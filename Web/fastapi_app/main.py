
import os
import sys
import pickle
import cv2
import numpy as np
import mediapipe as mp
from fastapi import FastAPI, UploadFile, File, HTTPException, Form
from fastapi.middleware.cors import CORSMiddleware
from ultralytics import YOLO
from pydantic import BaseModel
import io
from PIL import Image

# Initialize FastAPI
app = FastAPI(title="Cricket Shot Detection API")

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Allow all for dev
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Paths
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
ROOT_DIR = os.path.dirname(BASE_DIR)
YOLO_MODEL_PATH = os.path.join(ROOT_DIR, 'best.pt')
PKL_MODEL_PATH = os.path.join(ROOT_DIR, 'model_data', 'cricket_shot_model.pkl')

# Global Models
yolo_model = None
pkl_model = None
mp_pose = None
pose_detector = None

@app.on_event("startup")
def load_models():
    global yolo_model, pkl_model, mp_pose, pose_detector
    
    # Load YOLO
    if os.path.exists(YOLO_MODEL_PATH):
        print(f"Loading YOLO model from {YOLO_MODEL_PATH}")
        yolo_model = YOLO(YOLO_MODEL_PATH)
    else:
        print(f"Warning: YOLO model not found at {YOLO_MODEL_PATH}")

    # Load Pickle Model
    if os.path.exists(PKL_MODEL_PATH):
        print(f"Loading Pickle model from {PKL_MODEL_PATH}")
        with open(PKL_MODEL_PATH, "rb") as f:
            pkl_model = pickle.load(f)
    else:
        print(f"Warning: Pickle model not found at {PKL_MODEL_PATH}")

    # Initialize MediaPipe
    try:
        mp_pose = mp.solutions.pose
        # static_image_mode=True for independent frame processing via HTTP
        # Lower confidence to 0.3 to detect easier
        pose_detector = mp_pose.Pose(static_image_mode=True, min_detection_confidence=0.3, model_complexity=1)
        print("MediaPipe initialized successfully")
    except Exception as e:
        print(f"Error initializing MediaPipe: {e}")
        print("MediaPipe features will be disabled.")
        mp_pose = None
        pose_detector = None

@app.post("/predict")
async def predict(
    file: UploadFile = File(...),
    mode: str = Form("yolo") # 'yolo' or 'mediapipe'
):
    try:
        # Read Image
        contents = await file.read()
        nparr = np.frombuffer(contents, np.uint8)
        img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
        
        if img is None:
            print("Error: Failed to decode image")
            raise HTTPException(status_code=400, detail="Invalid image file")
            
        # Debug: Save first 3 images to check content
        debug_dir = os.path.join(ROOT_DIR, "debug_images")
        os.makedirs(debug_dir, exist_ok=True)
        files_count = len(os.listdir(debug_dir))
        if files_count < 3:
             debug_path = os.path.join(debug_dir, f"received_{files_count}.jpg")
             cv2.imwrite(debug_path, img)
             print(f"Saved debug image to {debug_path}")
            
        print(f"Received image: {img.shape}, Mode: {mode}")

        results_data = []

        if mode == "mediapipe":
            if pose_detector is None:
                 return {
                    "message": "MediaPipe is not active on server",
                    "data": [], # Return empty to avoid bad UI updates
                    "db_id": 0
                 }

            # Convert to RGB
            img_rgb = cv2.cvtColor(img, cv2.COLOR_BGR2RGB)
            results = pose_detector.process(img_rgb)
            
            if results.pose_landmarks:
                print("Pose DETECTED")
                # Extract landmarks
                landmarks = results.pose_landmarks.landmark
                # Flatten: x, y, z, visibility
                row = []
                for lm in landmarks:
                    row.extend([lm.x, lm.y, lm.z, lm.visibility])
                
                # Predict
                if pkl_model:
                    # Sklearn expects [samples, features]
                    prediction = pkl_model.predict([row])[0]
                    prediction_str = str(prediction)
                    
                    # Map names if needed (Fix typos from model)
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
                    print(f"Prediction: {prediction_str} -> {final_name}")
                    
                    # Get probability if possible
                    probs = pkl_model.predict_proba([row])[0] if hasattr(pkl_model, "predict_proba") else None
                    conf = float(max(probs)) if probs is not None else 1.0
                    
                    results_data.append({
                        "type": "classification",
                        "class_name": final_name,
                        "conf": conf,
                        "model": "mediapipe"
                    })
                else:
                     print("PKL model not loaded")
            else:
                 print(f"No pose detected in frame. Image stats: Mean={img.mean()}")
                 # Do not append anything to results_data so frontend ignores it

        else: # YOLO default
            if yolo_model:
                results = yolo_model(img, verbose=False, conf=0.1)
                for result in results:
                    # Boxes
                    if hasattr(result, 'boxes') and result.boxes is not None:
                         for box in result.boxes:
                            cls_id = int(box.cls[0])
                            cls_name = yolo_model.names[cls_id] if yolo_model.names else str(cls_id)
                            results_data.append({
                                "type": "box",
                                "class_name": cls_name,
                                "conf": float(box.conf[0]),
                                "xyxy": box.xyxy[0].tolist(),
                                "model": "yolo"
                            })
                    
                    # Classification (if YOLO-cls)
                    if hasattr(result, 'probs') and result.probs is not None:
                        top1 = int(result.probs.top1)
                        results_data.append({
                            "type": "classification",
                            "class_name": yolo_model.names[top1],
                            "conf": float(result.probs.top1conf),
                            "model": "yolo"
                        })
            else:
                 results_data.append({"error": "YOLO model not loaded"})

        return {
            "message": "Analysis successful",
            "data": results_data,
            "db_id": 0 # Placeholder as we are bypassing DB for now
        }

    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/")
def home():
    return {"message": "Cricket Shot Detection API Running"}
