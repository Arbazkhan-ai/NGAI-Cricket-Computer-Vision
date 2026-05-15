from ultralytics import YOLO
import cv2
import numpy as np
import os
import json
import joblib
import mediapipe as mp
from tensorflow.keras.models import load_model
import time

# ---------------------------
# SHOT DETECTION CONFIG (from pose_detection/deep2.py)
# ---------------------------
POSE_DETECTION_DIR = "pose_detection"
SHOT_MODEL_PATH = os.path.join(POSE_DETECTION_DIR, "saved_models_v2", "lstm_final.keras")
SCALER_PATH = os.path.join(POSE_DETECTION_DIR, "saved_models_v2", "scaler.save")
LABEL_MAP_PATH = os.path.join(POSE_DETECTION_DIR, "saved_models_v2", "label_map.json")

SEQ_LEN = 30
CONF_THRESHOLD = 0.70          # only show predictions above this confidence
IGNORE_LABELS  = {"Batsman"}   # labels to suppress (background/idle class)

# Load LSTM Model + Scaler + Labels
shot_model = load_model(SHOT_MODEL_PATH)
scaler = joblib.load(SCALER_PATH)

with open(LABEL_MAP_PATH, "r") as f:
    classes = json.load(f)["classes"]

# MediaPipe Pose Init
mp_pose = mp.solutions.pose
mp_drawing = mp.solutions.drawing_utils
pose = mp_pose.Pose(min_detection_confidence=0.5, min_tracking_confidence=0.5)
pose_buffer = []

# ---------------------------
# BALL & PITCH MODELS (from main.py)
# ---------------------------
ball_model = YOLO('detect/train/weights/best.pt')
pitch_model = YOLO('detect/train/weights/pitch.pt')

ball_track = []
frames_without_ball = 0
MAX_MISSING_FRAMES = 10
ball_hit_bat = False

# Latch shot after hit — persist the last confirmed shot on screen
latched_shot_label = None
latched_shot_conf = 0.0
SHOT_DISPLAY_FRAMES = 90   # keep showing shot for ~3 sec at 30fps
shot_display_countdown = 0

cap = cv2.VideoCapture("lbw.mp4")

width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
fps = cap.get(cv2.CAP_PROP_FPS)

fourcc = cv2.VideoWriter_fourcc(*'mp4v')
out = cv2.VideoWriter('output.mp4', fourcc, fps, (width, height))


# ---------------------------
# PHYSICS ANALYSIS ENGINE
# ---------------------------
def analyze_ball(track):
    if len(track) < 6:
        return "INSUFFICIENT DATA"

    pts = np.array(track)

    x = pts[:, 0]
    y = pts[:, 1]

    # ---------------- BOUNCE ----------------
    bounce = False
    for i in range(2, len(y)-2):
        if y[i] > y[i-1] and y[i] > y[i+1]:
            bounce = True
            break

    # ---------------- SWING ----------------
    swing_amount = x[-1] - x[0]
    swing_strength = abs(swing_amount)

    # ---------------- SPIN (CURVATURE) ----------------
    spin = 0
    for i in range(2, len(x)):
        spin += abs(x[i] - 2*x[i-1] + x[i-2])

    # ---------------- SPEED ----------------
    dist = 0
    for i in range(1, len(track)):
        dist += np.linalg.norm(np.array(track[i]) - np.array(track[i-1]))

    speed = dist / len(track)

    # ---------------- CLASSIFICATION ----------------
    if bounce and spin > 200:
        return "SPIN BOUNCER"
    elif bounce:
        return "BOUNCING BALL"
    elif swing_strength > 50:
        return "SWING BALL"
    elif speed > 15:
        return "FAST BALL"
    else:
        return "NORMAL BALL"


# ---------------------------
# TV TRAIL FUNCTION
# ---------------------------
def draw_trail(frame, track):
    if len(track) < 2:
        return frame

    overlay = frame.copy()

    for i in range(1, len(track)):
        alpha = i / len(track)

        color = (
            int(0 + 255 * alpha),
            int(255 * (1 - alpha)),
            255
        )

        thickness = int(8 * alpha + 2)

        cv2.line(overlay, track[i-1], track[i], color, thickness)

    cv2.addWeighted(overlay, 0.7, frame, 0.3, 0, frame)

    for i, pt in enumerate(track):
        r = int(5 + 5 * (i / len(track)))
        cv2.circle(frame, pt, r, (0, 255, 255), -1)

    return frame


# ---------------------------
# MAIN LOOP
# ---------------------------
while True:
    frame_start = time.time()   # start timer for FPS control
    ret, frame = cap.read()
    if not ret:
        break

    # 1. YOLO Ball Detection
    results_ball = ball_model(frame)
    annotated_frame = results_ball[0].plot()

    # 2. SHOT DETECTION (Pose)
    # Only run Pose Detection if a 'Batsman' is detected by YOLO
    batsman_box = None
    for box in results_ball[0].boxes:
        if int(box.cls[0]) == 2:  # 2 is 'Batsman'
            batsman_box = box.xyxy[0].tolist()
            break
    
    current_shot_label = "Waiting..."
    current_shot_conf = 0.0

    if batsman_box:
        bx1, by1, bx2, by2 = map(int, batsman_box)
        # Ensure box is within frame boundaries
        bx1, by1 = max(0, bx1), max(0, by1)
        bx2, by2 = min(width, bx2), min(height, by2)
        
        # Crop to batsman
        batsman_crop = frame[by1:by2, bx1:bx2]
        if batsman_crop.size > 0:
            img_rgb = cv2.cvtColor(batsman_crop, cv2.COLOR_BGR2RGB)
            img_rgb.flags.writeable = False
            res_pose = pose.process(img_rgb)
            img_rgb.flags.writeable = True

            if res_pose.pose_landmarks:
                # 1. Adjust landmarks back to global coordinates for drawing
                # Landmarks are normalized [0,1] relative to the crop
                crop_w = bx2 - bx1
                crop_h = by2 - by1
                
                # Clone landmarks to modify them for global display without affecting the original feature extraction
                # Actually, we need global normalized landmarks for the LSTM (likely)
                feat = []
                for p in res_pose.pose_landmarks.landmark:
                    # Global pixel coordinates
                    gx = (p.x * crop_w + bx1)
                    gy = (p.y * crop_h + by1)
                    # Global normalized coordinates [0, 1]
                    gnx = gx / width
                    gny = gy / height
                    
                    feat.extend([gnx, gny, p.z, p.visibility])
                    
                    # Update landmarks in-place for mp_drawing (which uses normalized [0,1] of whatever frame it draws on)
                    # Since annotated_frame is full width/height, we set them to gnx, gny
                    p.x = gnx
                    p.y = gny

                # Draw Skeleton Landmarks on annotated_frame (using global-normalized)
                mp_drawing.draw_landmarks(
                    annotated_frame,
                    res_pose.pose_landmarks,
                    mp_pose.POSE_CONNECTIONS
                )

                pose_buffer.append(feat)
                if len(pose_buffer) > SEQ_LEN:
                    pose_buffer.pop(0)

                # LSTM Prediction
                if len(pose_buffer) == SEQ_LEN:
                    X = np.array(pose_buffer, dtype=np.float32)
                    X_scaled = scaler.transform(X)
                    X_scaled = X_scaled.reshape(1, SEQ_LEN, -1)

                    preds = shot_model.predict(X_scaled, verbose=0)
                    pred_idx = np.argmax(preds[0])
                    label = classes[pred_idx]
                    conf = float(preds[0][pred_idx])

                    if label not in IGNORE_LABELS and conf >= CONF_THRESHOLD:
                        current_shot_label = label
                        current_shot_conf = conf

    # 3. PITCH DETECTION (YOLO)
    results_pitch = pitch_model.predict(frame, conf=0.5, verbose=False)

    pitch_boxes = []

    for res in results_pitch:
        for box in res.boxes:
            if int(box.cls[0]) == 1:
                px1, py1, px2, py2 = box.xyxy[0].tolist()
                pitch_boxes.append((px1, py1, px2, py2))

                cv2.rectangle(annotated_frame,
                              (int(px1), int(py1)),
                              (int(px2), int(py2)),
                              (0, 255, 0), 2)

                cv2.putText(annotated_frame, "PITCH",
                            (int(px1), int(py1)-10),
                            cv2.FONT_HERSHEY_SIMPLEX, 0.6, (0,255,0), 2)

    # 4. BALL TRACKING
    boxes = results_ball[0].boxes
    ball_detected_this_frame = False
    
    current_ball_box = None
    current_bat_box = None

    for box in boxes:
        cls_name = ball_model.names[int(box.cls[0])]
        
        if cls_name.lower() == 'bat':
            current_bat_box = box.xyxy[0].tolist()

        elif cls_name.lower() == 'ball' and not ball_detected_this_frame:
            x1, y1, x2, y2 = box.xyxy[0].tolist()

            cx = int((x1 + x2) / 2)
            cy = int((y1 + y2) / 2)

            # Only track if inside detected pitch
            inside = any(px1 <= cx <= px2 and py1 <= cy <= py2
                         for (px1, py1, px2, py2) in pitch_boxes)

            if inside:
                current_ball_box = (x1, y1, x2, y2)
                ball_track.append((cx, cy))
                ball_detected_this_frame = True
                frames_without_ball = 0

    if not ball_detected_this_frame:
        frames_without_ball += 1
        if frames_without_ball > MAX_MISSING_FRAMES:
            ball_track = []
            ball_hit_bat = False
            
    # Check for ball hitting bat (ball center inside expanded bat box)
    if current_ball_box and current_bat_box:
        bx1, by1, bx2, by2 = current_ball_box
        tx1, ty1, tx2, ty2 = current_bat_box
        ball_cx = (bx1 + bx2) / 2
        ball_cy = (by1 + by2) / 2
        
        MARGIN = 40  # pixels of tolerance around bat box
        if (tx1 - MARGIN) <= ball_cx <= (tx2 + MARGIN) and \
           (ty1 - MARGIN) <= ball_cy <= (ty2 + MARGIN):
            ball_hit_bat = True
            # Latch the shot label at the moment of hit
            if current_shot_label != "Waiting...":
                latched_shot_label = current_shot_label
                latched_shot_conf = current_shot_conf
                shot_display_countdown = SHOT_DISPLAY_FRAMES

    # 5. DRAW TRAIL
    annotated_frame = draw_trail(annotated_frame, ball_track)

    # 6. ANALYZE BALL TYPE
    ball_type = analyze_ball(ball_track)

    # Countdown for latched shot display
    if shot_display_countdown > 0:
        shot_display_countdown -= 1
    else:
        latched_shot_label = None

    # 7. DISPLAY STATS OVERLAY
    cv2.rectangle(annotated_frame, (20, 20), (450, 160), (0, 0, 0), -1)

    cv2.putText(annotated_frame, f"BALL TYPE: {ball_type}",
                (30, 50), cv2.FONT_HERSHEY_SIMPLEX,
                0.7, (0, 255, 255), 2)

    cv2.putText(annotated_frame, f"POINTS: {len(ball_track)}",
                (30, 80), cv2.FONT_HERSHEY_SIMPLEX,
                0.6, (255, 255, 255), 2)

    if not ball_hit_bat:
        cv2.putText(annotated_frame, "SHOT: Waiting for hit...",
                    (30, 120), cv2.FONT_HERSHEY_SIMPLEX,
                    0.6, (150, 150, 150), 1)
    elif latched_shot_label:
        cv2.putText(annotated_frame, f"SHOT: {latched_shot_label} ({latched_shot_conf*100:.1f}%)",
                    (30, 120), cv2.FONT_HERSHEY_SIMPLEX,
                    0.7, (0, 255, 100), 2)
    else:
        cv2.putText(annotated_frame, "SHOT: Detecting...",
                    (30, 120), cv2.FONT_HERSHEY_SIMPLEX,
                    0.6, (150, 150, 150), 1)

    # 8. SAVE + SHOW
    out.write(annotated_frame)
    cv2.imshow("AI Cricket Physics System", annotated_frame)

    # Compute correct delay to maintain real-time FPS
    frame_duration_ms = int(1000 / fps)   # e.g. 33ms for 30fps
    elapsed_ms = int((time.time() - frame_start) * 1000)
    wait_ms = max(1, frame_duration_ms - elapsed_ms)
    key = cv2.waitKey(wait_ms) & 0xFF

    if key == ord("q"):
        break

cap.release()
out.release()
cv2.destroyAllWindows()