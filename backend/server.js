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
app.post('/api/auth/login', async (req, res) => {
    try {
        const { correo, contrasena } = req.body;
        const { rows } = await db.query(`
            SELECT u.*, l.nombre_local 
            FROM usuarios u
            LEFT JOIN locales l ON u.id_local = l.id_local
            WHERE u.correo = $1
        `, [correo]);
        
        const row = rows[0];
        if (!row || row.contrasena_hash !== contrasena) {
            return res.status(401).json({ error: 'Credenciales inválidas' });
        }
        res.json({ id_usuario: row.id_usuario, nombre: row.nombre, rol: row.rol, id_local: row.id_local, nombre_local: row.nombre_local });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/auth/registro', async (req, res) => {
    const client = await db.connect();
    try {
        const { nombre_local, direccion, nombre, correo, contrasena } = req.body;
        await client.query('BEGIN');
        
        const resLocal = await client.query(
            `INSERT INTO locales (nombre_local, direccion) VALUES ($1, $2) RETURNING id_local`, 
            [nombre_local, direccion]
        );
        const idLocal = resLocal.rows[0].id_local;
        
        await client.query(
            `INSERT INTO usuarios (id_local, nombre, correo, contrasena_hash, rol) VALUES ($1, $2, $3, $4, 'Administrador')`,
            [idLocal, nombre, correo, contrasena]
        );
        
        await client.query('COMMIT');
        res.json({ success: true, id_local: idLocal });
    } catch (err) {
        await client.query('ROLLBACK');
        res.status(500).json({ error: err.message });
    } finally {
        client.release();
    }
});

// API: Locales y Usuarios
app.get('/api/locales/:id', async (req, res) => {
    try {
        const { rows } = await db.query(`SELECT * FROM locales WHERE id_local = $1`, [req.params.id]);
        res.json(rows[0]);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/usuarios/local', async (req, res) => {
    try {
        const { id_local } = req.query;
        const { rows } = await db.query(`SELECT id_usuario, nombre, rol, id_local FROM usuarios WHERE id_local = $1 AND estado = true`, [id_local]);
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// API: Turnos
app.get('/api/turnos/estado', async (req, res) => {
    try {
        const { id_local } = req.query;
        const { rows } = await db.query(`SELECT * FROM turnos_caja WHERE estado_turno = 'Abierto' AND id_local = $1 ORDER BY id_turno DESC LIMIT 1`, [id_local]);
        res.json({ turno_abierto: rows.length > 0, turno: rows[0] });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/turnos/abrir', async (req, res) => {
    try {
        const { id_usuario, id_local, monto_apertura } = req.body;
        const { rows } = await db.query(
            `INSERT INTO turnos_caja (id_usuario, id_local, monto_apertura) VALUES ($1, $2, $3) RETURNING id_turno`, 
            [id_usuario, id_local, monto_apertura]
        );
        res.json({ success: true, id_turno: rows[0].id_turno });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/turnos/cerrar', async (req, res) => {
    try {
        const { id_turno, monto_cierre_real, monto_cierre_calculado } = req.body;
        await db.query(
            `UPDATE turnos_caja SET estado_turno = 'Cerrado', fecha_cierre = CURRENT_TIMESTAMP, monto_cierre_real = $1, monto_cierre_calculado = $2 WHERE id_turno = $3`,
            [monto_cierre_real, monto_cierre_calculado, id_turno]
        );
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/turnos/reporte', async (req, res) => {
    try {
        const { id_turno } = req.query;
        const report = { articulos: [], metodos_pago: [] };
        
        const resArticulos = await db.query(`
            SELECT p.nombre_producto, sum(d.cantidad) as total_cantidad, sum(d.subtotal) as total_dinero
            FROM detalle_ventas d
            JOIN ventas v ON d.id_venta = v.id_venta
            JOIN productos p ON d.id_producto = p.id_producto
            WHERE v.id_turno = $1
            GROUP BY p.nombre_producto
        `, [id_turno]);
        report.articulos = resArticulos.rows;
        
        const resMetodos = await db.query(`
            SELECT metodo_pago, sum(total_neto) as total
            FROM ventas
            WHERE id_turno = $1
            GROUP BY metodo_pago
        `, [id_turno]);
        report.metodos_pago = resMetodos.rows;
        
        res.json(report);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// API: Productos (SaaS)
app.get('/api/productos', async (req, res) => {
    try {
        const { q, id_local } = req.query;
        let query = `SELECT * FROM productos WHERE id_local = $1`;
        let params = [id_local];
        
        if (q) {
            query += ` AND (nombre_producto ILIKE $2 OR codigo_barras = $3)`;
            params.push(`%${q}%`, q);
        }
        const { rows } = await db.query(query, params);
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/productos/alertas', async (req, res) => {
    try {
        const { id_local } = req.query;
        const { rows } = await db.query(`SELECT * FROM productos WHERE stock_actual <= stock_minimo AND id_local = $1`, [id_local]);
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/productos', async (req, res) => {
    try {
        const { id_local, codigo_barras, nombre_producto, imagen_url, precio_compra, precio_venta, stock_actual, stock_minimo } = req.body;
        const { rows } = await db.query(
            `INSERT INTO productos (id_local, codigo_barras, nombre_producto, imagen_url, precio_compra, precio_venta, stock_actual, stock_minimo) 
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id_producto`,
            [id_local, codigo_barras, nombre_producto, imagen_url, precio_compra, precio_venta, stock_actual, stock_minimo]
        );
        res.json({ success: true, id_producto: rows[0].id_producto });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.delete('/api/productos/:id', async (req, res) => {
    try {
        await db.query(`DELETE FROM productos WHERE id_producto = $1`, [req.params.id]);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// API: Clientes
app.get('/api/clientes/buscar', async (req, res) => {
    try {
        const { documento } = req.query;
        const { rows } = await db.query(`SELECT * FROM clientes WHERE documento_identidad = $1`, [documento]);
        res.json(rows[0] || null);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/clientes/crear', async (req, res) => {
    try {
        const { documento_identidad, nombre_razon_social, telefono, correo } = req.body;
        const { rows } = await db.query(
            `INSERT INTO clientes (documento_identidad, nombre_razon_social, telefono, correo) VALUES ($1, $2, $3, $4) RETURNING id_cliente`,
            [documento_identidad, nombre_razon_social, telefono, correo]
        );
        res.json({ success: true, id_cliente: rows[0].id_cliente });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// API: Historial de Ventas
app.get('/api/ventas/historial', async (req, res) => {
    try {
        const { id_local } = req.query;
        const { rows } = await db.query(`
            SELECT v.*, u.nombre as cajero, c.nombre_razon_social as cliente
            FROM ventas v
            LEFT JOIN usuarios u ON v.id_usuario = u.id_usuario
            LEFT JOIN clientes c ON v.id_cliente = c.id_cliente
            WHERE v.id_local = $1
            ORDER BY v.fecha_venta DESC
        `, [id_local]);
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// API: Envio de Factura por Correo
app.post('/api/facturas/enviar-correo', async (req, res) => {
    try {
        const { correo_cliente, nombre_cliente, id_venta, total_neto, detalles, nombre_local, metodo_pago } = req.body;
        
        if (!transporter) {
            return res.status(503).json({ error: 'Servidor de correo no disponible.' });
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
            <div style="background:linear-gradient(135deg,#264653,#2A9D8F);padding:2rem;text-align:center;">
              <h1 style="color:white;margin:0;font-size:1.5rem;">🧾 Factura Electrónica</h1>
              <p style="color:rgba(255,255,255,0.8);margin:0.5rem 0 0;">Documento Autorizado - Simulación DIAN</p>
            </div>
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
            <div style="background:#f0f0f0;padding:1rem;text-align:center;color:#999;font-size:0.8rem;">
              ✦ Desarrollado por <strong style="color:#2A9D8F;">Andrés Cuesta</strong> · Sistema Integral de Ventas ✦
            </div>
          </div>
        </body>
        </html>`;

        await transporter.sendMail({
            from: `"${nombre_local} - Sistema POS" <andrescuesta112@gmail.com>`,
            to: correo_cliente,
            subject: `Factura Electrónica No. FE-${id_venta.toString().padStart(6,'0')} - ${nombre_local}`,
            html: htmlBody,
        });

        console.log(`\n📧 Factura enviada REALMENTE a ${correo_cliente}\n`);

        res.json({ success: true, mensaje: 'Factura enviada exitosamente.' });
    } catch (err) {
        console.error('Error enviando correo:', err);
        res.status(500).json({ error: 'No se pudo enviar el correo.' });
    }
});

// API: Ventas
app.post('/api/ventas/procesar', async (req, res) => {
    const client = await db.connect();
    try {
        const { id_usuario, id_local, id_cliente, id_turno, subtotal, descuento_total, impuestos, total_neto, metodo_pago, detalles } = req.body;
        
        await client.query('BEGIN');
        
        const resVenta = await client.query(
            `INSERT INTO ventas (id_usuario, id_local, id_cliente, id_turno, subtotal, descuento_total, impuestos, total_neto, metodo_pago) 
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING id_venta`,
            [id_usuario, id_local, id_cliente, id_turno, subtotal, descuento_total, impuestos, total_neto, metodo_pago]
        );
        const ventaId = resVenta.rows[0].id_venta;
        
        for (const det of detalles) {
            await client.query(
                `INSERT INTO detalle_ventas (id_venta, id_producto, cantidad, precio_unitario_cobrado, descuento_aplicado, subtotal) 
                 VALUES ($1, $2, $3, $4, $5, $6)`,
                [ventaId, det.id_producto, det.cantidad, det.precio_unitario, det.descuento, det.subtotal]
            );
            
            await client.query(
                `UPDATE productos SET stock_actual = stock_actual - $1 WHERE id_producto = $2 AND id_local = $3`,
                [det.cantidad, det.id_producto, id_local]
            );
        }
        
        if (id_cliente && id_cliente !== 1) { // 1 es Consumidor final
            const puntos = Math.floor(total_neto / 10000);
            await client.query(`UPDATE clientes SET puntos_acumulados = puntos_acumulados + $1 WHERE id_cliente = $2`, [puntos, id_cliente]);
        }
        
        await client.query('COMMIT');
        res.json({ success: true, id_venta: ventaId });
    } catch (err) {
        await client.query('ROLLBACK');
        console.error('Error procesando venta:', err);
        res.status(500).json({ error: err.message });
    } finally {
        client.release();
    }
});

const PORT = 3000;
app.listen(PORT, () => {
    console.log(`Backend server running on http://localhost:${PORT}`);
});
