import cv2
import threading
import sys
import time
import os
import argparse
import pickle
import numpy as np
import mediapipe as mp
import warnings
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
PKL_PATH = os.path.join(ROOT_DIR, 'model_data', 'cricket_shot_model.pkl')

# Global State
camera = None
pkl_model = None
show_landmarks = False
mp_pose = None
mp_drawing = None
pose = None
connection_status = "Initializing..."

def load_models():
    global pkl_model
    pkl_model = None

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
    global camera, show_landmarks, connection_status, success_url
    success_url = None
    
    parser = argparse.ArgumentParser()
    parser.add_argument("--ip", type=str, default="", help="IP Address for Camera")
    parser.add_argument("--port", type=str, default="", help="Port for Camera")
    parser.add_argument("--landmarks", type=str, default="false", help="Show Landmarks (true/false)")
    args = parser.parse_args()

    show_landmarks = args.landmarks.lower() == "true"
    ip = args.ip
    port = args.port

    # Connection Logic in background thread
    def connect_worker():
        global camera, connection_status, success_url
        
        # 0. Load Models & MediaPipe in this thread to avoid blocking server start
        try:
            connection_status = "Loading AI Models..."
            load_models()
            connection_status = "Initializing Pose Detection..."
            initialize_mediapipe()
        except Exception as e:
            print(f"[Worker] Init Error: {e}")
            connection_status = f"Init Error: {e}"

        # 1. Try IP Camera if specified
        if ip:
            connection_status = f"Connecting to {ip}..."
            candidates = []
            if ip.lower().startswith("http") or ip.lower().startswith("rtsp"):
                 # Add the exact URL given
                 candidates.append(ip)
                 
                 # Logic for "HTTPS -> HTTP" fallback automatically
                 if ip.lower().startswith("https"):
                     candidates.append(ip.replace("https", "http", 1))

                 # Add common variations if not already a deep path
                 if not any(x in ip.lower() for x in [".mjpg", ".jpg", ".mp4", "playlist.m3u8", ".sdp"]):
                     base = ip.rstrip("/")
                     # Common paths for "IP Webcam" and others
                     paths = ["/video", "/video.mjpg", "/mjpeg", "/shot.jpg", "/h264_pcm.sdp"]
                     for pth in paths:
                         if pth not in base:
                             candidates.append(f"{base}{pth}")
                             # If we were https, add http variations for these too
                             if ip.lower().startswith("https"):
                                 candidates.append(f"{base.replace('https', 'http', 1)}{pth}")
            else:
            # User didn't specify protocol, so we try HTTP (more common) then HTTPS
                 formats = [
                     "http://{ip}:{port}/video",
                     "http://{ip}:{port}/video.mjpg",
                     "http://{ip}:{port}/mjpeg",
                     "http://{ip}:{port}/live",
                     "http://{ip}:{port}",
                     "https://{ip}:{port}/video",
                     "https://{ip}:{port}"
                 ]
                 
            # User didn't specify protocol
                 formats = [
                     "http://{ip}:{port}/video",       # Common for IP Webcam (Android)
                     "http://{ip}:{port}/video.mjpg",  # Alternative MJPEG
                     "http://{ip}:{port}/mjpeg",       # Typical for pro cameras
                     "http://{ip}:{port}/live",        # Common for RTSP/HTTP relays
                     "http://{ip}:{port}/axis-cgi/mjpg/video.cgi", # Axis
                     "http://{ip}:{port}",             # Root
                     "https://{ip}:{port}/video",      # Secure variant
                 ]
                 
                 p = port if port else ""
                 
                 for fmt in formats:
                     # Detect if IP already has the port we need
                     if ":" in ip and "{port}" in fmt:
                         cur_url = fmt.replace("{ip}:{port}", ip).replace("{ip}", ip)
                     else:
                         cur_url = fmt.replace("{ip}", ip).replace("{port}", p)
                     
                     # Cleanup logic that doesn't break http://
                     # 1. Protect protocol
                     if "://" in cur_url:
                         protocol, rest = cur_url.split("://", 1)
                         # 2. Fix double slashes in the path (but not protocol)
                         rest = "/".join(filter(None, rest.split("/")))
                         # 3. Handle trailing colon if port was empty
                         if rest.endswith(":"): rest = rest[:-1]
                         # 4. Reconstruct
                         cur_url = f"{protocol}://{rest}"
                     
                     if cur_url not in candidates:
                         candidates.append(cur_url)

            print(f"[Worker] Candidates to try: {candidates}")
            sys.stdout.flush()

            # Pre-check network reachability for the main IP/Port to give faster feedback
            import socket
            try:
                # Extract IP and Port from the first candidate
                import re
                match = re.search(r'://([^:/]+)(?::(\d+))?', candidates[0])
                if match:
                    check_ip = match.group(1)
                    check_port = int(match.group(2)) if match.group(2) else 80
                    print(f"[Worker] Network probe: Checking if {check_ip}:{check_port} is reachable...")
                    s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
                    s.settimeout(2.0)
                    result = s.connect_ex((check_ip, check_port))
                    if result == 0:
                        print(f"[Worker] Network probe: SUCCESS (Port is open)")
                    else:
                        print(f"[Worker] Network probe: FAILED (Port closed or unreachable, error {result})")
                        connection_status = f"Network Error: {check_ip}:{check_port} unreachable"
                    s.close()
            except Exception as e:
                print(f"[Worker] Network probe error: {e}")
            
            sys.stdout.flush()

            # Iterate through candidates
            local_camera = None
            success_url = None
            pid = os.getpid()

            for url in candidates:
                print(f"[Worker-{pid}] Attempting: {url}")
                sys.stdout.flush()
                # Update status on screen immediately
                connection_status = f"Trying: {url.split('://')[-1]}"
                
                try:
                    # Some versions of OpenCV allow setting timeout
                    test_cap = cv2.VideoCapture(url)
                    # Small wait to let it attempt connection
                    time.sleep(0.5) 
                    
                    if test_cap.isOpened():
                        ret, _ = test_cap.read()
                        if ret:
                            print(f"[Worker-{pid}] SUCCESS: {url}")
                            sys.stdout.flush()
                            # SET GLOBAL CAMERA IMMEDIATELY
                            camera = test_cap 
                            success_url = url
                            connection_status = "IP Camera Connected"
                            local_camera = test_cap
                            break
                        else:
                            print(f"[Worker-{pid}] Open but no frame: {url}")
                            test_cap.release()
                    else:
                        print(f"[Worker-{pid}] Failed to open: {url}")
                except Exception as e:
                    print(f"[Worker-{pid}] EXCEPTION: {e}")
                
                # Small gap between candidates
                time.sleep(0.3)
                sys.stdout.flush()
            
            if not local_camera:
                 print(f"[Worker-{pid}] ALL ATTEMPTS FAILED.")
                 sys.stdout.flush()
                 connection_status = "IP CONNECTION FAILED"
                 # Final attempt to show the URL to the user so they can verify
                 if candidates:
                     connection_status += f" (Tried {len(candidates)} URLs)"

            # IMPORTANT: If IP was requested but failed, we DO NOT fallback to default camera.
            # User specifically asked for IP.
        
        else:
            # 2. Default Camera (only if no IP requested)
            print("Connecting to Default Camera (0)...")
            connection_status = "Connecting to Webcam..."
            local_camera = cv2.VideoCapture(0)
            
            if not local_camera.isOpened():
                print("Error: Could not open default camera.")
                connection_status = "Webcam Not Found"
                camera = None
            else:
                 connection_status = "Webcam Connected"
                 camera = local_camera

    # Start the connection thread
    t = threading.Thread(target=connect_worker, daemon=True)
    t.start()
    
    # Even if camera failed (or is connecting), we start the server to show the message
    print("Starting Live Detection Server on port 8080...")
    sys.stdout.flush()
    
    try:
        app.run(host='0.0.0.0', port=8080, debug=False, threaded=True)
    finally:
        if camera:
            camera.release()

def generate_frames():
    global camera, show_landmarks, pkl_model, mp_drawing, pose, mp_pose, connection_status, success_url

    while True:
        frame = None
        if camera is None or not camera.isOpened():
            # Create a black dummy frame with status
            frame = np.zeros((480, 640, 3), dtype=np.uint8)
            pid = os.getpid()
            
            # Draw multi-line status if needed
            cv2.putText(frame, f"PID: {pid}", (50, 150), 
                        cv2.FONT_HERSHEY_SIMPLEX, 0.6, (200, 200, 200), 1)
            cv2.putText(frame, "Status:", (50, 200), 
                        cv2.FONT_HERSHEY_SIMPLEX, 1, (255, 255, 255), 2)
            cv2.putText(frame, connection_status, (50, 250), 
                        cv2.FONT_HERSHEY_SIMPLEX, 0.8, (0, 0, 255), 2)
            cv2.putText(frame, "Check server logs", (50, 300), 
                        cv2.FONT_HERSHEY_SIMPLEX, 0.6, (150, 150, 150), 1)
            
            # Add a small delay
            time.sleep(0.1)
            
            # Retry logic could go here, but for now just show error
            
        else:
            ret, frame = camera.read()
            if not ret:
                print("Failed to grab frame. Switching to dummy frame.")
                sys.stdout.flush()
                connection_status = "Stream Lost. Reconnecting..."
                camera.release()
                camera = None

                # Instant Reconnect attempt if we know the URL
                if success_url:
                    print(f"Attempting reconnect to {success_url}...")
                    sys.stdout.flush()
                    try:
                        new_cap = cv2.VideoCapture(success_url)
                        if new_cap.isOpened():
                             ret2, _ = new_cap.read()
                             if ret2:
                                 print("Reconnected successfully.")
                                 sys.stdout.flush()
                                 camera = new_cap
                                 connection_status = "IP Camera Connected"
                                 continue
                    except:
                        pass
                
                continue

        # If we have a valid frame (real or dummy)
        if frame is not None:
             # Process with MediaPipe ONLY if it's a real frame and we have a camera connection
             if camera is not None:
                 try:
                    # MediaPipe requires RGB
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
                     # e.g. Image empty
                     pass

             # Encode frame for streaming
             ret, buffer = cv2.imencode('.jpg', frame)
             if not ret:
                 continue
                
             frame_bytes = buffer.tobytes()
             yield (b'--frame\r\n'
                   b'Content-Type: image/jpeg\r\n\r\n' + frame_bytes + b'\r\n')

if __name__ == "__main__":
    main()
