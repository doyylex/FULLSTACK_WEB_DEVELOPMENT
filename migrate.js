const bcrypt = require('bcryptjs');
const mysql = require('mysql2');

const db = mysql.createConnection({
    host: 'localhost',
    user: 'root',
    password: '123',
    database: 'test'
});

async function migrate() {
    const hashed = await bcrypt.hash('123', 10);
    db.connect();
    db.query("ALTER TABLE usuarios ADD COLUMN role VARCHAR(20) DEFAULT 'user'", (err) => {
        db.query("CREATE TABLE IF NOT EXISTS productos (id INT AUTO_INCREMENT PRIMARY KEY, nombre VARCHAR(100) NOT NULL, descripcion TEXT, precio DECIMAL(10,2) NOT NULL)", (err) => {
            db.query("INSERT INTO usuarios (username, password, role) VALUES ('admin', ?, 'admin') ON DUPLICATE KEY UPDATE role='admin'", [hashed], (err) => {
                if (err) console.error(err);
                else console.log('Migración completada con éxito.');
                db.end();
            });
        });
    });
}
migrate();
