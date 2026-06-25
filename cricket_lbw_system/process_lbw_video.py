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

def process_video(input_path, output_path, mode="auto", models_dict=None):
    import json
    yield f"data: {json.dumps({'progress': f'Starting LBW processing: {input_path}'})}\n\n"
    cap = cv2.VideoCapture(input_path)
    if not cap.isOpened():
        yield f"data: {json.dumps({'error': 'Could not open video source'})}\n\n"
        return
        
    width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
    height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
    fps = int(cap.get(cv2.CAP_PROP_FPS)) or 30

    # Load Shot Detection Model
    if models_dict:
        shot_model = models_dict.get('shot_model')
        scaler = models_dict.get('scaler')
        classes = models_dict.get('classes')
    else:
        import onnxruntime as ort
        import joblib
        BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
        MODELS_DIR = os.path.join(BASE_DIR, 'ai_engine', 'models')
        try:
            shot_model = ort.InferenceSession(os.path.join(MODELS_DIR, "lstm_shot_v2.onnx"))
            scaler = joblib.load(os.path.join(MODELS_DIR, "scaler_v2.save"))
            with open(os.path.join(MODELS_DIR, "label_map_v2.json"), "r") as f:
                classes = json.load(f)["classes"]
        except Exception as e:
            yield f"data: {json.dumps({'error': f'Failed to load shot detection model: {e}'})}\n\n"
            shot_model = None

    pose_buffer = []
    current_shot_label = ""
    current_shot_conf = 0.0

    ret, temp_frame = cap.read()
    if not ret:
        yield f"data: {json.dumps({'error': 'Could not read first frame'})}\n\n"
        cap.release()
        return
        
    resized_temp = resize_frame(temp_frame)
    frame_h, frame_w = resized_temp.shape[:2]
    cap.set(cv2.CAP_PROP_POS_FRAMES, 0)
    
    fps = cap.get(cv2.CAP_PROP_FPS)
    if not fps or fps <= 0 or fps != fps:
        fps = 30.0
        
    fourcc = cv2.VideoWriter_fourcc(*'avc1')
    out = cv2.VideoWriter(output_path, fourcc, fps, (frame_w, frame_h))
    if not out.isOpened():
        fourcc = cv2.VideoWriter_fourcc(*'mp4v')
        out = cv2.VideoWriter(output_path, fourcc, fps, (frame_w, frame_h))
    
    total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))

    # Initialize Modules
    if models_dict:
        detector = Detector(ball_model=models_dict.get('ball_model'), pitch_model=models_dict.get('pitch_model'))
        pose_detector = BatsmanPoseDetector(pose_instance=models_dict.get('pose_detector'))
    else:
        detector = Detector()
        pose_detector = BatsmanPoseDetector()
        
    tracker = BallTracker(smoothing_factor=0.6, jump_threshold=120)
    predictor = TrajectoryPredictor()
    lbw_logic = LBWLogic()

    manual_pitch_pts = []
    if mode.startswith('[') and mode.endswith(']'):
        import json
        try:
            raw_pts = json.loads(mode)
            orig_w = temp_frame.shape[1]
            orig_h = temp_frame.shape[0]
            scale_x = frame_w / orig_w
            scale_y = frame_h / orig_h
            manual_pitch_pts = [[int(pt[0] * scale_x), int(pt[1] * scale_y)] for pt in raw_pts]
        except:
            manual_pitch_pts = []
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
            import json
            yield f"data: {json.dumps({'progress': f'Frame {frame_idx}/{total_frames}'})}\n\n"
            
        frame = resize_frame(frame)

        # 1. Detect Pitch (Auto) & Stumps (Auto)
        if mode == "auto":
            new_pitch_roi = detector.detect_pitch(frame)
            if new_pitch_roi:
                pitch_roi = new_pitch_roi
            
        new_stump_rect = detector.detect_stumps(frame)
        if new_stump_rect:
            stump_rect = new_stump_rect

        # 2. Detect Objects (Strict Pitch Enforcement)
        if not pitch_roi and not manual_pitch_pts:
            objects = {}
            ball_data = None
            batsman_data = None
            bat_data = None
        else:
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
            
            # Shot prediction logic
            if shot_model and pose_results and pose_results.pose_landmarks:
                bx1, by1, bx2, by2 = pose_offset
                cw, ch = bx2 - bx1, by2 - by1
                feat = []
                for p in pose_results.pose_landmarks.landmark:
                    feat.extend([(p.x * cw + bx1)/width, (p.y * ch + by1)/height, p.z, p.visibility])
                pose_buffer.append(feat)
                if len(pose_buffer) > 30: pose_buffer.pop(0)
                if len(pose_buffer) == 30:
                    X = np.array(pose_buffer, dtype=np.float32)
                    X_scaled = scaler.transform(X).reshape(1, 30, -1).astype(np.float32)
                    ort_inputs = {shot_model.get_inputs()[0].name: X_scaled}
                    preds = shot_model.run(None, ort_inputs)[0]
                    idx = np.argmax(preds[0])
                    if classes[idx] != "Batsman" and preds[0][idx] >= 0.70:
                        current_shot_label, current_shot_conf = classes[idx], float(preds[0][idx])

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
            manual_pitch_pts,
            bat_zone=bat_zone,
            pad_zone=pad_zone,
            first_contact=lbw_logic.first_contact,
            show_setup=True,
            show_detections=True,
            shot_label=current_shot_label,
            shot_conf=current_shot_conf
        )

        out.write(output_frame)
        
        if frame_idx % 3 == 0:
            ret, buffer = cv2.imencode('.jpg', output_frame, [cv2.IMWRITE_JPEG_QUALITY, 40])
            if ret:
                import base64
                b64 = base64.b64encode(buffer).decode('utf-8')
                import json
                yield f"data: {json.dumps({'frame': b64})}\n\n"

    cap.release()
    out.release()
    import json
    yield f"data: {json.dumps({'progress': 'LBW Analysis Complete', 'final_result': {'decision': final_decision, 'conf': final_conf}})}\n\n"
    return True

if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", required=True)
    parser.add_argument("--output", required=True)
    parser.add_argument('--mode', type=str, default="auto", help='Analysis mode or manual pitch JSON array')
    args = parser.parse_args()
    
    for output in process_video(args.input, args.output, args.mode):
        import json
        if output.startswith("data: "):
            try:
                data = json.loads(output[6:])
                if "progress" in data:
                    print(data["progress"], flush=True)
                elif "frame" in data:
                    print(f"FRAME_DATA:{data['frame']}", flush=True)
                elif "final_result" in data:
                    print(f"FINAL_RESULT: {data['final_result'].get('decision', '')}|{data['final_result'].get('conf', 1.0)}", flush=True)
                elif "error" in data:
                    print(f"ERROR: {data['error']}", flush=True)
            except:
                pass
