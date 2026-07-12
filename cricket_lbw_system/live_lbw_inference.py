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
import onnxruntime as ort
try:
    sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '..', 'ai_engine')))
    from hawk_eye_engine import estimate_speed, swing_amount, spin_intensity, get_ball_type
except ImportError:
    estimate_speed = lambda *a, **k: 0
    swing_amount = lambda *a, **k: 0
    spin_intensity = lambda *a, **k: 0
    get_ball_type = lambda *a, **k: "UNKNOWN"

import joblib
import json
import requests
import threading
import queue

camera_lock = threading.Lock()
frame_queue = queue.Queue(maxsize=2)
stop_reader_thread = False
reader_thread_obj = None
video_writer = None


class HTTPMJPEGStream:
    def __init__(self, url):
        self.url = url
        self.stream = None
        self.iterator = None
        self.bytes = b''
        self.opened = False
        self._connect()
        
    def _connect(self):
        import requests
        try:
            self.stream = requests.get(self.url, stream=True, timeout=5)
            self.iterator = self.stream.iter_content(chunk_size=8192)
            self.opened = True
        except:
            self.opened = False
            
    def isOpened(self):
        return self.opened
        
    def read(self):
        import cv2
        import numpy as np
        if not self.opened:
            return False, None
        try:
            while True:
                a = self.bytes.find(b'\xff\xd8')
                b = self.bytes.find(b'\xff\xd9')
                if a != -1 and b != -1:
                    if b < a:
                        self.bytes = self.bytes[b+2:]
                        continue
                    jpg = self.bytes[a:b+2]
                    self.bytes = self.bytes[b+2:]
                    frame = cv2.imdecode(np.frombuffer(jpg, dtype=np.uint8), cv2.IMREAD_COLOR)
                    if frame is not None:
                        return True, frame
                chunk = next(self.iterator)
                self.bytes += chunk
        except StopIteration:
            self.opened = False
            return False, None
        except Exception as e:
            self.opened = False
            return False, None
            
    def release(self):
        self.opened = False
        if self.stream:
            self.stream.close()
            
    def get(self, prop_id):
        return 0

def camera_reader_loop():
    global camera, stop_reader_thread, frame_queue, connection_status, video_writer
    while not stop_reader_thread:
        with camera_lock:
            if camera is None or not camera.isOpened():
                time.sleep(0.1)
                continue
            success, frame = camera.read()
        
        if success:
            if video_writer is not None:
                try:
                    video_writer.write(frame)
                except Exception as e:
                    print(f"Error writing to video: {e}")
            if getattr(sys.modules[__name__], 'is_video_file', False):
                frame_queue.put(frame, block=True)
            else:
                if frame_queue.full():
                    try:
                        frame_queue.get_nowait()
                    except queue.Empty:
                        pass
                frame_queue.put(frame)
        else:
            with camera_lock:
                connection_status = "Video Finished / Interrupted"
                if camera:
                    camera.release()
                    camera = None
                if video_writer:
                    video_writer.release()
                    video_writer = None
            time.sleep(0.1)

def start_camera_reader():
    global stop_reader_thread, reader_thread_obj
    stop_reader_thread = False
    if reader_thread_obj is None or not reader_thread_obj.is_alive():
        reader_thread_obj = threading.Thread(target=camera_reader_loop, daemon=True)
        reader_thread_obj.start()

def stop_camera_reader():
    global stop_reader_thread, reader_thread_obj
    stop_reader_thread = True
    if reader_thread_obj is not None:
        reader_thread_obj.join(timeout=1.0)
        reader_thread_obj = None


class HTTPMJPEGStream:
    def __init__(self, url):
        self.url = url
        self.stream = None
        self.iterator = None
        self.bytes = b''
        self.opened = False
        self._connect()
        
    def _connect(self):
        import requests
        try:
            self.stream = requests.get(self.url, stream=True, timeout=5)
            self.iterator = self.stream.iter_content(chunk_size=8192)
            self.opened = True
        except:
            self.opened = False
            
    def isOpened(self):
        return self.opened
        
    def read(self):
        import cv2
        import numpy as np
        if not self.opened:
            return False, None
        try:
            while True:
                a = self.bytes.find(b'\xff\xd8')
                b = self.bytes.find(b'\xff\xd9')
                if a != -1 and b != -1:
                    if b < a:
                        self.bytes = self.bytes[b+2:]
                        continue
                    jpg = self.bytes[a:b+2]
                    self.bytes = self.bytes[b+2:]
                    frame = cv2.imdecode(np.frombuffer(jpg, dtype=np.uint8), cv2.IMREAD_COLOR)
                    if frame is not None:
                        return True, frame
                chunk = next(self.iterator)
                self.bytes += chunk
        except StopIteration:
            self.opened = False
            return False, None
        except Exception as e:
            self.opened = False
            return False, None
            
    def release(self):
        self.opened = False
        if self.stream:
            self.stream.close()
            
    def get(self, prop_id):
        return 0
        
    # Clear queue
    while not frame_queue.empty():
        try:
            frame_queue.get_nowait()
        except queue.Empty:
            break

def create_new_detection_sync(image_path="Live LBW Stream"):
    try:
        r = requests.post("http://127.0.0.1:3000/api/detections/new", json={"image_path": image_path}, timeout=0.3)
        if r.status_code == 200:
            return r.json().get("id")
    except Exception as e:
        print(f"Error creating DB record: {e}")
    return None

def make_api_call_async(url, payload):
    def run():
        try:
            requests.post(url, json=payload, timeout=0.5)
        except Exception as e:
            pass
    threading.Thread(target=run, daemon=True).start()


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

# Shot Model State
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
AI_ENGINE_MODELS_DIR = os.path.join(os.path.dirname(BASE_DIR), 'ai_engine', 'models')
SHOT_MODEL_PATH = os.path.join(AI_ENGINE_MODELS_DIR, "lstm_shot_v2.onnx")
SCALER_PATH     = os.path.join(AI_ENGINE_MODELS_DIR, "scaler_v2.save")
LABEL_MAP_PATH  = os.path.join(AI_ENGINE_MODELS_DIR, "label_map_v2.json")

try:
    shot_model = ort.InferenceSession(SHOT_MODEL_PATH)
    scaler = joblib.load(SCALER_PATH)
    with open(LABEL_MAP_PATH, "r") as f:
        shot_classes = json.load(f)["classes"]
except Exception as e:
    print(f"CRITICAL: Shot Model Loading Error: {e}")
    shot_model = None
    shot_classes = []

SEQ_LEN = 30
CONF_THRESHOLD = 0.70
IGNORE_LABELS  = {"Batsman", "Pose"}

# Camera State
camera = None
connection_status = "Not Connected"
current_ip = ""
show_landmarks_flag = False

# LBW Tracking State
pitch_roi = None
stump_rect = None
pad_hit_time = None
manual_pitch_pts = []
session_log = []
last_logged_pad_hit_time = None
pose_buffer = []
latched_shot_label = "Waiting..."
latched_shot_conf = 0.0
shot_display_countdown = 0
current_db_id = None
frames_without_ball = 0
lbw_decision_time = None
current_display_decision = None
shot_delay_countdown = 0

@app.route('/api/connect', methods=['POST'])
def connect_camera():
    global camera, connection_status, current_ip, pitch_roi, stump_rect, pad_hit_time, manual_pitch_pts, session_log, last_logged_pad_hit_time, pose_buffer, latched_shot_label, latched_shot_conf, shot_display_countdown, shot_delay_countdown, current_db_id, frames_without_ball, lbw_decision_time, current_display_decision, show_landmarks_flag
    data = request.json
    ip = data.get('ip', '')
    manual_pitch_pts = data.get('manual_pitch', [])
    show_landmarks_flag = data.get('showLandmarks', False)
    
    # Reset tracking state
    pitch_roi = None
    stump_rect = None
    pad_hit_time = None
    session_log = []
    last_logged_pad_hit_time = None
    pose_buffer = []
    latched_shot_label = "Waiting..."
    latched_shot_conf = 0.0
    shot_display_countdown = 0
    shot_delay_countdown = 0
    current_db_id = None
    frames_without_ball = 0
    tracker.clear()
    lbw_logic.reset()
    lbw_decision_time = None
    current_display_decision = None
    
    stop_camera_reader()
    with camera_lock:
        if camera: camera.release()
        global video_writer
        if video_writer: video_writer.release(); video_writer = None
    
    global is_video_file
    is_video_file = False
    video_source = ip
    if str(ip).isdigit():
        video_source = int(ip)
    elif isinstance(ip, str) and (ip.startswith('/uploads/') or ip.startswith('uploads/')):
        video_source = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'shared', 'uploads', ip.split('uploads/')[-1])
        is_video_file = True
    elif isinstance(ip, str) and ip.startswith('uploads/'):
        video_source = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'shared', ip)

    print(f"Connecting to: {video_source}")
    with camera_lock:
        if camera: camera.release()
        try:
            os.environ["OPENCV_FFMPEG_CAPTURE_OPTIONS"] = "timeout;5000"
            if isinstance(video_source, int) and os.name == 'nt':
                camera = cv2.VideoCapture(video_source, cv2.CAP_DSHOW)
            else:
                camera = cv2.VideoCapture(video_source)
        except Exception as e:
            print(f"OpenCV Error opening camera: {e}")
            camera = None

    if camera and camera.isOpened():
        connection_status = "Connected"
        global current_ip
        current_ip = ip
        
        success, frame = camera.read()
        if success:
            h, w = frame.shape[:2]
            fps = 30.0
            timestamp = time.strftime("%Y%m%d_%H%M%S")
            upload_dir = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'shared', 'uploads')
            os.makedirs(upload_dir, exist_ok=True)
            save_path = os.path.join(upload_dir, f"live_lbw_recording_{timestamp}.mp4")
            fourcc = cv2.VideoWriter_fourcc(*'mp4v')
            video_writer = cv2.VideoWriter(save_path, fourcc, fps, (w, h))
            if not frame_queue.full():
                frame_queue.put(frame)
                
        start_camera_reader()
        return jsonify({"status": "success", "message": "Connected"})
    else:
        connection_status = "Connection Failed"
        return jsonify({"status": "error", "message": f"Failed to open camera: {video_source}"}), 500

@app.route('/api/status', methods=['GET'])
def get_status():
    return jsonify({"status": connection_status, "ip": current_ip})

@app.route('/reset_score', methods=['POST'])
def reset_score():
    tracker.clear()
    lbw_logic.reset()
    global pad_hit_time, session_log, last_logged_pad_hit_time, current_db_id, frames_without_ball, lbw_decision_time, current_display_decision
    pad_hit_time = None
    session_log = []
    last_logged_pad_hit_time = None
    current_db_id = None
    frames_without_ball = 0
    lbw_decision_time = None
    current_display_decision = None
    return jsonify({"status": "success", "score": 0})

@app.route('/get_score')
def get_score():
    global latched_shot_label, latched_shot_conf, shot_display_countdown, shot_delay_countdown, current_display_decision, lbw_logic
    
    display_shot = None
    display_conf = None
    
    if not current_display_decision:
        if shot_delay_countdown > 0:
            display_shot = "Analyzing..."
            display_conf = 0.0
        elif shot_display_countdown > 0:
            display_shot = latched_shot_label
            display_conf = latched_shot_conf
            
    return jsonify({
        "score": 0, 
        "decision": current_display_decision,
        "contact": lbw_logic.first_contact if current_display_decision else None,
        "shot_label": display_shot,
        "shot_conf": display_conf
    })

@app.route('/get_log')
def get_log():
    return jsonify({"log": session_log})

@app.route('/video_feed')
def video_feed():
    return Response(generate_frames(), mimetype='multipart/x-mixed-replace; boundary=frame')

def generate_frames():
    global camera, connection_status, pitch_roi, stump_rect, pad_hit_time, current_ip, session_log, last_logged_pad_hit_time, pose_buffer, latched_shot_label, latched_shot_conf, shot_display_countdown, shot_delay_countdown, shot_model, scaler, shot_classes, current_db_id, frames_without_ball, lbw_decision_time, current_display_decision, show_landmarks_flag
    prev_time = time.time()
    tracked_trajectory = []
    last_shot_label = None
    last_decision = None
    last_contact = None
    current_frame_idx = 0

    while True:
        current_frame_idx += 1
        try:
            frame = frame_queue.get(timeout=0.1)
            success = True
        except queue.Empty:
            success = False
            with camera_lock:
                if camera is None or not camera.isOpened():
                    frame = np.zeros((480, 640, 3), dtype=np.uint8)
                    cv2.putText(frame, connection_status, (50, 240), cv2.FONT_HERSHEY_SIMPLEX, 0.8, (255, 255, 255), 2)
                    ret, buffer = cv2.imencode('.jpg', frame)
                    frame_bytes = buffer.tobytes()
                    yield (b'--frame\r\n'
                           b'Content-Type: image/jpeg\r\n\r\n' + frame_bytes + b'\r\n')
            continue
        
        # Resize frame for LBW
        orig_h, orig_w = frame.shape[:2]
        frame = resize_frame(frame)
        
        target_width = 1000
        scaled_manual_pitch = []
        if orig_w > target_width:
            target_height = int(orig_h * (target_width / orig_w))
            scale_x = target_width / orig_w
            scale_y = target_height / orig_h
            if manual_pitch_pts:
                scaled_manual_pitch = [[p[0]*scale_x, p[1]*scale_y] for p in manual_pitch_pts]
        else:
            scaled_manual_pitch = list(manual_pitch_pts) if manual_pitch_pts else []
        
        # FPS Calculation
        curr_time = time.time()
        fps = 1 / (curr_time - prev_time) if (curr_time - prev_time) > 0 else 0
        prev_time = curr_time

        # 1. Detect Pitch (Auto) & Stumps (Auto)
        if not scaled_manual_pitch:
            if current_frame_idx % 30 == 0 or not pitch_roi:
                new_pitch_roi = detector.detect_pitch(frame)
                if new_pitch_roi:
                    pitch_roi = new_pitch_roi
                    
            if current_frame_idx % 30 == 0 or not stump_rect:
                new_stump_rect = detector.detect_stumps(frame)
                if new_stump_rect:
                    stump_rect = new_stump_rect

        # 2. Detect Objects
        objects = detector.detect_objects(frame, pitch_roi=pitch_roi, manual_pitch=scaled_manual_pitch)
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
        pose_results, leg_positions, pose_offset = None, [], None
        if batsman_data:
            pose_results, leg_positions, pose_offset = pose_detector.detect_pose(frame, batsman_data['bbox'])
            if leg_positions:
                lx = [p[0] for p in leg_positions]
                ly = [p[1] for p in leg_positions]
                pad_zone = (max(0, min(lx) - 30), max(0, min(ly) - 20), min(frame.shape[1], max(lx) + 30), min(frame.shape[0], max(ly) + 30))
            else:
                bx1, by1, bx2, by2 = batsman_data['bbox']
                pad_zone = (bx1, int(by1 + (by2-by1)*0.5), bx2, by2)
                
        # Shot Detection Logic
        if pose_results and pose_results.pose_landmarks and shot_model:
            bx1, by1, bx2, by2 = pose_offset if pose_offset else (0, 0, frame.shape[1], frame.shape[0])
            cw, ch = bx2-bx1, by2-by1
            h_full, w_full = frame.shape[:2]
            feat = []
            for p in pose_results.pose_landmarks.landmark:
                abs_x = p.x * cw + bx1
                abs_y = p.y * ch + by1
                feat.extend([abs_x / w_full, abs_y / h_full, p.z, p.visibility])
                
            pose_buffer.append(feat)
            if len(pose_buffer) > SEQ_LEN: pose_buffer.pop(0)
            
            if len(pose_buffer) == SEQ_LEN:
                X = np.array(pose_buffer, dtype=np.float32)
                X_scaled = scaler.transform(X).reshape(1, SEQ_LEN, -1).astype(np.float32)
                ort_inputs = {shot_model.get_inputs()[0].name: X_scaled}
                preds = shot_model.run(None, ort_inputs)[0]
                idx = np.argmax(preds[0])
                if shot_classes[idx] not in IGNORE_LABELS and preds[0][idx] >= CONF_THRESHOLD:
                    latched_shot_label = shot_classes[idx]
                    latched_shot_conf = float(preds[0][idx])
                    shot_delay_countdown = 0
                    shot_display_countdown = 120 # 4 seconds
                    
                    session_log.append({
                        "time": time.strftime("%I:%M:%S %p"),
                        "type": "shot",
                        "label": latched_shot_label,
                        "conf": latched_shot_conf
                    })
                    pose_buffer.clear()
                else:
                    pose_buffer = pose_buffer[1:]

        # 4. Track Ball
        if ball_center is not None:
            last_pt = tracker.trajectory[-1] if tracker.trajectory else None
            trajectory = tracker.update(ball_center)
            new_last_pt = tracker.trajectory[-1] if tracker.trajectory else None
            
            if last_pt != new_last_pt or len(trajectory) == 1:
                frames_without_ball = 0
                if len(trajectory) == 1:
                    current_db_id = create_new_detection_sync("Live LBW Stream")
                    tracked_trajectory = []
                    lbw_logic.reset()
                    lbw_decision_time = None
                    current_display_decision = None
            else:
                frames_without_ball += 1
        else:
            frames_without_ball += 1
            trajectory = tracker.update(ball_center)
            
        if frames_without_ball > 15:
            can_reset = True
            
            if lbw_logic.decision in ["OUT", "NOT OUT", "NOT OUT (Missed Stumps)"]:
                if lbw_decision_time is not None and time.time() - lbw_decision_time < 5.0:
                    can_reset = False
            
            if can_reset:
                tracker.clear()
                lbw_logic.reset()
                lbw_decision_time = None
                current_display_decision = None
        
        # 5. Check Collision & Impact
        if lbw_logic.first_contact is None:
            prev_contact = lbw_logic.first_contact
            lbw_logic.check_collision(trajectory, bat_zone, pad_zone, stump_rect)
            if lbw_logic.first_contact == "PAD" and prev_contact is None:
                pad_hit_time = time.time()

        # 6. Predict Trajectory
        predicted_path = []
        if len(trajectory) > 5:
            predicted_path = predictor.predict(trajectory)

        # 7. Judge LBW
        decision = lbw_logic.decision
        is_delay_active = False
        ball_lost = frames_without_ball > 5
        
        if lbw_logic.first_contact == "PAD":
            if decision == "PENDING" or decision == "CHECK LBW" or decision == "":
                decision = lbw_logic.judge_lbw(predicted_path, stump_rect, ball_lost=ball_lost)
                if decision in ["OUT", "NOT OUT", "NOT OUT (Missed Stumps)"] and lbw_decision_time is None:
                    lbw_decision_time = time.time()
            current_display_decision = decision
        else:
            if decision in ["PENDING", "CHECK LBW", "", "TRACKING..."]:
                decision = lbw_logic.judge_lbw(predicted_path, stump_rect, ball_lost=ball_lost)
                if decision in ["OUT", "OUT (BOWLED)", "NOT OUT", "NOT OUT (Missed Stumps)"] and lbw_decision_time is None:
                    lbw_decision_time = time.time()
            current_display_decision = decision if (lbw_logic.first_contact or decision == "OUT (BOWLED)") else None
        
        # Log final decision once
        if decision not in ["PENDING", "CHECK LBW", ""] and pad_hit_time is not None:
            if last_logged_pad_hit_time != pad_hit_time:
                last_logged_pad_hit_time = pad_hit_time
                session_log.append({
                    "time": time.strftime("%I:%M:%S %p"),
                    "type": "lbw",
                    "decision": decision
                })

        # 8. Visualization
        if pose_results and show_landmarks_flag:
            pose_detector.draw_skeleton(frame, pose_results, offset=pose_offset)
            
        if current_display_decision is None:
            if shot_delay_countdown > 0:
                shot_delay_countdown -= 1
            elif shot_display_countdown > 0:
                shot_display_countdown -= 1
                if shot_display_countdown == 0:
                    latched_shot_label = None
                    latched_shot_conf = 0.0
        
        vis_impact_point = None if is_delay_active else lbw_logic.impact_point
        vis_first_contact = None if is_delay_active else lbw_logic.first_contact

        speed = 0
        swing = 0
        spin = 0
        ball_type = "ANALYZING..."
        if estimate_speed and len(trajectory) > 0:
            speed = estimate_speed(trajectory, fps=fps)
            swing = swing_amount(trajectory)
            spin = spin_intensity(trajectory)
            ball_type = get_ball_type(trajectory, speed)

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
            scaled_manual_pitch,
            bat_zone=bat_zone,
            pad_zone=pad_zone,
            first_contact=vis_first_contact,
            show_setup=show_landmarks_flag,
            show_detections=show_landmarks_flag,
            speed=speed,
            swing=swing,
            spin=spin,
            ball_type=ball_type
        )

        if decision and decision not in ["PENDING", "CHECK LBW", ""] and not is_delay_active:
            if lbw_logic.impact_point:
                ix, iy = lbw_logic.impact_point
                cv2.circle(annotated_frame, (int(ix), int(iy)), 15, (0, 0, 255), 3)
                cv2.putText(annotated_frame, "IMPACT", (int(ix) - 30, int(iy) - 20), cv2.FONT_HERSHEY_SIMPLEX, 0.6, (0, 0, 255), 2)

        frame = annotated_frame

        if len(trajectory) > 0:
            tracked_trajectory = list(trajectory)

        if current_db_id is not None:
            shot_changed = (latched_shot_label != last_shot_label)
            decision_changed = (decision != last_decision)
            contact_changed = (lbw_logic.first_contact != last_contact)
            if current_frame_idx % 3 == 0 or shot_changed or decision_changed or contact_changed:
                last_shot_label = latched_shot_label
                last_decision = decision
                last_contact = lbw_logic.first_contact
                results_data = [{
                    "class_name": latched_shot_label if latched_shot_label else "Waiting...",
                    "conf": latched_shot_conf if latched_shot_label else 0.0,
                    "lbw_decision": decision if decision else "Waiting...",
                    "first_contact": lbw_logic.first_contact if lbw_logic.first_contact else "None",
                    "trajectory": tracked_trajectory,
                    "type": "live_lbw"
                }]
                make_api_call_async("http://127.0.0.1:3000/api/detections/update", {"id": current_db_id, "results": results_data})

        ret, buffer = cv2.imencode('.jpg', frame)
        if not ret: continue
        yield (b'--frame\r\n' b'Content-Type: image/jpeg\r\n\r\n' + buffer.tobytes() + b'\r\n')

@app.route('/api/disconnect', methods=['POST'])
def disconnect_camera():
    global camera, connection_status, video_writer
    if camera:
        camera.release()
        camera = None
    if video_writer:
        video_writer.release()
        video_writer = None
    connection_status = "Disconnected"
    return jsonify({"status": "success", "message": "Camera disconnected"})

def main():
    app.run(host='0.0.0.0', port=8081, debug=False, threaded=True)

if __name__ == "__main__":
    main()
