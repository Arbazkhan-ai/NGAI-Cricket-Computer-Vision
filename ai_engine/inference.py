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

YOLO_PATH = os.path.join(os.path.dirname(BASE_DIR), "ai_models", "detect", "train", "weights", "best_shot.pt")

# Global Models
yolo_model = None
pitch_model = None
pose_detector = None

try:
    if os.path.exists(YOLO_PATH):
        yolo_model = YOLO(YOLO_PATH)
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
            results = yolo_model(img, verbose=False)
            for res in results:
                if getattr(res, 'boxes', None) is not None and len(res.boxes) > 0:
                    for box in res.boxes:
                        cls_id = int(box.cls[0])
                        output.append({
                            "type": "box",
                            "class_name": yolo_model.names[cls_id],
                            "conf": float(box.conf[0]),
                            "xyxy": box.xyxy[0].tolist(),
                            "model": "yolo"
                        })
                elif getattr(res, 'probs', None) is not None:
                    top1 = res.probs.top1
                    output.append({
                        "type": "classification",
                        "class_name": yolo_model.names[top1],
                        "conf": float(res.probs.top1conf),
                        "model": "yolo"
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
