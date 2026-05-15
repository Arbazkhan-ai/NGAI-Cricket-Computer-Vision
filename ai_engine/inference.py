import sys
import json
import os
import traceback
import cv2
import numpy as np
import warnings
import mediapipe as mp
from ultralytics import YOLO

# Suppress warnings
warnings.filterwarnings("ignore")

# Silence STDOUT for loading
original_stdout = sys.stdout
sys.stdout = open(os.devnull, 'w')

# Constants
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
MODELS_DIR = os.path.join(BASE_DIR, 'models')

YOLO_PATH = os.path.join(MODELS_DIR, "yolo_ball_best.pt")
YOLO_PITCH_PATH = os.path.join(MODELS_DIR, "yolo_pitch_best.pt")
SHOT_MODEL_PATH = os.path.join(MODELS_DIR, "lstm_shot_v2.keras")

# Global Models
yolo_model = None
pitch_model = None
pose_detector = None

try:
    if os.path.exists(YOLO_PATH):
        yolo_model = YOLO(YOLO_PATH)
    if os.path.exists(YOLO_PITCH_PATH):
        pitch_model = YOLO(YOLO_PITCH_PATH)
    mp_pose = mp.solutions.pose
    pose_detector = mp_pose.Pose(static_image_mode=True, min_detection_confidence=0.5, model_complexity=1)
except Exception as e:
    pass

sys.stdout = original_stdout

def run_inference(image_path, mode="yolo"):
    output = []
    try:
        img = cv2.imread(image_path)
        if img is None: return {"error": "Could not read image"}

        # 1. YOLO Detection
        if yolo_model:
            results = yolo_model(img, verbose=False, conf=0.15)
            for res in results:
                for box in res.boxes:
                    cls_id = int(box.cls[0])
                    output.append({
                        "type": "box",
                        "class_name": yolo_model.names[cls_id],
                        "conf": float(box.conf[0]),
                        "xyxy": box.xyxy[0].tolist(),
                        "model": "yolo"
                    })
        
        if pitch_model:
            p_results = pitch_model(img, verbose=False, conf=0.5)
            for res in p_results:
                for box in res.boxes:
                    output.append({
                        "type": "box",
                        "class_name": "PITCH",
                        "conf": float(box.conf[0]),
                        "xyxy": box.xyxy[0].tolist(),
                        "model": "yolo_pitch"
                    })

        # 2. Pose Detection
        img_rgb = cv2.cvtColor(img, cv2.COLOR_BGR2RGB)
        res_pose = pose_detector.process(img_rgb)
        if res_pose.pose_landmarks:
            output.append({
                "type": "pose",
                "keypoints": [[lm.x, lm.y] for lm in res_pose.pose_landmarks.landmark],
                "model": "mediapipe"
            })
            
        return output
    except Exception as e:
        return {"error": str(e)}

if __name__ == "__main__":
    for line in sys.stdin:
        if not line.strip(): continue
        try:
            data = json.loads(line)
            res = run_inference(data.get("image_path"), data.get("mode", "yolo"))
            print(json.dumps(res))
            sys.stdout.flush()
        except Exception as e:
            print(json.dumps({"error": str(e)}))
            sys.stdout.flush()
