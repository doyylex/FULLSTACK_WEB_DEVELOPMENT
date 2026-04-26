const express = require('express');
const mysql = require('mysql2');
const path = require('path');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const cookieParser = require('cookie-parser');

const app = express();
const port = 3000;
const SECRET_KEY = 'mi_secreto_para_el_tp_2026';

// Configuraciones
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(cookieParser());
app.use(express.static(__dirname));

// Configuración de MySQL
const db = mysql.createConnection({
    host: 'localhost',
    user: 'root',
    password: '123',
    database: 'test'
});

db.connect();

// --- MIDDLEWARES ---

const verifyToken = (req, res, next) => {
    const token = req.cookies.token;
    if (!token) return res.redirect('/');
    try {
        const decoded = jwt.verify(token, SECRET_KEY);
        req.user = decoded;
        next();
    } catch (error) {
        res.clearCookie('token');
        return res.redirect('/');
    }
};

const isAdmin = (req, res, next) => {
    if (req.user && req.user.role === 'admin') next();
    else res.status(403).send('Acceso Denegado');
};

// --- RUTAS PÚBLICAS ---

app.get('/', (req, res) => {
    if (req.cookies.token) {
        try {
            jwt.verify(req.cookies.token, SECRET_KEY);
            return res.redirect('/home');
        } catch (e) { }
    }
    res.sendFile(path.join(__dirname, 'login.html'));
});

app.get('/registro', (req, res) => res.sendFile(path.join(__dirname, 'registro.html')));

app.post('/registro', async (req, res) => {
    const { username, password } = req.body;
    try {
        const hashedPassword = await bcrypt.hash(password, 10);
        db.query("INSERT INTO usuarios (username, password, role) VALUES (?, ?, 'user')", [username, hashedPassword], (err) => {
            if (err) return res.send('Error al registrar');
            res.redirect('/');
        });
    } catch (e) { res.send('Error'); }
});

app.post('/login', (req, res) => {
    const { username, password } = req.body;
    db.query('SELECT * FROM usuarios WHERE username = ?', [username], async (err, results) => {
        if (err || results.length === 0) return res.send('Usuario no encontrado');
        const user = results[0];
        const isMatch = await bcrypt.compare(password, user.password);
        if (isMatch) {
            const token = jwt.sign({ id: user.id, username: user.username, role: user.role }, SECRET_KEY, { expiresIn: '2h' });
            res.cookie('token', token, { httpOnly: true, maxAge: 7200000 });
            return res.redirect('/home');
        }
        res.send('Contraseña incorrecta');
    });
});

// --- RUTAS PROTEGIDAS ---

app.get('/home', verifyToken, (req, res) => {
    if (req.user.role === 'admin') res.redirect('/admin');
    else res.redirect('/tienda');
});

app.get('/tienda', verifyToken, (req, res) => res.sendFile(path.join(__dirname, 'tienda.html')));
app.get('/compras', verifyToken, (req, res) => res.sendFile(path.join(__dirname, 'compras.html')));

// API DE PRODUCTOS 
app.get('/api/productos', verifyToken, (req, res) => {
    const { cat, search, sort } = req.query;

    let query = 'SELECT * FROM productos WHERE 1=1';
    let params = [];

    // 1. Filtro por Categoría
    if (cat && cat !== 'Todas') {
        query += ' AND categoria = ?';
        params.push(cat);
    }

    // 2. Filtro por Búsqueda (Live Search)
    if (search) {
        query += ' AND (nombre LIKE ? OR descripcion LIKE ?)';
        params.push(`%${search}%`, `%${search}%`);
    }

    // 3. Ordenamiento
    if (sort === 'precio_asc') query += ' ORDER BY precio ASC';
    else if (sort === 'precio_desc') query += ' ORDER BY precio DESC';
    else if (sort === 'nombre_asc') query += ' ORDER BY nombre ASC';
    else if (sort === 'nombre_desc') query += ' ORDER BY nombre DESC';

    db.query(query, params, (err, results) => {
        if (err) return res.status(500).send(err);
        res.json(results);
    });
});

// --- SISTEMA DE ÓRDENES ---

app.post('/api/ordenes', verifyToken, async (req, res) => {
    const { carrito, total } = req.body;
    if (!carrito || carrito.length === 0) return res.status(400).send('Carrito vacío');

    const checkStock = () => {
        return new Promise((resolve, reject) => {
            const ids = carrito.map(i => i.id);
            db.query('SELECT id, nombre, stock FROM productos WHERE id IN (?)', [ids], (err, results) => {
                if (err) return reject(err);
                for (const item of carrito) {
                    const prodInTable = results.find(r => r.id === item.id);
                    if (!prodInTable || prodInTable.stock < item.cantidad) {
                        return reject(`Stock insuficiente para: ${prodInTable ? prodInTable.nombre : 'Producto'}`);
                    }
                }
                resolve();
            });
        });
    };

    try {
        await checkStock();
        db.beginTransaction((err) => {
            if (err) throw err;
            db.query('INSERT INTO ordenes (usuario_id, total) VALUES (?, ?)', [req.user.id, total], (err, result) => {
                if (err) return db.rollback(() => res.status(500).send(err));
                const ordenId = result.insertId;
                const valoresDetalles = carrito.map(item => [ordenId, item.id, item.cantidad, item.precio]);
                db.query('INSERT INTO detalles_orden (orden_id, producto_id, cantidad, precio_unitario) VALUES ?', [valoresDetalles], (err) => {
                    if (err) return db.rollback(() => res.status(500).send(err));
                    let completed = 0;
                    carrito.forEach(item => {
                        db.query('UPDATE productos SET stock = stock - ? WHERE id = ?', [item.cantidad, item.id], (err) => {
                            if (err) return db.rollback(() => res.status(500).send(err));
                            completed++;
                            if (completed === carrito.length) {
                                db.commit((err) => {
                                    if (err) return db.rollback(() => res.status(500).send(err));
                                    res.json({ success: true, message: 'Compra finalizada' });
                                });
                            }
                        });
                    });
                });
            });
        });
    } catch (e) { res.status(400).json({ success: false, message: e }); }
});

app.get('/api/mis-ordenes', verifyToken, (req, res) => {
    const query = `
        SELECT o.id, o.total, o.fecha, GROUP_CONCAT(CONCAT(p.nombre, ' (x', d.cantidad, ')') SEPARATOR ', ') as productos
        FROM ordenes o
        JOIN detalles_orden d ON o.id = d.orden_id
        JOIN productos p ON d.producto_id = p.id
        WHERE o.usuario_id = ?
        GROUP BY o.id
        ORDER BY o.fecha DESC
    `;
    db.query(query, [req.user.id], (err, results) => {
        if (err) return res.status(500).send(err);
        res.json(results);
    });
});

// --- ADMIN ---

app.get('/admin', verifyToken, isAdmin, (req, res) => res.sendFile(path.join(__dirname, 'admin.html')));

app.post('/admin/productos', verifyToken, isAdmin, (req, res) => {
    const { nombre, descripcion, precio, categoria, stock } = req.body;
    db.query('INSERT INTO productos (nombre, descripcion, precio, categoria, stock) VALUES (?, ?, ?, ?, ?)',
        [nombre, descripcion, precio, categoria, stock], (err) => {
            if (err) return res.status(500).send(err);
            res.redirect('/admin');
        });
});

app.post('/admin/productos/editar', verifyToken, isAdmin, (req, res) => {
    const { id, nombre, precio, stock } = req.body;
    db.query('UPDATE productos SET nombre = ?, precio = ?, stock = ? WHERE id = ?',
        [nombre, precio, stock, id], (err) => {
            if (err) return res.status(500).send(err);
            res.json({ success: true });
        });
});

app.post('/admin/productos/eliminar', verifyToken, isAdmin, (req, res) => {
    db.query('DELETE FROM productos WHERE id = ?', [req.body.id], (err) => {
        if (err) return res.status(500).send(err);
        res.redirect('/admin');
    });
});

app.get('/logout', (req, res) => {
    res.clearCookie('token');
    res.redirect('/');
});

app.listen(port, () => console.log(`PC Sales Extreme en http://localhost:${port}`));
