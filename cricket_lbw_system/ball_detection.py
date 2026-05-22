from ultralytics import YOLO
import cv2
import numpy as np

class Detector:
    def __init__(self, ball_model_path='models/ball_model.pt', pitch_model_path='models/pitch.pt', stump_model_path='runs/detect/train/weights/best.pt'):
        self.ball_model = YOLO(ball_model_path)
        self.pitch_model = YOLO(pitch_model_path)
        self.stump_model = YOLO(stump_model_path)
        
    def detect_pitch(self, frame):
        results = self.pitch_model(frame, verbose=False)[0]
        for box in results.boxes:
            if int(box.cls[0]) == 1: # Pitch
                return list(map(int, box.xyxy[0]))
        return None

    def detect_stumps(self, frame, conf_threshold=0.5):
        results = self.stump_model(frame, verbose=False)[0]
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
        results = self.ball_model(frame, verbose=False)[0]
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

            # Filter by Pitch (Manual Polygon takes priority, then Auto ROI)
            if manual_pitch and len(manual_pitch) == 4:
                pts = np.array(manual_pitch, np.int32)
                if cv2.pointPolygonTest(pts, (float(cx), float(cy)), False) < 0:
                    continue
            elif pitch_roi:
                px1, py1, px2, py2 = pitch_roi
                if not (px1 <= cx <= px2 and py1 <= cy <= py2):
                    continue

            # Class mapping: 0: Ball, 1: Bat, 2: Batsman
            key = None
            if cls == 0: key = 'ball'
            elif cls == 1: key = 'bat'
            elif cls == 2: key = 'batsman'

            if key and conf > highest_conf[key]:
                highest_conf[key] = conf
                detections[key] = {
                    'bbox': (x1, y1, x2, y2),
                    'center': (cx, cy),
                    'conf': conf
                }
        
        return detections
