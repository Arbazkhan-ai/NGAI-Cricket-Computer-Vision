import os
import sys
import cv2
from ultralytics import YOLO

YOLO_PATH = r"D:\Full Webdevelopment\models\detect\train\weights\best_shot.pt"

print(f"Checking model at: {YOLO_PATH}")
if not os.path.exists(YOLO_PATH):
    print("Model file not found!")
    sys.exit(1)

try:
    print("Loading model...")
    model = YOLO(YOLO_PATH)
    print("Model loaded successfully.")
    
    # Create a dummy image (black)
    import numpy as np
    img = np.zeros((640, 640, 3), dtype=np.uint8)
    
    print("Running inference on dummy image...")
    results = model(img, verbose=True)
    print(f"Results type: {type(results)}")
    
    for res in results:
        print(f"Result boxes: {res.boxes}")
        print(f"Result probs: {res.probs}")
        if res.probs is not None:
            top1 = res.probs.top1
            conf = float(res.probs.top1conf)
            label = model.names[top1]
            print(f"Top class: {label} with conf {conf}")

except Exception as e:
    import traceback
    print(f"Error occurred: {e}")
    traceback.print_exc()
