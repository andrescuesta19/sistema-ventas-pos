const sqlite3 = require('sqlite3').verbose();
const fs = require('fs');
const path = require('path');

const dbPath = path.resolve(__dirname, 'pos_database.sqlite');
const isNewDb = !fs.existsSync(dbPath);

const db = new sqlite3.Database(dbPath, (err) => {
    if (err) {
        console.error('Error opening database', err.message);
    } else {
        console.log('Connected to the SQLite database.');
        
        if (isNewDb) {
            console.log('Initializing new database...');
            const schemaStr = fs.readFileSync(path.resolve(__dirname, 'schema.sql'), 'utf8');
            const seedStr = fs.readFileSync(path.resolve(__dirname, 'seed.sql'), 'utf8');
            
            db.serialize(() => {
                db.exec(schemaStr, (err) => {
                    if (err) console.error('Error executing schema', err.message);
                    else console.log('Schema created successfully');
                });
                db.exec(seedStr, (err) => {
                    if (err) console.error('Error executing seed', err.message);
                    else console.log('Seed data inserted successfully');
                });
            });
        }
    }
});

module.exports = db;
