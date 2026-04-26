const bcrypt = require('bcryptjs');
const mysql = require('mysql2');

const db = mysql.createConnection({
    host: 'localhost',
    user: 'root',
    password: '123',
    database: 'test'
});

async function reset() {
    const hashedAdmin = await bcrypt.hash('123', 10);
    
    db.connect();

    const queries = [
        "DROP TABLE IF EXISTS detalles_orden",
        "DROP TABLE IF EXISTS ordenes",
        "DROP TABLE IF EXISTS productos",
        "DROP TABLE IF EXISTS usuarios",
        
        "CREATE TABLE usuarios (id INT AUTO_INCREMENT PRIMARY KEY, username VARCHAR(50) UNIQUE NOT NULL, password VARCHAR(255) NOT NULL, role VARCHAR(20) DEFAULT 'user')",
        
        "CREATE TABLE productos (id INT AUTO_INCREMENT PRIMARY KEY, nombre VARCHAR(100) NOT NULL, descripcion TEXT, precio DECIMAL(10,2) NOT NULL, categoria VARCHAR(50), stock INT DEFAULT 0)",
        
        "CREATE TABLE ordenes (id INT AUTO_INCREMENT PRIMARY KEY, usuario_id INT, total DECIMAL(10,2), fecha TIMESTAMP DEFAULT CURRENT_TIMESTAMP, FOREIGN KEY (usuario_id) REFERENCES usuarios(id))",
        
        "CREATE TABLE detalles_orden (id INT AUTO_INCREMENT PRIMARY KEY, orden_id INT, producto_id INT, cantidad INT, precio_unitario DECIMAL(10,2), FOREIGN KEY (orden_id) REFERENCES ordenes(id), FOREIGN KEY (producto_id) REFERENCES productos(id))",
        
        { sql: "INSERT INTO usuarios (username, password, role) VALUES ('admin', ?, 'admin')", params: [hashedAdmin] }
    ];

    for (let q of queries) {
        try {
            if (typeof q === 'string') {
                await db.promise().query(q);
            } else {
                await db.promise().query(q.sql, q.params);
            }
            console.log(`Ejecutado: ${typeof q === 'string' ? q.substring(0, 50) : q.sql.substring(0, 50)}...`);
        } catch (err) {
            console.error('Error en:', q, err.message);
        }
    }

    console.log('--- BASE DE DATOS RESETEADA CON ÉXITO ---');
    console.log('Usuario admin creado: admin / 123');
    db.end();
}

reset();
