import os
import sys
import cv2
import numpy as np
import mediapipe as mp
from fastapi import FastAPI, UploadFile, File, HTTPException, Form
from fastapi.middleware.cors import CORSMiddleware
from ultralytics import YOLO
from pydantic import BaseModel
import io
import json
import joblib
# Support for both Keras and ONNX model loading since process_video expects ONNX
from tensorflow.keras.models import load_model
import onnxruntime as ort
from fastapi.responses import StreamingResponse

# Initialize FastAPI
app = FastAPI(title="Cricket Shot Detection API")

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Paths
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
MODELS_DIR = os.path.join(os.path.dirname(BASE_DIR), 'models')

# Add paths to sys.path so we can import the video processing modules
sys.path.append(os.path.dirname(BASE_DIR)) # ai_engine
sys.path.append(os.path.join(os.path.dirname(os.path.dirname(BASE_DIR)), "cricket_lbw_system"))

from process_video import process_video as pv_live
try:
    from process_lbw_video import process_video as pv_lbw
except ImportError:
    pv_lbw = None

YOLO_MODEL_PATH = os.path.join(MODELS_DIR, "yolo_ball_best.pt")
YOLO_PITCH_PATH = os.path.join(MODELS_DIR, "yolo_pitch_best.pt")
SHOT_MODEL_PATH = os.path.join(MODELS_DIR, "lstm_shot_v2.keras")
SHOT_ONNX_PATH  = os.path.join(MODELS_DIR, "lstm_shot_v2.onnx")
SCALER_PATH     = os.path.join(MODELS_DIR, "scaler_v2.save")
LABEL_MAP_PATH  = os.path.join(MODELS_DIR, "label_map_v2.json")

# Global Models
yolo_model = None
pitch_yolo_model = None
shot_model = None
scaler = None
classes = []
pose_detector = None

# Config
SEQ_LEN = 30
CONF_THRESHOLD = 0.70

@app.on_event("startup")
def load_models():
    global yolo_model, pitch_yolo_model, shot_model, scaler, classes, pose_detector
    
    try:
        if os.path.exists(YOLO_MODEL_PATH):
            yolo_model = YOLO(YOLO_MODEL_PATH)
            print("YOLO ball model loaded.")
        
        if os.path.exists(YOLO_PITCH_PATH):
            pitch_yolo_model = YOLO(YOLO_PITCH_PATH)
            print("YOLO pitch model loaded.")
        
        if os.path.exists(SHOT_ONNX_PATH):
            shot_model = ort.InferenceSession(SHOT_ONNX_PATH)
            scaler = joblib.load(SCALER_PATH)
            with open(LABEL_MAP_PATH, "r") as f:
                classes = json.load(f)["classes"]
            print("LSTM ONNX model loaded.")
        elif os.path.exists(SHOT_MODEL_PATH):
            shot_model = load_model(SHOT_MODEL_PATH)
            scaler = joblib.load(SCALER_PATH)
            with open(LABEL_MAP_PATH, "r") as f:
                classes = json.load(f)["classes"]
            print("LSTM Keras model loaded.")

        mp_pose = mp.solutions.pose
        pose_detector = mp_pose.Pose(static_image_mode=True, min_detection_confidence=0.5)
        print("MediaPipe initialized.")
    except Exception as e:
        print(f"Startup Error: {e}")

@app.post("/predict")
async def predict(
    file: UploadFile = File(...)
):
    try:
        contents = await file.read()
        nparr = np.frombuffer(contents, np.uint8)
        img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
        if img is None: raise HTTPException(status_code=400, detail="Invalid image")
        
        # Flip frame horizontally to fix mirroring (Left -> Right, Right -> Left)
        img = cv2.flip(img, 1)

        h, w, _ = img.shape
        results_data = []

        # 1. YOLO Detection
        if yolo_model:
            yolo_res = yolo_model(img, verbose=False, conf=0.15)
            for res in yolo_res:
                for box in res.boxes:
                    cls_id = int(box.cls[0])
                    results_data.append({
                        "type": "box",
                        "class_name": yolo_model.names[cls_id],
                        "conf": float(box.conf[0]),
                        "xyxy": box.xyxy[0].tolist(),
                        "model": "yolo"
                    })
        
        if pitch_yolo_model:
            pitch_res = pitch_yolo_model(img, verbose=False, conf=0.5)
            for res in pitch_res:
                for box in res.boxes:
                    results_data.append({
                        "type": "box",
                        "class_name": "PITCH",
                        "conf": float(box.conf[0]),
                        "xyxy": box.xyxy[0].tolist(),
                        "model": "yolo_pitch"
                    })

        # 2. Pose & Shot (Single Frame Estimation - Note: LSTM usually needs sequence, 
        # for single image we can only do pose or dummy sequence)
        img_rgb = cv2.cvtColor(img, cv2.COLOR_BGR2RGB)
        pose_res = pose_detector.process(img_rgb)
        
        if pose_res.pose_landmarks:
            keypoints = [[lm.x, lm.y] for lm in pose_res.pose_landmarks.landmark]
            results_data.append({
                "type": "pose",
                "keypoints": keypoints,
                "model": "mediapipe"
            })

        return {
            "message": "Analysis successful",
            "data": results_data
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/process-video")
async def process_video_endpoint(input_path: str = Form(...), output_path: str = Form(...), mode: str = Form("mediapipe")):
    models_dict = {
        'ball_model': yolo_model,
        'pitch_model': pitch_yolo_model,
        'shot_model': shot_model,
        'scaler': scaler,
        'classes': classes,
        'pose_detector': pose_detector
    }
    return StreamingResponse(pv_live(input_path, output_path, mode, models_dict), media_type="text/event-stream")

@app.post("/process-lbw-video")
async def process_lbw_endpoint(input_path: str = Form(...), output_path: str = Form(...), mode: str = Form("auto")):
    if not pv_lbw:
        raise HTTPException(status_code=500, detail="LBW processor not found")
    models_dict = {
        'ball_model': yolo_model,
        'pitch_model': pitch_yolo_model,
        'shot_model': shot_model,
        'scaler': scaler,
        'classes': classes,
        'pose_detector': pose_detector
    }
    return StreamingResponse(pv_lbw(input_path, output_path, mode, models_dict), media_type="text/event-stream")

@app.get("/")
def home():
    return {"message": "Cricket AI Detection API Running with Unified Models"}
