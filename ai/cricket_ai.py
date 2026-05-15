"""
cricket_ai.py
=============
Full Cricket AI Analysis Pipeline — headless server-side version of
d:\\runs_archive\\main.py.

Usage:
    python cricket_ai.py --input <video_path> --output <output_path>

Outputs:
    - Annotated video written to <output_path>
    - One JSON line printed to stdout on completion:
      {"ball_type": "...", "shot_label": "...", "shot_conf": 0.0,
       "ball_points": 42, "frames_processed": 300, "status": "ok"}
"""

import argparse
import cv2
import json
import joblib
import mediapipe as mp
import numpy as np
import os
import sys
import time
import warnings

warnings.filterwarnings("ignore")

# ── Suppress TF / MediaPipe spam ──────────────────────────────────────────────
os.environ["TF_CPP_MIN_LOG_LEVEL"] = "3"

from ultralytics import YOLO
from tensorflow.keras.models import load_model  # noqa: E402

# ─────────────────────────────────────────────────────────────────────────────
# MODEL PATHS  (all referenced from d:\runs_archive so nothing needs copying)
# ─────────────────────────────────────────────────────────────────────────────
RUNS_ARCHIVE = r"d:\runs_archive"

BALL_MODEL_PATH  = os.path.join(RUNS_ARCHIVE, "detect", "train", "weights", "best.pt")
PITCH_MODEL_PATH = os.path.join(RUNS_ARCHIVE, "detect", "train", "weights", "pitch.pt")

POSE_DIR         = os.path.join(RUNS_ARCHIVE, "pose_detection", "saved_models_v2")
SHOT_MODEL_PATH  = os.path.join(POSE_DIR, "lstm_final.keras")
SCALER_PATH      = os.path.join(POSE_DIR, "scaler.save")
LABEL_MAP_PATH   = os.path.join(POSE_DIR, "label_map.json")

# ─────────────────────────────────────────────────────────────────────────────
# CONFIG
# ─────────────────────────────────────────────────────────────────────────────
SEQ_LEN           = 30
CONF_THRESHOLD    = 0.70
IGNORE_LABELS     = {"Batsman"}
MAX_MISSING_FRAMES = 10
SHOT_DISPLAY_FRAMES = 90


# ─────────────────────────────────────────────────────────────────────────────
# HELPERS
# ─────────────────────────────────────────────────────────────────────────────
def analyze_ball(track):
    """
    Enhanced Cricket Physics Engine
    -------------------------------
    Detects:
      - Spin: Off-Spin (Inner), Leg-Spin (Outer), Top-Spin
      - Swing: In-swing, Out-swing
      - Length: Short, Good, Full, Yorker, Full Toss
      - Speed: Fast, Medium, Slow
    """
    if len(track) < 8:
        return "ANALYZING..."
    
    pts = np.array(track)
    x, y = pts[:, 0], pts[:, 1]
    
    # 1. Detect Bounce
    bounce_idx = -1
    for i in range(2, len(y) - 2):
        if y[i] > y[i - 1] and y[i] > y[i + 1]:
            bounce_idx = i
            break
    
    # 2. Physics Metrics
    total_dist = sum(np.linalg.norm(pts[i] - pts[i-1]) for i in range(1, len(pts)))
    speed = total_dist / len(track)
    
    # 3. Trajectory Analysis
    if bounce_idx != -1:
        # Movement before bounce (Swing)
        dx_pre = x[bounce_idx] - x[0]
        # Movement after bounce (Spin)
        dx_post = x[-1] - x[bounce_idx]
        # Bounce height (normalized by frame)
        bounce_y = y[bounce_idx]
        
        # --- Length Classification ---
        # (Assuming y=0 is top, y increases towards batsman)
        if bounce_y < 300: length = "SHORT"
        elif bounce_y < 500: length = "GOOD LENGTH"
        elif bounce_y < 700: length = "FULL"
        else: length = "YORKER"
        
        # --- Spin/Swing Classification ---
        # Positive dx = Rightward movement, Negative dx = Leftward movement
        # Assume RHB (Right Hand Batsman)
        if abs(dx_post) > 30:
            spin_type = "LEG SPIN (Outer)" if dx_post > 0 else "OFF SPIN (Inner)"
            return f"{length} {spin_type}"
        elif abs(dx_pre) > 40:
            swing_type = "OUT-SWING" if dx_pre > 0 else "IN-SWING"
            return f"{length} {swing_type}"
        
        if speed > 20: return f"FAST {length} BALL"
        return f"{length} BALL"
    
    else:
        # No bounce detected -> Full Toss
        if speed > 22: return "FAST FULL TOSS"
        return "FULL TOSS"


def draw_trail(frame, track):
    if len(track) < 2:
        return frame
    overlay = frame.copy()
    for i in range(1, len(track)):
        alpha     = i / len(track)
        color     = (int(255 * alpha), int(255 * (1 - alpha)), 255)
        thickness = int(8 * alpha + 2)
        cv2.line(overlay, track[i - 1], track[i], color, thickness)
    cv2.addWeighted(overlay, 0.7, frame, 0.3, 0, frame)
    for i, pt in enumerate(track):
        r = int(5 + 5 * (i / len(track)))
        cv2.circle(frame, pt, r, (0, 255, 255), -1)
    return frame


# ─────────────────────────────────────────────────────────────────────────────
# MAIN PIPELINE
# ─────────────────────────────────────────────────────────────────────────────
def run(input_path: str, output_path: str):
    # ── Load models ──────────────────────────────────────────────────────────
    try:
        ball_model  = YOLO(BALL_MODEL_PATH)
        pitch_model = YOLO(PITCH_MODEL_PATH)
    except Exception as e:
        print(json.dumps({"status": "error", "message": f"YOLO load failed: {e}"}))
        sys.exit(1)

    try:
        shot_model = load_model(SHOT_MODEL_PATH)
        scaler     = joblib.load(SCALER_PATH)
        with open(LABEL_MAP_PATH, "r") as f:
            classes = json.load(f)["classes"]
    except Exception as e:
        print(json.dumps({"status": "error", "message": f"Shot model load failed: {e}"}))
        sys.exit(1)

    mp_pose    = mp.solutions.pose
    mp_drawing = mp.solutions.drawing_utils
    pose       = mp_pose.Pose(min_detection_confidence=0.5, min_tracking_confidence=0.5)

    # ── Open video ───────────────────────────────────────────────────────────
    cap = cv2.VideoCapture(input_path)
    if not cap.isOpened():
        print(json.dumps({"status": "error", "message": f"Cannot open video: {input_path}"}))
        sys.exit(1)

    width  = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
    height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
    fps    = cap.get(cv2.CAP_PROP_FPS) or 30

    fourcc = cv2.VideoWriter_fourcc(*"mp4v")
    out    = cv2.VideoWriter(output_path, fourcc, fps, (width, height))

    # ── State ────────────────────────────────────────────────────────────────
    pose_buffer          = []
    ball_track           = []
    frames_without_ball  = 0
    ball_hit_bat         = False
    latched_shot_label   = None
    latched_shot_conf    = 0.0
    shot_display_countdown = 0
    frames_processed     = 0

    # Aggregated results
    all_shot_labels = []

    # ── Frame loop ───────────────────────────────────────────────────────────
    while True:
        ret, frame = cap.read()
        if not ret:
            break
        frames_processed += 1

        # 1. YOLO Ball/Bat/Batsman detection
        results_ball    = ball_model(frame, verbose=False)
        annotated_frame = results_ball[0].plot()

        # 2. Pose detection (gated on Batsman box)
        batsman_box = None
        for box in results_ball[0].boxes:
            if int(box.cls[0]) == 2:
                batsman_box = box.xyxy[0].tolist()
                break

        current_shot_label = "Waiting..."
        current_shot_conf  = 0.0

        if batsman_box:
            bx1, by1, bx2, by2 = map(int, batsman_box)
            bx1, by1 = max(0, bx1), max(0, by1)
            bx2, by2 = min(width, bx2), min(height, by2)
            crop = frame[by1:by2, bx1:bx2]

            if crop.size > 0:
                img_rgb = cv2.cvtColor(crop, cv2.COLOR_BGR2RGB)
                img_rgb.flags.writeable = False
                res_pose = pose.process(img_rgb)
                img_rgb.flags.writeable = True

                if res_pose.pose_landmarks:
                    crop_w, crop_h = bx2 - bx1, by2 - by1
                    feat = []
                    for p in res_pose.pose_landmarks.landmark:
                        gx, gy = p.x * crop_w + bx1, p.y * crop_h + by1
                        gnx, gny = gx / width, gy / height
                        feat.extend([gnx, gny, p.z, p.visibility])
                        p.x, p.y = gnx, gny

                    mp_drawing.draw_landmarks(
                        annotated_frame,
                        res_pose.pose_landmarks,
                        mp_pose.POSE_CONNECTIONS,
                    )

                    pose_buffer.append(feat)
                    if len(pose_buffer) > SEQ_LEN:
                        pose_buffer.pop(0)

                    if len(pose_buffer) == SEQ_LEN:
                        X        = np.array(pose_buffer, dtype=np.float32)
                        X_scaled = scaler.transform(X).reshape(1, SEQ_LEN, -1)
                        preds    = shot_model.predict(X_scaled, verbose=0)
                        pred_idx = int(np.argmax(preds[0]))
                        label    = classes[pred_idx]
                        conf     = float(preds[0][pred_idx])

                        if label not in IGNORE_LABELS and conf >= CONF_THRESHOLD:
                            current_shot_label = label
                            current_shot_conf  = conf

        # 3. Pitch detection
        results_pitch = pitch_model.predict(frame, conf=0.5, verbose=False)
        pitch_boxes   = []
        for res in results_pitch:
            for box in res.boxes:
                if int(box.cls[0]) == 1:
                    px1, py1, px2, py2 = box.xyxy[0].tolist()
                    pitch_boxes.append((px1, py1, px2, py2))
                    cv2.rectangle(annotated_frame,
                                  (int(px1), int(py1)), (int(px2), int(py2)),
                                  (0, 255, 0), 2)
                    cv2.putText(annotated_frame, "PITCH",
                                (int(px1), int(py1) - 10),
                                cv2.FONT_HERSHEY_SIMPLEX, 0.6, (0, 255, 0), 2)

        # 4. Ball tracking
        boxes                    = results_ball[0].boxes
        ball_detected_this_frame = False
        current_ball_box         = None
        current_bat_box          = None

        for box in boxes:
            cls_name = ball_model.names[int(box.cls[0])].lower()
            if cls_name == "bat":
                current_bat_box = box.xyxy[0].tolist()
            elif cls_name == "ball" and not ball_detected_this_frame:
                x1, y1, x2, y2 = box.xyxy[0].tolist()
                cx, cy = int((x1 + x2) / 2), int((y1 + y2) / 2)
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
                ball_track    = []
                ball_hit_bat  = False

        # Check ball-bat contact
        if current_ball_box and current_bat_box:
            bx1, by1, bx2, by2 = current_ball_box
            tx1, ty1, tx2, ty2 = current_bat_box
            ball_cx = (bx1 + bx2) / 2
            ball_cy = (by1 + by2) / 2
            MARGIN  = 40
            if (tx1 - MARGIN) <= ball_cx <= (tx2 + MARGIN) and \
               (ty1 - MARGIN) <= ball_cy <= (ty2 + MARGIN):
                ball_hit_bat = True
                if current_shot_label != "Waiting...":
                    latched_shot_label      = current_shot_label
                    latched_shot_conf       = current_shot_conf
                    shot_display_countdown  = SHOT_DISPLAY_FRAMES
                    all_shot_labels.append(latched_shot_label)

        # 5. Trail
        annotated_frame = draw_trail(annotated_frame, ball_track)

        # 6. Ball type
        ball_type = analyze_ball(ball_track)

        # Countdown
        if shot_display_countdown > 0:
            shot_display_countdown -= 1
        else:
            latched_shot_label = None

        # 7. Stats overlay
        cv2.rectangle(annotated_frame, (20, 20), (450, 160), (0, 0, 0), -1)
        cv2.putText(annotated_frame, f"BALL TYPE: {ball_type}",
                    (30, 50), cv2.FONT_HERSHEY_SIMPLEX, 0.7, (0, 255, 255), 2)
        cv2.putText(annotated_frame, f"POINTS: {len(ball_track)}",
                    (30, 80), cv2.FONT_HERSHEY_SIMPLEX, 0.6, (255, 255, 255), 2)

        if not ball_hit_bat:
            cv2.putText(annotated_frame, "SHOT: Waiting for hit...",
                        (30, 120), cv2.FONT_HERSHEY_SIMPLEX, 0.6, (150, 150, 150), 1)
        elif latched_shot_label:
            cv2.putText(annotated_frame,
                        f"SHOT: {latched_shot_label} ({latched_shot_conf * 100:.1f}%)",
                        (30, 120), cv2.FONT_HERSHEY_SIMPLEX, 0.7, (0, 255, 100), 2)
        else:
            cv2.putText(annotated_frame, "SHOT: Detecting...",
                        (30, 120), cv2.FONT_HERSHEY_SIMPLEX, 0.6, (150, 150, 150), 1)

        # 8. Write frame (NO imshow)
        out.write(annotated_frame)

    # ── Cleanup ──────────────────────────────────────────────────────────────
    cap.release()
    out.release()
    pose.close()

    # ── Summary ──────────────────────────────────────────────────────────────
    final_ball_type   = analyze_ball(ball_track) if ball_track else "NO DATA"
    final_shot_label  = latched_shot_label or (all_shot_labels[-1] if all_shot_labels else "None")

    summary = {
        "status":           "ok",
        "ball_type":        final_ball_type,
        "shot_label":       final_shot_label,
        "shot_conf":        round(latched_shot_conf, 3),
        "ball_points":      len(ball_track),
        "frames_processed": frames_processed,
        "all_shots":        all_shot_labels,
    }
    print(json.dumps(summary), flush=True)


# ─────────────────────────────────────────────────────────────────────────────
if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Cricket AI full pipeline (headless)")
    parser.add_argument("--input",  required=True, help="Input video path")
    parser.add_argument("--output", required=True, help="Output video path")
    args = parser.parse_args()
    run(args.input, args.output)
