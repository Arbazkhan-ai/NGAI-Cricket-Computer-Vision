import cv2
import time
import argparse
import numpy as np
from ball_detection import Detector
from tracking import BallTracker
from pose_detection import BatsmanPoseDetector
from trajectory_prediction import TrajectoryPredictor
from lbw_logic import LBWLogic
from visualization import draw_analytics
from utils import resize_frame

# Global variables for mouse callback
drawing_stumps = False
ix, iy = -1, -1
stump_rect = [300, 400, 500, 700]
manual_pitch_pts = []
manual_stumps_drawn = False
show_setup_toggle = True
pad_hit_time = None

def mouse_callback(event, x, y, flags, param):
    global ix, iy, drawing_stumps, stump_rect, manual_pitch_pts, manual_stumps_drawn
    
    # Left Click - Draw Stump Rectangle
    if event == cv2.EVENT_LBUTTONDOWN:
        drawing_stumps = True
        ix, iy = x, y
    elif event == cv2.EVENT_MOUSEMOVE:
        if drawing_stumps:
            stump_rect = [min(ix, x), min(iy, y), max(ix, x), max(iy, y)]
    elif event == cv2.EVENT_LBUTTONUP:
        drawing_stumps = False
        stump_rect = [min(ix, x), min(iy, y), max(ix, x), max(iy, y)]
        manual_stumps_drawn = True
        
    # Right Click - Set Manual Pitch Points (4 points)
    elif event == cv2.EVENT_RBUTTONDOWN:
        if len(manual_pitch_pts) < 4:
            manual_pitch_pts.append((x, y))
        else:
            manual_pitch_pts = [(x, y)] # Reset and start over

def main():
    global manual_pitch_pts, manual_stumps_drawn, show_setup_toggle, pad_hit_time
    parser = argparse.ArgumentParser()
    parser.add_argument('--input', type=str, default='videos/lbw.mp4', help='Path to video file or "webcam"')
    args = parser.parse_args()

    # Initialize Modules
    detector = Detector()
    tracker = BallTracker(smoothing_factor=0.6, jump_threshold=120)
    pose_detector = BatsmanPoseDetector()
    predictor = TrajectoryPredictor()
    lbw_logic = LBWLogic()

    # Video Source
    if args.input == 'webcam':
        cap = cv2.VideoCapture(0)
    else:
        cap = cv2.VideoCapture(args.input)

    if not cap.isOpened():
        print(f"Error: Could not open video source {args.input}")
        return

    # Determine resized dimensions for VideoWriter
    ret, temp_frame = cap.read()
    if not ret:
        print("Error: Could not read first frame from video source")
        cap.release()
        return
    resized_temp = resize_frame(temp_frame)
    frame_h, frame_w = resized_temp.shape[:2]
    cap.set(cv2.CAP_PROP_POS_FRAMES, 0) # Reset capture to frame 0

    fps = cap.get(cv2.CAP_PROP_FPS)
    if not fps or fps <= 0 or fps != fps:
        fps = 30.0

    # Initialize VideoWriter to save video in "outputs" folder
    import os
    os.makedirs('outputs', exist_ok=True)
    if args.input == 'webcam':
        output_filename = 'webcam_detection.mp4'
    else:
        base_name = os.path.basename(args.input)
        name, _ = os.path.splitext(base_name)
        output_filename = f"{name}_detection.mp4"
    output_path = os.path.join('outputs', output_filename)
    fourcc = cv2.VideoWriter_fourcc(*'mp4v')
    out = cv2.VideoWriter(output_path, fourcc, fps, (frame_w, frame_h))
    print(f"Saving output video to: {output_path}")

    # Read first frame for paused startup calibration state
    ret, first_frame = cap.read()
    if not ret:
        print("Error: Could not read first frame from video source")
        cap.release()
        return
    first_frame = resize_frame(first_frame)
    use_first_frame = True

    # State definition
    STATE_STARTUP = 0
    STATE_CALIBRATING = 1
    STATE_PLAYING = 2
    current_state = STATE_STARTUP

    cv2.namedWindow("Cricket LBW Analytics System", cv2.WINDOW_NORMAL)
    cv2.resizeWindow("Cricket LBW Analytics System", 1000, 700)
    cv2.setMouseCallback("Cricket LBW Analytics System", mouse_callback)

    prev_time = 0
    pitch_roi = None
    
    while cap.isOpened():
        # Transition states based on manual pitch points
        if current_state == STATE_STARTUP and len(manual_pitch_pts) > 0:
            current_state = STATE_CALIBRATING
            
        if current_state == STATE_CALIBRATING and len(manual_pitch_pts) == 4:
            current_state = STATE_PLAYING

        if current_state == STATE_PLAYING:
            if use_first_frame:
                use_first_frame = False
                frame = first_frame.copy()
            else:
                ret, frame = cap.read()
                if not ret:
                    print("Video ended. Saving current output run and waiting 3 seconds before reset...")
                    out.release()
                    cv2.waitKey(3000)
                    # Re-initialize the VideoWriter for the next loop
                    out = cv2.VideoWriter(output_path, fourcc, fps, (frame_w, frame_h))
                    cap.set(cv2.CAP_PROP_POS_FRAMES, 0)
                    ret, first_frame = cap.read()
                    if not ret:
                        break
                    first_frame = resize_frame(first_frame)
                    use_first_frame = True
                    lbw_logic.reset()
                    tracker.clear()
                    pad_hit_time = None
                    manual_pitch_pts = []
                    current_state = STATE_STARTUP
                    continue
                frame = resize_frame(frame)
        else:
            frame = first_frame.copy()
        
        if current_state == STATE_PLAYING:
            # 1. Detect Pitch (Auto) & Stumps (Auto)
            new_pitch_roi = detector.detect_pitch(frame)
            if new_pitch_roi:
                pitch_roi = new_pitch_roi
                
            if not manual_stumps_drawn:
                new_stump_rect = detector.detect_stumps(frame)
                if new_stump_rect:
                    stump_rect = new_stump_rect

            # 2. Detect Objects (Filtered by Manual Pitch if 4 pts exist, else Auto ROI)
            objects = detector.detect_objects(frame, pitch_roi=pitch_roi, manual_pitch=manual_pitch_pts)
            ball_data = objects.get('ball')
            batsman_data = objects.get('batsman')
            bat_data = objects.get('bat')
            
            ball_center = ball_data['center'] if ball_data else None
            
            # 3. Create Heat Zones
            bat_zone = None
            if bat_data:
                btx1, bty1, btx2, bty2 = bat_data['bbox']
                bat_zone = (btx1, bty1, btx2, bty2)
                
            pad_zone = None
            # Option 2: Use MediaPipe landmarks for Pad Zone
            pose_results, leg_positions, pose_offset = None, [], None
            if batsman_data:
                pose_results, leg_positions, pose_offset = pose_detector.detect_pose(frame, batsman_data['bbox'])
                if leg_positions:
                    # Calculate bounding box of the leg landmarks
                    lx = [p[0] for p in leg_positions]
                    ly = [p[1] for p in leg_positions]
                    pad_zone = (min(lx), min(ly), max(lx), max(ly))
                else:
                    # Fallback: Use bottom half of batsman bbox
                    bx1, by1, bx2, by2 = batsman_data['bbox']
                    pad_zone = (bx1, int(by1 + (by2-by1)*0.5), bx2, by2)
            
            # 4. Track Ball
            trajectory = tracker.update(ball_center)
            
            # 5. Check Collision & Impact (Pass trajectory)
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
            curr_time = time.time()
            fps = 1 / (curr_time - prev_time) if (curr_time - prev_time) > 0 else 0
            prev_time = curr_time
            
            if pose_results:
                pose_detector.draw_skeleton(frame, pose_results, offset=pose_offset)
            
            # Show setup elements during drawing/setup OR if the toggle is enabled
            show_setup = show_setup_toggle or drawing_stumps or (0 < len(manual_pitch_pts) < 4)
            
            # If delay is active, suppress the visual impact indicators
            vis_impact_point = None if is_delay_active else lbw_logic.impact_point
            vis_first_contact = None if is_delay_active else lbw_logic.first_contact

            output_frame = draw_analytics(
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
                show_setup=show_setup
            )

            # Help Text
            cv2.putText(output_frame, "Left Click-Drag: Stumps | Right Click: 4 Pitch Pts | 'c': Clear Pitch | 'r': Reset | 's': Toggle Overlay", 
                        (10, frame.shape[0] - 20), cv2.FONT_HERSHEY_SIMPLEX, 0.5, (0, 255, 255), 1)

            # Save current frame to output video
            out.write(output_frame)

            cv2.imshow("Cricket LBW Analytics System", output_frame)
            
            # Adjust playback speed: Slow motion if impact detected
            wait_time = 30 if lbw_logic.first_contact else 1
            key = cv2.waitKey(wait_time) & 0xFF
        else:
            # Menu overlay on first frame
            if current_state == STATE_STARTUP:
                overlay = frame.copy()
                cv2.rectangle(overlay, (frame_w//2 - 350, frame_h//2 - 120), (frame_w//2 + 350, frame_h//2 + 100), (0, 0, 0), -1)
                cv2.rectangle(overlay, (frame_w//2 - 350, frame_h//2 - 120), (frame_w//2 + 350, frame_h//2 + 100), (0, 255, 150), 2)
                cv2.addWeighted(overlay, 0.7, frame, 0.3, 0, frame)
                
                cv2.putText(frame, "CRICKET LBW SYSTEM - SETUP", (frame_w//2 - 280, frame_h//2 - 70),
                            cv2.FONT_HERSHEY_SIMPLEX, 1.0, (0, 255, 150), 3, cv2.LINE_AA)
                cv2.putText(frame, "Press 'A' : Auto Pitch Detection & Start Video", (frame_w//2 - 300, frame_h//2 - 10),
                            cv2.FONT_HERSHEY_SIMPLEX, 0.7, (255, 255, 255), 2, cv2.LINE_AA)
                cv2.putText(frame, "Press 'M' : Manual Pitch Calibration Mode", (frame_w//2 - 300, frame_h//2 + 30),
                            cv2.FONT_HERSHEY_SIMPLEX, 0.7, (255, 255, 255), 2, cv2.LINE_AA)
                cv2.putText(frame, "Or start right-clicking 4 points on the pitch.", (frame_w//2 - 250, frame_h//2 + 70),
                            cv2.FONT_HERSHEY_SIMPLEX, 0.5, (180, 180, 180), 1, cv2.LINE_AA)

            elif current_state == STATE_CALIBRATING:
                overlay = frame.copy()
                cv2.rectangle(overlay, (frame_w//2 - 300, 20), (frame_w//2 + 300, 100), (0, 0, 0), -1)
                cv2.rectangle(overlay, (frame_w//2 - 300, 20), (frame_w//2 + 300, 100), (255, 255, 0), 2)
                cv2.addWeighted(overlay, 0.7, frame, 0.3, 0, frame)
                
                cv2.putText(frame, "MANUAL PITCH CALIBRATION", (frame_w//2 - 220, 50),
                            cv2.FONT_HERSHEY_SIMPLEX, 0.8, (255, 255, 0), 2, cv2.LINE_AA)
                cv2.putText(frame, f"Right-click 4 points on pitch: {len(manual_pitch_pts)}/4 placed", (frame_w//2 - 260, 85),
                            cv2.FONT_HERSHEY_SIMPLEX, 0.6, (255, 255, 255), 1, cv2.LINE_AA)
                
                if len(manual_pitch_pts) > 0:
                    for idx, pt in enumerate(manual_pitch_pts):
                        cv2.circle(frame, pt, 6, (255, 255, 0), -1)
                        cv2.putText(frame, str(idx+1), (pt[0]+8, pt[1]-8), cv2.FONT_HERSHEY_SIMPLEX, 0.5, (255, 255, 0), 2)
                    if len(manual_pitch_pts) > 1:
                        pts = np.array(manual_pitch_pts, np.int32)
                        cv2.polylines(frame, [pts], False, (255, 255, 0), 2)
                
                cv2.putText(frame, "Press 'A' to switch to Auto Detection | 'c' to clear points", 
                            (10, frame_h - 20), cv2.FONT_HERSHEY_SIMPLEX, 0.5, (0, 255, 255), 1)

            cv2.imshow("Cricket LBW Analytics System", frame)
            key = cv2.waitKey(30) & 0xFF

        # Key handlers
        if key == ord('q'):
            break
        elif key == ord('a'):
            current_state = STATE_PLAYING
        elif key == ord('m'):
            current_state = STATE_CALIBRATING
        elif key == ord('c'):
            manual_pitch_pts = []
        elif key == ord('r'):
            lbw_logic.reset()
            tracker.clear()
            manual_stumps_drawn = False
            pad_hit_time = None
            manual_pitch_pts = []
            cap.set(cv2.CAP_PROP_POS_FRAMES, 0)
            ret, first_frame = cap.read()
            if ret:
                first_frame = resize_frame(first_frame)
            use_first_frame = True
            current_state = STATE_STARTUP
        elif key == ord('s'):
            show_setup_toggle = not show_setup_toggle

    cap.release()
    out.release()
    print(f"Output video successfully saved to {output_path}")
    cv2.destroyAllWindows()

if __name__ == "__main__":
    main()
