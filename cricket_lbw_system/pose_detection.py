import mediapipe as mp
import cv2

class BatsmanPoseDetector:
    def __init__(self):
        self.mp_pose = mp.solutions.pose
        self.pose = self.mp_pose.Pose(static_image_mode=False, min_detection_confidence=0.5)
        self.mp_draw = mp.solutions.drawing_utils
        
    def detect_pose(self, frame, person_bbox=None):
        if person_bbox:
            # Crop frame to person bbox for better accuracy and to target ONLY the batsman
            x1, y1, x2, y2 = person_bbox
            # Add some padding
            h, w, _ = frame.shape
            x1, y1 = max(0, x1 - 20), max(0, y1 - 20)
            x2, y2 = min(w, x2 + 20), min(h, y2 + 20)
            
            roi = frame[y1:y2, x1:x2]
            if roi.size == 0:
                return None, []
                
            rgb_roi = cv2.cvtColor(roi, cv2.COLOR_BGR2RGB)
            results = self.pose.process(rgb_roi)
            
            leg_positions = []
            if results.pose_landmarks:
                rh, rw, _ = roi.shape
                for idx in [25, 26, 27, 28]:
                    lm = results.pose_landmarks.landmark[idx]
                    # Map back to original frame coordinates
                    cx, cy = int(lm.x * rw) + x1, int(lm.y * rh) + y1
                    leg_positions.append((cx, cy))
            
            # Note: results here are relative to ROI. 
            # For drawing, we'll need to adjust landmarks or just pass them as is if we draw on ROI.
            # But we want to draw on the original frame. 
            # I'll return a modified results or just the leg positions.
            return results, leg_positions, (x1, y1, x2, y2)
        else:
            # Fallback to full frame detection
            rgb_frame = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
            results = self.pose.process(rgb_frame)
            leg_positions = []
            if results.pose_landmarks:
                h, w, _ = frame.shape
                for idx in [25, 26, 27, 28]:
                    lm = results.pose_landmarks.landmark[idx]
                    cx, cy = int(lm.x * w), int(lm.y * h)
                    leg_positions.append((cx, cy))
            return results, leg_positions, None

    def draw_skeleton(self, frame, results, offset=None):
        if results and results.pose_landmarks:
            if offset:
                # We need to manually draw if we want it on the full frame
                # Or just crop, draw, and paste back. Paste back is easier.
                x1, y1, x2, y2 = offset
                roi = frame[y1:y2, x1:x2]
                self.mp_draw.draw_landmarks(roi, results.pose_landmarks, self.mp_pose.POSE_CONNECTIONS)
                frame[y1:y2, x1:x2] = roi
            else:
                self.mp_draw.draw_landmarks(frame, results.pose_landmarks, self.mp_pose.POSE_CONNECTIONS)
