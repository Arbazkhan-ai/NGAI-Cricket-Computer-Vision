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

// Configure Multer for file uploads
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        const uploadDir = path.join(__dirname, 'uploads');
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

// Endpoint to handle image upload and analysis
app.post('/api/analyze', upload.single('image'), (req, res) => {
    if (!req.file) {
        return res.status(400).json({ error: 'No image file provided' });
    }

    const imagePath = req.file.path;
    const pythonScriptPath = path.join(__dirname, 'inference.py');

    // Spawn Python process to run inference
    const pythonProcess = spawn('python', [pythonScriptPath, imagePath]);

    let dataString = '';
    let errorString = '';

    pythonProcess.stdout.on('data', (data) => {
        dataString += data.toString();
    });

    pythonProcess.stderr.on('data', (data) => {
        errorString += data.toString();
    });

    pythonProcess.on('close', (code) => {
        if (code !== 0) {
            console.error(`Python script exited with code ${code}`);
            console.error(`Error: ${errorString}`);
            return res.status(500).json({ error: 'Failed to process image', details: errorString });
        }

        try {
            const result = JSON.parse(dataString);

            // Save to Database
            const stmt = db.prepare("INSERT INTO detections (image_path, results) VALUES (?, ?)");
            stmt.run(imagePath, JSON.stringify(result), function (err) {
                if (err) {
                    console.error(err.message);
                    // We still return the result even if DB save fails, but log it
                }
                res.json({
                    message: 'Analysis complete',
                    data: result,
                    db_id: this ? this.lastID : null
                });
            });
            stmt.finalize();

        } catch (e) {
            console.error('Error parsing JSON from Python script:', e);
            console.log('Raw output:', dataString);
            res.status(500).json({ error: 'Invalid response from model' });
        }
    });
});

app.get('/api/history', (req, res) => {
    db.all("SELECT * FROM detections ORDER BY timestamp DESC", [], (err, rows) => {
        if (err) {
            res.status(500).json({ error: err.message });
            return;
        }
        res.json(rows);
    });
});

// Auth Routes
app.post('/api/signup', async (req, res) => {
    const { name, email, password } = req.body;
    if (!name || !email || !password) {
        return res.status(400).json({ error: 'All fields are required' });
    }

    try {
        const hashedPassword = await bcrypt.hash(password, 10);
        const stmt = db.prepare("INSERT INTO users (name, email, password) VALUES (?, ?, ?)");
        stmt.run(name, email, hashedPassword, function (err) {
            if (err) {
                if (err.message.includes('UNIQUE constraint failed')) {
                    return res.status(400).json({ error: 'Email already exists' });
                }
                return res.status(500).json({ error: err.message });
            }
            res.status(201).json({ message: 'User created successfully', userId: this.lastID });
        });
        stmt.finalize();
    } catch (e) {
        res.status(500).json({ error: 'Server error' });
    }
});

app.post('/api/login', (req, res) => {
    const { email, password } = req.body;
    if (!email || !password) {
        return res.status(400).json({ error: 'Email and password required' });
    }

    db.get("SELECT * FROM users WHERE email = ?", [email], async (err, user) => {
        if (err) return res.status(500).json({ error: 'Server error' });
        if (!user) return res.status(400).json({ error: 'Invalid credentials' });

        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) return res.status(400).json({ error: 'Invalid credentials' });

        const token = jwt.sign({ id: user.id, email: user.email, name: user.name }, JWT_SECRET, { expiresIn: '24h' });
        res.json({ token, user: { id: user.id, name: user.name, email: user.email } });
    });
});

app.post('/api/forgot-password', (req, res) => {
    const { email } = req.body;
    if (!email) {
        return res.status(400).json({ error: 'Email is required' });
    }

    db.get("SELECT * FROM users WHERE email = ?", [email], (err, user) => {
        if (err) return res.status(500).json({ error: 'Server error' });
        if (!user) return res.status(404).json({ error: 'User not found' });

        // Generate a token and expiry (1 hour)
        const resetToken = Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
        const expiry = Date.now() + 3600000; // 1 hour from now

        db.run("UPDATE users SET reset_token = ?, reset_token_expiry = ? WHERE email = ?", [resetToken, expiry, email], (err) => {
            if (err) return res.status(500).json({ error: 'Database error' });

            const resetLink = `http://localhost:5173/reset-password?token=${resetToken}`;

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
    db.get("SELECT * FROM users WHERE reset_token = ? AND reset_token_expiry > ?", [token, Date.now()], async (err, user) => {
        if (err) return res.status(500).json({ error: 'Server error' });
        if (!user) return res.status(400).json({ error: 'Invalid or expired token' });

        try {
            const hashedPassword = await bcrypt.hash(newPassword, 10);
            db.run("UPDATE users SET password = ?, reset_token = NULL, reset_token_expiry = NULL WHERE id = ?", [hashedPassword, user.id], (updateErr) => {
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
