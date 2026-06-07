const db = require('./database');

// Wait a bit for the connection pool to initialize and the table to be created if not exists
setTimeout(() => {
    db.query("ALTER TABLE users ADD COLUMN reset_token TEXT", (err) => {
        if (err) {
            console.log('Column reset_token likely exists or error:', err.message);
        } else {
            console.log('Successfully added reset_token column');
        }
    });

    db.query("ALTER TABLE users ADD COLUMN reset_token_expiry DATETIME", (err) => {
        if (err) {
            console.log('Column reset_token_expiry likely exists or error:', err.message);
        } else {
            console.log('Successfully added reset_token_expiry column');
        }
        
        // Exit process after queries
        setTimeout(() => process.exit(0), 500);
    });
}, 1000);
