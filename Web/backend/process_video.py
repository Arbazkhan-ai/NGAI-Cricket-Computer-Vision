import cv2
import sys
import os
import argparse
import numpy as np
import mediapipe as mp
import warnings
from ultralytics import YOLO
from hawk_eye_engine import estimate_speed, swing_amount, spin_intensity

# Suppress warnings
warnings.filterwarnings("ignore")

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

def analyze_ball(track):
    if len(track) < 6: return "INSUFFICIENT DATA"
    pts = np.array(track)
    x, y = pts[:, 0], pts[:, 1]
    bounce = False
    for i in range(2, len(y)-2):
        if y[i] > y[i-1] and y[i] > y[i+1]:
            bounce = True; break
    swing_strength = abs(x[-1] - x[0])
    spin = sum(abs(x[i] - 2*x[i-1] + x[i-2]) for i in range(2, len(x)))
    dist = sum(np.linalg.norm(np.array(track[i]) - np.array(track[i-1])) for i in range(1, len(track)))
    speed = dist / len(track)
    if bounce and spin > 200: return "SPIN BOUNCER"
    elif bounce: return "BOUNCING BALL"
    elif swing_strength > 50: return "SWING BALL"
    elif speed > 15: return "FAST BALL"
    else: return "NORMAL BALL"

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

def process_video(input_path, output_path, mode="mediapipe"):
    print(f"Starting advanced processing (Instant-Mode): {input_path}", flush=True)
    cap = cv2.VideoCapture(input_path)
    if not cap.isOpened(): return False

    width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
    height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
    fps = int(cap.get(cv2.CAP_PROP_FPS)) or 30
    
    # Load Models
    try:
        import onnxruntime as ort
        import joblib
        import json
        
        print(f"Loading Ball Model from: {YOLO_BALL_PATH}", flush=True)
        ball_model = YOLO(YOLO_BALL_PATH, task='detect')
        print(f"Loading Pitch Model from: {YOLO_PITCH_PATH}", flush=True)
        pitch_model = YOLO(YOLO_PITCH_PATH, task='detect')
        shot_model = ort.InferenceSession(SHOT_MODEL_PATH)
        scaler = joblib.load(SCALER_PATH)
        with open(LABEL_MAP_PATH, "r") as f:
            classes = json.load(f)["classes"]
            
        mp_pose = mp.solutions.pose
        pose = mp_pose.Pose(static_image_mode=False, min_detection_confidence=0.5, min_tracking_confidence=0.5, model_complexity=2)
    except Exception as e:
        import traceback
        print(f"Init Error: {e}", flush=True)
        traceback.print_exc()
        return False

    # Use 'avc1' for H264 (better browser support)
    fourcc = cv2.VideoWriter_fourcc(*'avc1')
    out = cv2.VideoWriter(output_path, fourcc, fps, (width, height))
    
    # If avc1 fails, fallback to mp4v
    if not out.isOpened():
        print("AVC1 codec failed, falling back to MP4V", flush=True)
        fourcc = cv2.VideoWriter_fourcc(*'mp4v')
        out = cv2.VideoWriter(output_path, fourcc, fps, (width, height))

    pose_buffer = []
    ball_track = []
    frames_without_ball = 0
    ball_hit_bat = False
    latched_shot_label = None
    latched_shot_conf = 0.0
    shot_display_countdown = 0
    
    total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
    frame_idx = 0

    pitch_boxes = []
    
    while cap.isOpened():
        ret, frame = cap.read()
        if not ret: break
        frame_idx += 1
        
        if frame_idx % 10 == 0: 
            print(f"Frame {frame_idx}/{total_frames}", flush=True)
        
        # 1. Pitch Detection (Optimized: Detect every 100 frames since it's static)
        if frame_idx == 1 or frame_idx % 100 == 0:
            res_pitch = pitch_model.predict(frame, conf=0.5, verbose=False)
            pitch_boxes = []
            for res in res_pitch:
                for box in res.boxes:
                    if int(box.cls[0]) == 1:
                        px1, py1, px2, py2 = box.xyxy[0].tolist()
                        pitch_boxes.append((px1, py1, px2, py2))
        
        # Draw pitch boxes (Removed for clean view)
        pass

        # 2. YOLO Ball, Bat, Batsman
        results_ball = ball_model(frame, verbose=False, conf=0.15)
        
        all_batsmen = []
        all_bats = []
        ball_box = None
        
        for box in results_ball[0].boxes:
            cls_id = int(box.cls[0])
            cls_name = ball_model.names[cls_id].lower()
            conf = float(box.conf[0])
            coords = map(int, box.xyxy[0].tolist())
            x1, y1, x2, y2 = coords
            
            if cls_name == 'batsman' or cls_id == 2: 
                all_batsmen.append([x1, y1, x2, y2])
            elif cls_name == 'bat' or cls_id == 1: 
                all_bats.append([x1, y1, x2, y2])
            elif cls_name == 'ball' or cls_id == 0: 
                ball_box = [x1, y1, x2, y2]
                
        # 3. Logic: Find the REAL Batsman (Person with Bat inside Pitch)
        batsman_box = None
        if all_batsmen:
            best_batsman = None
            for bman in all_batsmen:
                # 1. Check if on Pitch
                cx, cy = (bman[0]+bman[2])//2, (bman[1]+bman[3])//2
                on_pitch = False
                for pbox in pitch_boxes:
                    if pbox[0] <= cx <= pbox[2] and pbox[1] <= cy <= pbox[3]:
                        on_pitch = True; break
                
                if not on_pitch: continue # Skip if not on pitch
                
                # 2. Check if has Bat (proximity check)
                has_bat = False
                for bat in all_bats:
                    # If bat center is within person box or close
                    bat_cx, bat_cy = (bat[0]+bat[2])//2, (bat[1]+bat[3])//2
                    if (bman[0]-20) <= bat_cx <= (bman[2]+20) and (bman[1]-20) <= bat_cy <= (bman[3]+20):
                        has_bat = True; break
                
                if has_bat:
                    best_batsman = bman
                    break # Found him!
            
            batsman_box = best_batsman

        # 4. Pose Detection (Only for the qualified batsman)
        current_shot_label = ""
        current_shot_conf = 0.0
        if batsman_box:
            bx1, by1, bx2, by2 = map(int, batsman_box)
            bx1, by1, bx2, by2 = max(0, bx1), max(0, by1), min(width, bx2), min(height, by2)
            crop = frame[by1:by2, bx1:bx2]
            if crop.size > 0:
                res_pose = pose.process(cv2.cvtColor(crop, cv2.COLOR_BGR2RGB))
                if res_pose.pose_landmarks:
                    cw, ch = bx2-bx1, by2-by1
                    feat = []
                    for p in res_pose.pose_landmarks.landmark:
                        feat.extend([(p.x * cw + bx1)/width, (p.y * ch + by1)/height, p.z, p.visibility])
                    pose_buffer.append(feat)
                    if len(pose_buffer) > SEQ_LEN: pose_buffer.pop(0)
                    if len(pose_buffer) == SEQ_LEN:
                        X = np.array(pose_buffer, dtype=np.float32)
                        X_scaled = scaler.transform(X).reshape(1, SEQ_LEN, -1).astype(np.float32)
                        ort_inputs = {shot_model.get_inputs()[0].name: X_scaled}
                        preds = shot_model.run(None, ort_inputs)[0]
                        idx = np.argmax(preds[0])
                        if classes[idx] not in IGNORE_LABELS and preds[0][idx] >= CONF_THRESHOLD:
                            current_shot_label, current_shot_conf = classes[idx], float(preds[0][idx])

        # 5. Ball Tracking (Only if inside Pitch)
        if ball_box:
            x1, y1, x2, y2 = ball_box
            cx, cy = int((x1+x2)/2), int((y1+y2)/2)
            
            # Constraint: Must be near pitch
            near_pitch = False
            for pbox in pitch_boxes:
                if (pbox[0]-100) <= cx <= (pbox[2]+100) and (pbox[1]-100) <= cy <= (pbox[3]+100):
                    near_pitch = True; break
            
            if near_pitch:
                ball_track.append((cx, cy))
                frames_without_ball = 0
            else:
                frames_without_ball += 1
        else:
            frames_without_ball += 1
            if frames_without_ball > MAX_MISSING_FRAMES: ball_track = []; ball_hit_bat = False
            
        # 6. Hit Detection (Only if qualified batsman exists)
        if ball_box and batsman_box:
            bcx, bcy = (ball_box[0]+ball_box[2])/2, (ball_box[1]+ball_box[3])/2
            # Use batsman proximity to ball as hit indicator if bat not detected separately
            # or if we want to be more robust
            if (batsman_box[0]-50) <= bcx <= (batsman_box[2]+50) and (batsman_box[1]-50) <= bcy <= (batsman_box[3]+50):
                ball_hit_bat = True
                if current_shot_label:
                    latched_shot_label, latched_shot_conf = current_shot_label, current_shot_conf
                    shot_display_countdown = SHOT_DISPLAY_FRAMES

        # 6. Advanced Rendering (Stats Only)
        # frame = draw_trail(frame, ball_track) # Removed for clean view
        
        # 7. Hawk-Eye Physics
        speed = estimate_speed(ball_track, fps=fps)
        swing = swing_amount(ball_track)
        spin = spin_intensity(ball_track)

        cv2.rectangle(frame, (20, 20), (450, 160), (0, 0, 0), -1)
        cv2.putText(frame, f"SPEED: {speed} km/h", (30, 50), cv2.FONT_HERSHEY_SIMPLEX, 0.7, (0, 255, 255), 2)
        cv2.putText(frame, f"SWING: {swing}px", (30, 80), cv2.FONT_HERSHEY_SIMPLEX, 0.6, (255, 255, 255), 2)
        cv2.putText(frame, f"SPIN/CURVE: {spin}", (30, 110), cv2.FONT_HERSHEY_SIMPLEX, 0.6, (255, 255, 0), 2)
        
        if ball_hit_bat and latched_shot_label:
            cv2.putText(frame, f"SHOT: {latched_shot_label} ({latched_shot_conf*100:.1f}%)", (30, 140), cv2.FONT_HERSHEY_SIMPLEX, 0.7, (0, 255, 100), 2)
        
        out.write(frame)

    cap.release(); out.release()
    print("Video processing complete."); return True

if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", required=True)
    parser.add_argument("--output", required=True)
    parser.add_argument("--mode", default="mediapipe")
    args = parser.parse_args()
    process_video(args.input, args.output, args.mode)
