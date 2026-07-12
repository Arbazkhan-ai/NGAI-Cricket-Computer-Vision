from ultralytics import YOLO
import cv2
import numpy as np

import os
BASE_DIR = os.path.dirname(os.path.abspath(__file__))

class Detector:
    def __init__(self, 
                 ball_model_path=os.path.join(BASE_DIR, 'models', 'ball_model.pt'), 
                 pitch_model_path=os.path.join(BASE_DIR, 'models', 'pitch.pt'), 
                 stump_model_path=os.path.join(BASE_DIR, 'runs', 'detect', 'train', 'weights', 'best.pt'),
                 ball_model=None, pitch_model=None, stump_model=None):
        self.ball_model = ball_model if ball_model else YOLO(ball_model_path)
        self.pitch_model = pitch_model if pitch_model else YOLO(pitch_model_path)
        self.stump_model = stump_model if stump_model else YOLO(stump_model_path)
        
    def detect_pitch(self, frame):
        results = self.pitch_model(frame, verbose=False, conf=0.75)[0]
        for box in results.boxes:
            if int(box.cls[0]) == 1: # Pitch
                return list(map(int, box.xyxy[0]))
        return None

    def detect_stumps(self, frame, conf_threshold=0.60):
        results = self.stump_model(frame, verbose=False, conf=0.60)[0]
        best_box = None
        highest_conf = 0.0
        for box in results.boxes:
            if int(box.cls[0]) == 0:  # Class 0: stumps
                conf = float(box.conf[0])
                if conf >= conf_threshold and conf > highest_conf:
                    highest_conf = conf
                    best_box = list(map(int, box.xyxy[0]))
        return best_box


    def detect_objects(self, frame, pitch_roi=None, manual_pitch=None):
        results = self.ball_model(frame, verbose=False, conf=0.15)[0]
        detections = {
            'ball': None,
            'batsman': None,
            'bat': None
        }
        
        highest_conf = {'ball': 0, 'batsman': 0, 'bat': 0}

        for box in results.boxes:
            cls = int(box.cls[0])
            conf = float(box.conf[0])
            x1, y1, x2, y2 = map(int, box.xyxy[0])
            cx, cy = (x1 + x2) // 2, (y1 + y2) // 2

            # Class mapping: 0: Ball, 1: Bat, 2: Batsman
            key = None
            if cls == 0: key = 'ball'
            elif cls == 1: key = 'bat'
            elif cls == 2: key = 'batsman'

            # Pitch Constraint for Batsman and Bat
            if key in ['batsman', 'bat']:
                if manual_pitch and len(manual_pitch) == 4:
                    pts = np.array(manual_pitch, np.int32)
                    if cv2.pointPolygonTest(pts, (float(cx), float(cy)), True) < -20:
                        continue
                elif pitch_roi:
                    px1, py1, px2, py2 = pitch_roi
                    if not ((px1 - 20) <= cx <= (px2 + 20) and (py1 - 20) <= cy <= (py2 + 20)):
                        continue

            if key and conf > highest_conf[key]:
                highest_conf[key] = conf
                detections[key] = {
                    'bbox': (x1, y1, x2, y2),
                    'center': (cx, cy),
                    'conf': conf
                }
        
        return detections
