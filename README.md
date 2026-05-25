# 🏏 NGAI-Cricket Computer Vision Analytics

An advanced, real-time AI analytics platform for cricket. This system utilizes state-of-the-art Computer Vision models to track ball trajectory, estimate speed/spin, and classify batting shots using a hybrid deep learning architecture.

## 🚀 Features

- **LBW Decision System**: Automated Out/Not Out prediction by analyzing bat-pad impact sequence and predicting stump intersection.
- **Ball Trajectory Prediction**: Uses 2nd-degree polynomial regression to forecast the ball's future path.
- **Batsman Pose Detection**: Uses MediaPipe to track 33 body keypoints, crucial for distinguishing bat vs. pad collisions and classifying shots.
- **Live Ball Tracking**: Real-time detection and trajectory visualization using YOLOv8.
- **Batting Shot Classification**: Hybrid MediaPipe + LSTM/ONNX model to identify shots (Sweep, Drive, Pullshot, Flick).
- **Hawk-Eye Stats**: Estimates ball speed, swing amount, and spin intensity.
- **Match Analytics**: Save and view match history, scores, and shot statistics.
- **Interactive UI**: Premium dashboard with live camera feed, confidence overlays, and game rule simulation.
- **Authentication**: Secure user signup/login and password reset functionality.

## 🛠️ Technology Stack

### Frontend
- **React.js** (Vite + TypeScript)
- **Tailwind CSS** (Premium Emerald Theme)
- **Lucide Icons** (Visual indicators)

### Backend
- **Node.js & Express**: Core API and service management.
- **MySQL**: Persistent storage for users, detections, and matches.
- **FastAPI**: Specialized high-performance Python API for batch inference.

### AI & Computer Vision
- **YOLOv8**: Object detection (Ball, Pitch, Batsman, Bat).
- **MediaPipe**: Human pose estimation (33 keypoints).
- **LSTM (Keras/ONNX)**: Sequence-based shot classification.
- **OpenCV**: Image processing and real-time video manipulation.

## 📁 Project Structure

The project is organized into a clean, modular structure:

- `/client`: Frontend React application.
- `/server`: Node.js Express API and database management.
- `/ai`: Python scripts for real-time inference and model logic.
- `/ai/models`: Centralized storage for trained AI models.
- `/shared/uploads`: Shared directory for images and processed video analysis.

## 🏁 Getting Started

### 1. Prerequisites
- **Node.js** (v16 or higher)
- **Python 3.9+** (with virtual environment)
- **MySQL Server** (running on port 3306)

### 2. Installation
1. Install Node dependencies for both frontend and backend:
   ```powershell
   cd client; npm install
   cd ../server; npm install
   ```
2. Install Python dependencies in your venv:
   ```powershell
   pip install -r requirements.txt
   ```

### 3. Running the Project
You need to start three components in separate terminals:

**A. Start Backend (Express):**
```powershell
cd server
npm start
```

**B. Start Frontend:**
```powershell
cd client
npm run dev
```

**C. Start AI API (FastAPI):**
```powershell
cd ai/api
python -m uvicorn main:app --port 8000
```

## ⚖️ Database Configuration
The system uses MySQL by default. 
- **Database Name**: `cricket_db`
- **Auto-setup**: The system will automatically create the database and required tables on the first run of `npm start`.
- **Credentials**: Update `server/database.js` if your MySQL root user has a password.

---
Developed with ❤️ for Cricket Enthusiasts and AI Researchers.
