const express = require('express');
const cors = require('cors');
const db = require('./db');

const app = express();
app.use(cors());
app.use(express.json());

// API: Auth
app.post('/api/auth/login', (req, res) => {
    const { correo, contrasena } = req.body;
    db.get(`
        SELECT u.*, l.nombre_local 
        FROM usuarios u
        LEFT JOIN locales l ON u.id_local = l.id_local
        WHERE u.correo = ?`, [correo], (err, row) => {
        if (err) return res.status(500).json({ error: err.message });
        if (!row || row.contrasena_hash !== contrasena) {
            return res.status(401).json({ error: 'Credenciales inválidas' });
        }
        res.json({ id_usuario: row.id_usuario, nombre: row.nombre, rol: row.rol, id_local: row.id_local, nombre_local: row.nombre_local });
    });
});

app.post('/api/auth/registro', (req, res) => {
    const { nombre_local, direccion, nombre, correo, contrasena } = req.body;
    db.serialize(() => {
        db.run('BEGIN TRANSACTION');
        db.run(`INSERT INTO locales (nombre_local, direccion) VALUES (?, ?)`, [nombre_local, direccion], function(err) {
            if (err) { db.run('ROLLBACK'); return res.status(500).json({ error: err.message }); }
            const idLocal = this.lastID;
            db.run(`INSERT INTO usuarios (id_local, nombre, correo, contrasena_hash, rol) VALUES (?, ?, ?, ?, 'Administrador')`,
                [idLocal, nombre, correo, contrasena], function(err) {
                if (err) { db.run('ROLLBACK'); return res.status(500).json({ error: err.message }); }
                db.run('COMMIT');
                res.json({ success: true, id_local: idLocal });
            });
        });
    });
});

// API: Locales y Usuarios
app.get('/api/locales/:id', (req, res) => {
    db.get(`SELECT * FROM locales WHERE id_local = ?`, [req.params.id], (err, row) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(row);
    });
});

app.get('/api/usuarios/local', (req, res) => {
    const { id_local } = req.query;
    db.all(`SELECT id_usuario, nombre, rol, id_local FROM usuarios WHERE id_local = ? AND estado = 1`, [id_local], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

// API: Turnos
app.get('/api/turnos/estado', (req, res) => {
    const { id_local } = req.query;
    db.get(`SELECT * FROM turnos_caja WHERE estado_turno = 'Abierto' AND id_local = ? ORDER BY id_turno DESC LIMIT 1`, [id_local], (err, row) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ turno_abierto: !!row, turno: row });
    });
});

app.post('/api/turnos/abrir', (req, res) => {
    const { id_usuario, id_local, monto_apertura } = req.body;
    db.run(`INSERT INTO turnos_caja (id_usuario, id_local, monto_apertura) VALUES (?, ?, ?)`, [id_usuario, id_local, monto_apertura], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ success: true, id_turno: this.lastID });
    });
});

app.post('/api/turnos/cerrar', (req, res) => {
    const { id_turno, monto_cierre_real, monto_cierre_calculado } = req.body;
    const q = `UPDATE turnos_caja SET estado_turno = 'Cerrado', fecha_cierre = CURRENT_TIMESTAMP, monto_cierre_real = ?, monto_cierre_calculado = ? WHERE id_turno = ?`;
    db.run(q, [monto_cierre_real, monto_cierre_calculado, id_turno], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ success: true });
    });
});

app.get('/api/turnos/reporte', (req, res) => {
    const { id_turno } = req.query;
    const report = { articulos: [], metodos_pago: [] };
    
    // Articulos vendidos
    db.all(`
        SELECT p.nombre_producto, sum(d.cantidad) as total_cantidad, sum(d.subtotal) as total_dinero
        FROM detalle_ventas d
        JOIN ventas v ON d.id_venta = v.id_venta
        JOIN productos p ON d.id_producto = p.id_producto
        WHERE v.id_turno = ?
        GROUP BY d.id_producto
    `, [id_turno], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        report.articulos = rows;
        
        // Metodos de pago
        db.all(`
            SELECT metodo_pago, sum(total_neto) as total
            FROM ventas
            WHERE id_turno = ?
            GROUP BY metodo_pago
        `, [id_turno], (err, rows2) => {
            if (err) return res.status(500).json({ error: err.message });
            report.metodos_pago = rows2;
            res.json(report);
        });
    });
});

// API: Productos (SaaS)
app.get('/api/productos', (req, res) => {
    const { q, id_local } = req.query;
    let query = `SELECT * FROM productos WHERE id_local = ?`;
    let params = [id_local];
    
    if (q) {
        query += ` AND (nombre_producto LIKE ? OR codigo_barras = ?)`;
        params.push(`%${q}%`, q);
    }
    db.all(query, params, (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

app.get('/api/productos/alertas', (req, res) => {
    const { id_local } = req.query;
    db.all(`SELECT * FROM productos WHERE stock_actual <= stock_minimo AND id_local = ?`, [id_local], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

app.post('/api/productos', (req, res) => {
    const { id_local, codigo_barras, nombre_producto, imagen_url, precio_compra, precio_venta, stock_actual, stock_minimo } = req.body;
    db.run(`INSERT INTO productos (id_local, codigo_barras, nombre_producto, imagen_url, precio_compra, precio_venta, stock_actual, stock_minimo) 
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [id_local, codigo_barras, nombre_producto, imagen_url, precio_compra, precio_venta, stock_actual, stock_minimo], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ success: true, id_producto: this.lastID });
    });
});

app.delete('/api/productos/:id', (req, res) => {
    db.run(`DELETE FROM productos WHERE id_producto = ?`, [req.params.id], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ success: true });
    });
});

// API: Clientes
app.get('/api/clientes/buscar', (req, res) => {
    const { documento } = req.query;
    db.get(`SELECT * FROM clientes WHERE documento_identidad = ?`, [documento], (err, row) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(row || null);
    });
});

app.post('/api/clientes/crear', (req, res) => {
    const { documento_identidad, nombre_razon_social, telefono, correo } = req.body;
    db.run(`INSERT INTO clientes (documento_identidad, nombre_razon_social, telefono, correo) VALUES (?, ?, ?, ?)`,
        [documento_identidad, nombre_razon_social, telefono, correo], function(err) {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ success: true, id_cliente: this.lastID });
        });
});

// API: Historial de Ventas
app.get('/api/ventas/historial', (req, res) => {
    const { id_local } = req.query;
    db.all(`
        SELECT v.*, u.nombre as cajero, c.nombre_razon_social as cliente
        FROM ventas v
        LEFT JOIN usuarios u ON v.id_usuario = u.id_usuario
        LEFT JOIN clientes c ON v.id_cliente = c.id_cliente
        WHERE v.id_local = ?
        ORDER BY v.fecha_venta DESC
    `, [id_local], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

// API: Ventas
app.post('/api/ventas/procesar', (req, res) => {
    const { id_usuario, id_local, id_cliente, id_turno, subtotal, descuento_total, impuestos, total_neto, metodo_pago, detalles } = req.body;
    
    db.serialize(() => {
        db.run('BEGIN TRANSACTION');
        
        db.run(`INSERT INTO ventas (id_usuario, id_local, id_cliente, id_turno, subtotal, descuento_total, impuestos, total_neto, metodo_pago) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [id_usuario, id_local, id_cliente, id_turno, subtotal, descuento_total, impuestos, total_neto, metodo_pago], function(err) {
                if (err) {
                    db.run('ROLLBACK');
                    return res.status(500).json({ error: err.message });
                }
                const ventaId = this.lastID;
                
                let completed = 0;
                let hasError = false;
                
                detalles.forEach((det) => {
                    db.run(`INSERT INTO detalle_ventas (id_venta, id_producto, cantidad, precio_unitario_cobrado, descuento_aplicado, subtotal) VALUES (?, ?, ?, ?, ?, ?)`,
                        [ventaId, det.id_producto, det.cantidad, det.precio_unitario, det.descuento, det.subtotal], (err) => {
                            if (err) hasError = true;
                        });
                    
                    db.run(`UPDATE productos SET stock_actual = stock_actual - ? WHERE id_producto = ? AND id_local = ?`, [det.cantidad, det.id_producto, id_local], (err) => {
                        if (err) hasError = true;
                        completed++;
                        
                        if (completed === detalles.length) {
                            if (hasError) {
                                db.run('ROLLBACK');
                                res.status(500).json({ error: 'Error procesando detalle o stock' });
                            } else {
                                if (id_cliente && id_cliente !== 1) { // 1 es Consumidor final
                                    const puntos = Math.floor(total_neto / 10000);
                                    db.run(`UPDATE clientes SET puntos_acumulados = puntos_acumulados + ? WHERE id_cliente = ?`, [puntos, id_cliente]);
                                }
                                db.run('COMMIT');
                                res.json({ success: true, id_venta: ventaId });
                            }
                        }
                    });
                });
            });
    });
});

const PORT = 3000;
app.listen(PORT, () => {
    console.log(`Backend server running on http://localhost:${PORT}`);
});
