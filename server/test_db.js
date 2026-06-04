const db = require('./database');
setTimeout(() => {
    db.query("INSERT INTO detections (image_path, results) VALUES ('test', 'test')", (err, res) => {
        console.log('Insert:', err, res);
        db.query('SELECT * FROM detections', (err2, rows) => {
            console.log('Select:', err2, rows);
            process.exit(0);
        });
    });
}, 500);
