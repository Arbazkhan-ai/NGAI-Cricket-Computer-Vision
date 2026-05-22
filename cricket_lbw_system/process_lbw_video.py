import cv2
import time
import argparse
import sys
import os
import numpy as np
from ball_detection import Detector
from tracking import BallTracker
from pose_detection import BatsmanPoseDetector
from trajectory_prediction import TrajectoryPredictor
from lbw_logic import LBWLogic
from visualization import draw_analytics
from utils import resize_frame

def process_video(input_path, output_path, mode="auto"):
    print(f"Starting LBW processing: {input_path}", flush=True)
    cap = cv2.VideoCapture(input_path)
    if not cap.isOpened():
        print("Error: Could not open video source", flush=True)
        return False

    ret, temp_frame = cap.read()
    if not ret:
        print("Error: Could not read first frame", flush=True)
        cap.release()
        return False
        
    resized_temp = resize_frame(temp_frame)
    frame_h, frame_w = resized_temp.shape[:2]
    cap.set(cv2.CAP_PROP_POS_FRAMES, 0)
    
    fps = cap.get(cv2.CAP_PROP_FPS)
    if not fps or fps <= 0 or fps != fps:
        fps = 30.0
        
    fourcc = cv2.VideoWriter_fourcc(*'mp4v')
    out = cv2.VideoWriter(output_path, fourcc, fps, (frame_w, frame_h))
    
    total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))

    # Initialize Modules
    detector = Detector()
    tracker = BallTracker(smoothing_factor=0.6, jump_threshold=120)
    pose_detector = BatsmanPoseDetector()
    predictor = TrajectoryPredictor()
    lbw_logic = LBWLogic()

    pitch_roi = None
    stump_rect = [300, 400, 500, 700] # Default fallback
    pad_hit_time = None
    frame_idx = 0
    final_decision = "NOT OUT"
    final_conf = 1.0

    while cap.isOpened():
        ret, frame = cap.read()
        if not ret:
            break
            
        frame_idx += 1
        if frame_idx % 10 == 0:
            print(f"Frame {frame_idx}/{total_frames}", flush=True)
            
        frame = resize_frame(frame)

        # 1. Detect Pitch (Auto) & Stumps (Auto)
        new_pitch_roi = detector.detect_pitch(frame)
        if new_pitch_roi:
            pitch_roi = new_pitch_roi
            
        new_stump_rect = detector.detect_stumps(frame)
        if new_stump_rect:
            stump_rect = new_stump_rect

        # 2. Detect Objects
        objects = detector.detect_objects(frame, pitch_roi=pitch_roi)
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
        
        # 5. Check Collision
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
        if decision == "PENDING" or decision == "CHECK LBW":
            decision = lbw_logic.judge_lbw(predicted_path, stump_rect)
            
        if decision != "PENDING" and decision != "CHECK LBW":
            final_decision = decision

        # 8. Visualization
        if pose_results:
            pose_detector.draw_skeleton(frame, pose_results, offset=pose_offset)
            
        output_frame = draw_analytics(
            frame, 
            ball_data, 
            objects,
            trajectory, 
            predicted_path, 
            lbw_logic.impact_point, 
            decision, 
            fps,
            pitch_roi,
            stump_rect,
            [],
            bat_zone=bat_zone,
            pad_zone=pad_zone,
            first_contact=lbw_logic.first_contact,
            show_setup=False
        )

        out.write(output_frame)

    cap.release()
    out.release()
    print(f"FINAL_RESULT: {final_decision}|{final_conf}", flush=True)
    print("Video processing complete.", flush=True)
    return True

if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", required=True)
    parser.add_argument("--output", required=True)
    parser.add_argument("--mode", default="auto")
    args = parser.parse_args()
    process_video(args.input, args.output, args.mode)
