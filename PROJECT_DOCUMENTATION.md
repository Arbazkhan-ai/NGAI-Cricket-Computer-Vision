
# ⚡ Cricket Computer Vision Project Documentation

Welcome to the comprehensive guide for the NGAI-Cricket Detection System. This document explains how the project works, how to run it, and how to modify it.

## 🏗️ Architecture Overview

The system consists of two main parts:
1.  **Frontend (UI):** Built with **React + Vite + TypeScript**. It handles the user interface, camera feed, and visualizing detections.
2.  **Backend (API & Logic):** Built with **Node.js + Express**. It manages the database, user authentication, and runs the **Python Computer Vision script**.

### Data Flow
1.  **Frontend** captures an image (or video frame) from the camera.
2.  It sends this image to the **Backend** via a POST request (`/api/analyze`).
3.  **Backend** temporarily saves the image and spawns a **Python process** (`inference.py`).
4.  **Python Script** loads the AI model (YOLO), analyzes the image, and prints the result as JSON.
5.  **Backend** captures this JSON output, saves it to the **SQLite database**, and sends it back to the **Frontend**.
6.  **Frontend** displays the detection result (shot type, confidence) to the user.

---

## 🚀 How to Run the Project

You need to run the **Backend** and **Frontend** in two separate terminals.

### 1. Start the Backend
This server runs on port 3000 and handles all logic.
```powershell
cd "d:\Full Webdevelopment\Front-End\backend"
npm start
```
*You will see: "Server running on http://localhost:3000"*

### 2. Start the Frontend
This is the website accessible in your browser (usually port 5173).
```powershell
cd "d:\Full Webdevelopment\Front-End"
npm run dev
```
*You will see: "Local: http://localhost:5173/"*

---

## 📝 How to Make Changes

### 🎨 Frontend Changes (UI & Design)
All frontend code is in `d:\Full Webdevelopment\Front-End\src`.

*   **Pages:** Located in `src/pages`.
    *   `Home.tsx`: The main dashboard with the camera feed.
    *   `LandingPage.tsx`: The first page users see.
    *   `Login.tsx` / `Signup.tsx`: Authentication pages.
*   **Structure:**
    *   `App.tsx`: Controls routing (which page shows for which URL).
    *   `components/`: Reusable parts like the Sidebar or Layout.
*   **Styling:**
    *   Uses **Tailwind CSS**. You can change classes mostly directly in the HTML elements (e.g., `className="bg-red-500"`).

**Example: Changing the Dashboard Title**
1.  Open `src/pages/Home.tsx`.
2.  Find the text (e.g., "Detection Source").
3.  Change it and save. The browser updates **instantly**.

### ⚙️ Backend Changes (API & Database)
All backend code is in `d:\Full Webdevelopment\Front-End\backend`.

*   **API Logic:** `server.js` contains all the endpoints (routes).
    *   `/api/analyze`: Handles image analysis.
    *   `/api/login`: Handles user login.
*   **Database:** `database.js` sets up the SQLite database tables.
*   **AI Integration:** `inference.py` (simulated or real) is called by `server.js`.

**Example: Adding a New API Endpoint**
1.  Open `backend/server.js`.
2.  Add a new route:
    ```javascript
    app.get('/api/test', (req, res) => {
        res.json({ message: "Hello from backend!" });
    });
    ```
3.  **Restart the backend terminal** (Ctrl+C, then `npm start`) to apply changes.

### 🧠 AI Model Changes
*   The Python script is located at `backend/inference.py`.
*   The backend runs this script using `child_process.spawn`.
*   To change the model, modify `inference.py` to load your specific `.pt` file or logic.

---

## 🔄 What Happens After a Change?

1.  **Frontend:**
    *   The **Vite** server watches your files.
    *   When you save `Home.tsx`, it recompiles *only* that file and refreshes your browser automatically (Hot Module Replacement).
    *   **No restart needed.**

2.  **Backend:**
    *   Node.js does **not** auto-restart by default.
    *   After changing `server.js`, you must **stop** the server (Ctrl+C) and run `npm start` again.

---

## 📂 Key Files Reference

| File | Location | Purpose |
|------|----------|---------|
| `App.tsx` | Front-End/src | Main Router configuration. |
| `api.ts` | Front-End/src/services | Functions to call the Backend API. |
| `server.js` | Front-End/backend | Main backend application file. |
| `inference.py` | Front-End/backend | Python script for AI detection. |
| `cricket.db` | Front-End/backend | SQLite database file storing users and history. |

---

## ❓ Common Issues

*   **"Network Request Failed"**: Ensure the Backend is running on port 3000.
*   **"Camera Not Found"**: Check browser permissions or close other apps using the camera (Zoom/Teams).
*   **"Login Failed"**: Check if `cricket.db` exists in the backend folder. If corrupted, delete it and restart backend to recreate it.

