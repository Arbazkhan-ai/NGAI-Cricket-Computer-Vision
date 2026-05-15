# realtime_predict_updated.py
import os
import cv2
import json
import joblib
import numpy as np
import mediapipe as mp
from tensorflow.keras.models import load_model

# -------------------------
# CONFIG
# -------------------------
MODEL_PATH = "saved_models_v2/lstm_final.keras"
SCALER_PATH = "saved_models_v2/scaler.save"
LABEL_MAP = "saved_models_v2/label_map.json"

SEQ_LEN = 30
FRAME_W = 640      # fixed width
FRAME_H = 480      # fixed height

USE_WEBCAM = False
VIDEO_SOURCE = r"shots video\pull shot\pul_unseen.mp4"

CONF_THRESHOLD = 0.70          # only show predictions above this confidence
IGNORE_LABELS  = {"Batsman"}   # labels to suppress (background/idle class)

# -------------------------
# LOAD MODEL + SCALER + LABELS
# -------------------------
model = load_model(MODEL_PATH)
scaler = joblib.load(SCALER_PATH)

with open(LABEL_MAP, "r") as f:
    classes = json.load(f)["classes"]

print("Classes:", classes)

# -------------------------
# MEDIAPIPE INIT
# -------------------------
mp_pose = mp.solutions.pose
mp_drawing = mp.solutions.drawing_utils

pose = mp_pose.Pose(
    min_detection_confidence=0.5,
    min_tracking_confidence=0.5
)

# -------------------------
# VIDEO SOURCE
# -------------------------
buffer = []
cap = cv2.VideoCapture(0 if USE_WEBCAM else VIDEO_SOURCE)

# Setup VideoWriter to save the output
fps = cap.get(cv2.CAP_PROP_FPS)
if not fps or fps == 0 or np.isnan(fps):
    fps = 30.0
fourcc = cv2.VideoWriter_fourcc(*'mp4v')
out = cv2.VideoWriter('output_video.mp4', fourcc, fps, (FRAME_W, FRAME_H))

while True:
    ret, frame = cap.read()
    if not ret:
        break

    # ✅ Resize frame (important for speed + consistency)
    frame = cv2.resize(frame, (FRAME_W, FRAME_H))

    img_rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
    img_rgb.flags.writeable = False
    res = pose.process(img_rgb)
    img_rgb.flags.writeable = True

    if res.pose_landmarks:

        # ✅ DRAW SKELETON
        mp_drawing.draw_landmarks(
            frame,
            res.pose_landmarks,
            mp_pose.POSE_CONNECTIONS
        )

        lm = res.pose_landmarks.landmark
        feat = []

        for p in lm:
            feat.extend([p.x, p.y, p.z, p.visibility])

        buffer.append(feat)

        if len(buffer) > SEQ_LEN:
            buffer.pop(0)

        # -------------------------
        # PREDICTION
        # -------------------------
        if len(buffer) == SEQ_LEN:
            X = np.array(buffer, dtype=np.float32)
            X_scaled = scaler.transform(X)
            X_scaled = X_scaled.reshape(1, SEQ_LEN, -1)

            preds = model.predict(X_scaled, verbose=0)
            pred_idx = np.argmax(preds[0])
            label = classes[pred_idx]
            conf  = float(preds[0][pred_idx])

            # Only display if it's a real shot above confidence threshold
            if label not in IGNORE_LABELS and conf >= CONF_THRESHOLD:
                # Background overlay for text
                cv2.rectangle(frame, (5, 10), (400, 65), (0, 0, 0), -1)

                # Shot label + confidence
                cv2.putText(
                    frame,
                    f"{label}  {conf*100:.1f}%",
                    (10, 48),
                    cv2.FONT_HERSHEY_SIMPLEX,
                    1.1,
                    (0, 255, 100),
                    2,
                    cv2.LINE_AA
                )

                # Confidence bar
                bar_x, bar_y, bar_h = 10, 70, 12
                bar_max_w = 380
                filled_w  = int(bar_max_w * conf)
                cv2.rectangle(frame, (bar_x, bar_y), (bar_x + bar_max_w, bar_y + bar_h), (50, 50, 50), -1)
                cv2.rectangle(frame, (bar_x, bar_y), (bar_x + filled_w,  bar_y + bar_h), (0, 220, 90),  -1)
            else:
                # Subtle idle indicator
                cv2.putText(
                    frame,
                    "Waiting for shot...",
                    (10, 40),
                    cv2.FONT_HERSHEY_SIMPLEX,
                    0.65,
                    (120, 120, 120),
                    1,
                    cv2.LINE_AA
                )

    # -------------------------
    # SHOW
    # -------------------------
    cv2.imshow("Cricket Shot Detection", frame)
    out.write(frame)  # Save the frame to the output video

    if cv2.waitKey(1) & 0xFF == ord('q'):
        break

cap.release()
out.release()
cv2.destroyAllWindows()
