const express = require('express');
const multer = require('multer');
const path = require('path');
const { spawn } = require('child_process');
const db = require('./database');
const cors = require('cors');
const fs = require('fs');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const nodemailer = require('nodemailer');
const http = require('http');

const JWT_SECRET = 'super-secret-key-change-this';

const app = express();
const PORT = 3000;

// Email Configuration
const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: 'arbazjani8@gmail.com', // TODO: Please update this with your Gmail address
        pass: 'slja uefd jllg saca'
    }
});

// Enable CORS
app.use(cors());
app.use(express.json());
app.use('/uploads', express.static(path.join(__dirname, '..', 'shared', 'uploads')));

// Configure Multer for file uploads
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        const uploadDir = path.join(__dirname, '..', 'shared', 'uploads');
        if (!fs.existsSync(uploadDir)) {
            fs.mkdirSync(uploadDir);
        }
        cb(null, uploadDir);
    },
    filename: function (req, file, cb) {
        cb(null, Date.now() + '-' + file.originalname);
    }
});

const upload = multer({ storage: storage });


// Handle mobile chunk uploads
app.post('/api/mobile_upload', upload.single('video'), async (req, res) => {
    if (!req.file) {
        return res.status(400).json({ error: 'No video file provided' });
    }
    
    const serviceType = req.body.type || 'shot';
    const port = serviceType === 'lbw' ? 8081 : 8080;
    
    try {
        const fetch = (await import('node-fetch')).default;
        const pythonRes = await fetch(`http://127.0.0.1:${port}/api/mobile_chunk`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ filename: req.file.path })
        });
        const data = await pythonRes.json();
        res.json({ status: 'ok', file: req.file.filename, python_response: data });
    } catch (err) {
        console.error('Mobile upload error:', err);
        res.status(500).json({ error: 'Failed to notify Python engine' });
    }
});

// Define Python Path (hardcoded for this environment to ensure venv usage)
const PYTHON_PATH = path.join(__dirname, '..', '..', '..', 'venv', 'Scripts', 'python.exe');
// Note: We need to go up 3 levels from backend/server.js? 
// D:\Full Webdevelopment\Web\backend
// .. -> Web
// .. -> Full Webdevelopment
// venv is in Full Webdevelopment. So up 2 levels.
// Let's verify path join. 

// Actually, let's just use the absolute path to be 100% sure and avoid relative path confusion in the fix.
const PYTHON_EXECUTABLE = process.platform === 'win32'
    ? 'd:\\Full Webdevelopment\\venv\\Scripts\\python.exe'
    : 'python3';

// ------------------------------------------------------
// PERSISTENT JAVASCRIPT/PYTHON BRIDGE
// ------------------------------------------------------
let pythonProcess = null;
let liveProcess = null; // Handle for the live detection window process
let liveLbwProcess = null; // Handle for the LBW live detection process
const requestQueue = []; // Array of {resolve, reject} objects corresponding to sent requests

// pythonProcess removed as it's replaced by FastAPI proxy

// Endpoint to handle image upload and analysis
app.post('/api/analyze', upload.single('image'), async (req, res) => {
    if (!req.file) {
        return res.status(400).json({ error: 'No image file provided' });
    }

    const imagePath = req.file.path;
    const mode = req.body.mode || 'yolo';

    try {
        const stats = fs.statSync(imagePath);
        const boundary = '----WebKitFormBoundary' + Math.random().toString(16).substring(2);
        const postDataStart = Buffer.from(
            `--${boundary}\r\n` +
            `Content-Disposition: form-data; name="file"; filename="${path.basename(imagePath)}"\r\n` +
            `Content-Type: application/octet-stream\r\n\r\n`
        );
        const postDataEnd = Buffer.from(`\r\n--${boundary}--\r\n`);

        const reqOpts = {
            hostname: '127.0.0.1',
            port: 8000,
            path: '/predict',
            method: 'POST',
            headers: {
                'Content-Type': `multipart/form-data; boundary=${boundary}`,
                'Content-Length': postDataStart.length + stats.size + postDataEnd.length
            }
        };

        const proxyReq = http.request(reqOpts, (proxyRes) => {
            let data = '';
            proxyRes.on('data', (chunk) => { data += chunk; });
            proxyRes.on('end', () => {
                if (proxyRes.statusCode === 200) {
                    let result;
                    try {
                        result = JSON.parse(data).data;
                    } catch (e) {
                        return res.status(500).json({ error: 'Invalid response from AI engine' });
                    }
                    
                    db.query("INSERT INTO detections (image_path, results) VALUES (?, ?)", [imagePath, JSON.stringify(result)], (err, dbResults) => {
                        if (err) console.error("DB Error:", err.message);
                    });

                    res.json({
                        message: 'Analysis complete',
                        data: result,
                        db_id: 0
                    });
                } else {
                    res.status(500).json({ error: 'AI engine error' });
                }
            });
        });

        proxyReq.on('error', (e) => {
            console.error("FastAPI Error:", e);
            res.status(500).json({ error: 'Failed to process request', details: e.message });
        });

        proxyReq.write(postDataStart);
        const fileStream = fs.createReadStream(imagePath);
        fileStream.on('data', (chunk) => proxyReq.write(chunk));
        fileStream.on('end', () => {
            proxyReq.write(postDataEnd);
            proxyReq.end();
        });

    } catch (e) {
        console.error("Server Error:", e);
        res.status(500).json({ error: 'Failed to process request', details: e.message });
    }
});

// Endpoint to handle video upload and analysis
app.post('/api/analyze-video', upload.single('video'), async (req, res) => {
    if (!req.file) {
        return res.status(400).json({ error: 'No video file provided' });
    }

    const videoPath = req.file.path;
    const mode = req.body.mode || 'mediapipe';

    // Output filename
    const filename = path.basename(videoPath, path.extname(videoPath)) + '_processed.mp4';
    const outputPath = path.join(path.dirname(videoPath), filename);

    console.log(`Processing video: ${videoPath} with mode ${mode}`);

    // Set headers for streaming progress
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    let finalShotResult = null;
    let stdoutBuffer = '';

    const postData = `input_path=${encodeURIComponent(videoPath)}&output_path=${encodeURIComponent(outputPath)}&mode=${encodeURIComponent(mode)}`;

    const options = {
        hostname: '127.0.0.1',
        port: 8000,
        path: '/process-video',
        method: 'POST',
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'Content-Length': Buffer.byteLength(postData)
        }
    };

    const proxyReq = http.request(options, (proxyRes) => {
        proxyRes.on('data', (chunk) => {
            stdoutBuffer += chunk.toString();
            
            let newlineIndex;
            while ((newlineIndex = stdoutBuffer.indexOf('\n\n')) !== -1) {
                let messageStr = stdoutBuffer.substring(0, newlineIndex).trim();
                stdoutBuffer = stdoutBuffer.substring(newlineIndex + 2);
                
                if (!messageStr || !messageStr.startsWith('data: ')) continue;
                
                // Directly pass the event stream chunk to frontend
                res.write(`${messageStr}\n\n`);

                try {
                    const json = JSON.parse(messageStr.substring(6));
                    if (json.final_result) {
                        finalShotResult = json.final_result;
                    }
                } catch(e) {}
            }
        });

        proxyRes.on('end', () => {
            const processedUrl = `/uploads/${filename}`;
            const resultsData = JSON.stringify(finalShotResult ? [finalShotResult] : [{ class_name: 'Analysis Complete', conf: 1.0, type: 'video' }]);
            
            db.query("INSERT INTO detections (image_path, results) VALUES (?, ?)", [processedUrl, resultsData], (err, results) => {
                if (err) console.error("DB Error (Video):", err.message);
                
                // Final success message with video URL and detection data
                res.write(`data: ${JSON.stringify({ 
                    message: 'Video processing complete', 
                    video_url: processedUrl, 
                    data: finalShotResult ? [finalShotResult] : null,
                    db_id: results ? results.insertId : 0 
                })}\n\n`);
                res.end();
            });
        });
    });

    proxyReq.on('error', (e) => {
        console.error(`Problem with FastAPI request: ${e.message}`);
        res.write(`data: ${JSON.stringify({ error: 'Video processing failed' })}\n\n`);
        res.end();
    });

    proxyReq.write(postData);
    proxyReq.end();
});


// Endpoint to handle LBW video upload and analysis
app.post('/api/analyze-lbw-video', upload.single('video'), async (req, res) => {
    if (!req.file) {
        return res.status(400).json({ error: 'No video file provided' });
    }

    const videoPath = req.file.path;
    const mode = req.body.mode || 'auto';

    // Output filename
    const filename = path.basename(videoPath, path.extname(videoPath)) + '_lbw_processed.mp4';
    const outputPath = path.join(path.dirname(videoPath), filename);

    console.log(`Processing LBW video: ${videoPath}`);

    // Set headers for streaming progress
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    let finalDecision = null;
    let stdoutBuffer = '';

    const postData = `input_path=${encodeURIComponent(videoPath)}&output_path=${encodeURIComponent(outputPath)}&mode=${encodeURIComponent(mode)}`;

    const options = {
        hostname: '127.0.0.1',
        port: 8000,
        path: '/process-lbw-video',
        method: 'POST',
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'Content-Length': Buffer.byteLength(postData)
        }
    };

    const proxyReq = http.request(options, (proxyRes) => {
        proxyRes.on('data', (chunk) => {
            stdoutBuffer += chunk.toString();
            
            let newlineIndex;
            while ((newlineIndex = stdoutBuffer.indexOf('\n\n')) !== -1) {
                let messageStr = stdoutBuffer.substring(0, newlineIndex).trim();
                stdoutBuffer = stdoutBuffer.substring(newlineIndex + 2);
                
                if (!messageStr || !messageStr.startsWith('data: ')) continue;
                
                // Directly pass the event stream chunk to frontend
                res.write(`${messageStr}\n\n`);

                try {
                    const json = JSON.parse(messageStr.substring(6));
                    if (json.final_result) {
                        finalDecision = json.final_result;
                    }
                } catch(e) {}
            }
        });

        proxyRes.on('end', () => {
            const processedUrl = `/uploads/${filename}`;
            const resultsData = JSON.stringify(finalDecision ? [finalDecision] : [{ decision: 'NOT OUT', conf: 1.0, type: 'lbw' }]);
            
            db.query("INSERT INTO lbw_detections (video_path, results) VALUES (?, ?)", [processedUrl, resultsData], (err, results) => {
                if (err) console.error("DB Error (LBW Video):", err.message);
                
                // Final success message with video URL and detection data
                res.write(`data: ${JSON.stringify({ 
                    message: 'LBW Video processing complete', 
                    video_url: processedUrl, 
                    data: finalDecision ? [finalDecision] : null,
                    db_id: results ? results.insertId : 0 
                })}\n\n`);
                res.end();
            });
        });
    });

    proxyReq.on('error', (e) => {
        console.error(`Problem with FastAPI LBW request: ${e.message}`);
        res.write(`data: ${JSON.stringify({ error: 'Video processing failed' })}\n\n`);
        res.end();
    });

    proxyReq.write(postData);
    proxyReq.end();
});

// Endpoint just to upload a video and save to history unanalyzed
app.post('/api/upload-video-only', upload.single('video'), (req, res) => {
    if (!req.file) {
        return res.status(400).json({ error: 'No video file provided' });
    }
    const filename = req.file.filename;
    const videoUrl = `/uploads/${filename}`;
    db.query("INSERT INTO detections (image_path, results) VALUES (?, ?)", [videoUrl, "[]"], (err, results) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ message: 'Upload successful', video_path: videoUrl, id: results.insertId });
    });
});

// Endpoint to handle analyzing an existing video from the database
app.post('/api/analyze-existing', async (req, res) => {
    const { id, type, source_table = 'detections' } = req.body;
    
    // Ensure safe table name
    const table = source_table === 'matches' ? 'matches' : 'detections';
    const videoColumn = table === 'matches' ? 'video_url' : 'image_path';

    db.query(`SELECT * FROM ${table} WHERE id = ?`, [id], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        if (!rows || rows.length === 0) return res.status(404).json({ error: 'Video not found' });
        
        const videoUrl = rows[0][videoColumn];
        if (!videoUrl) return res.status(400).json({ error: 'No video associated with this record' });

        let videoFilename = path.basename(videoUrl);
        // If the video was already processed, revert to the original filename to avoid double-overlay
        if (videoFilename.includes('_processed')) {
            videoFilename = videoFilename.replace('_lbw_processed', '').replace('_processed', '');
        }
        const videoPath = path.join(__dirname, '..', 'shared', 'uploads', videoFilename);
        
        if (!fs.existsSync(videoPath)) {
            return res.status(404).json({ error: 'Original video file missing on server' });
        }
        
        const suffix = type === 'lbw' ? '_lbw_processed.mp4' : '_processed.mp4';
        const outFilename = path.basename(videoFilename, path.extname(videoFilename)) + suffix;
        const outputPath = path.join(__dirname, '..', 'shared', 'uploads', outFilename);
        
        let scriptName = type === 'lbw' ? 'process_lbw_video.py' : 'process_video.py';
        let engineDir = type === 'lbw' ? 'cricket_lbw_system' : 'ai_engine';
        const scriptPath = path.join(__dirname, '..', engineDir, scriptName);
        
        const args = [scriptPath, '--input', videoPath, '--output', outputPath, '--mode', 'auto'];
        
        let exe = PYTHON_EXECUTABLE;
        if (!fs.existsSync(exe)) exe = 'python';

        res.setHeader('Content-Type', 'text/event-stream');
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Connection', 'keep-alive');
        
        let finalShotResult = null;
        const proc = spawn(exe, args, { cwd: path.join(__dirname, '..', engineDir) });
        
        proc.stdout.on('data', (data) => {
            const message = data.toString().trim();
            console.log(`EXISTING ${type.toUpperCase()} OUT: ${message}`);
            
            if (message.includes('FINAL_RESULT:')) {
                const parts = message.split('FINAL_RESULT:')[1].trim().split('|');
                if (parts.length >= 2) {
                    finalShotResult = { class_name: parts[0], conf: parseFloat(parts[1]) };
                }
            }
            res.write(`data: ${JSON.stringify({ progress: message })}\n\n`);
        });
        
        proc.stderr.on('data', (data) => console.error(`EXISTING ${type.toUpperCase()} ERR: ${data}`));
        
        proc.on('close', (code) => {
            if (code === 0) {
                const processedUrl = `/uploads/${outFilename}`;
                const resultsData = JSON.stringify(finalShotResult ? [finalShotResult] : [{ class_name: 'Analysis Complete', conf: 1.0, type: 'video' }]);
                
                const updateQuery = table === 'matches' 
                    ? `UPDATE matches SET video_url = ? WHERE id = ?`
                    : `UPDATE detections SET image_path = ?, results = ? WHERE id = ?`;
                
                const updateParams = table === 'matches' 
                    ? [processedUrl, id]
                    : [processedUrl, resultsData, id];

                db.query(updateQuery, updateParams, (err) => {
                    if (err) console.error("DB Error (Update Video):", err.message);
                    
                    res.write(`data: ${JSON.stringify({ 
                        message: 'Video processing complete', 
                        video_url: processedUrl, 
                        data: finalShotResult ? [finalShotResult] : null,
                        db_id: id
                    })}\n\n`);
                    res.end();
                });
            } else {
                console.error(`Existing video processing failed with code ${code}`);
                res.write(`data: ${JSON.stringify({ error: 'Video processing failed' })}\n\n`);
                res.end();
            }
        });
    });
});

app.get('/api/history', (req, res) => {
    db.query("SELECT * FROM detections ORDER BY timestamp DESC", (err, rows) => {
        if (err) {
            res.status(500).json({ error: err.message });
            return;
        }
        res.json(rows);
    });
});

app.post('/api/detections/new', (req, res) => {
    const { image_path = 'Live Stream' } = req.body;
    db.query("INSERT INTO detections (image_path, results) VALUES (?, ?)", [image_path, "[]"], (err, results) => {
        if (err) {
            console.error("DB Error (New Detection):", err.message);
            return res.status(500).json({ error: err.message });
        }
        res.json({ id: results.insertId });
    });
});

app.post('/api/detections/update', (req, res) => {
    const { id, results } = req.body;
    if (!id) return res.status(400).json({ error: 'Missing ID' });
    
    db.query("UPDATE detections SET results = ? WHERE id = ?", [JSON.stringify(results), id], (err) => {
        if (err) {
            console.error("DB Error (Update Detection):", err.message);
            return res.status(500).json({ error: err.message });
        }
        res.json({ success: true });
    });
});


app.get('/api/matches', (req, res) => {
    db.query("SELECT * FROM matches ORDER BY timestamp DESC", (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

app.post('/api/save-match', (req, res) => {
    const { score, shots_count, duration, details, video_url } = req.body;
    db.query("INSERT INTO matches (score, shots_count, duration, details, video_url) VALUES (?, ?, ?, ?, ?)", [score, shots_count, duration, details ? JSON.stringify(details) : null, video_url || null], (err, results) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ id: results.insertId, message: 'Match saved successfully' });
    });
});

// Function to start the live detection background service
function startLiveService() {
    const scriptPath = path.join(__dirname, '..', 'ai_engine', 'live_inference.py');
    console.log(`Starting Live Detection service...`);

    let exe = PYTHON_EXECUTABLE;
    if (!fs.existsSync(exe)) exe = 'python';

    liveProcess = spawn(exe, [scriptPath]);

    liveProcess.stdout.on('data', (data) => console.log(`LIVE SERVICE: ${data}`));
    liveProcess.stderr.on('data', (data) => {
        const out = data.toString();
        if (!out.includes('HTTP/1.1 200')) console.error(`LIVE SERVICE ERR: ${out}`);
    });

    liveProcess.on('close', (code) => {
        console.log(`Live service exited with code ${code}. Restarting in 2s...`);
        liveProcess = null;
        setTimeout(startLiveService, 2000);
    });
}

// Function to start the LBW live detection background service
function startLiveLbwService() {
    const scriptPath = path.join(__dirname, '..', 'cricket_lbw_system', 'live_lbw_inference.py');
    console.log(`Starting LBW Live Detection service...`);

    let exe = PYTHON_EXECUTABLE;
    if (!fs.existsSync(exe)) exe = 'python';

    liveLbwProcess = spawn(exe, [scriptPath], { cwd: path.join(__dirname, '..', 'cricket_lbw_system') });

    liveLbwProcess.stdout.on('data', (data) => console.log(`LBW LIVE SERVICE: ${data}`));
    liveLbwProcess.stderr.on('data', (data) => {
        const out = data.toString();
        if (!out.includes('HTTP/1.1 200')) console.error(`LBW LIVE SERVICE ERR: ${out}`);
    });

    liveLbwProcess.on('close', (code) => {
        console.log(`LBW Live service exited with code ${code}. Restarting in 2s...`);
        liveLbwProcess = null;
        setTimeout(startLiveLbwService, 2000);
    });
}

let fastApiProcess = null;

function startFastAPIService() {
    const aiEngineDir = path.join(__dirname, '..', 'ai_engine');
    console.log(`Starting FastAPI AI Engine...`);
    
    let exe = PYTHON_EXECUTABLE;
    if (!fs.existsSync(exe)) exe = 'python';

    fastApiProcess = spawn(exe, ['-m', 'uvicorn', 'api.main:app', '--host', '127.0.0.1', '--port', '8000'], { cwd: aiEngineDir });

    fastApiProcess.stdout.on('data', (data) => console.log(`FASTAPI: ${data}`));
    fastApiProcess.stderr.on('data', (data) => {
        const out = data.toString();
        // Ignore expected warnings or info, but log errors
        console.error(`FASTAPI ERR: ${out}`);
    });

    fastApiProcess.on('close', (code) => {
        console.log(`FastAPI service exited with code ${code}. Restarting in 2s...`);
        fastApiProcess = null;
        setTimeout(startFastAPIService, 2000);
    });
}

// Start all persistent services
startFastAPIService();
startLiveService();
startLiveLbwService();

// ... (other endpoints)

// Start Live Detection Connection
app.post('/api/start_live', (req, res) => {
    const { ip, manual_pitch, showLandmarks } = req.body;
    const http = require('http');
    
    const postData = JSON.stringify({ ip, manual_pitch, showLandmarks });
    const options = {
        hostname: '127.0.0.1',
        port: 8080,
        path: '/api/connect',
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(postData)
        }
    };

    const request = http.request(options, (response) => {
        let data = '';
        response.on('data', (chunk) => { data += chunk; });
        response.on('end', () => {
            try {
                const parsed = JSON.parse(data);
                res.status(response.statusCode).json(parsed);
            } catch (e) {
                res.status(500).json({ error: 'Invalid response from live service' });
            }
        });
    });

    request.on('error', (e) => {
        console.error('Live service connection error:', e);
        res.status(500).json({ error: 'Live service not running' });
    });

    request.write(postData);
    request.end();
});

// Stop Live Detection Process
app.post('/api/stop_live', (req, res) => {
    const http = require('http');
    const options = {
        hostname: '127.0.0.1',
        port: 8080,
        path: '/api/disconnect',
        method: 'POST'
    };
    const request = http.request(options, (response) => {
        console.log('Stopped live process camera via API disconnect');
        res.json({ message: 'Live detection stopped via API disconnect' });
    });
    request.on('error', (e) => {
        console.warn('Could not call disconnect route, falling back to process kill', e.message);
        if (liveProcess) {
            try {
                if (process.platform === 'win32') {
                    spawn('taskkill', ['/pid', liveProcess.pid, '/f', '/t']);
                } else {
                    liveProcess.kill();
                }
                liveProcess = null;
                console.log('Stopped live process via fallback taskkill');
            } catch (err) {
                console.error('Error killing process:', err);
            }
        }
        res.json({ message: 'Live detection stopped via fallback process kill' });
    });
    request.end();
});

// Start LBW Live Detection Connection
app.post('/api/start_lbw_live', (req, res) => {
    const { ip, manual_pitch } = req.body;
    const http = require('http');
    
    const postData = JSON.stringify({ ip, manual_pitch });
    const options = {
        hostname: '127.0.0.1',
        port: 8081,
        path: '/api/connect',
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(postData)
        }
    };

    const request = http.request(options, (response) => {
        let data = '';
        response.on('data', (chunk) => { data += chunk; });
        response.on('end', () => {
            try {
                const parsed = JSON.parse(data);
                res.status(response.statusCode).json(parsed);
            } catch (e) {
                res.status(500).json({ error: 'Invalid response from LBW live service' });
            }
        });
    });

    request.on('error', (e) => {
        console.error('LBW Live service connection error:', e);
        res.status(500).json({ error: 'LBW Live service not running' });
    });

    request.write(postData);
    request.end();
});

// Stop LBW Live Detection Process
app.post('/api/stop_lbw_live', (req, res) => {
    const http = require('http');
    const options = {
        hostname: '127.0.0.1',
        port: 8081,
        path: '/api/disconnect',
        method: 'POST'
    };
    const request = http.request(options, (response) => {
        console.log('Stopped LBW live process camera via API disconnect');
        res.json({ message: 'LBW Live detection stopped via API disconnect' });
    });
    request.on('error', (e) => {
        console.warn('Could not call LBW disconnect route, falling back to process kill', e.message);
        if (liveLbwProcess) {
            try {
                if (process.platform === 'win32') {
                    spawn('taskkill', ['/pid', liveLbwProcess.pid, '/f', '/t']);
                } else {
                    liveLbwProcess.kill();
                }
                liveLbwProcess = null;
                console.log('Stopped LBW live process via fallback taskkill');
            } catch (err) {
                console.error('Error killing LBW process:', err);
            }
        }
        res.json({ message: 'LBW Live detection stopped via fallback process kill' });
    });
    request.end();
});

// Auth Routes
app.post('/api/signup', async (req, res) => {
    const { name, email, password, mobile_number } = req.body;
    if (!name || !email || !password) {
        return res.status(400).json({ error: 'All fields are required' });
    }

    try {
        const hashedPassword = await bcrypt.hash(password, 10);
        db.query("INSERT INTO users (name, email, password, mobile_number) VALUES (?, ?, ?, ?)", [name, email, hashedPassword, mobile_number || null], (err, results) => {
            if (err) {
                console.error("Signup DB Query Error:", err);
                if (err.message && (err.message.includes('ER_DUP_ENTRY') || err.message.includes('UNIQUE constraint failed'))) {
                    return res.status(400).json({ error: 'Email already exists' });
                }
                return res.status(500).json({ error: err.message || 'Unknown DB Error' });
            }
            res.status(201).json({ message: 'User created successfully', userId: results.insertId });
        });
    } catch (e) {
        res.status(500).json({ error: 'Server error' });
    }
});

app.post('/api/login', (req, res) => {
    const { email, password, rememberMe } = req.body;
    if (!email || !password) {
        return res.status(400).json({ error: 'Email and password required' });
    }

    db.query("SELECT * FROM users WHERE email = ?", [email], async (err, results) => {
        if (err) {
            console.error("Login DB Query Error:", err);
            return res.status(500).json({ error: 'Server error', details: err.message });
        }

        if (!results || results.length === 0) return res.status(400).json({ error: 'Invalid credentials' });

        try {
            const user = results[0];
            const isMatch = await bcrypt.compare(password, user.password);
            if (!isMatch) return res.status(400).json({ error: 'Invalid credentials' });

            const expiresIn = rememberMe ? '7d' : '24h';
            const token = jwt.sign({ id: user.id, email: user.email, name: user.name }, JWT_SECRET, { expiresIn });
            res.json({
                token,
                user: {
                    id: user.id,
                    name: user.name,
                    email: user.email,
                    mobile_number: user.mobile_number,
                    location: user.location,
                    image: user.image
                }
            });
        } catch (authErr) {
            console.error("Auth Processing Error:", authErr);
            res.status(500).json({ error: 'Server error during authentication' });
        }
    });
});

// Middleware to authenticate JWT token
const authenticateToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    
    if (!token) return res.status(401).json({ error: 'Access token required' });
    
    jwt.verify(token, JWT_SECRET, (err, user) => {
        if (err) return res.status(403).json({ error: 'Invalid or expired token' });
        req.user = user;
        next();
    });
};

// Get User Profile Route
app.get('/api/profile', authenticateToken, (req, res) => {
    db.query("SELECT id, name, email, mobile_number, location, image FROM users WHERE id = ?", [req.user.id], (err, results) => {
        if (err) return res.status(500).json({ error: 'Database error' });
        if (!results || results.length === 0) return res.status(404).json({ error: 'User not found' });
        res.json(results[0]);
    });
});

// Update User Profile Route
app.post('/api/profile/update', authenticateToken, (req, res) => {
    const { name, email, mobile_number, location, image } = req.body;
    if (!name || !email) {
        return res.status(400).json({ error: 'Name and email are required' });
    }

    db.query(
        "UPDATE users SET name = ?, email = ?, mobile_number = ?, location = ?, image = ? WHERE id = ?",
        [name, email, mobile_number, location, image, req.user.id],
        (err) => {
            if (err) {
                if (err.message.includes('ER_DUP_ENTRY') || err.message.includes('UNIQUE constraint failed')) {
                    return res.status(400).json({ error: 'Email already in use' });
                }
                return res.status(500).json({ error: 'Failed to update profile: ' + err.message });
            }
            res.json({
                message: 'Profile updated successfully',
                user: { id: req.user.id, name, email, mobile_number, location, image }
            });
        }
    );
});

app.post('/api/forgot-password', (req, res) => {
    const { email } = req.body;
    if (!email) {
        return res.status(400).json({ error: 'Email is required' });
    }

    db.query("SELECT * FROM users WHERE email = ?", [email], (err, results) => {
        if (err) return res.status(500).json({ error: 'Server error' });
        if (results.length === 0) return res.status(404).json({ error: 'User not found' });

        const user = results[0];
        // Generate a token and expiry (1 hour)
        const resetToken = Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
        const expiry = Date.now() + 3600000; // 1 hour from now

        db.query("UPDATE users SET reset_token = ?, reset_token_expiry = ? WHERE email = ?", [resetToken, expiry, email], (err) => {
            if (err) return res.status(500).json({ error: 'Database error' });

            const resetLink = `http://localhost:5173/reset-password?token=${resetToken}`;
            // ... rest of email logic remains the same

            const mailOptions = {
                from: 'Cricket App Support <YOUR_GMAIL_ADDRESS@gmail.com>', // Sender address
                to: email,
                subject: 'Password Reset Request',
                html: `
                    <h3>Password Reset Request</h3>
                    <p>You indicated that you forgot your password. Please click the link below to reset it:</p>
                    <p><a href="${resetLink}">Reset Password</a></p>
                    <p>Link expires in 1 hour.</p>
                `
            };

            // Log for dev purposes
            console.log('---------------------------------------------------');
            console.log(`[SIMULATION] Reset Link: ${resetLink}`);
            console.log('---------------------------------------------------');

            transporter.sendMail(mailOptions, (error, info) => {
                if (error) {
                    console.error('Error sending email:', error);
                    // We return success even if email fails to avoid enumerating users (security best practice), 
                    // but for this dev setup we warn the user.
                    return res.status(500).json({ error: 'Failed to send email. Check server logs.' });
                }
                res.json({ message: 'Password reset link has been sent per email.' });
            });
        });
    });
});

app.post('/api/reset-password', async (req, res) => {
    const { token, newPassword } = req.body;
    if (!token || !newPassword) {
        return res.status(400).json({ error: 'Token and new password are required' });
    }

    // Verify token and expiry
    db.query("SELECT * FROM users WHERE reset_token = ? AND reset_token_expiry > ?", [token, Date.now()], async (err, results) => {
        if (err) return res.status(500).json({ error: 'Server error' });
        if (results.length === 0) return res.status(400).json({ error: 'Invalid or expired token' });

        const user = results[0];
        try {
            const hashedPassword = await bcrypt.hash(newPassword, 10);
            db.query("UPDATE users SET password = ?, reset_token = NULL, reset_token_expiry = NULL WHERE id = ?", [hashedPassword, user.id], (updateErr) => {
                if (updateErr) return res.status(500).json({ error: 'Failed to update password' });
                res.json({ message: 'Password updated successfully' });
            });
        } catch (e) {
            res.status(500).json({ error: 'Encryption error' });
        }
    });
});

app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});

function cleanupProcesses() {
    const { execSync } = require('child_process');
    console.log('Cleaning up child processes...');
    try { if (fastApiProcess && fastApiProcess.pid) execSync(`taskkill /pid ${fastApiProcess.pid} /f /t`, {stdio: 'ignore'}); } catch(e) {}
    try { if (liveProcess && liveProcess.pid) execSync(`taskkill /pid ${liveProcess.pid} /f /t`, {stdio: 'ignore'}); } catch(e) {}
    try { if (liveLbwProcess && liveLbwProcess.pid) execSync(`taskkill /pid ${liveLbwProcess.pid} /f /t`, {stdio: 'ignore'}); } catch(e) {}
}

process.on('exit', cleanupProcesses);
process.on('SIGINT', () => { process.exit(); });
process.on('SIGTERM', () => { process.exit(); });
process.on('SIGUSR2', () => { process.exit(); });
