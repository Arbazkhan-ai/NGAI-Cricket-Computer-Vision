const mysql = require('mysql2');

const db = mysql.createPool({
    host: 'localhost',
    user: 'root',
    password: '',
    database: 'cricket_cv',
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
});

// Initialize tables
db.query(`CREATE TABLE IF NOT EXISTS detections (
    id INT AUTO_INCREMENT PRIMARY KEY,
    image_path TEXT,
    results TEXT,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
)`, (err) => {
    if (err) console.error('Error creating detections table:', err.message);
});

db.query(`CREATE TABLE IF NOT EXISTS matches (
    id INT AUTO_INCREMENT PRIMARY KEY,
    score INT,
    shots_count INT,
    duration VARCHAR(50),
    details TEXT,
    video_url TEXT,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
)`, (err) => {
    if (err) console.error('Error creating matches table:', err.message);
});

// Since CREATE TABLE IF NOT EXISTS doesn't add columns to existing tables, we try ALTER TABLE but ignore errors
db.query(`ALTER TABLE matches ADD COLUMN video_url TEXT`, (err) => {
    // Ignore error if column already exists
});

db.query(`CREATE TABLE IF NOT EXISTS users (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(255),
    email VARCHAR(255) UNIQUE,
    password VARCHAR(255),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    reset_token VARCHAR(255),
    reset_token_expiry BIGINT
)`, (err) => {
    if (err) console.error('Error creating users table:', err.message);
});

// Alter table to add new columns if they don't exist
db.query(`ALTER TABLE users ADD COLUMN mobile_number TEXT`, (err) => {});
db.query(`ALTER TABLE users ADD COLUMN location TEXT`, (err) => {});
db.query(`ALTER TABLE users ADD COLUMN image TEXT`, (err) => {});

// Connect logic to check if pool is working
db.getConnection((err, connection) => {
    if (err) {
        if (err.code === 'ER_BAD_DB_ERROR') {
            console.error('CRITICAL: Database cricket_cv does not exist. Please create it manually.');
        } else {
            console.error('CRITICAL: MySQL Initialization Failed!', err.message);
        }
    } else {
        console.log('Connected to the MySQL database (cricket_cv).');
        connection.release();
    }
});

// We can simply export the pool and it will act like the old wrapper
module.exports = db;
