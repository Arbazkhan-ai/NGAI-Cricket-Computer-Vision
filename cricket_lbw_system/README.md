# AI-Based Cricket LBW Prediction System

This is a standalone desktop application for real-time cricket LBW analysis using computer vision.

## Features
- **YOLOv8 Ball Detection**: Highly accurate ball tracking.
- **MediaPipe Pose Estimation**: Detects batsman legs for impact analysis.
- **Physics-based Prediction**: Predicts ball trajectory after impact.
- **Automated Decision**: Determines OUT/NOT OUT based on stump intersection.

## Project Structure
- `main.py`: Entry point.
- `ball_detection.py`: YOLOv8 integration.
- `pose_detection.py`: MediaPipe integration.
- `tracking.py`: History management.
- `lbw_logic.py`: Impact and decision rules.
- `trajectory_prediction.py`: Path extrapolation.
- `visualization.py`: OpenCV drawing utilities.
- `utils.py`: Constants and math.

## How to Run
1. Ensure you have the virtual environment activated.
2. Install dependencies:
   ```bash
   pip install -r requirements.txt
   ```
3. Run the application:
   ```bash
   python main.py --input videos/sample.mp4
   ```
   *Use `--input webcam` for real-time camera feed.*

## Controls
- **'q'**: Quit application.
- **'r'**: Reset impact and trajectory for next ball.
