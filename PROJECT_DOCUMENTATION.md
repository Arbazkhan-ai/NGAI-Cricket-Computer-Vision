# ⚡ Cricket Computer Vision Project Documentation

Welcome to the comprehensive guide for the NGAI-Cricket Detection System. This document explains the new organized architecture, data flow, and maintenance steps.

## 🏗️ Architecture Overview (Organized)

The project is split into three main modules to ensure high performance and maintainability:

1.  **Client (`/client`):** The Frontend. Built with React + Vite + TypeScript.
2.  **Server (`/server`):** The Node.js Express Backend. Handles DB, Auth, and process orchestration.
3.  **AI (`/ai`):** The Intelligence Layer. Contains Python scripts for YOLO and MediaPipe analysis.

### Data Flow
1.  **Client** captures a frame from the webcam.
2.  It sends the image to the **Server** (`/api/analyze`).
3.  **Server** saves it to `/shared/uploads` and communicates with the persistent **AI Process** (`ai/inference.py` or LBW scripts).
4.  **AI Process** analyzes the image using YOLOv8/MediaPipe. It evaluates ball trajectory, batsman pose, and LBW rules (bat-pad collision sequence).
5.  **Server** saves results to **MySQL** and sends them back to the **Client**.

---

## 🚀 Reorganized Folder Structure

| Folder | Purpose |
| :--- | :--- |
| `client/` | Frontend source code, assets, and React components. |
| `server/` | Express routes, middleware, and MySQL database configuration. |
| `ai/` | Main Python inference scripts (`live_inference.py`, `inference.py`). |
| `ai/api/` | FastAPI version of the detection engine. |
| `ai/models/` | **Storage for AI Weights** (`.pt`, `.onnx`, `.keras`). |
| `shared/uploads/` | Centralized folder for all uploaded media and processed outputs. |

---

## 📝 Maintenance & Modifications

### Adding a New Model
1.  Place your new `.pt` or `.onnx` file in `ai/models/`.
2.  Update the path in `ai/live_inference.py` or `ai/api/main.py`.

### Changing the Design
1.  Modify components in `client/src/pages` or `client/src/components`.
2.  Styles are managed via Tailwind CSS.

### Database Updates
1.  To change tables, modify `server/database.js`.
2.  The system uses **MySQL**. Ensure the MySQL service is running before starting the server.

---

## ❓ FAQ & Troubleshooting

- **Server Error on Login?** Ensure MySQL is running. If it's a fresh install, remember to Sign Up before trying to Log In.
- **Mirroring Issue?** Fixed. The system now automatically flips frames horizontally in both the live stream and the prediction API.
- **Paths?** All paths in `server.js` and `live_inference.py` have been updated to be relative to the new folder structure.

---
*Last Updated: May 15, 2026*
