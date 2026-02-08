import sys
import json
import os
import traceback

# 1. Silence STDOUT to prevent JSON corruption, but log STDERR to file for debugging
original_stdout = sys.stdout
original_stderr = sys.stderr

sys.stdout = open(os.devnull, 'w')
# Write errors to a file so we can read them via tool
sys.stderr = open(os.path.join(os.path.dirname(__file__), 'error_log.txt'), 'w')

import pickle
import cv2
import numpy as np
import warnings
import mediapipe as mp
from ultralytics import YOLO

# Suppress warnings
warnings.filterwarnings("ignore")

# Base Directory
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
# Models are in Web/ (one level up from backend)
ROOT_DIR = os.path.join(BASE_DIR, '..')

YOLO_PATH = os.path.join(ROOT_DIR, 'best.pt')
PKL_PATH = os.path.join(ROOT_DIR, 'model_data', 'cricket_shot_model.pkl')

# ---------------------------------------------------------
# GLOBAL MODEL LOADING (Load ONCE)
# ---------------------------------------------------------

    
yolo_model = None
pkl_model = None
mp_pose = None
pose = None

# Global Initialization
try:
    # Load YOLO
    if os.path.exists(YOLO_PATH):
        yolo_model = YOLO(YOLO_PATH)

    # Load PKL
    if os.path.exists(PKL_PATH):
        with open(PKL_PATH, "rb") as f:
            pkl_model = pickle.load(f)

    # Init MediaPipe Globally
    mp_pose = mp.solutions.pose
    # Using static_image_mode=True is safer for independent frames
    pose = mp_pose.Pose(static_image_mode=True, min_detection_confidence=0.5, model_complexity=1)

except Exception as e:
    pass

# Restore stdout now that models are loaded (we want to print results)
# BUT we must be careful only to print JSON
sys.stdout = original_stdout
# sys.stderr = original_stderr # Keep stderr suppressed or restore for debug

def run_inference(image_path, mode="mediapipe"):
    output = []
    
    try:
        # ---------------------------------------------------------
        # MODE: MEDIA_PIPE (PKL)
        # ---------------------------------------------------------
        if mode == 'pkl' or mode == 'mediapipe':
            global pkl_model, pose
            
            if pkl_model is None:
                if not os.path.exists(PKL_PATH):
                     raise FileNotFoundError(f"Pickle model not found at {PKL_PATH}")
                with open(PKL_PATH, "rb") as f:
                    pkl_model = pickle.load(f)

            if pose is None:
                 mp_pose = mp.solutions.pose
                 pose = mp_pose.Pose(static_image_mode=True, min_detection_confidence=0.5, model_complexity=1)

            # Read Image
            img = cv2.imread(image_path)
            if img is None:
                raise ValueError(f"Could not read image at {image_path}")

            img_rgb = cv2.cvtColor(img, cv2.COLOR_BGR2RGB)
            results = pose.process(img_rgb)

            if results.pose_landmarks:
                # Extract landmarks
                landmarks = results.pose_landmarks.landmark
                row = []
                for lm in landmarks:
                    row.extend([lm.x, lm.y, lm.z, lm.visibility])

                # Predict
                prediction = pkl_model.predict([row])[0]
                prediction_str = str(prediction)

                # Name Mapping
                NAME_MAPPING = {
                    "Stap-Out": "Step-Shot",
                    "stop-out": "Step-Shot",
                    "Pull shot": "Pull Shot",
                    "Straight Drive": "Straight Drive",
                    "Batsman": "Batsman",
                    "Drive": "Drive",
                    "Sweep": "Sweep"
                }
                final_name = NAME_MAPPING.get(prediction_str, prediction_str)

                conf = 1.0
                if hasattr(pkl_model, "predict_proba"):
                        probs = pkl_model.predict_proba([row])[0]
                        conf = float(max(probs))

                # Calculate Bounding Box from Landmarks
                h, w, _ = img.shape
                x_coords = [lm.x * w for lm in landmarks]
                y_coords = [lm.y * h for lm in landmarks]
                x1, y1 = min(x_coords), min(y_coords)
                x2, y2 = max(x_coords), max(y_coords)

                # Extract Keypoints for Frontend
                keypoints = [[lm.x, lm.y] for lm in landmarks]

                output.append({
                    "type": "box",
                    "class_name": final_name,
                    "conf": conf,
                    "xyxy": [x1, y1, x2, y2],
                    "keypoints": keypoints,
                    "model": "mediapipe"
                })

        # ---------------------------------------------------------
        # MODE: YOLO (Video/Photo)
        # ---------------------------------------------------------
        else:
            if yolo_model is None:
                if not os.path.exists(YOLO_PATH):
                     raise FileNotFoundError(f"YOLO model not found at {YOLO_PATH}")
                globals()['yolo_model'] = YOLO(YOLO_PATH)

            # Run inference using global model
            results = yolo_model(image_path, verbose=False, conf=0.1)
            
            if results:
                for result in results:
                    # Boxes
                    if hasattr(result, 'boxes') and result.boxes is not None:
                        for box in result.boxes:
                            cls_id = int(box.cls[0])
                            cls_name = yolo_model.names[cls_id] if hasattr(yolo_model, 'names') else str(cls_id)
                            output.append({
                                "type": "box",
                                "class_name": cls_name,
                                "conf": float(box.conf[0]),
                                "xyxy": box.xyxy[0].tolist(),
                                "model": "yolo"
                            })
                    
                    # Classification
                    if hasattr(result, 'probs') and result.probs is not None:
                        top1 = int(result.probs.top1)
                        cls_name = yolo_model.names[top1] if hasattr(yolo_model, 'names') else str(top1)
                        output.append({
                            "type": "classification",
                            "class_name": cls_name,
                            "conf": float(result.probs.top1conf),
                            "model": "yolo"
                        })

        return output

    except Exception as e:
        return {"error": str(e), "traceback": traceback.format_exc()}

if __name__ == "__main__":
    
    # ---------------------------------------------------------
    # MODE 1: ONESHOT (CLI ARGS) - Legacy support
    # ---------------------------------------------------------
    if len(sys.argv) >= 2:
        try:
            img_path = sys.argv[1]
            mode_arg = sys.argv[2] if len(sys.argv) > 2 else "yolo"
            final_output = run_inference(img_path, mode_arg)
        except Exception as e:
            final_output = {"error": str(e), "traceback": traceback.format_exc()}
        
        print(json.dumps(final_output))

    # ---------------------------------------------------------
    # MODE 2: SERVICE (STDIN LOOP) - Fast support
    # ---------------------------------------------------------
    else:
        # Continuous loop reading from STDIN
        # Input expected: JSON line {"image_path": "...", "mode": "..."}
        try:
            for line in sys.stdin:
                if not line.strip():
                    continue
                    
                try:
                    data = json.loads(line)
                    res = run_inference(data.get("image_path"), data.get("mode", "yolo"))
                    print(json.dumps(res))
                    sys.stdout.flush() # CRITICAL for Node.js to receive it immediately
                except json.JSONDecodeError:
                    print(json.dumps({"error": "Invalid JSON input"}))
                    sys.stdout.flush()
                except Exception as e:
                    print(json.dumps({"error": str(e), "traceback": traceback.format_exc()}))
                    sys.stdout.flush()
                    
        except BrokenPipeError:
            # Node.js closed the stream
            pass
