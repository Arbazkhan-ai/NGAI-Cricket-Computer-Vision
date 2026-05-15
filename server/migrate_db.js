const db = require('./database');

db.serialize(() => {
    db.run("ALTER TABLE users ADD COLUMN reset_token TEXT", (err) => {
        if (err) {
            console.log('Column reset_token likely exists or error:', err.message);
        } else {
            console.log('Successfully added reset_token column');
        }
    });

    db.run("ALTER TABLE users ADD COLUMN reset_token_expiry DATETIME", (err) => {
        if (err) {
            console.log('Column reset_token_expiry likely exists or error:', err.message);
        } else {
            console.log('Successfully added reset_token_expiry column');
        }
    });
});
