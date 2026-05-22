import cv2
import sys
import time
import os
import argparse
import numpy as np
from flask import Flask, Response, request, jsonify
from flask_cors import CORS
from ball_detection import Detector
from tracking import BallTracker
from pose_detection import BatsmanPoseDetector
from trajectory_prediction import TrajectoryPredictor
from lbw_logic import LBWLogic
from visualization import draw_analytics
from utils import resize_frame

# Initialize Flask App
app = Flask(__name__)
CORS(app)

# Global Models
print("--- PRE-LOADING LBW MODELS ---")
detector = Detector()
tracker = BallTracker(smoothing_factor=0.6, jump_threshold=120)
pose_detector = BatsmanPoseDetector()
predictor = TrajectoryPredictor()
lbw_logic = LBWLogic()
print("--- MODELS READY ---")

# Camera State
camera = None
connection_status = "Not Connected"
current_ip = ""

# LBW Tracking State
pitch_roi = None
stump_rect = [300, 400, 500, 700]
pad_hit_time = None
manual_pitch_pts = []

@app.route('/api/connect', methods=['POST'])
def connect_camera():
    global camera, connection_status, current_ip, pitch_roi, stump_rect, pad_hit_time, manual_pitch_pts
    data = request.json
    ip = data.get('ip', '')
    manual_pitch_pts = data.get('manual_pitch', [])
    
    # Reset tracking state
    pitch_roi = None
    stump_rect = [300, 400, 500, 700]
    pad_hit_time = None
    tracker.clear()
    lbw_logic.reset()
    
    if camera: camera.release()
    
    current_ip = ip
    
    print(f"Connecting to: {ip if ip else 'Local Webcam'}")
    camera = cv2.VideoCapture(ip if ip else 0)
    if camera.isOpened():
        connection_status = "Connected"
        current_ip = ip
        return jsonify({"status": "success", "message": "Connected"})
    else:
        connection_status = "Connection Failed"
        return jsonify({"status": "error", "message": "Failed to open camera"}), 500

@app.route('/api/status', methods=['GET'])
def get_status():
    return jsonify({"status": connection_status, "ip": current_ip})

@app.route('/reset_score', methods=['POST'])
def reset_score():
    tracker.clear()
    lbw_logic.reset()
    global pad_hit_time
    pad_hit_time = None
    return jsonify({"status": "success", "score": 0})

@app.route('/get_score')
def get_score():
    return jsonify({"score": 0, "decision": lbw_logic.decision})

@app.route('/video_feed')
def video_feed():
    return Response(generate_frames(), mimetype='multipart/x-mixed-replace; boundary=frame')

def generate_frames():
    global camera, connection_status, pitch_roi, stump_rect, pad_hit_time, current_ip
    prev_time = time.time()

    while True:
        if camera is None or not camera.isOpened():
            frame = np.zeros((480, 640, 3), dtype=np.uint8)
            cv2.putText(frame, connection_status, (50, 240), cv2.FONT_HERSHEY_SIMPLEX, 0.8, (255, 255, 255), 2)
            time.sleep(0.1)
        else:
            ret, frame = camera.read()
            if not ret:
                connection_status = "Video Finished / Interrupted"
                camera.release(); camera = None; continue

            # Resize frame for LBW
            frame = resize_frame(frame)
            
            # FPS Calculation
            curr_time = time.time()
            fps = 1 / (curr_time - prev_time) if (curr_time - prev_time) > 0 else 0
            prev_time = curr_time

            # 1. Detect Pitch (Auto) & Stumps (Auto)
            if not manual_pitch_pts:
                new_pitch_roi = detector.detect_pitch(frame)
                if new_pitch_roi:
                    pitch_roi = new_pitch_roi
                
            new_stump_rect = detector.detect_stumps(frame)
            if new_stump_rect:
                stump_rect = new_stump_rect

            # 2. Detect Objects
            objects = detector.detect_objects(frame, pitch_roi=pitch_roi, manual_pitch=manual_pitch_pts)
            ball_data = objects.get('ball')
            batsman_data = objects.get('batsman')
            bat_data = objects.get('bat')
            
            ball_center = ball_data['center'] if ball_data else None

            # 3. Create Heat Zones
            bat_zone = None
            if bat_data:
                btx1, bty1, btx2, bty2 = bat_data['bbox']
                bat_zone = (max(0, btx1 - 25), max(0, bty1 - 25), btx2 + 25, bty2 + 25)
                
            pad_zone = None
            pose_results, leg_positions, pose_offset = None, [], None
            if batsman_data:
                pose_results, leg_positions, pose_offset = pose_detector.detect_pose(frame, batsman_data['bbox'])
                if leg_positions:
                    lx = [p[0] for p in leg_positions]
                    ly = [p[1] for p in leg_positions]
                    pad_zone = (min(lx) - 30, min(ly) - 30, max(lx) + 30, max(ly) + 30)
                else:
                    bx1, by1, bx2, by2 = batsman_data['bbox']
                    pad_zone = (bx1, int(by1 + (by2-by1)*0.5), bx2, by2)

            # 4. Track Ball
            trajectory = tracker.update(ball_center)
            
            # 5. Check Collision & Impact
            if lbw_logic.first_contact is None:
                prev_contact = lbw_logic.first_contact
                lbw_logic.check_collision(trajectory, bat_zone, pad_zone)
                if lbw_logic.first_contact == "PAD" and prev_contact is None:
                    pad_hit_time = time.time()

            # 6. Predict Trajectory
            predicted_path = []
            if len(trajectory) > 5:
                predicted_path = predictor.predict(trajectory)

            # 7. Judge LBW
            decision = lbw_logic.decision
            is_delay_active = False
            if lbw_logic.first_contact == "PAD" and pad_hit_time is not None:
                elapsed = time.time() - pad_hit_time
                if elapsed < 3.0:
                    is_delay_active = True
                    delay_remaining = 3.0 - elapsed
                    decision = f"PENDING ({int(delay_remaining) + 1}s)"
                else:
                    if decision == "PENDING" or decision == "CHECK LBW":
                        decision = lbw_logic.judge_lbw(predicted_path, stump_rect)
            else:
                if lbw_logic.first_contact and (decision == "PENDING" or decision == "CHECK LBW"):
                    decision = lbw_logic.judge_lbw(predicted_path, stump_rect)

            # 8. Visualization
            if pose_results:
                pose_detector.draw_skeleton(frame, pose_results, offset=pose_offset)

            vis_impact_point = None if is_delay_active else lbw_logic.impact_point
            vis_first_contact = None if is_delay_active else lbw_logic.first_contact

            annotated_frame = draw_analytics(
                frame, 
                ball_data, 
                objects,
                trajectory, 
                predicted_path, 
                vis_impact_point, 
                decision, 
                fps,
                pitch_roi,
                stump_rect,
                manual_pitch_pts,
                bat_zone=bat_zone,
                pad_zone=pad_zone,
                first_contact=vis_first_contact,
                show_setup=False
            )
            frame = annotated_frame

        ret, buffer = cv2.imencode('.jpg', frame)
        if not ret: continue
        yield (b'--frame\r\n' b'Content-Type: image/jpeg\r\n\r\n' + buffer.tobytes() + b'\r\n')

def main():
    app.run(host='0.0.0.0', port=8081, debug=False, threaded=True)

if __name__ == "__main__":
    main()
