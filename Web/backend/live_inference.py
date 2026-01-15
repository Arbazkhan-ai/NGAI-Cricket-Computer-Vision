import cv2
import sys
import os
import argparse
import pickle
import numpy as np
import mediapipe as mp
import warnings
from ultralytics import YOLO
from flask import Flask, Response
from flask_cors import CORS

# Suppress warnings
warnings.filterwarnings("ignore")

# Initialize Flask App
app = Flask(__name__)
CORS(app)

# Constants
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
ROOT_DIR = os.path.join(BASE_DIR, '..')
YOLO_PATH = os.path.join(ROOT_DIR, 'best.pt')
PKL_PATH = os.path.join(ROOT_DIR, 'model_data', 'cricket_shot_model.pkl')

# Global State
camera = None
yolo_model = None
pkl_model = None
show_landmarks = False
mp_pose = None
mp_drawing = None
pose = None

def load_models():
    global yolo_model, pkl_model
    yolo_model = None
    pkl_model = None

    print(f"Loading YOLO from {YOLO_PATH}...")
    if os.path.exists(YOLO_PATH):
        yolo_model = YOLO(YOLO_PATH)
    else:
        print(f"Warning: YOLO model not found at {YOLO_PATH}")

    print(f"Loading PKL from {PKL_PATH}...")
    if os.path.exists(PKL_PATH):
        with open(PKL_PATH, "rb") as f:
            pkl_model = pickle.load(f)
    else:
        print(f"Warning: PKL model not found at {PKL_PATH}")

def initialize_mediapipe():
    global mp_pose, mp_drawing, pose
    mp_pose = mp.solutions.pose
    mp_drawing = mp.solutions.drawing_utils
    pose = mp_pose.Pose(static_image_mode=False, min_detection_confidence=0.5, min_tracking_confidence=0.5)



@app.route('/video_feed')
def video_feed():
    return Response(generate_frames(), mimetype='multipart/x-mixed-replace; boundary=frame')

@app.route('/health')
def health():
    return {"status": "running"}

def main():
    global camera, show_landmarks
    
    parser = argparse.ArgumentParser()
    parser.add_argument("--ip", type=str, default="", help="IP Address for Camera")
    parser.add_argument("--port", type=str, default="", help="Port for Camera")
    parser.add_argument("--landmarks", type=str, default="false", help="Show Landmarks (true/false)")
    args = parser.parse_args()

    show_landmarks = args.landmarks.lower() == "true"
    ip = args.ip
    port = args.port

    load_models()
    initialize_mediapipe()

    # 1. Try IP Camera
    camera = None
    if ip and port:
        url = f"http://{ip}:{port}/video"
        print(f"Attempting to connect to IP Camera: {url}")
        camera = cv2.VideoCapture(url)
        if not camera.isOpened():
            print("Failed to connect to IP Camera. Falling back to default camera.")
            camera = None
    
    # 2. Fallback to Default Camera
    if camera is None or not camera.isOpened():
        print("Connecting to Default Camera (0)...")
        camera = cv2.VideoCapture(0)

    if not camera.isOpened():
        print("Error: Could not open any camera. Starting in Dummy Mode.")
        camera = None

    print("Starting Live Detection Server on port 8080...")
    # Run Flask server
    try:
        app.run(host='0.0.0.0', port=8080, debug=False, threaded=True)
    finally:
        if camera:
            camera.release()

def generate_frames():
    global camera, show_landmarks, yolo_model, pkl_model, mp_drawing, pose, mp_pose

    while True:
        frame = None
        if camera is None or not camera.isOpened():
            # Create a black dummy frame
            frame = np.zeros((480, 640, 3), dtype=np.uint8)
            cv2.putText(frame, "Camera Not Found", (200, 240), 
                        cv2.FONT_HERSHEY_SIMPLEX, 1, (0, 0, 255), 2)
            cv2.putText(frame, "Check connection", (220, 280), 
                        cv2.FONT_HERSHEY_SIMPLEX, 0.7, (0, 0, 255), 1)
            # Add a small delay to simulate frame rate
            cv2.waitKey(30)
        else:
            ret, frame = camera.read()
            if not ret:
                print("Failed to grab frame. Switching to dummy frame.")
                camera.release()
                camera = None
                continue

        # If we have a valid frame (real or dummy)
        if frame is not None:
             # Process with MediaPipe ONLY if it's a real frame? 
             # Actually, if it's a dummy frame, we probably don't want to process it.
             if camera is not None:
                 try:
                    # Process with MediaPipe
                    image_rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
                    results = pose.process(image_rgb)

                    # Draw Landmarks if enabled
                    if show_landmarks and results.pose_landmarks:
                        mp_drawing.draw_landmarks(
                            frame,
                            results.pose_landmarks,
                            mp_pose.POSE_CONNECTIONS,
                            mp_drawing.DrawingSpec(color=(245, 117, 66), thickness=2, circle_radius=2),
                            mp_drawing.DrawingSpec(color=(245, 66, 230), thickness=2, circle_radius=2)
                        )

                    # Prediction Logic
                    if results.pose_landmarks and pkl_model:
                        try:
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

                            # Get confidence
                            conf = "N/A"
                            if hasattr(pkl_model, "predict_proba"):
                                probs = pkl_model.predict_proba([row])[0]
                                conf = f"{float(max(probs))*100:.1f}%"

                            # Display text
                            cv2.rectangle(frame, (0, 0), (300, 60), (245, 117, 16), -1)
                            cv2.putText(frame, f"Shot: {final_name}", (10, 30), 
                                        cv2.FONT_HERSHEY_SIMPLEX, 0.8, (255, 255, 255), 2, cv2.LINE_AA)
                            cv2.putText(frame, f"Conf: {conf}", (10, 55), 
                                        cv2.FONT_HERSHEY_SIMPLEX, 0.6, (255, 255, 255), 1, cv2.LINE_AA)

                        except Exception as e:
                            print(f"Prediction Error: {e}")
                 except Exception as overall_e:
                     print(f"Processing Error: {overall_e}")

             # Encode frame
             ret, buffer = cv2.imencode('.jpg', frame)
             if not ret:
                 continue
                
             frame_bytes = buffer.tobytes()
             yield (b'--frame\r\n'
                   b'Content-Type: image/jpeg\r\n\r\n' + frame_bytes + b'\r\n')

if __name__ == "__main__":
    main()
