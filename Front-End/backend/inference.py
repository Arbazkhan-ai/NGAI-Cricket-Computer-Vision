import sys
import json
import os
from ultralytics import YOLO

# Get the absolute path to the model file (one directory up)
MODEL_PATH = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', 'best.pt'))

def run_inference(image_path):
    try:
        # Load the model
        model = YOLO(MODEL_PATH)
        
        # Run inference
        results = model(image_path, verbose=False)
        
        # Process results
        output = []
        for result in results:
            # Check for bounding boxes (detection)
            if hasattr(result, 'boxes'):
                for box in result.boxes:
                    cls_id = int(box.cls[0])
                    cls_name = model.names[cls_id] if model.names and cls_id in model.names else str(cls_id)
                    output.append({
                        "type": "box",
                        "class_id": cls_id,
                        "class_name": cls_name,
                        "conf": float(box.conf[0]),
                        "xyxy": box.xyxy[0].tolist()
                    })
            
            # Check for keypoints (pose)
            if hasattr(result, 'keypoints') and result.keypoints is not None:
                for kp in result.keypoints:
                     output.append({
                        "type": "pose",
                        "conf": float(kp.conf[0]) if kp.conf is not None else 0,
                        "keypoints": kp.xy[0].tolist()
                    })
                    
        print(json.dumps(output))

    except Exception as e:
        print(json.dumps({"error": str(e)}))

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print(json.dumps({"error": "No image path provided"}))
        sys.exit(1)
        
    image_path = sys.argv[1]
    run_inference(image_path)
