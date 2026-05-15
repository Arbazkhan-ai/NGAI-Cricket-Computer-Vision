import cv2
import threading
import sys
import time
import os
import argparse
import numpy as np
import mediapipe as mp
import warnings
from flask import Flask, Response, request, jsonify
from flask_cors import CORS
from ultralytics import YOLO
from hawk_eye_engine import estimate_speed, swing_amount, spin_intensity, get_ball_type

# Suppress warnings
warnings.filterwarnings("ignore")

# Initialize Flask App
app = Flask(__name__)
CORS(app)

# Constants
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
MODELS_DIR = os.path.join(BASE_DIR, 'models')

# Model Paths
YOLO_BALL_PATH = os.path.join(MODELS_DIR, "yolo_ball_best.pt")
YOLO_PITCH_PATH = os.path.join(MODELS_DIR, "yolo_pitch_best.pt")
SHOT_MODEL_PATH = os.path.join(MODELS_DIR, "lstm_shot_v2.onnx")
SCALER_PATH     = os.path.join(MODELS_DIR, "scaler_v2.save")
LABEL_MAP_PATH  = os.path.join(MODELS_DIR, "label_map_v2.json")

# Config
SEQ_LEN = 30
CONF_THRESHOLD = 0.70
IGNORE_LABELS  = {"Batsman"}
SHOT_DISPLAY_FRAMES = 90
MAX_MISSING_FRAMES = 10

# Global State (Models Loaded on Startup)
print("--- PRE-LOADING MODELS FOR INSTANT START ---")
import onnxruntime as ort
import joblib
import json

try:
    ball_model = YOLO(YOLO_BALL_PATH)
    pitch_model = YOLO(YOLO_PITCH_PATH)
    shot_model = ort.InferenceSession(SHOT_MODEL_PATH)
    scaler = joblib.load(SCALER_PATH)
    with open(LABEL_MAP_PATH, "r") as f:
        classes = json.load(f)["classes"]
    
    mp_pose = mp.solutions.pose
    mp_drawing = mp.solutions.drawing_utils
    pose = mp_pose.Pose(static_image_mode=False, min_detection_confidence=0.5, min_tracking_confidence=0.5, model_complexity=1)
    print("--- MODELS READY ---")
except Exception as e:
    print(f"CRITICAL: Model Loading Error: {e}")

# Camera State
camera = None
connection_status = "Not Connected"
current_ip = ""

# Tracking State
ball_track = []
frames_without_ball = 0
ball_hit_bat = False
pose_buffer = []
latched_shot_label = None
latched_shot_conf = 0.0
shot_display_countdown = 0


# Global Game State
game_score = 0
last_hit_frame = -1
current_frame_idx = 0

def draw_trail(frame, track):
    if len(track) < 2: return frame
    overlay = frame.copy()
    for i in range(1, len(track)):
        alpha = i / len(track)
        color = (int(0 + 255 * alpha), int(255 * (1 - alpha)), 255)
        thickness = int(8 * alpha + 2)
        cv2.line(overlay, track[i-1], track[i], color, thickness)
    cv2.addWeighted(overlay, 0.7, frame, 0.3, 0, frame)
    for i, pt in enumerate(track):
        r = int(5 + 5 * (i / len(track)))
        cv2.circle(frame, pt, r, (0, 255, 255), -1)
    return frame

@app.route('/api/connect', methods=['POST'])
def connect_camera():
    global camera, connection_status, current_ip, ball_track, ball_hit_bat, pose_buffer
    data = request.json
    ip = data.get('ip', '')
    
    # Reset tracking state
    ball_track = []
    pose_buffer = []
    ball_hit_bat = False
    
    if camera: camera.release()
    
    print(f"Connecting to: {ip if ip else 'Local Webcam'}")
    camera = cv2.VideoCapture(ip if ip else 0)
    if camera.isOpened():
        connection_status = "Connected"
        current_ip = ip
        return jsonify({"status": "success", "message": "Connected"})
    else:
        connection_status = "Connection Failed"
        return jsonify({"status": "error", "message": "Failed to open camera"}), 500

@app.route('/api/status', methods=['GET'])
def get_status():
    return jsonify({"status": connection_status, "ip": current_ip})

@app.route('/reset_score', methods=['POST'])
def reset_score():
    global game_score
    game_score = 0
    return jsonify({"status": "success", "score": 0})

@app.route('/get_score')
def get_score():
    return jsonify({"score": game_score})

@app.route('/video_feed')
def video_feed():
    return Response(generate_frames(), mimetype='multipart/x-mixed-replace; boundary=frame')

def generate_frames():
    global camera, ball_model, pitch_model, shot_model, scaler, classes, mp_drawing, pose, mp_pose, ball_track, frames_without_ball, ball_hit_bat, pose_buffer, latched_shot_label, latched_shot_conf, shot_display_countdown, connection_status, game_score, last_hit_frame, current_frame_idx

    while True:
        current_frame_idx += 1
        if camera is None or not camera.isOpened():
            frame = np.zeros((480, 640, 3), dtype=np.uint8)
            cv2.putText(frame, connection_status, (50, 240), cv2.FONT_HERSHEY_SIMPLEX, 0.8, (255, 255, 255), 2)
            time.sleep(0.1)
        else:
            ret, frame = camera.read()
            if not ret:
                connection_status = "Stream Interrupted"
                camera.release(); camera = None; continue

            # Flip frame horizontally to fix mirroring (Left -> Right, Right -> Left)
            frame = cv2.flip(frame, 1)

            h, w = frame.shape[:2]
            annotated_frame = frame.copy()
            
            # AI Inference
            results_pitch = pitch_model.predict(frame, conf=0.5, verbose=False)
            pitch_boxes = []
            for res in results_pitch:
                for box in res.boxes:
                    if int(box.cls[0]) == 1:
                        px1, py1, px2, py2 = box.xyxy[0].tolist()
                        pitch_boxes.append((px1, py1, px2, py2))
                        cv2.rectangle(annotated_frame, (int(px1), int(py1)), (int(px2), int(py2)), (0, 255, 0), 2)

            results_ball = ball_model(frame, verbose=False, conf=0.15)
            all_batsmen = []
            all_bats = []
            current_ball_box = None
            
            for box in results_ball[0].boxes:
                cls_id = int(box.cls[0])
                cls_name = ball_model.names[cls_id].lower()
                conf = float(box.conf[0])
                coords = map(int, box.xyxy[0].tolist())
                x1, y1, x2, y2 = coords
                
                color = (0, 255, 0) if cls_name == 'batsman' else (255, 0, 0) if cls_name == 'ball' else (0, 0, 255)
                cv2.rectangle(annotated_frame, (x1, y1), (x2, y2), color, 2)
                cv2.putText(annotated_frame, f"{cls_name.upper()} {conf:.2f}", (x1, y1-10), cv2.FONT_HERSHEY_SIMPLEX, 0.5, color, 2)

                if cls_name == 'batsman' or cls_id == 2: all_batsmen.append([x1, y1, x2, y2])
                elif cls_name == 'ball' or cls_id == 0: current_ball_box = [x1, y1, x2, y2]
                elif cls_name == 'bat' or cls_id == 1: all_bats.append([x1, y1, x2, y2])

            # Logic: Find Active Batsman
            batsman_box = None
            if all_batsmen:
                for bman in all_batsmen:
                    cx, cy = (bman[0]+bman[2])//2, (bman[1]+bman[3])//2
                    on_pitch = any(px1 <= cx <= px2 and py1 <= cy <= py2 for (px1, py1, px2, py2) in pitch_boxes)
                    if not on_pitch: continue
                    
                    has_bat = any((bman[0]-20) <= (bat[0]+bat[2])//2 <= (bman[2]+20) and (bman[1]-20) <= (bat[1]+bat[3])//2 <= (bman[3]+20) for bat in all_bats)
                    if has_bat:
                        batsman_box = bman; break

            current_shot_label = "Waiting..."
            current_shot_conf = 0.0

            if batsman_box:
                bx1, by1, bx2, by2 = map(int, batsman_box)
                bx1, by1, bx2, by2 = max(0, bx1), max(0, by1), min(w, bx2), min(h, by2)
                crop = frame[by1:by2, bx1:bx2]
                if crop.size > 0:
                    res_pose = pose.process(cv2.cvtColor(crop, cv2.COLOR_BGR2RGB))
                    if res_pose.pose_landmarks:
                        cw, ch = bx2-bx1, by2-by1
                        feat = []
                        for p in res_pose.pose_landmarks.landmark:
                            feat.extend([(p.x * cw + bx1)/w, (p.y * ch + by1)/h, p.z, p.visibility])
                        mp_drawing.draw_landmarks(annotated_frame, res_pose.pose_landmarks, mp_pose.POSE_CONNECTIONS)
                        pose_buffer.append(feat)
                        if len(pose_buffer) > SEQ_LEN: pose_buffer.pop(0)
                        if len(pose_buffer) == SEQ_LEN and shot_model:
                            X = np.array(pose_buffer, dtype=np.float32)
                            X_scaled = scaler.transform(X).reshape(1, SEQ_LEN, -1).astype(np.float32)
                            ort_inputs = {shot_model.get_inputs()[0].name: X_scaled}
                            preds = shot_model.run(None, ort_inputs)[0]
                            idx = np.argmax(preds[0])
                            if classes[idx] not in IGNORE_LABELS and preds[0][idx] >= CONF_THRESHOLD:
                                current_shot_label, current_shot_conf = classes[idx], float(preds[0][idx])

            if current_ball_box:
                x1, y1, x2, y2 = current_ball_box
                cx, cy = int((x1+x2)/2), int((y1+y2)/2)
                
                # Pitch Constraint
                near_pitch = any((pbox[0]-100) <= cx <= (pbox[2]+100) and (pbox[1]-100) <= cy <= (pbox[3]+100) for pbox in pitch_boxes)
                if near_pitch:
                    ball_track.append((cx, cy))
                    frames_without_ball = 0
                else:
                    frames_without_ball += 1
            else:
                frames_without_ball += 1
                if frames_without_ball > MAX_MISSING_FRAMES: ball_track = []; ball_hit_bat = False

            if current_ball_box and batsman_box:
                bcx, bcy = (current_ball_box[0]+current_ball_box[2])/2, (current_ball_box[1]+current_ball_box[3])/2
                if (batsman_box[0]-50) <= bcx <= (batsman_box[2]+50) and (batsman_box[1]-50) <= bcy <= (batsman_box[3]+50):
                    if not ball_hit_bat:
                        # NEW HIT! Increment score
                        game_score += 1
                        last_hit_frame = current_frame_idx
                    
                    ball_hit_bat = True
                    if current_shot_label != "Waiting...":
                        latched_shot_label, latched_shot_conf = current_shot_label, current_shot_conf
                        shot_display_countdown = SHOT_DISPLAY_FRAMES

            # Trail & Physics
            annotated_frame = draw_trail(annotated_frame, ball_track)
            
            # Hawk-Eye Stats
            speed = estimate_speed(ball_track)
            swing = swing_amount(ball_track)
            spin = spin_intensity(ball_track)
            ball_type = get_ball_type(ball_track, speed)

            cv2.rectangle(annotated_frame, (20, 20), (450, 160), (0, 0, 0), -1)
            cv2.putText(annotated_frame, f"TYPE: {ball_type}", (30, 50), cv2.FONT_HERSHEY_SIMPLEX, 0.7, (0, 255, 255), 2)
            cv2.putText(annotated_frame, f"SPEED: {speed} km/h", (30, 80), cv2.FONT_HERSHEY_SIMPLEX, 0.6, (255, 255, 255), 2)
            cv2.putText(annotated_frame, f"SWING: {swing}px | SPIN: {spin}", (30, 110), cv2.FONT_HERSHEY_SIMPLEX, 0.5, (255, 255, 0), 2)
            
            if ball_hit_bat and latched_shot_label:
                cv2.putText(annotated_frame, f"SHOT: {latched_shot_label} ({latched_shot_conf*100:.1f}%)", (30, 140), cv2.FONT_HERSHEY_SIMPLEX, 0.7, (0, 255, 100), 2)
            
            frame = annotated_frame

        ret, buffer = cv2.imencode('.jpg', frame)
        if not ret: continue
        yield (b'--frame\r\n' b'Content-Type: image/jpeg\r\n\r\n' + buffer.tobytes() + b'\r\n')

def main():
    app.run(host='0.0.0.0', port=8080, debug=False, threaded=True)

if __name__ == "__main__":
    main()
