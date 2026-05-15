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
const requestQueue = []; // Array of {resolve, reject} objects corresponding to sent requests

// Function to start the persistent Python process
function startPythonProcess() {
    const pythonScriptPath = path.join(__dirname, '..', 'ai', 'inference.py');
    console.log(`Starting Python inference service using: ${PYTHON_EXECUTABLE}`);

    // Check if venv python exists, else fall back to 'python'
    let exe = PYTHON_EXECUTABLE;
    if (!fs.existsSync(exe)) {
        console.warn(`Warning: Venv python not found at ${exe}. Falling back to system 'python'.`);
        exe = 'python';
    }

    pythonProcess = spawn(exe, [pythonScriptPath]);

    let buffer = '';

    // Handle Data from Python (One JSON line per request)
    pythonProcess.stdout.on('data', (data) => {
        buffer += data.toString();

        // Process line by line
        let boundary = buffer.indexOf('\n');
        while (boundary !== -1) {
            const line = buffer.substring(0, boundary);
            buffer = buffer.substring(boundary + 1);

            if (line.trim()) {
                const handler = requestQueue.shift();
                if (handler) {
                    try {
                        const result = JSON.parse(line);
                        handler.resolve(result);
                    } catch (e) {
                        console.error("JSON Parse Error on line:", line);
                        handler.reject(new Error("Failed to parse backend response"));
                    }
                }
            }
            boundary = buffer.indexOf('\n');
        }
    });

    pythonProcess.stderr.on('data', (data) => {
        console.error(`PYTHON ERR: ${data}`);
    });

    pythonProcess.on('close', (code) => {
        console.log(`Python process exited with code ${code}. Restarting in 1s...`);
        pythonProcess = null;
        setTimeout(startPythonProcess, 1000); // Auto-restart
    });
}

// Start immediately
startPythonProcess();


// Endpoint to handle image upload and analysis
app.post('/api/analyze', upload.single('image'), async (req, res) => {
    if (!req.file) {
        return res.status(400).json({ error: 'No image file provided' });
    }

    const imagePath = req.file.path;
    const mode = req.body.mode || 'yolo';

    // Ensure process is running
    if (!pythonProcess) {
        // Wait a bit or try to restart? It should be auto-restarting.
        return res.status(503).json({ error: 'Inference service is starting, please try again.' });
    }

    try {
        // Create a promise that resolves when the Python script responds
        const result = await new Promise((resolve, reject) => {
            // Add to queue
            requestQueue.push({ resolve, reject });

            // Send request to Python (JSON line)
            const payload = JSON.stringify({ image_path: imagePath, mode: mode }) + '\n';
            pythonProcess.stdin.write(payload);
        });

        // Error in result?
        if (result.error) {
            console.error("Inference Error:", result);
            return res.status(500).json(result); // Pass error to frontend
        }

        // Save to Database (Async, don't block response)
        db.query("INSERT INTO detections (image_path, results) VALUES (?, ?)", [imagePath, JSON.stringify(result)], (err, results) => {
            if (err) console.error("DB Error:", err.message);
        });

        res.json({
            message: 'Analysis complete',
            data: result,
            db_id: 0 // Placeholder or get actual ID if needed
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

    // Call process_video.py
    const scriptPath = path.join(__dirname, '..', 'ai', 'process_video.py');
    const args = [scriptPath, '--input', videoPath, '--output', outputPath, '--mode', mode];

    let exe = PYTHON_EXECUTABLE;
    if (!fs.existsSync(exe)) {
        exe = 'python';
    }

    // Set headers for streaming progress
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    let finalShotResult = null;

    const proc = spawn(exe, args);

    proc.stdout.on('data', (data) => {
        const message = data.toString().trim();
        console.log(`VIDEO OUT: ${message}`);
        
        // Check for the final result line
        if (message.includes('FINAL_RESULT:')) {
            const parts = message.split('FINAL_RESULT:')[1].trim().split('|');
            if (parts.length >= 2) {
                finalShotResult = {
                    class_name: parts[0],
                    conf: parseFloat(parts[1])
                };
            }
        }

        // Stream the message to the frontend
        res.write(`data: ${JSON.stringify({ progress: message })}\n\n`);
    });

    proc.stderr.on('data', (data) => console.error(`VIDEO ERR: ${data}`));

    proc.on('close', (code) => {
        if (code === 0) {
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
        } else {
            console.error(`Video processing failed with code ${code}`);
            res.write(`data: ${JSON.stringify({ error: 'Video processing failed' })}\n\n`);
            res.end();
        }
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

app.get('/api/matches', (req, res) => {
    db.query("SELECT * FROM matches ORDER BY timestamp DESC", (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

app.post('/api/save-match', (req, res) => {
    const { score, shots_count, duration } = req.body;
    db.query("INSERT INTO matches (score, shots_count, duration) VALUES (?, ?, ?)", [score, shots_count, duration], (err, results) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ id: results.insertId, message: 'Match saved successfully' });
    });
});

// Function to start the live detection background service
function startLiveService() {
    const scriptPath = path.join(__dirname, '..', 'ai', 'live_inference.py');
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

// Start both persistent services
startPythonProcess();
startLiveService();

// ... (other endpoints)

// Start Live Detection Connection
app.post('/api/start_live', (req, res) => {
    const { ip } = req.body;
    const http = require('http');
    
    const postData = JSON.stringify({ ip });
    const options = {
        hostname: 'localhost',
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
                res.json(JSON.parse(data));
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
    if (liveProcess) {
        try {
            if (process.platform === 'win32') {
                spawn('taskkill', ['/pid', liveProcess.pid, '/f', '/t']);
            } else {
                liveProcess.kill();
            }
            liveProcess = null;
            console.log('Stopped live process via API');
            res.json({ message: 'Live detection stopped' });
        } catch (e) {
            console.error('Error stopping process:', e);
            res.status(500).json({ error: 'Failed to stop process' });
        }
    } else {
        res.json({ message: 'No live process running' });
    }
});

// Auth Routes
app.post('/api/signup', async (req, res) => {
    const { name, email, password } = req.body;
    if (!name || !email || !password) {
        return res.status(400).json({ error: 'All fields are required' });
    }

    try {
        const hashedPassword = await bcrypt.hash(password, 10);
        db.query("INSERT INTO users (name, email, password) VALUES (?, ?, ?)", [name, email, hashedPassword], (err, results) => {
            if (err) {
                if (err.message.includes('ER_DUP_ENTRY')) {
                    return res.status(400).json({ error: 'Email already exists' });
                }
                return res.status(500).json({ error: err.message });
            }
            res.status(201).json({ message: 'User created successfully', userId: results.insertId });
        });
    } catch (e) {
        res.status(500).json({ error: 'Server error' });
    }
});

app.post('/api/login', (req, res) => {
    const { email, password } = req.body;
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

            const token = jwt.sign({ id: user.id, email: user.email, name: user.name }, JWT_SECRET, { expiresIn: '24h' });
            res.json({ token, user: { id: user.id, name: user.name, email: user.email } });
        } catch (authErr) {
            console.error("Auth Processing Error:", authErr);
            res.status(500).json({ error: 'Server error during authentication' });
        }
    });
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
