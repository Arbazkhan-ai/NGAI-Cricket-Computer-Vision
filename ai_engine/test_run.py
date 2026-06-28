import os
os.environ["TF_ENABLE_ONEDNN_OPTS"] = "0"
import api.main
import asyncio
import sys

api.main.load_models()
models_dict = {
    'ball_model': api.main.yolo_model,
    'pitch_model': api.main.pitch_yolo_model,
    'shot_model': api.main.shot_model,
    'scaler': api.main.scaler,
    'classes': api.main.classes,
    'pose_detector': api.main.pose_detector
}

async def run():
    from process_video import process_video
    input_path = "D:/Full Webdevelopment/shared/uploads/1782579768708-lbw.mp4"
    output_path = "D:/Full Webdevelopment/shared/uploads/test.mp4"
    print("Starting process_video generator...")
    try:
        for chunk in process_video(input_path, output_path, "auto", models_dict):
            if "progress" in chunk:
                print("CHUNK:", chunk.strip())
            elif "error" in chunk:
                print("ERROR_CHUNK:", chunk.strip())
            # ignore frame base64
    except Exception as e:
        import traceback
        traceback.print_exc()

asyncio.run(run())
