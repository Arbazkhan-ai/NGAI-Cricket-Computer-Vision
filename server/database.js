const mysql = require('mysql2');

// 1. Initial connection without database selection to ensure DB exists
const connectionConfigs = {
  host: 'localhost',
  user: 'root',
  password: '', // Default for many local setups
};

// 2. Create the Pool (with database name)
const pool = mysql.createPool({
  ...connectionConfigs,
  database: 'cricket_db',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
});

// Helper to run initialization queries
const initializeDatabase = async () => {
  // Create a separate connection just for setup (to handle DB creation)
  const setupConn = mysql.createConnection(connectionConfigs).promise();
  
  try {
    // Create database if it doesn't exist
    await setupConn.query(`CREATE DATABASE IF NOT EXISTS cricket_db`);
    await setupConn.end();

    const dbConn = pool.promise();

    const tables = [
      `CREATE TABLE IF NOT EXISTS detections (
        id INT AUTO_INCREMENT PRIMARY KEY,
        image_path TEXT,
        results TEXT,
        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
      )`,
      `CREATE TABLE IF NOT EXISTS matches (
        id INT AUTO_INCREMENT PRIMARY KEY,
        score INT,
        shots_count INT,
        duration VARCHAR(50),
        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
      )`,
      `CREATE TABLE IF NOT EXISTS users (
        id INT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(255),
        email VARCHAR(255) UNIQUE,
        password VARCHAR(255),
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        reset_token VARCHAR(255),
        reset_token_expiry BIGINT
      )`
    ];

    for (const query of tables) {
      await dbConn.query(query);
    }

    console.log('Connected to the MySQL database (cricket_db) and tables verified.');
  } catch (err) {
    console.error('CRITICAL: MySQL Initialization Failed!');
    console.error('Error details:', err.message);
    console.error('Please ensure MySQL is running and credentials in database.js are correct.');
  }
};

// Start initialization
initializeDatabase();

// Export the pool
module.exports = pool;
