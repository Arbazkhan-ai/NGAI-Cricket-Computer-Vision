import cv2
import sys
import os
import argparse
import pickle
import numpy as np
import mediapipe as mp
import warnings
from ultralytics import YOLO

# Suppress warnings
warnings.filterwarnings("ignore")

# Constants
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
ROOT_DIR = os.path.join(BASE_DIR, '..')
YOLO_PATH = os.path.join(ROOT_DIR, 'best.pt')
PKL_PATH = os.path.join(ROOT_DIR, 'model_data', 'cricket_shot_model.pkl')

def process_video(input_path, output_path, mode="mediapipe"):
    print(f"Processing video: {input_path} with mode: {mode}")
    
    cap = cv2.VideoCapture(input_path)
    if not cap.isOpened():
        print(f"Error: Could not open video file {input_path}")
        return False

    # Get video properties
    width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
    height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
    fps = int(cap.get(cv2.CAP_PROP_FPS))
    if fps == 0: fps = 30 # Default to 30 if unknown
    
    # Init Models
    yolo_model = None
    pkl_model = None
    mp_pose = None
    mp_drawing = None
    pose = None

    if mode == "yolo":
        if os.path.exists(YOLO_PATH):
            yolo_model = YOLO(YOLO_PATH)
        else:
            print("Error: YOLO model not found")
            return False
    elif mode == "mediapipe":
        if os.path.exists(PKL_PATH):
            with open(PKL_PATH, "rb") as f:
                pkl_model = pickle.load(f)
        else:
            print("Error: PKL model not found")
            return False
            
        mp_pose = mp.solutions.pose
        mp_drawing = mp.solutions.drawing_utils
        pose = mp_pose.Pose(static_image_mode=False, min_detection_confidence=0.5, min_tracking_confidence=0.5)

    # Init Video Writer
    # Use mp4v for compatibility
    fourcc = cv2.VideoWriter_fourcc(*'mp4v')
    out = cv2.VideoWriter(output_path, fourcc, fps, (width, height))

    NAME_MAPPING = {
        "Stap-Out": "Step-Shot",
        "stop-out": "Step-Shot",
        "Pull shot": "Pull Shot",
        "Straight Drive": "Straight Drive",
        "Batsman": "Batsman",
        "Drive": "Drive",
        "Sweep": "Sweep"
    }

    frame_count = 0
    total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))

    while cap.isOpened():
        ret, frame = cap.read()
        if not ret:
            break
        
        frame_count += 1
        if frame_count % 30 == 0:
            print(f"Processing frame {frame_count}/{total_frames}")

        if mode == "mediapipe":
            # MediaPipe Processing
            image_rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
            results = pose.process(image_rgb)

            if results.pose_landmarks:
                # Draw Landmarks
                mp_drawing.draw_landmarks(
                    frame,
                    results.pose_landmarks,
                    mp_pose.POSE_CONNECTIONS,
                    mp_drawing.DrawingSpec(color=(245, 117, 66), thickness=2, circle_radius=2),
                    mp_drawing.DrawingSpec(color=(245, 66, 230), thickness=2, circle_radius=2)
                )

                if pkl_model:
                    try:
                        landmarks = results.pose_landmarks.landmark
                        row = []
                        for lm in landmarks:
                            row.extend([lm.x, lm.y, lm.z, lm.visibility])

                        prediction = pkl_model.predict([row])[0]
                        prediction_str = str(prediction)
                        final_name = NAME_MAPPING.get(prediction_str, prediction_str)

                        # Draw Box and Text
                        cv2.rectangle(frame, (0, 0), (300, 60), (245, 117, 16), -1)
                        cv2.putText(frame, final_name, (10, 40), 
                                    cv2.FONT_HERSHEY_SIMPLEX, 1, (255, 255, 255), 2, cv2.LINE_AA)
                    except Exception as e:
                        pass
        
        elif mode == "yolo":
            # YOLO Processing
            results = yolo_model(frame, verbose=False, conf=0.25)
            if results:
                for result in results:
                     # Draw boxes
                    frame = result.plot() # Ultralytics plot() returns the frame with annotations
        
        out.write(frame)

    cap.release()
    out.release()
    print("Video processing complete.")
    return True

if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", required=True, help="Input video path")
    parser.add_argument("--output", required=True, help="Output video path")
    parser.add_argument("--mode", default="mediapipe", help="Mode: yolo or mediapipe")
    
    args = parser.parse_args()
    
    success = process_video(args.input, args.output, args.mode)
    if not success:
        sys.exit(1)
