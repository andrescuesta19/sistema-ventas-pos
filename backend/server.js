const express = require('express');
const cors = require('cors');
const nodemailer = require('nodemailer');
const db = require('./db');

const app = express();
app.use(cors());
app.use(express.json());

// Configuracion Gmail Email
let transporter = nodemailer.createTransport({
    host: 'smtp.gmail.com',
    port: 465,
    secure: true,
    auth: {
        user: 'andrescuesta112@gmail.com',
        pass: 'jrhx flul kowu sqzo'
    }
});

console.log('\n📧 Servidor de correo LISTO (Conectado a Gmail)');
console.log(`   Cuenta emisora: andrescuesta112@gmail.com\n`);

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

// API: Envio de Factura por Correo
app.post('/api/facturas/enviar-correo', async (req, res) => {
    const { correo_cliente, nombre_cliente, id_venta, total_neto, detalles, nombre_local, metodo_pago } = req.body;
    
    if (!transporter) {
        return res.status(503).json({ error: 'Servidor de correo no disponible todavía, intenta en unos segundos.' });
    }

    const detallesHtml = detalles.map(d => `
        <tr>
            <td style="padding:8px;border-bottom:1px solid #eee;">${d.nombre_producto}</td>
            <td style="padding:8px;border-bottom:1px solid #eee;text-align:center;">${d.cantidad}</td>
            <td style="padding:8px;border-bottom:1px solid #eee;text-align:right;">$${Number(d.precio_unitario).toLocaleString('es-CO')}</td>
            <td style="padding:8px;border-bottom:1px solid #eee;text-align:right;">$${Number(d.subtotal).toLocaleString('es-CO')}</td>
        </tr>
    `).join('');

    const cufe = `FE-${id_venta}-${Date.now().toString(36).toUpperCase()}`;

    const htmlBody = `
    <!DOCTYPE html>
    <html lang="es">
    <head><meta charset="UTF-8"><meta name="viewport" content="width=device-width"></head>
    <body style="font-family:Arial,sans-serif;background:#f4f4f4;margin:0;padding:20px;">
      <div style="max-width:600px;margin:0 auto;background:white;border-radius:12px;overflow:hidden;box-shadow:0 4px 20px rgba(0,0,0,0.1);">
        
        <!-- Header -->
        <div style="background:linear-gradient(135deg,#264653,#2A9D8F);padding:2rem;text-align:center;">
          <h1 style="color:white;margin:0;font-size:1.5rem;">🧾 Factura Electrónica</h1>
          <p style="color:rgba(255,255,255,0.8);margin:0.5rem 0 0;">Documento Autorizado - Simulación DIAN</p>
        </div>

        <!-- Body -->
        <div style="padding:2rem;">
          <div style="display:flex;justify-content:space-between;margin-bottom:1.5rem;padding-bottom:1rem;border-bottom:2px solid #eee;">
            <div>
              <strong style="font-size:1.1rem;color:#264653;">${nombre_local}</strong><br/>
              <span style="color:#777;font-size:0.9rem;">NIT: 900.123.456-7</span>
            </div>
            <div style="text-align:right;">
              <strong style="color:#2A9D8F;font-size:1.1rem;">No. FE-${id_venta.toString().padStart(6,'0')}</strong><br/>
              <span style="color:#777;font-size:0.9rem;">${new Date().toLocaleDateString('es-CO')}</span>
            </div>
          </div>

          <div style="background:#f9f9f9;border-radius:8px;padding:1rem;margin-bottom:1.5rem;">
            <strong>Adquiriente:</strong> ${nombre_cliente}<br/>
            <strong>Medio de Pago:</strong> ${metodo_pago}
          </div>

          <table style="width:100%;border-collapse:collapse;">
            <thead>
              <tr style="background:#264653;color:white;">
                <th style="padding:10px;text-align:left;">Producto</th>
                <th style="padding:10px;text-align:center;">Cant.</th>
                <th style="padding:10px;text-align:right;">Precio</th>
                <th style="padding:10px;text-align:right;">Subtotal</th>
              </tr>
            </thead>
            <tbody>${detallesHtml}</tbody>
          </table>

          <div style="text-align:right;margin-top:1.5rem;padding-top:1rem;border-top:2px solid #eee;">
            <div style="font-size:1.4rem;font-weight:bold;color:#264653;">
              TOTAL: $${Number(total_neto).toLocaleString('es-CO')}
            </div>
          </div>

          <div style="margin-top:2rem;padding:1rem;background:#e8f8f7;border-radius:8px;font-size:0.8rem;color:#555;">
            <strong>CUFE:</strong> ${cufe}<br/>
            <em>Este documento es una simulación de factura electrónica. Para producción real, conectar al servicio de la DIAN.</em>
          </div>
        </div>

        <!-- Footer -->
        <div style="background:#f0f0f0;padding:1rem;text-align:center;color:#999;font-size:0.8rem;">
          ✦ Desarrollado por <strong style="color:#2A9D8F;">Andrés Cuesta</strong> · Sistema Integral de Ventas ✦
        </div>
      </div>
    </body>
    </html>`;

    try {
        const info = await transporter.sendMail({
            from: `"${nombre_local} - Sistema POS" <andrescuesta112@gmail.com>`,
            to: correo_cliente,
            subject: `Factura Electrónica No. FE-${id_venta.toString().padStart(6,'0')} - ${nombre_local}`,
            html: htmlBody,
        });

        console.log(`\n📧 Factura enviada REALMENTE a ${correo_cliente}\n`);

        res.json({ 
            success: true, 
            mensaje: 'Factura enviada exitosamente.'
        });
    } catch (err) {
        console.error('Error enviando correo:', err);
        res.status(500).json({ error: 'No se pudo enviar el correo.' });
    }
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
