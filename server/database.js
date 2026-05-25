const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.join(__dirname, 'cricket_db.sqlite');
const db = new sqlite3.Database(dbPath, (err) => {
    if (err) {
        console.error('CRITICAL: SQLite Initialization Failed!', err.message);
    } else {
        console.log('Connected to the SQLite database (cricket_db.sqlite).');
    }
});

// Initialize tables
db.serialize(() => {
    db.run(`CREATE TABLE IF NOT EXISTS detections (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        image_path TEXT,
        results TEXT,
        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);
    db.run(`CREATE TABLE IF NOT EXISTS matches (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        score INTEGER,
        shots_count INTEGER,
        duration VARCHAR(50),
        details TEXT,
        video_url TEXT,
        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);
    // Alter table to add video_url if it doesn't exist
    db.run(`ALTER TABLE matches ADD COLUMN video_url TEXT`, (err) => {
        // Ignore error if column already exists
    });
    db.run(`CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name VARCHAR(255),
        email VARCHAR(255) UNIQUE,
        password VARCHAR(255),
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        reset_token VARCHAR(255),
        reset_token_expiry BIGINT
    )`);
});

// Wrapper to mimic mysql2's db.query behavior so server.js doesn't need to change much
module.exports = {
    query: (sql, params, callback) => {
        if (typeof params === 'function') {
            callback = params;
            params = [];
        }
        
        const isSelect = sql.trim().toUpperCase().startsWith('SELECT');
        if (isSelect) {
            db.all(sql, params, (err, rows) => {
                if (callback) callback(err, rows);
            });
        } else {
            db.run(sql, params, function(err) {
                // 'this' contains lastID and changes for sqlite3 db.run
                if (callback) {
                    const resultObj = this ? { insertId: this.lastID, affectedRows: this.changes } : {};
                    callback(err, resultObj);
                }
            });
        }
    }
};
