import cv2
import sys
import time
import os
import argparse
import numpy as np
from flask import Flask, Response, request, jsonify
from flask_cors import CORS
from ball_detection import Detector
from tracking import BallTracker
from pose_detection import BatsmanPoseDetector
from trajectory_prediction import TrajectoryPredictor
from lbw_logic import LBWLogic
from visualization import draw_analytics
from utils import resize_frame
import onnxruntime as ort
import joblib
import json

# Initialize Flask App
app = Flask(__name__)
CORS(app)

# Global Models
print("--- PRE-LOADING LBW MODELS ---")
detector = Detector()
tracker = BallTracker(smoothing_factor=0.6, jump_threshold=120)
pose_detector = BatsmanPoseDetector()
predictor = TrajectoryPredictor()
lbw_logic = LBWLogic()
print("--- MODELS READY ---")

# Shot Model State
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
AI_ENGINE_MODELS_DIR = os.path.join(os.path.dirname(BASE_DIR), 'ai_engine', 'models')
SHOT_MODEL_PATH = os.path.join(AI_ENGINE_MODELS_DIR, "lstm_shot_v2.onnx")
SCALER_PATH     = os.path.join(AI_ENGINE_MODELS_DIR, "scaler_v2.save")
LABEL_MAP_PATH  = os.path.join(AI_ENGINE_MODELS_DIR, "label_map_v2.json")

try:
    shot_model = ort.InferenceSession(SHOT_MODEL_PATH)
    scaler = joblib.load(SCALER_PATH)
    with open(LABEL_MAP_PATH, "r") as f:
        shot_classes = json.load(f)["classes"]
except Exception as e:
    print(f"CRITICAL: Shot Model Loading Error: {e}")
    shot_model = None
    shot_classes = []

SEQ_LEN = 30
CONF_THRESHOLD = 0.70
IGNORE_LABELS  = {"Batsman"}

# Camera State
camera = None
connection_status = "Not Connected"
current_ip = ""

# LBW Tracking State
pitch_roi = None
stump_rect = [300, 400, 500, 700]
pad_hit_time = None
manual_pitch_pts = []
session_log = []
last_logged_pad_hit_time = None
pose_buffer = []
latched_shot_label = "Waiting..."
latched_shot_conf = 0.0
shot_display_countdown = 0

@app.route('/api/connect', methods=['POST'])
def connect_camera():
    global camera, connection_status, current_ip, pitch_roi, stump_rect, pad_hit_time, manual_pitch_pts, session_log, last_logged_pad_hit_time, pose_buffer, latched_shot_label, latched_shot_conf, shot_display_countdown
    data = request.json
    ip = data.get('ip', '')
    manual_pitch_pts = data.get('manual_pitch', [])
    
    # Reset tracking state
    pitch_roi = None
    stump_rect = [300, 400, 500, 700]
    pad_hit_time = None
    session_log = []
    last_logged_pad_hit_time = None
    pose_buffer = []
    latched_shot_label = "Waiting..."
    latched_shot_conf = 0.0
    shot_display_countdown = 0
    tracker.clear()
    lbw_logic.reset()
    
    if camera: camera.release()
    
    current_ip = ip
    
    video_source = ip if ip else 0
    if isinstance(ip, str) and ip.startswith('/uploads/'):
        video_source = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'shared', ip.lstrip('/'))
    elif isinstance(ip, str) and ip.startswith('uploads/'):
        video_source = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'shared', ip)

    print(f"Connecting to: {video_source}")
    try:
        os.environ["OPENCV_FFMPEG_CAPTURE_OPTIONS"] = "timeout;5000"
        camera = cv2.VideoCapture(video_source)
    except Exception as e:
        print(f"OpenCV Error opening camera: {e}")
        camera = None

    if camera and camera.isOpened():
        connection_status = "Connected"
        current_ip = ip
        return jsonify({"status": "success", "message": "Connected"})
    else:
        connection_status = "Connection Failed"
        return jsonify({"status": "error", "message": f"Failed to open camera: {video_source}"}), 500

@app.route('/api/status', methods=['GET'])
def get_status():
    return jsonify({"status": connection_status, "ip": current_ip})

@app.route('/reset_score', methods=['POST'])
def reset_score():
    tracker.clear()
    lbw_logic.reset()
    global pad_hit_time, session_log, last_logged_pad_hit_time
    pad_hit_time = None
    session_log = []
    last_logged_pad_hit_time = None
    return jsonify({"status": "success", "score": 0})

@app.route('/get_score')
def get_score():
    global latched_shot_label, latched_shot_conf, shot_display_countdown
    return jsonify({
        "score": 0, 
        "decision": lbw_logic.decision,
        "contact": lbw_logic.first_contact,
        "shot_label": latched_shot_label if shot_display_countdown > 0 else None,
        "shot_conf": latched_shot_conf if shot_display_countdown > 0 else None
    })

@app.route('/get_log')
def get_log():
    return jsonify({"log": session_log})

@app.route('/video_feed')
def video_feed():
    return Response(generate_frames(), mimetype='multipart/x-mixed-replace; boundary=frame')

def generate_frames():
    global camera, connection_status, pitch_roi, stump_rect, pad_hit_time, current_ip, session_log, last_logged_pad_hit_time, pose_buffer, latched_shot_label, latched_shot_conf, shot_display_countdown, shot_model, scaler, shot_classes
    prev_time = time.time()

    while True:
        if camera is None or not camera.isOpened():
            frame = np.zeros((480, 640, 3), dtype=np.uint8)
            cv2.putText(frame, connection_status, (50, 240), cv2.FONT_HERSHEY_SIMPLEX, 0.8, (255, 255, 255), 2)
            time.sleep(0.1)
        else:
            ret, frame = camera.read()
            if not ret:
                connection_status = "Video Finished / Interrupted"
                camera.release(); camera = None; continue

            # Flip frame horizontally to fix mirroring
            # frame = cv2.flip(frame, 1)

            # Resize frame for LBW
            frame = resize_frame(frame)
            
            # FPS Calculation
            curr_time = time.time()
            fps = 1 / (curr_time - prev_time) if (curr_time - prev_time) > 0 else 0
            prev_time = curr_time

            # 1. Detect Pitch (Auto) & Stumps (Auto)
            if not manual_pitch_pts:
                new_pitch_roi = detector.detect_pitch(frame)
                if new_pitch_roi:
                    pitch_roi = new_pitch_roi
                
            new_stump_rect = detector.detect_stumps(frame)
            if new_stump_rect:
                stump_rect = new_stump_rect

            # 2. Detect Objects
            objects = detector.detect_objects(frame, pitch_roi=pitch_roi, manual_pitch=manual_pitch_pts)
            ball_data = objects.get('ball')
            batsman_data = objects.get('batsman')
            bat_data = objects.get('bat')
            
            ball_center = ball_data['center'] if ball_data else None

            # 3. Create Heat Zones
            bat_zone = None
            if bat_data:
                btx1, bty1, btx2, bty2 = bat_data['bbox']
                bat_zone = (max(0, btx1 - 25), max(0, bty1 - 25), btx2 + 25, bty2 + 25)
                
            pad_zone = None
            pose_results, leg_positions, pose_offset = None, [], None
            if batsman_data:
                pose_results, leg_positions, pose_offset = pose_detector.detect_pose(frame, batsman_data['bbox'])
                if leg_positions:
                    lx = [p[0] for p in leg_positions]
                    ly = [p[1] for p in leg_positions]
                    pad_zone = (min(lx) - 30, min(ly) - 30, max(lx) + 30, max(ly) + 30)
                else:
                    bx1, by1, bx2, by2 = batsman_data['bbox']
                    pad_zone = (bx1, int(by1 + (by2-by1)*0.5), bx2, by2)
                    
                # Shot Detection Logic
                if pose_results and pose_results.pose_landmarks and shot_model:
                    bx1, by1, bx2, by2 = pose_offset if pose_offset else (0, 0, frame.shape[1], frame.shape[0])
                    cw, ch = bx2-bx1, by2-by1
                    h_full, w_full = frame.shape[:2]
                    feat = []
                    for p in pose_results.pose_landmarks.landmark:
                        abs_x = p.x * cw + bx1
                        abs_y = p.y * ch + by1
                        feat.extend([abs_x / w_full, abs_y / h_full, p.z, p.visibility])
                        
                    pose_buffer.append(feat)
                    if len(pose_buffer) > SEQ_LEN: pose_buffer.pop(0)
                    
                    if len(pose_buffer) == SEQ_LEN:
                        X = np.array(pose_buffer, dtype=np.float32)
                        X_scaled = scaler.transform(X).reshape(1, SEQ_LEN, -1).astype(np.float32)
                        ort_inputs = {shot_model.get_inputs()[0].name: X_scaled}
                        preds = shot_model.run(None, ort_inputs)[0]
                        idx = np.argmax(preds[0])
                        if shot_classes[idx] not in IGNORE_LABELS and preds[0][idx] >= CONF_THRESHOLD:
                            latched_shot_label = shot_classes[idx]
                            latched_shot_conf = float(preds[0][idx])
                            shot_display_countdown = 600
                            
                            session_log.append({
                                "time": time.strftime("%I:%M:%S %p"),
                                "type": "shot",
                                "label": latched_shot_label,
                                "conf": latched_shot_conf
                            })
                            pose_buffer = [] # Reset to avoid spam

            # 4. Track Ball
            trajectory = tracker.update(ball_center)
            
            # 5. Check Collision & Impact
            if lbw_logic.first_contact is None:
                prev_contact = lbw_logic.first_contact
                lbw_logic.check_collision(trajectory, bat_zone, pad_zone)
                if lbw_logic.first_contact == "PAD" and prev_contact is None:
                    pad_hit_time = time.time()

            # 6. Predict Trajectory
            predicted_path = []
            if len(trajectory) > 5:
                predicted_path = predictor.predict(trajectory)

            # 7. Judge LBW
            decision = lbw_logic.decision
            is_delay_active = False
            if lbw_logic.first_contact == "PAD" and pad_hit_time is not None:
                elapsed = time.time() - pad_hit_time
                if elapsed < 5.0:
                    is_delay_active = True
                    delay_remaining = 5.0 - elapsed
                    decision = f"PENDING ({int(delay_remaining) + 1}s)"
                else:
                    if decision == "PENDING" or decision == "CHECK LBW":
                        decision = lbw_logic.judge_lbw(predicted_path, stump_rect)
            else:
                if lbw_logic.first_contact and (decision == "PENDING" or decision == "CHECK LBW"):
                    decision = lbw_logic.judge_lbw(predicted_path, stump_rect)
            
            # Log final decision once
            if decision not in ["PENDING", "CHECK LBW", ""] and pad_hit_time is not None:
                if last_logged_pad_hit_time != pad_hit_time:
                    last_logged_pad_hit_time = pad_hit_time
                    session_log.append({
                        "time": time.strftime("%I:%M:%S %p"),
                        "type": "lbw",
                        "decision": decision
                    })

            # 8. Visualization
            if pose_results:
                pose_detector.draw_skeleton(frame, pose_results, offset=pose_offset)
                
            if shot_display_countdown > 0:
                shot_display_countdown -= 1

            vis_impact_point = None if is_delay_active else lbw_logic.impact_point
            vis_first_contact = None if is_delay_active else lbw_logic.first_contact

            annotated_frame = draw_analytics(
                frame, 
                ball_data, 
                objects,
                trajectory, 
                predicted_path, 
                vis_impact_point, 
                decision, 
                fps,
                pitch_roi,
                stump_rect,
                manual_pitch_pts,
                bat_zone=bat_zone,
                pad_zone=pad_zone,
                first_contact=vis_first_contact,
                show_setup=False
            )
            frame = annotated_frame

        ret, buffer = cv2.imencode('.jpg', frame)
        if not ret: continue
        yield (b'--frame\r\n' b'Content-Type: image/jpeg\r\n\r\n' + buffer.tobytes() + b'\r\n')

def main():
    app.run(host='0.0.0.0', port=8081, debug=False, threaded=True)

if __name__ == "__main__":
    main()
