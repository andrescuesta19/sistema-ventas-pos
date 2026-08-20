require('dotenv').config();
const express = require('express');
const cors = require('cors');
const nodemailer = require('nodemailer');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const rateLimit = require('express-rate-limit');
const crypto = require('crypto'); // v1.5.4: para generarCodigo() criptografico
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const db = require('./db');
const dian = require('./dian'); // v1.9.1: facturación electrónica DIAN

const app = express();

// === Servir imágenes de productos ===
const uploadsDir = path.join(__dirname, 'uploads', 'productos');
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// === Configuración de multer para imágenes ===
const storageProductos = multer.diskStorage({
    destination: (req, file, cb) => cb(null, uploadsDir),
    filename: (req, file, cb) => {
        const ext = path.extname(file.originalname).toLowerCase();
        cb(null, `producto_${req.params.id}_${Date.now()}${ext}`);
    }
});
const uploadProducto = multer({
    storage: storageProductos,
    limits: { fileSize: 5 * 1024 * 1024 }, // 5 MB
    fileFilter: (req, file, cb) => {
        const allowed = ['.jpg', '.jpeg', '.png', '.webp'];
        const ext = path.extname(file.originalname).toLowerCase();
        if (allowed.includes(ext)) cb(null, true);
        else cb(new Error('Solo se permiten imágenes JPG, PNG o WebP.'));
    }
});

// === A3-fix: CORS con whitelist ===
// Solo permitimos orígenes conocidos. En producción el frontend siempre
// es la app Electron local o localhost, así que la lista es cerrada.
const ALLOWED_ORIGINS = (process.env.CORS_ORIGINS || 'http://localhost:3000,http://localhost:5173,http://127.0.0.1:3000,capacitor://localhost').split(',');
app.use(cors({
    origin: (origin, callback) => {
        // Permitir requests sin origin (Electron, curl, health checks)
        if (!origin) return callback(null, true);
        if (ALLOWED_ORIGINS.includes(origin)) return callback(null, true);
        return callback(new Error(`Origen no permitido: ${origin}`));
    },
    credentials: true,
}));
app.use(express.json());

// === B3-fix: Rate limiting global ===
const globalLimiter = rateLimit({
    windowMs: 60 * 1000, // 1 min
    max: 200,             // 200 req/min por IP (generoso para una app de escritorio)
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Demasiadas solicitudes. Intenta en un momento.' },
});
app.use('/api/', globalLimiter);

// Rate limit más estricto para login (anti brute-force)
const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 min
    max: 10,                   // 10 intentos por IP cada 15 min
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Demasiados intentos de login. Espera 15 minutos.' },
    // No contar intentos exitosos (para no molestar al usuario legítimo)
    skipSuccessfulRequests: true,
});

// === A2-fix: JWT ===
// v1.5.6: JWT_SECRET es OBLIGATORIO en producción.
// Antes había un fallback que generaba un secreto aleatorio por sesión: en prod eso
// invalidaba todos los tokens al reiniciar y enmascaraba una mala configuración.
let JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
    if (process.env.NODE_ENV === 'production') {
        console.error('❌ JWT_SECRET no está configurado. Abortando en producción.');
        console.error('   Genera uno con: openssl rand -hex 64');
        process.exit(1);
    }
    // Solo en desarrollo: generar uno aleatorio para esta sesión.
    const secret = crypto.randomBytes(64).toString('hex');
    console.warn('⚠️  JWT_SECRET no está configurado. Usando uno aleatorio para esta sesión (solo dev).');
    console.warn('   Los tokens se invalidarán al reiniciar. Configura JWT_SECRET en .env para producción.');
    JWT_SECRET = secret;
}
const JWT_EXPIRES_IN = '8h'; // turno de trabajo + margen

function signToken(payload) {
    return jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
}

// Middleware: requiere autenticación
function requireAuth(req, res, next) {
    const authHeader = req.headers.authorization || '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
    if (!token) {
        return res.status(401).json({ error: 'Sesión requerida. Inicia sesión.' });
    }
    try {
        const payload = jwt.verify(token, JWT_SECRET);
        // Verificar que el usuario sigue verificado y activo en la BD
        // (importante: alguien podría haber sido desactivado después de emitir el token)
        req.user = payload;
        next();
    } catch (err) {
        return res.status(401).json({ error: 'Sesión inválida o expirada. Inicia sesión de nuevo.' });
    }
}

// Middleware: requiere cuenta verificada (email confirmado)
// Lo aplicamos a endpoints que no son login ni verificación
async function requireAprobado(req, res, next) {
    try {
        // v1.5.4: también validar aprobado_por_admin (v1.5.0).
        // Antes solo validaba verificado y estado, lo que dejaba a usuarios
        // pendientes de aprobación del super-admin accediendo a endpoints
        // protegidos (como /api/productos).
        const r = await db.query(
            'SELECT verificado, estado, aprobado_por_admin FROM usuarios WHERE id_usuario = $1',
            [Number(req.user.id_usuario)]
        );
        if (r.rows.length === 0) return res.status(401).json({ error: 'Usuario no encontrado.' });
        const u = r.rows[0];
        if (!u.estado) return res.status(403).json({ error: 'Tu cuenta está desactivada.' });
        if (!u.verificado) return res.status(403).json({ error: 'Debes verificar tu correo antes de continuar.' });
        if (!u.aprobado_por_admin) {
            return res.status(403).json({
                error: 'Tu cuenta está pendiente de aprobación por el super-administrador.',
                pendiente_aprobacion: true,
            });
        }
        next();
    } catch (err) {
        console.error('Error en requireAprobado:', err);
        res.status(500).json({ error: 'Error interno del servidor.' });
    }
}

// Middleware: requiere rol Administrador
function requireAdmin(req, res, next) {
    if (!req.user || req.user.rol !== 'Administrador') {
        return res.status(403).json({ error: 'Se requiere rol de Administrador.' });
    }
    next();
}

// === v1.5.6: Error de negocio controlado ===
// Permite distinguir errores "operacionales" (mensajes seguros de mostrar al usuario)
// de errores internos (que deben quedar en logs y devolver mensaje genérico).
class AppError extends Error {
    constructor(message, status = 400) {
        super(message);
        this.status = status;
        this.isOperational = true;
    }
}

// === v1.5.6: Escape HTML para interpolaciones en emails ===
// Evita XSS por HTML injection cuando un dato del usuario (nombre, producto, etc.)
// se inserta dentro del cuerpo HTML de un correo.
function escapeHtml(str) {
    return String(str ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

// =====================================================
// SISTEMA DE EMAIL CON LOGGING Y RESILIENCIA
// =====================================================
// Wrapper sobre nodemailer que:
// 1. Loguea cada envío en la BD (auditoría)
// 2. Tiene retry automático
// 3. NO falla el flujo principal si el email falla (warn, no throw)
// 4. Siempre devuelve el código generado (para que el admin lo vea)

let transporter = null;
let emailStatus = 'no_configurado';

if (process.env.EMAIL_USER && process.env.EMAIL_PASS) {
    transporter = nodemailer.createTransport({
        host: 'smtp.gmail.com',
        port: 465,
        secure: true,
        auth: {
            user: process.env.EMAIL_USER,
            pass: process.env.EMAIL_PASS
        }
    });
    // Verificamos la conexión al arrancar
    transporter.verify()
        .then(() => {
            emailStatus = 'ok';
            console.log('\n📧 Servidor de correo LISTO (Gmail)');
            console.log(`   Cuenta: ${process.env.EMAIL_USER}\n`);
        })
        .catch(err => {
            emailStatus = 'auth_failed';
            console.error('\n❌ Gmail rechazó las credenciales:', err.message);
            console.error('   → Los emails NO se enviarán hasta que regeneres la contraseña de aplicación.');
            console.error('   → Ve a https://myaccount.google.com/apppasswords para crear una nueva.\n');
        });
} else {
    console.warn('\n⚠️  Servidor de correo NO configurado (faltan EMAIL_USER/EMAIL_PASS en .env)');
    console.warn('   → Los emails NO se enviarán. Los códigos quedarán en la BD para que los consultes.\n');
}

// Función para loguear emails en la BD
async function logEmail({ tipo, destinatario, asunto, exito, error_msg, codigo_asociado = null }) {
    try {
        await db.query(
            `INSERT INTO email_logs (tipo, destinatario, asunto, exito, error_mensaje, codigo_asociado, created_at)
             VALUES ($1, $2, $3, $4, $5, $6, NOW())`,
            [tipo, destinatario, asunto, exito, error_msg, codigo_asociado]
        );
    } catch (err) {
        console.error('Error guardando log de email:', err.message);
    }
}

// Función para enviar email con resiliencia
async function enviarEmail({ to, subject, html, tipo = 'general', codigo_asociado = null }) {
    if (!transporter) {
        const msg = 'Servidor de correo no configurado';
        console.warn(`⚠️ Email NO enviado a ${to}: ${msg}`);
        await logEmail({ tipo, destinatario: to, asunto: subject, exito: false, error_msg: msg, codigo_asociado });
        return { success: false, error: msg };
    }

    try {
        await transporter.sendMail({
            from: `"Sistema de Ventas POS" <${process.env.EMAIL_USER}>`,
            to,
            subject,
            html,
        });
        console.log(`📧 Email enviado a ${to} [${tipo}]`);
        await logEmail({ tipo, destinatario: to, asunto: subject, exito: true, error_msg: null, codigo_asociado });
        return { success: true };
    } catch (err) {
        console.error(`❌ Error enviando email a ${to}: ${err.message}`);
        await logEmail({ tipo, destinatario: to, asunto: subject, exito: false, error_msg: err.message, codigo_asociado });
        return { success: false, error: err.message };
    }
}

// API: Auth
// ⚠️  C4-fix: Mitigación de timing attack.
//     Si el usuario no existe, igual hacemos un bcrypt.compare contra un hash dummy
//     con el mismo cost factor, para que el tiempo de respuesta sea indistinguible
//     del caso "usuario existe pero contraseña incorrecta".
//     Esto previene enumeración de correos registrados por diferencia de tiempo.
const BCRYPT_DUMMY_HASH = '$2b$12$iAv.b8NAI2Teb96n0OmpBeIeXOuy4uYPk6pwDdhWGJDoBCXTaTCMK'; // hash bcrypt válido de "dummy-no-existe" (cost 12)

// === B3-fix: Login con rate limit estricto (anti brute-force) ===
app.post('/api/auth/login', loginLimiter, async (req, res) => {
    try {
        const correo = (req.body.correo || '').toString().trim();
        const contrasena = (req.body.contrasena || '').toString();

        if (!correo || !contrasena) {
            return res.status(400).json({ error: 'Correo y contraseña son requeridos.' });
        }

        const { rows } = await db.query(`
            SELECT u.*, l.nombre_local
            FROM usuarios u
            LEFT JOIN locales l ON u.id_local = l.id_local
            WHERE u.correo = $1
        `, [correo]);

        const row = rows[0];

        if (!row) {
            // ⚠️ Mitigación timing attack: hacemos un bcrypt.compare con hash dummy
            // del mismo cost factor (10) para igualar el tiempo de respuesta.
            await bcrypt.compare(contrasena, BCRYPT_DUMMY_HASH);
            return res.status(401).json({ error: 'Credenciales inválidas' });
        }

        // Verificación segura con Bcrypt
        let esValida = false;
        if (row.contrasena_hash && (row.contrasena_hash.startsWith('$2a$') || row.contrasena_hash.startsWith('$2b$'))) {
            esValida = await bcrypt.compare(contrasena, row.contrasena_hash);
        } else {
            // ⚠️ Legacy: si hay un hash que no es bcrypt, hacemos un compare contra el dummy
            // (que también falla) para igualar el tiempo, y luego rechazamos.
            await bcrypt.compare(contrasena, BCRYPT_DUMMY_HASH);
            esValida = false;
        }

        if (!esValida) {
            return res.status(401).json({ error: 'Credenciales inválidas' });
        }

        // Verificar que la cuenta está activa y aprobada
        if (!row.estado) {
            return res.status(403).json({ error: 'Tu cuenta está desactivada. Contacta al administrador de la plataforma.' });
        }
        // v1.5.0: La verificación de email ya no se usa.
        // Lo que importa es que esté aprobado por el super-admin.
        if (!row.aprobado_por_admin) {
            return res.status(403).json({
                error: 'Tu cuenta está pendiente de aprobación. El super-administrador revisará tu solicitud pronto.',
                pendiente_aprobacion: true,
                correo: row.correo,
            });
        }

        // === A2-fix: Generar JWT en vez de devolver datos sueltos ===
        const token = signToken({
            id_usuario: row.id_usuario,
            nombre: row.nombre,
            rol: row.rol,
            id_local: row.id_local,
            nombre_local: row.nombre_local,
        });

        res.json({
            token,
            user: {
                id_usuario: row.id_usuario,
                nombre: row.nombre,
                rol: row.rol,
                id_local: row.id_local,
                nombre_local: row.nombre_local,
                verificado: row.verificado,
            }
        });
    } catch (err) {
        console.error('Error en login:', err);
        res.status(500).json({ error: 'Error interno del servidor.' });
    }
});

// Endpoint para verificar token (útil al recargar la página)
app.get('/api/auth/me', requireAuth, async (req, res) => {
    // Devolvemos datos actualizados del usuario desde la BD
    try {
        const { rows } = await db.query(`
            SELECT u.id_usuario, u.nombre, u.correo, u.rol, u.id_local, u.verificado, u.estado, u.documento_identidad, u.telefono, u.avatar_url, l.nombre_local, l.nit, l.direccion, l.ciudad, l.telefono as telefono_local
            FROM usuarios u
            LEFT JOIN locales l ON u.id_local = l.id_local
            WHERE u.id_usuario = $1
        `, [Number(req.user.id_usuario)]);
        if (rows.length === 0) return res.status(404).json({ error: 'Usuario no encontrado.' });
        res.json(rows[0]);
    } catch (err) {
        console.error('Error en /me:', err);
        res.status(500).json({ error: 'Error interno del servidor.' });
    }
});

// =====================================================
// REGISTRO PÚBLICO v1.4.0 — con 5 capas de seguridad
// =====================================================
// 1. Rate limit por IP (3/hora)
// 2. Switch en BD "registro_publico_habilitado" (OFF por defecto)
// 3. Verificación de email con código 6 dígitos (15 min expiración)
// 4. Política de contraseña configurable
// 5. Cuenta inactiva hasta verificar email
// =====================================================

// Helper: leer config del sistema
async function getConfig(clave) {
    const r = await db.query('SELECT valor FROM configuracion_sistema WHERE clave = $1', [clave]);
    return r.rows[0]?.valor || null;
}

// Helper: generar código de 6 dígitos (criptográficamente seguro, v1.5.4)
// Antes usaba Math.random() que NO es seguro. crypto.randomInt es CSPRNG.
function generarCodigo() {
    return String(crypto.randomInt(0, 1000000)).padStart(6, '0');
}

// Helper: validar política de contraseña
async function validarPoliticaContrasena(contrasena) {
    const minLong = parseInt(await getConfig('politica_password_min_longitud') || '8');
    const reqMayus = (await getConfig('politica_password_requiere_mayuscula') || 'true') === 'true';
    const reqNum = (await getConfig('politica_password_requiere_numero') || 'true') === 'true';
    const reqEsp = (await getConfig('politica_password_requiere_especial') || 'false') === 'true';

    if (contrasena.length < minLong) {
        return `La contraseña debe tener al menos ${minLong} caracteres.`;
    }
    if (reqMayus && !/[A-Z]/.test(contrasena)) {
        return 'La contraseña debe tener al menos una letra mayúscula.';
    }
    if (reqNum && !/[0-9]/.test(contrasena)) {
        return 'La contraseña debe tener al menos un número.';
    }
    if (reqEsp && !/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(contrasena)) {
        return 'La contraseña debe tener al menos un carácter especial (!@#$%^&*).';
    }
    return null; // válida
}

// Rate limit para registro: 3 por hora por IP
const registroLimiter = rateLimit({
    windowMs: 60 * 60 * 1000,
    max: 3,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Demasiados intentos de registro desde tu IP. Intenta en 1 hora.' },
});

app.post('/api/auth/registro', registroLimiter, async (req, res) => {
    const client = await db.connect();
    try {
        // Capa 1: Verificar que el registro público está habilitado
        const registroHabilitado = (await getConfig('registro_publico_habilitado')) === 'true';
        if (!registroHabilitado) {
            return res.status(403).json({
                error: 'El registro público está deshabilitado. Contacta al administrador del sistema.'
            });
        }

        const {
            // Datos del local
            nombre_local, direccion, nit, telefono_local, ciudad,
            // Datos del administrador
            nombre, correo, contrasena, documento_identidad, telefono,
        } = req.body;

        // Capa 2: Validar todos los campos requeridos
        const camposRequeridos = { nombre_local, nombre, correo, contrasena, documento_identidad };
        for (const [campo, valor] of Object.entries(camposRequeridos)) {
            if (!valor || String(valor).trim() === '') {
                return res.status(400).json({ error: `El campo "${campo}" es obligatorio.` });
            }
        }

        // Validar email
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(correo)) {
            return res.status(400).json({ error: 'Correo inválido.' });
        }

        // Capa 3: Validar política de contraseña
        const errorPassword = await validarPoliticaContrasena(contrasena);
        if (errorPassword) {
            return res.status(400).json({ error: errorPassword });
        }

        // Validar cédula (solo números, 6-15 dígitos)
        if (!/^\d{6,15}$/.test(documento_identidad)) {
            return res.status(400).json({ error: 'Cédula inválida. Debe tener entre 6 y 15 dígitos.' });
        }

        // Verificar que el correo no esté registrado
        const existeCorreo = await client.query('SELECT id_usuario FROM usuarios WHERE correo = $1', [correo.toLowerCase().trim()]);
        if (existeCorreo.rows.length > 0) {
            return res.status(409).json({ error: 'Ya existe una cuenta con ese correo.' });
        }

        // Verificar que la cédula no esté registrada
        const existeDoc = await client.query('SELECT id_usuario FROM usuarios WHERE documento_identidad = $1', [documento_identidad]);
        if (existeDoc.rows.length > 0) {
            return res.status(409).json({ error: 'Ya existe una cuenta con esa cédula.' });
        }

        // Capa 4: Hashear contraseña con cost 12 (configurable)
        const costFactor = parseInt(await getConfig('bcrypt_cost_factor') || '12');
        const hash = await bcrypt.hash(contrasena, costFactor);

        await client.query('BEGIN');

        // Crear local
        const resLocal = await client.query(
            `INSERT INTO locales (nombre_local, direccion, nit, telefono, ciudad, email)
             VALUES ($1, $2, $3, $4, $5, $6)
             RETURNING id_local`,
            [
                nombre_local.trim(),
                direccion ? direccion.trim() : null,
                nit ? nit.trim() : null,
                telefono_local ? telefono_local.trim() : null,
                ciudad ? ciudad.trim() : null,
                correo.toLowerCase().trim(),
            ]
        );
        const idLocal = resLocal.rows[0].id_local;

        // ⚠️ v1.5.0: Ya NO pedimos código de verificación al cliente.
        // El usuario se crea con verificado=true y aprobado_por_admin=false.
        // Puede entrar a la app, pero la mayoría de funciones están bloqueadas
        // hasta que el super-admin apruebe.
        const resUsuario = await client.query(
            `INSERT INTO usuarios
             (id_local, nombre, correo, contrasena_hash, rol, documento_identidad, telefono, verificado, aprobado_por_admin)
             VALUES ($1, $2, $3, $4, 'Administrador', $5, $6, true, false)
             RETURNING id_usuario`,
            [idLocal, nombre.trim(), correo.toLowerCase().trim(), hash, documento_identidad, telefono ? telefono.trim() : null]
        );
        const idUsuario = resUsuario.rows[0].id_usuario;

        await client.query('COMMIT');

        // Devolvemos JWT para que entre directo a la app
        const token = signToken({
            id_usuario: idUsuario,
            nombre: nombre.trim(),
            rol: 'Administrador',
            id_local: idLocal,
            nombre_local: nombre_local.trim(),
        });

        res.status(201).json({
            success: true,
            message: 'Registro exitoso. Tu cuenta está pendiente de aprobación por el administrador de la plataforma.',
            token,
            user: {
                id_usuario: idUsuario,
                nombre: nombre.trim(),
                rol: 'Administrador',
                id_local: idLocal,
                nombre_local: nombre_local.trim(),
                verificado: true,
                aprobado_por_admin: false,  // importante: el cliente sabe que está pendiente
            },
        });

    } catch (err) {
        await client.query('ROLLBACK').catch(() => {});
        console.error('Error en registro:', err);
        res.status(500).json({ error: 'Error interno al crear la cuenta.' });
    } finally {
        client.release();
    }
});

// Verificar email con código de 6 dígitos
app.post('/api/auth/verificar-email', async (req, res) => {
    try {
        const { correo, codigo } = req.body;
        if (!correo || !codigo) {
            return res.status(400).json({ error: 'Correo y código son requeridos.' });
        }
        if (!/^\d{6}$/.test(codigo)) {
            return res.status(400).json({ error: 'El código debe ser de 6 dígitos.' });
        }

        const r = await db.query(
            `SELECT id_usuario, id_local, nombre, codigo_verificacion, codigo_expiracion, intentos_verificacion, verificado
             FROM usuarios WHERE correo = $1`,
            [correo.toLowerCase().trim()]
        );
        if (r.rows.length === 0) {
            return res.status(404).json({ error: 'No existe una cuenta con ese correo.' });
        }
        const u = r.rows[0];

        if (u.verificado) {
            return res.json({ success: true, message: 'La cuenta ya estaba verificada.', ya_verificado: true });
        }

        // Rate limit de intentos
        const maxIntentos = parseInt(await getConfig('max_intentos_verificacion') || '5');
        if (u.intentos_verificacion >= maxIntentos) {
            return res.status(429).json({
                error: `Demasiados intentos fallidos. Solicita un nuevo código.`
            });
        }

        // Verificar expiración
        if (new Date() > new Date(u.codigo_expiracion)) {
            return res.status(400).json({ error: 'El código expiró. Solicita uno nuevo.' });
        }

        // Verificar código
        if (u.codigo_verificacion !== codigo) {
            // Incrementar intentos
            await db.query('UPDATE usuarios SET intentos_verificacion = intentos_verificacion + 1 WHERE id_usuario = $1', [u.id_usuario]);
            const restantes = maxIntentos - u.intentos_verificacion - 1;
            return res.status(401).json({
                error: `Código incorrecto. Te quedan ${restantes} ${restantes === 1 ? 'intento' : 'intentos'}.`
            });
        }

        // ✅ Código correcto: activar cuenta y devolver JWT
        await db.query(
            'UPDATE usuarios SET verificado = true, codigo_verificacion = NULL, codigo_expiracion = NULL, intentos_verificacion = 0 WHERE id_usuario = $1',
            [u.id_usuario]
        );

        // Obtener datos del local para el JWT
        const localRes = await db.query('SELECT nombre_local FROM locales WHERE id_local = $1', [u.id_local]);
        const nombre_local = localRes.rows[0]?.nombre_local || 'Mi Local';

        const token = signToken({
            id_usuario: u.id_usuario,
            nombre: u.nombre,
            rol: 'Administrador',
            id_local: u.id_local,
            nombre_local,
        });

        res.json({
            success: true,
            message: '¡Cuenta verificada con éxito!',
            token,
            user: {
                id_usuario: u.id_usuario,
                nombre: u.nombre,
                rol: 'Administrador',
                id_local: u.id_local,
                nombre_local,
            },
        });
    } catch (err) {
        console.error('Error verificando email:', err);
        res.status(500).json({ error: 'Error interno del servidor.' });
    }
});

// Reenviar código de verificación
app.post('/api/auth/reenviar-codigo', registroLimiter, async (req, res) => {
    try {
        const { correo } = req.body;
        if (!correo) return res.status(400).json({ error: 'Correo requerido.' });

        const r = await db.query(
            'SELECT id_usuario, nombre, verificado FROM usuarios WHERE correo = $1',
            [correo.toLowerCase().trim()]
        );
        if (r.rows.length === 0) {
            return res.status(404).json({ error: 'No existe una cuenta con ese correo.' });
        }
        const u = r.rows[0];
        if (u.verificado) {
            return res.json({ success: true, message: 'La cuenta ya estaba verificada.' });
        }

        const codigo = generarCodigo();
        const minutosExp = parseInt(await getConfig('codigo_verificacion_expiracion_minutos') || '15');
        await db.query(
            'UPDATE usuarios SET codigo_verificacion = $1, codigo_expiracion = NOW() + ($2 || \' minutes\')::interval, intentos_verificacion = 0 WHERE id_usuario = $3',
            [codigo, String(minutosExp), u.id_usuario]
        );

        if (transporter) {
            try {
                await transporter.sendMail({
                    from: `"Sistema de Ventas POS" <${process.env.EMAIL_USER}>`,
                    to: correo,
                    subject: 'Nuevo código de verificación - Sistema de Ventas POS',
                    html: `
                        <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:2rem;">
                            <h2 style="color:#264653;">Hola ${escapeHtml(u.nombre)},</h2>
                            <p>Tu nuevo código de verificación es:</p>
                            <div style="background:#264653;color:white;font-size:2rem;letter-spacing:0.5rem;padding:1.5rem;text-align:center;border-radius:8px;margin:1.5rem 0;font-weight:700;">
                                ${codigo}
                            </div>
                            <p style="color:#666;font-size:0.9rem;">Expira en ${minutosExp} minutos.</p>
                        </div>
                    `,
                });
            } catch (e) {
                console.error('Error reenviando código:', e.message);
            }
        }

        res.json({
            success: true,
            message: 'Código reenviado. Revisa tu correo.',
            _dev_codigo: process.env.NODE_ENV === 'development' ? codigo : undefined,
        });
    } catch (err) {
        console.error('Error en reenviar código:', err);
        res.status(500).json({ error: 'Error interno del servidor.' });
    }
});

// Solicitar código para recuperar contraseña (usuario no logueado)
app.post('/api/auth/solicitar-reset-password', rateLimit({
    windowMs: 60 * 60 * 1000, max: 3,
    message: { error: 'Demasiadas solicitudes. Intenta en 1 hora.' },
}), async (req, res) => {
    try {
        const { correo } = req.body;
        if (!correo) return res.status(400).json({ error: 'Correo requerido.' });

        const r = await db.query(
            'SELECT id_usuario, nombre FROM usuarios WHERE correo = $1 AND estado = true',
            [correo.toLowerCase().trim()]
        );

        // Por seguridad, siempre devolvemos el mismo mensaje (no revelamos si el correo existe)
        if (r.rows.length === 0) {
            return res.json({ success: true, message: 'Si el correo existe, recibirás un código de verificación.' });
        }
        const u = r.rows[0];
        const codigo = generarCodigo();
        const minutosExp = 15;
        await db.query(
            'UPDATE usuarios SET codigo_reset_password = $1, codigo_reset_expiracion = NOW() + ($2 || \' minutes\')::interval WHERE id_usuario = $3',
            [codigo, String(minutosExp), u.id_usuario]
        );

        if (transporter) {
            try {
                await transporter.sendMail({
                    from: `"Sistema de Ventas POS" <${process.env.EMAIL_USER}>`,
                    to: correo,
                    subject: 'Recuperación de contraseña - Sistema de Ventas POS',
                    html: `
                        <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:2rem;">
                            <h2 style="color:#264653;">Hola ${escapeHtml(u.nombre)},</h2>
                            <p>Recibimos una solicitud para restablecer tu contraseña. Tu código de verificación es:</p>
                            <div style="background:#264653;color:white;font-size:2rem;letter-spacing:0.5rem;padding:1.5rem;text-align:center;border-radius:8px;margin:1.5rem 0;font-weight:700;">
                                ${codigo}
                            </div>
                            <p style="color:#666;font-size:0.9rem;">Este código expira en ${minutosExp} minutos.</p>
                            <p style="color:#b91c1c;font-size:0.9rem;">Si no solicitaste esto, ignora este mensaje y tu contraseña seguirá igual.</p>
                        </div>
                    `,
                });
            } catch (e) {
                console.error('Error enviando código de reset:', e.message);
            }
        }

        res.json({
            success: true,
            message: 'Si el correo existe, recibirás un código de verificación.',
            _dev_codigo: process.env.NODE_ENV === 'development' ? codigo : undefined,
        });
    } catch (err) {
        console.error('Error en solicitar-reset:', err);
        res.status(500).json({ error: 'Error interno del servidor.' });
    }
});

// Confirmar reset de contraseña con código
app.post('/api/auth/confirmar-reset-password', async (req, res) => {
    try {
        const { correo, codigo, nueva_contrasena } = req.body;
        if (!correo || !codigo || !nueva_contrasena) {
            return res.status(400).json({ error: 'Correo, código y nueva contraseña son requeridos.' });
        }
        if (!/^\d{6}$/.test(codigo)) {
            return res.status(400).json({ error: 'El código debe ser de 6 dígitos.' });
        }

        // Validar política
        const errorPassword = await validarPoliticaContrasena(nueva_contrasena);
        if (errorPassword) {
            return res.status(400).json({ error: errorPassword });
        }

        const r = await db.query(
            'SELECT id_usuario, codigo_reset_password, codigo_reset_expiracion FROM usuarios WHERE correo = $1',
            [correo.toLowerCase().trim()]
        );
        if (r.rows.length === 0) {
            return res.status(404).json({ error: 'Código inválido o expirado.' });
        }
        const u = r.rows[0];

        if (!u.codigo_reset_password || new Date() > new Date(u.codigo_reset_expiracion)) {
            return res.status(400).json({ error: 'Código inválido o expirado.' });
        }
        if (u.codigo_reset_password !== codigo) {
            return res.status(401).json({ error: 'Código incorrecto.' });
        }

        const costFactor = parseInt(await getConfig('bcrypt_cost_factor') || '12');
        const hash = await bcrypt.hash(nueva_contrasena, costFactor);
        await db.query(
            'UPDATE usuarios SET contrasena_hash = $1, codigo_reset_password = NULL, codigo_reset_expiracion = NULL WHERE id_usuario = $2',
            [hash, u.id_usuario]
        );

        res.json({ success: true, message: 'Contraseña actualizada. Ya puedes iniciar sesión.' });
    } catch (err) {
        console.error('Error en confirmar-reset:', err);
        res.status(500).json({ error: 'Error interno del servidor.' });
    }
});

// API: Locales y Usuarios (PROTEGIDOS)
// IMPORTANTE: /api/locales/me debe ir ANTES de /api/locales/:id
// porque Express matchea rutas por orden de declaración, y "me"
// sería parseado como id con Number("me") = NaN.
app.get('/api/locales/me', requireAuth, requireAprobado, async (req, res) => {
    try {
        const idLocal = Number(req.user.id_local);
        const r = await db.query(
            'SELECT id_local, nombre_local, direccion, nit, telefono, ciudad, email FROM locales WHERE id_local = $1',
            [idLocal]
        );
        if (r.rows.length === 0) return res.status(404).json({ error: 'Local no encontrado.' });
        res.json(r.rows[0]);
    } catch (err) {
        console.error('Error en GET /locales/me:', err);
        res.status(500).json({ error: 'Error interno del servidor.' });
    }
});

app.get('/api/locales/:id', requireAuth, requireAprobado, async (req, res) => {
    try {
        const idLocal = Number(req.params.id);
        if (isNaN(idLocal)) return res.status(400).json({ error: 'id inválido.' });
        // Solo el admin del local o un usuario del mismo local puede leerlo
        if (idLocal !== Number(req.user.id_local) && req.user.rol !== 'Administrador') {
            return res.status(403).json({ error: 'No autorizado.' });
        }
        const { rows } = await db.query(`SELECT * FROM locales WHERE id_local = $1`, [idLocal]);
        res.json(rows[0]);
    } catch (err) {
        console.error('Error en /locales/:id:', err);
        res.status(500).json({ error: 'Error interno del servidor.' });
    }
});

app.get('/api/usuarios/local', requireAuth, requireAprobado, async (req, res) => {
    try {
        const { id_local } = req.query;
        // Solo pueden listar usuarios del local al que pertenecen
        if (Number(id_local) !== req.user.id_local) {
            return res.status(403).json({ error: 'No autorizado.' });
        }
        const { rows } = await db.query(`SELECT id_usuario, nombre, rol, id_local, estado FROM usuarios WHERE id_local = $1 ORDER BY nombre`, [id_local]);
        res.json(rows);
    } catch (err) {
        console.error('Error en /usuarios/local:', err);
        res.status(500).json({ error: 'Error interno del servidor.' });
    }
});

// === NUEVO: CRUD de gestión de usuarios (solo Administradores) ===
// Crear usuario (admin o cajero) en el local del admin logueado
app.post('/api/usuarios', requireAuth, requireAprobado, requireAdmin, async (req, res) => {
    try {
        const { nombre, correo, contrasena, rol } = req.body;

        // Validaciones
        if (!nombre || !correo || !contrasena) {
            return res.status(400).json({ error: 'Faltan campos requeridos (nombre, correo, contrasena).' });
        }
        if (contrasena.length < 6) {
            return res.status(400).json({ error: 'La contraseña debe tener al menos 6 caracteres.' });
        }
        if (!['Administrador', 'Cajero', 'Supervisor'].includes(rol)) {
            return res.status(400).json({ error: 'Rol inválido. Use Administrador, Cajero o Supervisor.' });
        }
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(correo)) {
            return res.status(400).json({ error: 'Correo inválido.' });
        }

        // Verificar que el correo no esté ya registrado
        const existente = await db.query('SELECT id_usuario FROM usuarios WHERE correo = $1', [correo]);
        if (existente.rows.length > 0) {
            return res.status(409).json({ error: 'Ya existe un usuario con ese correo.' });
        }

        const hash = await bcrypt.hash(contrasena, 10);
        const result = await db.query(
            `INSERT INTO usuarios (id_local, nombre, correo, contrasena_hash, rol)
             VALUES ($1, $2, $3, $4, $5)
             RETURNING id_usuario, id_local, nombre, correo, rol, estado`,
            [Number(req.user.id_local), nombre, correo, hash, rol]
        );
        res.status(201).json({ success: true, usuario: result.rows[0] });
    } catch (err) {
        console.error('Error creando usuario:', err);
        res.status(500).json({ error: 'Error interno al crear el usuario.' });
    }
});

// Actualizar usuario (solo admin del mismo local)
app.put('/api/usuarios/:id', requireAuth, requireAprobado, requireAdmin, async (req, res) => {
    try {
        const id = Number(req.params.id);
        const { nombre, rol, estado, contrasena } = req.body;

        // Verificar que el usuario pertenece al mismo local
        const target = await db.query('SELECT id_local FROM usuarios WHERE id_usuario = $1', [id]);
        if (target.rows.length === 0) return res.status(404).json({ error: 'Usuario no encontrado.' });
        if (target.rows[0].id_local !== req.user.id_local) {
            return res.status(403).json({ error: 'No autorizado.' });
        }

        // Construir UPDATE dinámico solo con los campos enviados
        const updates = [];
        const params = [];
        let i = 1;
        if (nombre !== undefined) { updates.push(`nombre = $${i++}`); params.push(nombre); }
        if (rol !== undefined) {
            if (!['Administrador', 'Cajero', 'Supervisor'].includes(rol)) {
                return res.status(400).json({ error: 'Rol inválido.' });
            }
            updates.push(`rol = $${i++}`); params.push(rol);
        }
        if (estado !== undefined) { updates.push(`estado = $${i++}`); params.push(!!estado); }
        if (contrasena !== undefined) {
            if (contrasena.length < 6) {
                return res.status(400).json({ error: 'La contraseña debe tener al menos 6 caracteres.' });
            }
            const hash = await bcrypt.hash(contrasena, 10);
            updates.push(`contrasena_hash = $${i++}`); params.push(hash);
        }

        if (updates.length === 0) return res.status(400).json({ error: 'Nada que actualizar.' });

        params.push(id);
        await db.query(`UPDATE usuarios SET ${updates.join(', ')} WHERE id_usuario = $${i}`, params);
        res.json({ success: true });
    } catch (err) {
        console.error('Error actualizando usuario:', err);
        res.status(500).json({ error: 'Error interno al actualizar el usuario.' });
    }
});

// Eliminar (desactivar) usuario — solo admin del mismo local
app.delete('/api/usuarios/:id', requireAuth, requireAprobado, requireAdmin, async (req, res) => {
    try {
        const id = Number(req.params.id);
        // No se puede eliminar a sí mismo
        if (id === req.user.id_usuario) {
            return res.status(400).json({ error: 'No puedes eliminar tu propia cuenta.' });
        }
        const target = await db.query('SELECT id_local FROM usuarios WHERE id_usuario = $1', [id]);
        if (target.rows.length === 0) return res.status(404).json({ error: 'Usuario no encontrado.' });
        if (target.rows[0].id_local !== req.user.id_local) {
            return res.status(403).json({ error: 'No autorizado.' });
        }
        // Soft delete: marcar como inactivo (estado = false) en vez de eliminar
        await db.query('UPDATE usuarios SET estado = false WHERE id_usuario = $1', [id]);
        res.json({ success: true });
    } catch (err) {
        console.error('Error eliminando usuario:', err);
        res.status(500).json({ error: 'Error interno al eliminar el usuario.' });
    }
});

// API: Turnos (PROTEGIDOS)
app.get('/api/turnos/estado', requireAuth, requireAprobado, async (req, res) => {
    try {
        const { id_local } = req.query;
        if (Number(id_local) !== req.user.id_local) {
            return res.status(403).json({ error: 'No autorizado.' });
        }
        const { rows } = await db.query(`SELECT * FROM turnos_caja WHERE estado_turno = 'Abierto' AND id_local = $1 ORDER BY id_turno DESC LIMIT 1`, [id_local]);
        res.json({ turno_abierto: rows.length > 0, turno: rows[0] });
    } catch (err) {
        console.error('Error en /turnos/estado:', err);
        res.status(500).json({ error: 'Error interno del servidor.' });
    }
});

app.post('/api/turnos/abrir', requireAuth, requireAprobado, async (req, res) => {
    try {
        const { id_local, monto_apertura } = req.body;
        if (Number(id_local) !== req.user.id_local) {
            return res.status(403).json({ error: 'No autorizado.' });
        }
        const monto = parseFloat(monto_apertura) || 0;
        const { rows } = await db.query(
            `INSERT INTO turnos_caja (id_usuario, id_local, monto_apertura) VALUES ($1, $2, $3) RETURNING id_turno`,
            [Number(req.user.id_usuario), id_local, monto]
        );
        res.json({ success: true, id_turno: rows[0].id_turno });
    } catch (err) {
        console.error('Error abriendo turno:', err);
        res.status(500).json({ error: 'Error interno del servidor.' });
    }
});

app.post('/api/turnos/cerrar', requireAuth, requireAprobado, async (req, res) => {
    try {
        const { id_turno, monto_cierre_real, monto_cierre_calculado } = req.body;
        const real = parseFloat(monto_cierre_real) || 0;
        const calc = parseFloat(monto_cierre_calculado) || 0;
        // Verificar que el turno pertenece al local del usuario
        const turnoRes = await db.query('SELECT id_local FROM turnos_caja WHERE id_turno = $1', [id_turno]);
        if (turnoRes.rows.length === 0) return res.status(404).json({ error: 'Turno no encontrado.' });
        if (turnoRes.rows[0].id_local !== req.user.id_local) {
            return res.status(403).json({ error: 'No autorizado.' });
        }
        await db.query(
            `UPDATE turnos_caja SET estado_turno = 'Cerrado', fecha_cierre = CURRENT_TIMESTAMP, monto_cierre_real = $1, monto_cierre_calculado = $2 WHERE id_turno = $3`,
            [real, calc, id_turno]
        );
        res.json({ success: true });
    } catch (err) {
        console.error('Error cerrando turno:', err);
        res.status(500).json({ error: 'Error interno del servidor.' });
    }
});

app.get('/api/turnos/reporte', requireAuth, requireAprobado, async (req, res) => {
    try {
        const { id_turno } = req.query;
        // Verificar que el turno pertenece al local del usuario
        const turnoRes = await db.query('SELECT id_local FROM turnos_caja WHERE id_turno = $1', [id_turno]);
        if (turnoRes.rows.length === 0) return res.status(404).json({ error: 'Turno no encontrado.' });
        if (turnoRes.rows[0].id_local !== req.user.id_local) {
            return res.status(403).json({ error: 'No autorizado.' });
        }
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
        console.error('Error en reporte de turno:', err);
        res.status(500).json({ error: 'Error interno del servidor.' });
    }
});

// API: Productos (SaaS) (PROTEGIDOS)
app.get('/api/productos', requireAuth, requireAprobado, async (req, res) => {
    try {
        const { q, id_local } = req.query;
        if (Number(id_local) !== req.user.id_local) {
            return res.status(403).json({ error: 'No autorizado.' });
        }
        let query = `SELECT * FROM productos WHERE id_local = $1`;
        let params = [id_local];

        if (q) {
            query += ` AND (nombre_producto ILIKE $2 OR codigo_barras = $3)`;
            params.push(`%${q}%`, q);
        }
        const { rows } = await db.query(query, params);

        // v1.7.2: incluir galería de imágenes de cada producto
        if (rows.length > 0) {
            const ids = rows.map(p => p.id_producto);
            const imgRes = await db.query(
                `SELECT id_producto, url, orden FROM producto_imagenes WHERE id_producto = ANY($1) ORDER BY orden ASC`,
                [ids]
            );
            const porProducto = {};
            for (const img of imgRes.rows) {
                if (!porProducto[img.id_producto]) porProducto[img.id_producto] = [];
                porProducto[img.id_producto].push({ url: img.url, orden: img.orden });
            }
            for (const p of rows) {
                p.imagenes = porProducto[p.id_producto] || [];
            }
        }
        res.json(rows);
    } catch (err) {
        console.error('Error listando productos:', err);
        res.status(500).json({ error: 'Error interno del servidor.' });
    }
});

app.get('/api/productos/alertas', requireAuth, requireAprobado, async (req, res) => {
    try {
        const { id_local } = req.query;
        if (Number(id_local) !== req.user.id_local) {
            return res.status(403).json({ error: 'No autorizado.' });
        }
        const { rows } = await db.query(
            `SELECT id_producto, nombre_producto, stock_actual, stock_minimo, precio_venta, codigo_barras
             FROM productos
             WHERE stock_actual <= stock_minimo AND id_local = $1
             ORDER BY (stock_minimo - stock_actual) DESC`,
            [id_local]
        );
        res.json(rows);
    } catch (err) {
        console.error('Error en alertas:', err);
        res.status(500).json({ error: 'Error interno del servidor.' });
    }
});

// v1.5.5: Búsqueda global (productos + clientes + ventas) por término.
// Usado por el buscador del Header.
app.get('/api/buscar', requireAuth, requireAprobado, async (req, res) => {
    try {
        const { q, id_local } = req.query;
        if (!q || !q.trim()) {
            return res.json({ productos: [], clientes: [], ventas: [] });
        }
        const term = `%${q.trim()}%`;
        const localId = Number(id_local || req.user.id_local);

        // Productos: nombre o código de barras
        const prods = await db.query(
            `SELECT id_producto, nombre_producto, stock_actual, precio_venta, codigo_barras
             FROM productos
             WHERE id_local = $1 AND (nombre_producto ILIKE $2 OR codigo_barras ILIKE $2)
             ORDER BY nombre_producto
             LIMIT 10`,
            [localId, term]
        );

        // Clientes del local (los clientes son globales pero los filtramos por los más recientes del local)
        const clientes = await db.query(
            `SELECT id_cliente, nombre_razon_social, documento_identidad, correo
             FROM clientes
             WHERE nombre_razon_social ILIKE $1 OR documento_identidad ILIKE $1
             ORDER BY nombre_razon_social
             LIMIT 10`,
            [term]
        );

        // Ventas recientes (últimos 90 días) que coincidan
        const ventas = await db.query(
            `SELECT v.id_venta, v.fecha_venta AS fecha, v.total_neto, c.nombre_razon_social
             FROM ventas v
             LEFT JOIN clientes c ON v.id_cliente = c.id_cliente
             WHERE v.id_local = $1
               AND v.fecha_venta >= NOW() - INTERVAL '90 days'
               AND (
                 CAST(v.id_venta AS TEXT) LIKE $2
                 OR c.nombre_razon_social ILIKE $2
               )
             ORDER BY v.fecha_venta DESC
             LIMIT 10`,
            [localId, term]
        );

        res.json({
            productos: prods.rows,
            clientes: clientes.rows,
            ventas: ventas.rows,
        });
    } catch (err) {
        console.error('Error en /api/buscar:', err);
        res.status(500).json({ error: 'Error interno del servidor.' });
    }
});

app.put('/api/productos/:id', requireAuth, requireAprobado, requireAdmin, async (req, res) => {
    try {
        // Verificar que el producto pertenece al local del usuario
        const prodRes = await db.query('SELECT id_local FROM productos WHERE id_producto = $1', [req.params.id]);
        if (prodRes.rows.length === 0) return res.status(404).json({ error: 'Producto no encontrado.' });
        if (prodRes.rows[0].id_local !== req.user.id_local) {
            return res.status(403).json({ error: 'No autorizado.' });
        }
        const { nombre_producto, precio_compra, precio_venta, stock_actual, stock_minimo, imagen_url } = req.body;
        await db.query(
            `UPDATE productos SET nombre_producto=$1, precio_compra=$2, precio_venta=$3, stock_actual=$4, stock_minimo=$5, imagen_url=$6 WHERE id_producto=$7`,
            [nombre_producto, precio_compra, precio_venta, stock_actual, stock_minimo, imagen_url, req.params.id]
        );
        res.json({ success: true });
    } catch (err) {
        console.error('Error actualizando producto:', err);
        res.status(500).json({ error: 'Error interno del servidor.' });
    }
});

app.post('/api/productos', requireAuth, requireAprobado, requireAdmin, async (req, res) => {
    try {
        const { id_local, codigo_barras, nombre_producto, imagen_url, precio_compra, precio_venta, stock_actual, stock_minimo } = req.body;
        if (Number(id_local) !== req.user.id_local) {
            return res.status(403).json({ error: 'No autorizado.' });
        }
        const { rows } = await db.query(
            `INSERT INTO productos (id_local, codigo_barras, nombre_producto, imagen_url, precio_compra, precio_venta, stock_actual, stock_minimo)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id_producto`,
            [id_local, codigo_barras, nombre_producto, imagen_url, precio_compra, precio_venta, stock_actual, stock_minimo]
        );
        res.json({ success: true, id_producto: rows[0].id_producto });
    } catch (err) {
        console.error('Error creando producto:', err);
        res.status(500).json({ error: 'Error interno del servidor.' });
    }
});

app.delete('/api/productos/:id', requireAuth, requireAprobado, requireAdmin, async (req, res) => {
    try {
        const prodRes = await db.query('SELECT id_local FROM productos WHERE id_producto = $1', [req.params.id]);
        if (prodRes.rows.length === 0) return res.status(404).json({ error: 'Producto no encontrado.' });
        if (prodRes.rows[0].id_local !== req.user.id_local) {
            return res.status(403).json({ error: 'No autorizado.' });
        }
        await db.query(`DELETE FROM productos WHERE id_producto = $1`, [req.params.id]);
        res.json({ success: true });
    } catch (err) {
        console.error('Error eliminando producto:', err);
        res.status(500).json({ error: 'Error interno del servidor.' });
    }
});

// API: Clientes (PROTEGIDOS)
app.get('/api/clientes/buscar', requireAuth, requireAprobado, async (req, res) => {
    try {
        const { documento } = req.query;
        const { rows } = await db.query(`SELECT * FROM clientes WHERE documento_identidad = $1`, [documento]);
        res.json(rows[0] || null);
    } catch (err) {
        console.error('Error buscando cliente:', err);
        res.status(500).json({ error: 'Error interno del servidor.' });
    }
});

app.get('/api/clientes/total', requireAuth, requireAprobado, async (req, res) => {
    try {
        const { rows } = await db.query(`SELECT COUNT(*)::int AS total FROM clientes`);
        res.json({ total: rows[0].total });
    } catch (err) {
        console.error('Error en total clientes:', err);
        res.status(500).json({ error: 'Error interno del servidor.' });
    }
});

// Listar todos los clientes (con búsqueda opcional por nombre o documento)
app.get('/api/clientes', requireAuth, requireAprobado, async (req, res) => {
    try {
        const { q } = req.query;
        let query = `SELECT * FROM clientes`;
        let params = [];
        if (q && q.trim()) {
            query += ` WHERE nombre_razon_social ILIKE $1 OR documento_identidad ILIKE $1`;
            params.push(`%${q.trim()}%`);
        }
        query += ` ORDER BY nombre_razon_social ASC LIMIT 200`;
        const { rows } = await db.query(query, params);
        res.json(rows);
    } catch (err) {
        console.error('Error listando clientes:', err);
        res.status(500).json({ error: 'Error interno del servidor.' });
    }
});

// Actividad reciente: últimas ventas + creación de clientes, del local
app.get('/api/actividad-reciente', requireAuth, requireAprobado, async (req, res) => {
    try {
        const { id_local, limite = 10 } = req.query;
        if (Number(id_local) !== req.user.id_local) {
            return res.status(403).json({ error: 'No autorizado.' });
        }
        if (!id_local) {
            return res.status(400).json({ error: 'id_local es requerido' });
        }

        const ventas = await db.query(`
            SELECT
                'venta' AS tipo,
                v.id_venta AS id,
                v.fecha_venta AS fecha,
                v.total_neto AS monto,
                v.metodo_pago,
                v.estado_factura,
                u.nombre AS cajero,
                c.nombre_razon_social AS cliente,
                c.documento_identidad AS cliente_doc
            FROM ventas v
            LEFT JOIN usuarios u ON v.id_usuario = u.id_usuario
            LEFT JOIN clientes c ON v.id_cliente = c.id_cliente
            WHERE v.id_local = $1
            ORDER BY v.fecha_venta DESC
            LIMIT $2
        `, [id_local, parseInt(limite)]);

        const feed = ventas.rows.map(v => ({
            tipo: 'venta',
            id: v.id,
            fecha: v.fecha,
            titulo: 'Nueva venta realizada',
            subtitulo: `Venta #${v.id.toString().padStart(6, '0')}${v.cliente ? ' · ' + v.cliente : ''}`,
            monto: v.monto,
            cliente: v.cliente,
            cliente_doc: v.cliente_doc
        }));

        res.json(feed);
    } catch (err) {
        console.error('Error en actividad reciente:', err);
        res.status(500).json({ error: 'Error interno del servidor.' });
    }
});

// Ventas agrupadas por día, últimos N días
app.get('/api/ventas/por-dia', requireAuth, requireAprobado, async (req, res) => {
    try {
        const { id_local, dias = 7 } = req.query;
        if (Number(id_local) !== req.user.id_local) {
            return res.status(403).json({ error: 'No autorizado.' });
        }
        if (!id_local) {
            return res.status(400).json({ error: 'id_local es requerido' });
        }

        const n = Math.min(parseInt(dias) || 7, 30);

        const { rows } = await db.query(`
            WITH serie AS (
                SELECT generate_series(
                    (NOW() AT TIME ZONE 'America/Bogota')::date - ($2::int - 1),
                    (NOW() AT TIME ZONE 'America/Bogota')::date,
                    '1 day'::interval
                )::date AS dia
            ),
            ventas_por_dia AS (
                SELECT
                    fecha_venta::date AS dia,
                    COALESCE(SUM(total_neto), 0)::numeric AS total,
                    COUNT(*)::int AS transacciones
                FROM ventas
                WHERE id_local = $1
                  AND fecha_venta::date >= (NOW() AT TIME ZONE 'America/Bogota')::date - ($2::int - 1)
                GROUP BY fecha_venta::date
            )
            SELECT
                to_char(serie.dia, 'YYYY-MM-DD') AS fecha,
                to_char(serie.dia, 'DD Mon') AS label,
                COALESCE(vpd.total, 0) AS total,
                COALESCE(vpd.transacciones, 0) AS transacciones
            FROM serie
            LEFT JOIN ventas_por_dia vpd ON vpd.dia = serie.dia
            ORDER BY serie.dia ASC
        `, [id_local, n]);

        res.json(rows);
    } catch (err) {
        console.error('Error en ventas por día:', err);
        res.status(500).json({ error: 'Error interno del servidor.' });
    }
});

app.post('/api/clientes/crear', requireAuth, requireAprobado, async (req, res) => {
    try {
        const { documento_identidad, nombre_razon_social, telefono, correo } = req.body;
        if (!documento_identidad || !nombre_razon_social) {
            return res.status(400).json({ error: 'documento_identidad y nombre_razon_social son requeridos.' });
        }
        const { rows } = await db.query(
            `INSERT INTO clientes (documento_identidad, nombre_razon_social, telefono, correo) VALUES ($1, $2, $3, $4) RETURNING id_cliente`,
            [documento_identidad, nombre_razon_social, telefono || null, correo || null]
        );
        res.json({ success: true, id_cliente: rows[0].id_cliente });
    } catch (err) {
        console.error('Error creando cliente:', err);
        res.status(500).json({ error: 'Error interno del servidor.' });
    }
});

// API: Resumen de Ventas del Turno Activo (Dashboard)
app.get('/api/ventas/resumen-dia', requireAuth, requireAprobado, async (req, res) => {
    try {
        const { id_local } = req.query;
        if (Number(id_local) !== req.user.id_local) {
            return res.status(403).json({ error: 'No autorizado.' });
        }
        const zeroStats = {
            total_transacciones: 0,
            total_ventas: 0,
            total_descuentos: 0,
            ventas_efectivo: 0,
            ventas_tarjeta: 0,
            ventas_transferencia: 0
        };

        const turnoRes = await db.query(
            `SELECT id_turno FROM turnos_caja
             WHERE id_local = $1 AND estado_turno = 'Abierto'
             ORDER BY id_turno DESC LIMIT 1`,
            [id_local]
        );

        if (turnoRes.rows.length === 0) {
            return res.json(zeroStats);
        }

        const idTurno = turnoRes.rows[0].id_turno;

        const { rows } = await db.query(`
            SELECT
                COUNT(v.id_venta) AS total_transacciones,
                COALESCE(SUM(v.total_neto), 0) AS total_ventas,
                COALESCE(SUM(v.descuento_total), 0) AS total_descuentos,
                COALESCE(SUM(CASE WHEN v.metodo_pago = 'Efectivo' THEN v.total_neto ELSE 0 END), 0) AS ventas_efectivo,
                COALESCE(SUM(CASE WHEN v.metodo_pago = 'Tarjeta' THEN v.total_neto ELSE 0 END), 0) AS ventas_tarjeta,
                COALESCE(SUM(CASE WHEN v.metodo_pago = 'Transferencia' THEN v.total_neto ELSE 0 END), 0) AS ventas_transferencia
            FROM ventas v
            WHERE v.id_turno = $1
        `, [idTurno]);

        res.json(rows[0] || zeroStats);
    } catch (err) {
        console.error('Error en resumen del día:', err);
        res.status(500).json({ error: 'Error interno del servidor.' });
    }
});

// API: Historial de Ventas
app.get('/api/ventas/historial', requireAuth, requireAprobado, async (req, res) => {
    try {
        const { id_local } = req.query;
        if (Number(id_local) !== req.user.id_local) {
            return res.status(403).json({ error: 'No autorizado.' });
        }
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
        console.error('Error en historial de ventas:', err);
        res.status(500).json({ error: 'Error interno del servidor.' });
    }
});

// API: Envio de Factura por Correo (PROTEGIDO + C3-fix)
app.post('/api/facturas/enviar-correo', requireAuth, requireAprobado, async (req, res) => {
    try {
        const { correo_cliente, nombre_cliente, id_venta, detalles, metodo_pago, id_local } = req.body;

        if (!id_venta || !Number.isFinite(Number(id_venta))) {
            return res.status(400).json({ error: 'id_venta inválido.' });
        }
        if (!correo_cliente || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(correo_cliente)) {
            return res.status(400).json({ error: 'correo_cliente inválido.' });
        }
        if (!Array.isArray(detalles) || detalles.length === 0) {
            return res.status(400).json({ error: 'detalles requeridos.' });
        }

        if (!transporter) {
            return res.status(503).json({ error: 'Servidor de correo no configurado. Revisa .env.' });
        }

        // Verificar que la venta existe Y pertenece al local del usuario autenticado
        const ventaRes = await db.query(
            `SELECT v.id_venta, v.total_neto, v.metodo_pago, v.id_local, l.nombre_local
             FROM ventas v
             LEFT JOIN locales l ON v.id_local = l.id_local
             WHERE v.id_venta = $1`,
            [id_venta]
        );
        if (ventaRes.rows.length === 0) {
            return res.status(404).json({ error: 'Venta no encontrada.' });
        }
        const venta = ventaRes.rows[0];

        // A2-fix: el id_local del usuario autenticado DEBE coincidir con el de la venta
        if (venta.id_local !== req.user.id_local) {
            return res.status(403).json({ error: 'No autorizado para esta venta.' });
        }

        const total_neto = Number(venta.total_neto);
        const nombre_local = venta.nombre_local || 'Sistema Integral de Ventas';
        const metodoPagoReal = venta.metodo_pago || metodo_pago || 'Efectivo';

        const detallesHtml = detalles.map(d => `
            <tr>
                <td style="padding:8px;border-bottom:1px solid #eee;">${escapeHtml(d.nombre_producto)}</td>
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
                  <strong style="font-size:1.1rem;color:#264653;">${escapeHtml(nombre_local)}</strong><br/>
                  <span style="color:#777;font-size:0.9rem;">NIT: 900.123.456-7</span>
                </div>
                <div style="text-align:right;">
                  <strong style="color:#2A9D8F;font-size:1.1rem;">No. FE-${id_venta.toString().padStart(6,'0')}</strong><br/>
                  <span style="color:#777;font-size:0.9rem;">${new Date().toLocaleDateString('es-CO', { timeZone: 'America/Bogota' })}</span>
                </div>
              </div>
              <div style="background:#f9f9f9;border-radius:8px;padding:1rem;margin-bottom:1.5rem;">
                <strong>Adquiriente:</strong> ${escapeHtml(nombre_cliente)}<br/>
                <strong>Medio de Pago:</strong> ${escapeHtml(metodoPagoReal)}
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
            from: `"${escapeHtml(nombre_local)} - Sistema POS" <${process.env.EMAIL_USER || 'andrescuesta112@gmail.com'}>`,
            to: correo_cliente,
            subject: `Factura Electrónica No. FE-${id_venta.toString().padStart(6,'0')} - ${escapeHtml(nombre_local)}`,
            html: htmlBody,
        });

        console.log(`\n📧 Factura enviada REALMENTE a ${correo_cliente}\n`);

        res.json({ success: true, mensaje: 'Factura enviada exitosamente.' });
    } catch (err) {
        console.error('Error enviando correo:', err);
        res.status(500).json({ error: 'No se pudo enviar el correo.' });
    }
});

// =======================================================
// FACTURACIÓN ELECTRÓNICA DIAN (v1.9.1)
// =======================================================
(async () => {
    try {
        await db.query(`
            CREATE TABLE IF NOT EXISTS configuracion_dian (
                id_local INTEGER PRIMARY KEY REFERENCES locales(id_local) ON DELETE CASCADE,
                nit VARCHAR(20),
                razon_social VARCHAR(200),
                direccion VARCHAR(200),
                ciudad VARCHAR(100),
                departamento VARCHAR(100),
                telefono VARCHAR(50),
                correo VARCHAR(150),
                resolucion_numero VARCHAR(30),
                resolucion_fecha DATE,
                resolucion_desde VARCHAR(20),
                resolucion_hasta VARCHAR(20),
                prefijo VARCHAR(10) DEFAULT 'FE',
                consecutivo INTEGER DEFAULT 1,
                certificado_path TEXT,
                certificado_password TEXT,
                habilitado BOOLEAN DEFAULT false,
                updated_at TIMESTAMP DEFAULT NOW()
            )
        `);
    } catch (e) {
        console.error('Error creando tabla configuracion_dian:', e.message);
    }
})();

// GET /api/dian/configuracion — configuración del facturador
app.get('/api/dian/configuracion', requireAuth, requireAprobado, async (req, res) => {
    try {
        const idLocal = Number(req.user.id_local);
        const { rows } = await db.query('SELECT * FROM configuracion_dian WHERE id_local = $1', [idLocal]);
        const cfg = rows[0] || {};
        // No exponer la contraseña del certificado
        if (cfg.certificado_password) cfg.certificado_password = '';
        res.json(cfg);
    } catch (err) {
        console.error('Error leyendo configuración DIAN:', err);
        res.status(500).json({ error: 'Error interno del servidor.' });
    }
});

// PUT /api/dian/configuracion — guardar configuración del facturador
app.put('/api/dian/configuracion', requireAuth, requireAprobado, requireAdmin, async (req, res) => {
    try {
        const idLocal = Number(req.user.id_local);
        const { nit, razon_social, direccion, ciudad, departamento, telefono, correo,
                resolucion_numero, resolucion_fecha, resolucion_desde, resolucion_hasta,
                prefijo, certificado_password, habilitado } = req.body;
        await db.query(`
            INSERT INTO configuracion_dian (id_local, nit, razon_social, direccion, ciudad, departamento,
                telefono, correo, resolucion_numero, resolucion_fecha, resolucion_desde, resolucion_hasta,
                prefijo, certificado_password, habilitado, updated_at)
            VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::date,$11,$12,$13,$14,$15,NOW())
            ON CONFLICT (id_local) DO UPDATE SET
                nit=COALESCE($2, configuracion_dian.nit),
                razon_social=COALESCE($3, configuracion_dian.razon_social),
                direccion=COALESCE($4, configuracion_dian.direccion),
                ciudad=COALESCE($5, configuracion_dian.ciudad),
                departamento=COALESCE($6, configuracion_dian.departamento),
                telefono=COALESCE($7, configuracion_dian.telefono),
                correo=COALESCE($8, configuracion_dian.correo),
                resolucion_numero=COALESCE($9, configuracion_dian.resolucion_numero),
                resolucion_fecha=COALESCE($10::date, configuracion_dian.resolucion_fecha),
                resolucion_desde=COALESCE($11, configuracion_dian.resolucion_desde),
                resolucion_hasta=COALESCE($12, configuracion_dian.resolucion_hasta),
                prefijo=COALESCE($13, configuracion_dian.prefijo),
                certificado_password=COALESCE($14, configuracion_dian.certificado_password),
                habilitado=COALESCE($15, configuracion_dian.habilitado),
                updated_at=NOW()
        `, [idLocal, nit?.trim() || null, razon_social?.trim() || null, direccion?.trim() || null,
             ciudad?.trim() || null, departamento?.trim() || null, telefono?.trim() || null,
             correo?.trim() || null, resolucion_numero?.trim() || null, resolucion_fecha || null,
             resolucion_desde?.trim() || null, resolucion_hasta?.trim() || null,
             prefijo?.trim() || null, dian.cifrarPassword(certificado_password, idLocal), habilitado === undefined ? null : !!habilitado]);
        res.json({ success: true });
    } catch (err) {
        console.error('Error guardando configuración DIAN:', err);
        res.status(500).json({ error: 'Error interno del servidor.' });
    }
});

// POST /api/dian/certificado — subir certificado digital .p12
app.post('/api/dian/certificado', requireAuth, requireAprobado, requireAdmin, multer({
    storage: multer.diskStorage({
        destination: (req, file, cb) => {
            const dir = path.join(__dirname, 'certificados');
            fs.mkdirSync(dir, { recursive: true });
            cb(null, dir);
        },
        filename: (req, file, cb) => cb(null, `local_${req.user.id_local}.p12`)
    }),
    // Solo se aceptan certificados .p12 (evita subir archivos arbitrarios)
    fileFilter: (req, file, cb) => {
        const ok = /\.p12$/i.test(file.originalname);
        cb(ok ? null : new Error('Solo se permiten archivos .p12'), ok);
    },
    limits: { fileSize: 5 * 1024 * 1024 }
}).single('certificado'), async (req, res) => {
    try {
        if (!req.file) return res.status(400).json({ error: 'Se requiere el archivo del certificado.' });
        const idLocal = Number(req.user.id_local);
        await db.query(
            `UPDATE configuracion_dian SET certificado_path = $1, updated_at = NOW() WHERE id_local = $2`,
            [req.file.path, idLocal]
        );
        res.json({ success: true, mensaje: 'Certificado subido correctamente.' });
    } catch (err) {
        console.error('Error subiendo certificado:', err);
        res.status(500).json({ error: 'Error interno del servidor.' });
    }
});

// POST /api/dian/emitir/:idVenta — generar XML, firmar y marcar como enviada
app.post('/api/dian/emitir/:idVenta', requireAuth, requireAprobado, requireAdmin, async (req, res) => {
    try {
        const idLocal = Number(req.user.id_local);
        const idVenta = Number(req.params.idVenta);

        const cfgR = await db.query('SELECT * FROM configuracion_dian WHERE id_local = $1', [idLocal]);
        const cfg = cfgR.rows[0];
        if (!cfg || !cfg.habilitado) {
            return res.status(400).json({ error: 'Primero configura y habilita la facturación electrónica en Configuración > Facturación DIAN.' });
        }
        if (!cfg.certificado_path || !fs.existsSync(cfg.certificado_path)) {
            return res.status(400).json({ error: 'No hay certificado digital subido. Sube tu certificado .p12.' });
        }

        const ventaR = await db.query(
            `SELECT v.*, c.nombre_razon_social, c.documento_identidad, c.correo AS cliente_correo
             FROM ventas v LEFT JOIN clientes c ON v.id_cliente = c.id_cliente
             WHERE v.id_venta = $1 AND v.id_local = $2`,
            [idVenta, idLocal]
        );
        if (ventaR.rows.length === 0) return res.status(404).json({ error: 'Venta no encontrada.' });
        const venta = ventaR.rows[0];

        const itemsR = await db.query(
            `SELECT dv.*, p.nombre_producto, p.codigo_barras AS codigo_producto
             FROM detalle_ventas dv LEFT JOIN productos p ON dv.id_producto = p.id_producto
             WHERE dv.id_venta = $1`,
            [idVenta]
        );

        // Consecutivo de la resolución
        const consecutivo = `${cfg.prefijo || 'FE'}-${String(cfg.consecutivo || 1).padStart(6, '0')}`;
        await db.query('UPDATE configuracion_dian SET consecutivo = consecutivo + 1 WHERE id_local = $1', [idLocal]);

        // CUFE (Código Único de Facturación Electrónica) — hash SHA-384
        const cufeData = `${cfg.nit}|${venta.fecha_venta.toISOString().slice(0,10)}|${consecutivo}|${venta.total_neto}|${venta.impuestos}|${venta.subtotal}`;
        const cufe = crypto.createHash('sha384').update(cufeData).digest('hex').toUpperCase();

        const xml = dian.generarXMLFactura({
            config: cfg,
            venta: { ...venta, cufe },
            cliente: { nombre_razon_social: venta.nombre_razon_social, documento_identidad: venta.documento_identidad },
            items: itemsR.rows,
            consecutivo
        });

        // Firmar con el certificado
        let xmlFirmado;
        try {
            xmlFirmado = dian.firmarXML(xml, cfg.certificado_path, dian.descifrarPassword(cfg.certificado_password, idLocal));
        } catch (e) {
            return res.status(400).json({ error: 'No se pudo firmar el XML: ' + e.message });
        }

        // Guardar el XML firmado
        const dir = path.join(__dirname, 'facturas_xml');
        fs.mkdirSync(dir, { recursive: true });
        const archivoXml = path.join(dir, `FE-${idVenta}.xml`);
        fs.writeFileSync(archivoXml, xmlFirmado);

        // Actualizar estado de la venta
        await db.query(
            `UPDATE ventas SET estado_factura = 'DIAN_Enviado', cufe = $1 WHERE id_venta = $2`,
            [cufe, idVenta]
        );

        res.json({
            success: true,
            mensaje: 'Factura electrónica generada y firmada. XML guardado.',
            consecutivo,
            cufe,
            xml_path: archivoXml
        });
    } catch (err) {
        console.error('Error emitiendo factura electrónica:', err);
        res.status(500).json({ error: 'Error interno del servidor.' });
    }
});

// API: Ventas (PROTEGIDO + C1-fix)
app.post('/api/ventas/procesar', requireAuth, requireAprobado, async (req, res) => {
    const client = await db.connect();
    try {
        // A2-fix: id_local e id_usuario SIEMPRE del token, no del body
        // JWT los serializa como string — convertimos a Number para evitar errores de tipo
        const id_local = Number(req.user.id_local);
        const id_usuario = Number(req.user.id_usuario);
        const { id_cliente, id_turno, metodo_pago, estado_factura, detalles } = req.body;

        const ESTADOS_FACTURA = ['Local', 'DIAN_Enviado', 'DIAN_Error'];
        const METODOS_PAGO = ['Efectivo', 'Tarjeta', 'Transferencia', 'Credito_Tienda'];

        const estadoFacturaFinal = ESTADOS_FACTURA.includes(estado_factura) ? estado_factura : 'Local';
        const metodoPagoFinal = METODOS_PAGO.includes(metodo_pago) ? metodo_pago : 'Efectivo';

        if (!Array.isArray(detalles) || detalles.length === 0) {
            return res.status(400).json({ error: 'La venta debe tener al menos un producto.' });
        }
        for (const det of detalles) {
            if (!det.id_producto || !Number.isFinite(Number(det.cantidad)) || Number(det.cantidad) <= 0) {
                return res.status(400).json({ error: 'Cada producto debe tener id_producto y cantidad > 0.' });
            }
        }

        // Si se envió id_turno, validar que pertenece al local
        if (id_turno) {
            const turnoRes = await client.query('SELECT id_local FROM turnos_caja WHERE id_turno = $1', [id_turno]);
            if (turnoRes.rows.length === 0 || turnoRes.rows[0].id_local !== id_local) {
                return res.status(403).json({ error: 'Turno inválido.' });
            }
        }

        await client.query('BEGIN');

        let subtotalRecalculado = 0;
        const lineasRecalculadas = [];

        for (const det of detalles) {
            const prodRes = await client.query(
                `SELECT id_producto, id_local, precio_venta, stock_actual, nombre_producto
                 FROM productos
                 WHERE id_producto = $1
                 FOR UPDATE`,
                [det.id_producto]
            );

            if (prodRes.rows.length === 0) {
                throw new AppError(`Producto ${det.id_producto} no existe.`);
            }
            const prod = prodRes.rows[0];

            if (prod.id_local !== id_local) {
                throw new AppError(`Producto ${det.id_producto} no pertenece al local.`);
            }

            const cantidad = Math.floor(Number(det.cantidad));
            if (cantidad <= 0 || cantidad > 10000) {
                throw new AppError(`Cantidad inválida para producto ${det.id_producto}.`);
            }

            if (prod.stock_actual < cantidad) {
                throw new AppError(`Stock insuficiente para "${prod.nombre_producto}" (disponible: ${prod.stock_actual}, solicitado: ${cantidad}).`);
            }

            const precioUnitario = Number(prod.precio_venta);
            const subtotalLinea = Math.round(precioUnitario * cantidad * 100) / 100;
            subtotalRecalculado += subtotalLinea;
            lineasRecalculadas.push({
                id_producto: det.id_producto,
                cantidad,
                precio_unitario: precioUnitario,
                subtotal: subtotalLinea,
            });
        }

        // Descuento global: solo aceptamos el del body como MONTO MÁXIMO en pesos.
        // Si es negativo, NaN, o mayor al subtotal, lo clampeamos a [0, subtotal].
        let descuentoAplicado = Number(req.body.descuento_total);
        if (!Number.isFinite(descuentoAplicado) || descuentoAplicado < 0) descuentoAplicado = 0;
        if (descuentoAplicado > subtotalRecalculado) descuentoAplicado = subtotalRecalculado;
        descuentoAplicado = Math.round(descuentoAplicado * 100) / 100;

        // Impuestos: 19% sobre (subtotal - descuento) si el producto aplica IVA.
        // Por simplicidad y consistencia con el seed (todos los productos aplican IVA),
        // calculamos 19% sobre el total. Si en el futuro hay productos exentos, esto
        // debe revisarse para calcular por línea según `aplica_iva`.
        const baseImpuestos = subtotalRecalculado - descuentoAplicado;
        const impuestos = Math.round(baseImpuestos * 0.19 * 100) / 100;
        const totalNeto = Math.round((baseImpuestos + impuestos) * 100) / 100;

        // Insertar venta
        const resVenta = await client.query(
            `INSERT INTO ventas (id_usuario, id_local, id_cliente, id_turno, subtotal, descuento_total, impuestos, total_neto, metodo_pago, estado_factura, fecha_venta)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, (NOW() AT TIME ZONE 'America/Bogota'))
             RETURNING id_venta`,
            [id_usuario, id_local, id_cliente, id_turno, subtotalRecalculado, descuentoAplicado, impuestos, totalNeto, metodoPagoFinal, estadoFacturaFinal]
        );
        const ventaId = resVenta.rows[0].id_venta;

        // Insertar detalles y descontar stock
        for (const linea of lineasRecalculadas) {
            await client.query(
                `INSERT INTO detalle_ventas (id_venta, id_producto, cantidad, precio_unitario_cobrado, descuento_aplicado, subtotal)
                 VALUES ($1, $2, $3, $4, $5, $6)`,
                [ventaId, linea.id_producto, linea.cantidad, linea.precio_unitario, 0, linea.subtotal]
            );
            await client.query(
                `UPDATE productos SET stock_actual = stock_actual - $1 WHERE id_producto = $2`,
                [linea.cantidad, linea.id_producto]
            );
        }

        if (id_cliente && id_cliente !== 1) { // 1 es Consumidor final
            const puntos = Math.floor(totalNeto / 10000);
            await client.query(`UPDATE clientes SET puntos_acumulados = puntos_acumulados + $1 WHERE id_cliente = $2`, [puntos, id_cliente]);
        }

        await client.query('COMMIT');
        res.json({
            success: true,
            id_venta: ventaId,
            // Devolvemos los totales recalculados para que el frontend muestre el real
            totales_recalculados: {
                subtotal: subtotalRecalculado,
                descuento: descuentoAplicado,
                impuestos,
                total: totalNeto,
            }
        });
    } catch (err) {
        await client.query('ROLLBACK');
        // v1.5.6: solo los errores de negocio (AppError) muestran su mensaje.
        // Los errores internos (BD, etc.) quedan en logs y devuelven mensaje genérico.
        if (err.isOperational) {
            return res.status(err.status).json({ error: err.message });
        }
        console.error('Error procesando venta:', err);
        res.status(500).json({ error: 'Error interno del servidor.' });
    } finally {
        client.release();
    }
});

// === v1.5.4: Versión del frontend (leída del package.json del frontend) ===
// Cacheada al arrancar para no leer el archivo en cada request.
let APP_VERSION = 'desconocida';
try {
    const path = require('path');
    const fs = require('fs');
    // Orden de búsqueda:
    // 1. frontend-version.json — archivo sincronizado por prebuild (más confiable)
    // 2. ../frontend/package.json — desarrollo
    // 3. Otras rutas empaquetadas
    const candidates = [
        path.join(__dirname, 'frontend-version.json'),                          // sincronizado por prebuild
        path.join(__dirname, '..', 'frontend', 'package.json'),                 // dev
        path.join(__dirname, '..', '..', 'frontend', 'package.json'),            // packaged (asarUnpack)
        path.join(__dirname, 'frontend', 'package.json'),                       // packaged alternativo
        path.join(process.resourcesPath || '', 'app', 'frontend', 'package.json'), // Electron prod
    ];
    for (const p of candidates) {
        try {
            if (fs.existsSync(p)) {
                // frontend-version.json tiene {version, ...}; package.json también
                const data = JSON.parse(fs.readFileSync(p, 'utf8'));
                if (data.version) {
                    APP_VERSION = data.version;
                    console.log(`[v1.5.4] Versión del frontend detectada: ${APP_VERSION} (${p})`);
                    break;
                }
            }
        } catch (err) {
            console.warn(`[v1.5.4] No se pudo leer ${p}: ${err.message}`);
        }
    }
} catch (err) {
    console.warn('[v1.5.4] No se pudo leer la versión del frontend:', err.message);
}

// Health check (sin auth) — útil para que la app verifique que el backend está vivo
app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString(), version: APP_VERSION });
});

// =====================================================
// SUPER-ADMIN (Plataforma global, separado de locales)
// =====================================================
// El super-admin ve TODOS los locales y TODOS los usuarios.
// NO tiene id_local. Es independiente.

// Middleware: requiere ser super-admin autenticado
function requireSuperAdmin(req, res, next) {
    const authHeader = req.headers.authorization || '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
    if (!token) return res.status(401).json({ error: 'Sesión requerida.' });
    try {
        const payload = jwt.verify(token, JWT_SECRET);
        if (payload.tipo !== 'super_admin') {
            return res.status(403).json({ error: 'Acceso solo para super-administradores.' });
        }
        req.superAdmin = payload;
        next();
    } catch {
        return res.status(401).json({ error: 'Sesión inválida o expirada.' });
    }
}

// Login de super-admin (separado del login de locales)
app.post('/api/super/login', loginLimiter, async (req, res) => {
    try {
        const correo = (req.body.correo || '').toString().trim();
        const contrasena = (req.body.contrasena || '').toString();
        if (!correo || !contrasena) {
            return res.status(400).json({ error: 'Correo y contraseña son requeridos.' });
        }

        const r = await db.query('SELECT * FROM super_admins WHERE correo = $1', [correo.toLowerCase().trim()]);
        const row = r.rows[0];

        if (!row) {
            await bcrypt.compare(contrasena, BCRYPT_DUMMY_HASH);
            return res.status(401).json({ error: 'Credenciales inválidas.' });
        }
        if (!row.estado) {
            return res.status(403).json({ error: 'Tu cuenta de super-admin está desactivada.' });
        }

        const ok = await bcrypt.compare(contrasena, row.contrasena_hash);
        if (!ok) return res.status(401).json({ error: 'Credenciales inválidas.' });

        // Actualizar last_login
        await db.query('UPDATE super_admins SET last_login = NOW() WHERE id_super = $1', [row.id_super]);

        const token = signToken({
            id_super: row.id_super,
            nombre: row.nombre,
            correo: row.correo,
            tipo: 'super_admin',
        });

        res.json({
            token,
            user: {
                id_super: row.id_super,
                nombre: row.nombre,
                correo: row.correo,
                tipo: 'super_admin',
            },
        });
    } catch (err) {
        console.error('Error en super login:', err);
        res.status(500).json({ error: 'Error interno del servidor.' });
    }
});

// Ver TODAS las solicitudes de registro pendientes (global, todos los locales)
app.get('/api/super/solicitudes', requireSuperAdmin, async (req, res) => {
    try {
        const r = await db.query(`
            SELECT
                u.id_usuario, u.nombre, u.correo, u.documento_identidad, u.telefono,
                u.aprobado_por_admin, u.fecha_aprobacion, u.created_at as fecha_registro,
                l.id_local, l.nombre_local, l.nit, l.ciudad,
                (SELECT COUNT(*) FROM usuarios u2 WHERE u2.id_local = l.id_local) as total_usuarios_local
            FROM usuarios u
            JOIN locales l ON u.id_local = l.id_local
            WHERE u.aprobado_por_admin = false
              AND u.rol = 'Administrador'
              AND u.estado = true
            ORDER BY u.created_at DESC
        `);
        res.json(r.rows);
    } catch (err) {
        console.error('Error en /super/solicitudes:', err);
        res.status(500).json({ error: 'Error interno del servidor.' });
    }
});

// Ver TODOS los locales
app.get('/api/super/locales', requireSuperAdmin, async (req, res) => {
    try {
        const r = await db.query(`
            SELECT
                l.id_local, l.nombre_local, l.direccion, l.nit, l.telefono, l.ciudad, l.email,
                l.created_at,
                (SELECT COUNT(*) FROM usuarios u WHERE u.id_local = l.id_local) as total_usuarios,
                (SELECT COUNT(*) FROM usuarios u WHERE u.id_local = l.id_local AND u.aprobado_por_admin = false) as pendientes_aprobacion
            FROM locales l
            ORDER BY l.id_local ASC
        `);
        res.json(r.rows);
    } catch (err) {
        console.error('Error en /super/locales:', err);
        res.status(500).json({ error: 'Error interno del servidor.' });
    }
});

// Aprobar una solicitud de registro
app.post('/api/super/aprobar-solicitud/:idUsuario', requireSuperAdmin, async (req, res) => {
    try {
        const idUsuario = Number(req.params.idUsuario);
        const r = await db.query(
            'SELECT u.id_usuario, u.nombre, u.correo, u.aprobado_por_admin FROM usuarios u WHERE u.id_usuario = $1',
            [idUsuario]
        );
        if (r.rows.length === 0) return res.status(404).json({ error: 'Solicitud no encontrada.' });
        if (r.rows[0].aprobado_por_admin) {
            return res.status(400).json({ error: 'Esta solicitud ya fue aprobada.' });
        }

        await db.query(
            `UPDATE usuarios
             SET aprobado_por_admin = true, fecha_aprobacion = NOW(), aprobado_por = $1
             WHERE id_usuario = $2`,
            [req.superAdmin.id_super, idUsuario]
        );

        // Logueamos la acción
        await db.query(
            `INSERT INTO email_logs (tipo, destinatario, asunto, exito, error_mensaje, created_at)
             VALUES ($1, $2, $3, $4, $5, NOW())`,
            ['super_admin_aprobacion', r.rows[0].correo, 'Registro aprobado por super-admin', true, null]
        ).catch(() => {});

        res.json({ success: true, message: `✅ ${r.rows[0].nombre} aprobado. Ya puede usar el sistema.` });
    } catch (err) {
        console.error('Error aprobando solicitud:', err);
        res.status(500).json({ error: 'Error interno del servidor.' });
    }
});

// Rechazar una solicitud de registro
app.post('/api/super/rechazar-solicitud/:idUsuario', requireSuperAdmin, async (req, res) => {
    try {
        const idUsuario = Number(req.params.idUsuario);
        const { motivo } = req.body;
        const r = await db.query(
            'SELECT u.id_usuario, u.nombre, u.correo, u.aprobado_por_admin FROM usuarios u WHERE u.id_usuario = $1',
            [idUsuario]
        );
        if (r.rows.length === 0) return res.status(404).json({ error: 'Solicitud no encontrada.' });
        if (r.rows[0].aprobado_por_admin) {
            return res.status(400).json({ error: 'Esta solicitud ya fue aprobada.' });
        }

        // Desactivamos al usuario y guardamos el motivo
        await db.query(
            `UPDATE usuarios
             SET estado = false, rechazado_por = $1, motivo_rechazo = $2
             WHERE id_usuario = $3`,
            [req.superAdmin.id_super, motivo || 'Sin motivo especificado', idUsuario]
        );

        await db.query(
            `INSERT INTO email_logs (tipo, destinatario, asunto, exito, error_mensaje, created_at)
             VALUES ($1, $2, $3, $4, $5, NOW())`,
            ['super_admin_rechazo', r.rows[0].correo, 'Registro rechazado por super-admin', true, null]
        ).catch(() => {});

        res.json({ success: true, message: `❌ Solicitud de ${r.rows[0].nombre} rechazada.` });
    } catch (err) {
        console.error('Error rechazando solicitud:', err);
        res.status(500).json({ error: 'Error interno del servidor.' });
    }
});

// Bloquear/desbloquear un usuario (de cualquier local)
app.post('/api/super/toggle-usuario/:idUsuario', requireSuperAdmin, async (req, res) => {
    try {
        const idUsuario = Number(req.params.idUsuario);
        const r = await db.query(
            'SELECT u.id_usuario, u.nombre, u.estado FROM usuarios u WHERE u.id_usuario = $1',
            [idUsuario]
        );
        if (r.rows.length === 0) return res.status(404).json({ error: 'Usuario no encontrado.' });
        const nuevoEstado = !r.rows[0].estado;
        await db.query('UPDATE usuarios SET estado = $1 WHERE id_usuario = $2', [nuevoEstado, idUsuario]);
        res.json({ success: true, message: nuevoEstado ? '✅ Usuario activado' : '❌ Usuario desactivado' });
    } catch (err) {
        console.error('Error toggle usuario:', err);
        res.status(500).json({ error: 'Error interno del servidor.' });
    }
});

// Métricas globales (para el dashboard del super-admin)
app.get('/api/super/metricas', requireSuperAdmin, async (req, res) => {
    try {
        const r = await db.query(`
            SELECT
                (SELECT COUNT(*) FROM locales) as total_locales,
                (SELECT COUNT(*) FROM usuarios WHERE estado = true) as total_usuarios,
                (SELECT COUNT(*) FROM usuarios WHERE aprobado_por_admin = false AND estado = true) as pendientes_aprobacion,
                (SELECT COUNT(*) FROM productos) as total_productos,
                (SELECT COUNT(*) FROM ventas) as total_ventas_historicas
        `);
        res.json(r.rows[0]);
    } catch (err) {
        console.error('Error en /super/metricas:', err);
        res.status(500).json({ error: 'Error interno del servidor.' });
    }
});

// Endpoint PÚBLICO (sin auth) para que el frontend pueda saber si el registro está habilitado
// antes de mostrar la pantalla de registro. Evita que un usuario llene todo el formulario
// solo para recibir un 403 al final.
app.get('/api/auth/registro-habilitado', async (req, res) => {
    try {
        const r = await db.query("SELECT valor FROM configuracion_sistema WHERE clave = 'registro_publico_habilitado'");
        res.json({ habilitado: r.rows[0]?.valor === 'true' });
    } catch (err) {
        console.error('Error en /registro-habilitado:', err);
        res.status(500).json({ error: 'Error interno del servidor.' });
    }
});

// =====================================================
// CÓDIGOS PENDIENTES Y LOGS DE EMAIL (admin only)
// =====================================================
// Para que el admin pueda ver los códigos de verificación
// de clientes que no recibieron el email, y auditar los emails enviados.

// GET: ver códigos de verificación pendientes (no usados, no expirados)
app.get('/api/admin/codigos-pendientes', requireAuth, requireAprobado, requireAdmin, async (req, res) => {
    try {
        const r = await db.query(`
            SELECT u.id_usuario, u.nombre, u.correo, u.codigo_verificacion,
                   u.codigo_expiracion, u.intentos_verificacion, l.nombre_local,
                   EXTRACT(EPOCH FROM (u.codigo_expiracion - NOW()))::int as segundos_restantes
            FROM usuarios u
            LEFT JOIN locales l ON u.id_local = l.id_local
            WHERE u.verificado = false
              AND u.codigo_verificacion IS NOT NULL
              AND u.codigo_expiracion > NOW()
              AND u.id_local = $1
            ORDER BY u.codigo_expiracion DESC
        `, [Number(req.user.id_local)]);
        res.json(r.rows);
    } catch (err) {
        console.error('Error en /admin/codigos-pendientes:', err);
        res.status(500).json({ error: 'Error interno del servidor.' });
    }
});

// GET: ver logs de emails enviados
app.get('/api/admin/email-logs', requireAuth, requireAprobado, requireAdmin, async (req, res) => {
    try {
        const { limite = 50 } = req.query;
        const r = await db.query(`
            SELECT id_log, tipo, destinatario, asunto, exito, error_mensaje, codigo_asociado, created_at
            FROM email_logs
            ORDER BY created_at DESC
            LIMIT $1
        `, [Math.min(parseInt(limite) || 50, 200)]);
        res.json(r.rows);
    } catch (err) {
        console.error('Error en /admin/email-logs:', err);
        res.status(500).json({ error: 'Error interno del servidor.' });
    }
});

// POST: reenviar código a un usuario (admin usa esto cuando el cliente no recibió el email)
app.post('/api/admin/reenviar-codigo/:idUsuario', requireAuth, requireAprobado, requireAdmin, async (req, res) => {
    try {
        const idUsuario = Number(req.params.idUsuario);
        // Obtener datos del usuario y validar que es del mismo local
        const r = await db.query(
            'SELECT u.id_usuario, u.nombre, u.correo, u.id_local, u.verificado FROM usuarios u WHERE u.id_usuario = $1',
            [idUsuario]
        );
        if (r.rows.length === 0) return res.status(404).json({ error: 'Usuario no encontrado.' });
        const u = r.rows[0];
        if (u.id_local !== Number(req.user.id_local)) return res.status(403).json({ error: 'No autorizado.' });
        if (u.verificado) return res.status(400).json({ error: 'El usuario ya está verificado.' });

        // Generar nuevo código
        const codigo = generarCodigo();
        const minutosExp = parseInt(await getConfig('codigo_verificacion_expiracion_minutos') || '15');
        await db.query(
            'UPDATE usuarios SET codigo_verificacion = $1, codigo_expiracion = NOW() + ($2 || \' minutes\')::interval, intentos_verificacion = 0 WHERE id_usuario = $3',
            [codigo, String(minutosExp), idUsuario]
        );

        // Reenviar
        const emailResult = await enviarEmail({
            to: u.correo,
            subject: 'Nuevo código de verificación - Sistema de Ventas POS',
            tipo: 'reenvio_verificacion',
            codigo_asociado: codigo,
            html: `
                <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:2rem;">
                    <h2 style="color:#264653;">Hola ${escapeHtml(u.nombre)},</h2>
                    <p>Tu nuevo código de verificación es:</p>
                    <div style="background:#264653;color:white;font-size:2rem;letter-spacing:0.5rem;padding:1.5rem;text-align:center;border-radius:8px;margin:1.5rem 0;font-weight:700;">
                        ${codigo}
                    </div>
                    <p style="color:#666;font-size:0.9rem;">Expira en ${minutosExp} minutos.</p>
                </div>
            `,
        });

        res.json({
            success: true,
            codigo,  // admin lo ve
            email_enviado: emailResult.success,
            email_error: emailResult.success ? null : emailResult.error,
        });
    } catch (err) {
        console.error('Error en reenviar-codigo admin:', err);
        res.status(500).json({ error: 'Error interno del servidor.' });
    }
});

// GET: estado del sistema de email (para el panel de Configuración)
app.get('/api/admin/email-status', requireAuth, requireAprobado, requireAdmin, async (req, res) => {
    try {
        const ult = await db.query(`
            SELECT
                COUNT(*) FILTER (WHERE exito) as total_exitos,
                COUNT(*) FILTER (WHERE NOT exito) as total_fallos,
                COUNT(*) as total_enviados,
                MAX(created_at) FILTER (WHERE exito) as ultimo_exito,
                MAX(created_at) FILTER (WHERE NOT exito) as ultimo_fallo
            FROM email_logs
            WHERE created_at > NOW() - INTERVAL '7 days'
        `);
        const r = ult.rows[0];
        res.json({
            configurado: !!transporter,
            ultimos_7_dias: {
                total_enviados: parseInt(r.total_enviados) || 0,
                total_exitos: parseInt(r.total_exitos) || 0,
                total_fallos: parseInt(r.total_fallos) || 0,
                ultimo_exito: r.ultimo_exito,
                ultimo_fallo: r.ultimo_fallo,
            },
        });
    } catch (err) {
        console.error('Error en /admin/email-status:', err);
        res.status(500).json({ error: 'Error interno del servidor.' });
    }
});

// APROBAR registro: activa la cuenta del usuario (admin lo aprueba manualmente
// cuando el email no funcionó y ya verificó la identidad del cliente por otro medio)
app.post('/api/admin/aprobar-registro/:idUsuario', requireAuth, requireAprobado, requireAdmin, async (req, res) => {
    try {
        const idUsuario = Number(req.params.idUsuario);
        const r = await db.query(
            'SELECT u.id_usuario, u.id_local, u.verificado, u.codigo_verificacion FROM usuarios u WHERE u.id_usuario = $1',
            [idUsuario]
        );
        if (r.rows.length === 0) return res.status(404).json({ error: 'Usuario no encontrado.' });
        const u = r.rows[0];
        if (u.id_local !== Number(req.user.id_local)) return res.status(403).json({ error: 'No autorizado.' });
        if (u.verificado) return res.status(400).json({ error: 'El usuario ya está verificado.' });

        await db.query(
            'UPDATE usuarios SET verificado = true, codigo_verificacion = NULL, codigo_expiracion = NULL, intentos_verificacion = 0 WHERE id_usuario = $1',
            [idUsuario]
        );
        // Logueamos la aprobación
        await db.query(
            `INSERT INTO email_logs (tipo, destinatario, asunto, exito, error_mensaje, codigo_asociado, created_at)
             VALUES ($1, $2, $3, $4, $5, $6, NOW())`,
            ['aprobacion_admin', `usuario_id:${idUsuario}`, 'Registro aprobado por admin', true, null, u.codigo_verificacion]
        ).catch(() => {}); // no crítico

        res.json({ success: true, message: 'Usuario aprobado. Ya puede iniciar sesión.' });
    } catch (err) {
        console.error('Error aprobando usuario:', err);
        res.status(500).json({ error: 'Error interno del servidor.' });
    }
});

// RECHAZAR registro: elimina al usuario y su local (soft delete: desactiva)
app.post('/api/admin/rechazar-registro/:idUsuario', requireAuth, requireAprobado, requireAdmin, async (req, res) => {
    try {
        const idUsuario = Number(req.params.idUsuario);
        const r = await db.query(
            'SELECT u.id_usuario, u.id_local, u.verificado, u.correo FROM usuarios u WHERE u.id_usuario = $1',
            [idUsuario]
        );
        if (r.rows.length === 0) return res.status(404).json({ error: 'Usuario no encontrado.' });
        const u = r.rows[0];
        if (u.id_local !== Number(req.user.id_local)) return res.status(403).json({ error: 'No autorizado.' });
        if (u.verificado) return res.status(400).json({ error: 'El usuario ya está verificado, no se puede rechazar.' });

        // Marcamos el usuario como inactivo (no lo eliminamos por integridad de datos)
        await db.query('UPDATE usuarios SET estado = false WHERE id_usuario = $1', [idUsuario]);
        await db.query(
            `INSERT INTO email_logs (tipo, destinatario, asunto, exito, error_mensaje, created_at)
             VALUES ($1, $2, $3, $4, $5, NOW())`,
            ['rechazo_admin', u.correo, 'Registro rechazado por admin', true, null]
        ).catch(() => {});

        res.json({ success: true, message: 'Registro rechazado. El usuario no podrá iniciar sesión.' });
    } catch (err) {
        console.error('Error rechazando usuario:', err);
        res.status(500).json({ error: 'Error interno del servidor.' });
    }
});

// =====================================================
// CONFIGURACIÓN DEL SISTEMA (admin only)
// =====================================================

// GET: ver settings del sistema — v1.5.4: SOLO super-admin
// (antes era requireAdmin, lo que permitía al admin de local ver/modificar
// settings globales. El UI ya ocultó esta pestaña para clientes.)
app.get('/api/configuracion', requireSuperAdmin, async (req, res) => {
    try {
        const r = await db.query('SELECT clave, valor, descripcion FROM configuracion_sistema ORDER BY clave');
        const settings = {};
        for (const row of r.rows) {
            // Parsear booleanos automáticamente
            if (row.valor === 'true') settings[row.clave] = true;
            else if (row.valor === 'false') settings[row.clave] = false;
            else if (/^\d+$/.test(row.valor)) settings[row.clave] = parseInt(row.valor);
            else settings[row.clave] = row.valor;
        }
        res.json(settings);
    } catch (err) {
        console.error('Error en GET /configuracion:', err);
        res.status(500).json({ error: 'Error interno del servidor.' });
    }
});

// PUT: actualizar settings — v1.5.4: SOLO super-admin
app.put('/api/configuracion', requireSuperAdmin, async (req, res) => {
    try {
        // Whitelist de settings que el admin puede cambiar
        const settingsPermitidos = [
            'registro_publico_habilitado',
            'politica_password_min_longitud',
            'politica_password_requiere_mayuscula',
            'politica_password_requiere_numero',
            'politica_password_requiere_especial',
            'codigo_verificacion_expiracion_minutos',
            'max_intentos_verificacion',
        ];

        for (const clave of Object.keys(req.body)) {
            if (!settingsPermitidos.includes(clave)) {
                return res.status(400).json({ error: `Setting "${clave}" no se puede modificar.` });
            }
            const valor = String(req.body[clave]);
            await db.query(
                'UPDATE configuracion_sistema SET valor = $1, updated_at = NOW(), updated_by = $2 WHERE clave = $3',
                [valor, Number(req.user.id_usuario), clave]
            );
        }
        res.json({ success: true });
    } catch (err) {
        console.error('Error en PUT /configuracion:', err);
        res.status(500).json({ error: 'Error interno del servidor.' });
    }
});

// =====================================================
// GESTIÓN DEL LOCAL
// =====================================================

// GET: ver datos del local actual — MOVIDO a la línea 680 (antes de /:id)
// (Express matchea por orden, "me" no puede caer en /:id)

// PUT: actualizar datos del local (solo admin)

// PUT: actualizar datos del local (solo admin)
app.put('/api/locales/me', requireAuth, requireAprobado, requireAdmin, async (req, res) => {
    try {
        const { nombre_local, direccion, nit, telefono, ciudad, email } = req.body;
        if (!nombre_local || !nombre_local.trim()) {
            return res.status(400).json({ error: 'El nombre del local es obligatorio.' });
        }
        const idLocal = Number(req.user.id_local);
        await db.query(
            `UPDATE locales
             SET nombre_local = $1, direccion = $2, nit = $3, telefono = $4, ciudad = $5, email = $6
             WHERE id_local = $7`,
            [nombre_local.trim(), direccion?.trim() || null, nit?.trim() || null, telefono?.trim() || null, ciudad?.trim() || null, email?.trim() || null, idLocal]
        );
        res.json({ success: true });
    } catch (err) {
        console.error('Error en PUT /locales/me:', err);
        res.status(500).json({ error: 'Error interno del servidor.' });
    }
});

// =====================================================
// GESTIÓN DE MI CUENTA (cualquier usuario logueado)
// =====================================================

// Cambiar MI propia contraseña (logueado, sin código — porque ya está autenticado)
app.put('/api/auth/mi-password', requireAuth, requireAprobado, async (req, res) => {
    try {
        const { contrasena_actual, nueva_contrasena } = req.body;
        if (!contrasena_actual || !nueva_contrasena) {
            return res.status(400).json({ error: 'Contraseña actual y nueva son requeridas.' });
        }
        // Validar política
        const errorPassword = await validarPoliticaContrasena(nueva_contrasena);
        if (errorPassword) return res.status(400).json({ error: errorPassword });

        // Verificar contraseña actual
        const r = await db.query('SELECT contrasena_hash FROM usuarios WHERE id_usuario = $1', [Number(req.user.id_usuario)]);
        if (r.rows.length === 0) return res.status(404).json({ error: 'Usuario no encontrado.' });

        const ok = await bcrypt.compare(contrasena_actual, r.rows[0].contrasena_hash);
        if (!ok) return res.status(401).json({ error: 'La contraseña actual es incorrecta.' });

        // Cambiar
        const costFactor = parseInt(await getConfig('bcrypt_cost_factor') || '12');
        const nuevoHash = await bcrypt.hash(nueva_contrasena, costFactor);
        await db.query('UPDATE usuarios SET contrasena_hash = $1 WHERE id_usuario = $2', [nuevoHash, Number(req.user.id_usuario)]);

        res.json({ success: true, message: 'Contraseña actualizada.' });
    } catch (err) {
        console.error('Error cambiando mi contraseña:', err);
        res.status(500).json({ error: 'Error interno del servidor.' });
    }
});

// Actualizar MI propio perfil (nombre, teléfono)
app.put('/api/auth/mi-perfil', requireAuth, requireAprobado, async (req, res) => {
    try {
        const { nombre, telefono, avatar_url } = req.body;
        if (!nombre || !nombre.trim()) {
            return res.status(400).json({ error: 'El nombre es obligatorio.' });
        }
        // v1.5.5: avatar_url es opcional. Si llega, validamos que sea un data URI
        // o una URL http(s) (evitamos que se cuelen cosas raras).
        let avatarSanitizado = null;
        if (avatar_url !== undefined) {
            if (avatar_url === null || avatar_url === '') {
                avatarSanitizado = null;
            } else if (typeof avatar_url === 'string') {
                if (avatar_url.startsWith('data:image/') && avatar_url.length < 800000) {
                    // data:image/png;base64,... hasta ~600KB de imagen
                    avatarSanitizado = avatar_url;
                } else if (/^https?:\/\//.test(avatar_url) && avatar_url.length < 500) {
                    avatarSanitizado = avatar_url;
                } else {
                    return res.status(400).json({ error: 'avatar_url inválido (debe ser data:image o http(s)).' });
                }
            }
        }
        await db.query(
            'UPDATE usuarios SET nombre = $1, telefono = $2, avatar_url = COALESCE($3, avatar_url) WHERE id_usuario = $4',
            [nombre.trim(), telefono?.trim() || null, avatarSanitizado, Number(req.user.id_usuario)]
        );
        res.json({ success: true });
    } catch (err) {
        console.error('Error actualizando mi perfil:', err);
        res.status(500).json({ error: 'Error interno del servidor.' });
    }
});

// =====================================================
// PROVEEDORES (v1.5.5)
// =====================================================
app.get('/api/proveedores', requireAuth, requireAprobado, async (req, res) => {
    try {
        const idLocal = Number(req.user.id_local);
        const { rows } = await db.query(
            `SELECT * FROM proveedores WHERE id_local = $1 ORDER BY nombre_razon_social`,
            [idLocal]
        );
        res.json(rows);
    } catch (err) {
        console.error('Error listando proveedores:', err);
        res.status(500).json({ error: 'Error interno del servidor.' });
    }
});

app.post('/api/proveedores', requireAuth, requireAprobado, requireAdmin, async (req, res) => {
    try {
        const idLocal = Number(req.user.id_local);
        const { nombre_razon_social, nit, telefono, correo, direccion, contacto_nombre, notas } = req.body;
        if (!nombre_razon_social || !nombre_razon_social.trim()) {
            return res.status(400).json({ error: 'El nombre del proveedor es obligatorio.' });
        }
        const r = await db.query(
            `INSERT INTO proveedores (id_local, nombre_razon_social, nit, telefono, correo, direccion, contacto_nombre, notas)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
             RETURNING *`,
            [idLocal, nombre_razon_social.trim(), nit?.trim() || null, telefono?.trim() || null,
             correo?.trim() || null, direccion?.trim() || null, contacto_nombre?.trim() || null,
             notas?.trim() || null]
        );
        res.json({ success: true, proveedor: r.rows[0] });
    } catch (err) {
        console.error('Error creando proveedor:', err);
        res.status(500).json({ error: 'Error interno del servidor.' });
    }
});

app.put('/api/proveedores/:id', requireAuth, requireAprobado, requireAdmin, async (req, res) => {
    try {
        const idLocal = Number(req.user.id_local);
        const idProv = Number(req.params.id);
        const { nombre_razon_social, nit, telefono, correo, direccion, contacto_nombre, notas, estado } = req.body;
        const r = await db.query(
            `UPDATE proveedores SET
                nombre_razon_social = COALESCE($1, nombre_razon_social),
                nit = $2, telefono = $3, correo = $4, direccion = $5,
                contacto_nombre = $6, notas = $7,
                estado = COALESCE($8, estado),
                updated_at = NOW()
             WHERE id_proveedor = $9 AND id_local = $10
             RETURNING *`,
            [nombre_razon_social?.trim() || null, nit?.trim() || null, telefono?.trim() || null,
             correo?.trim() || null, direccion?.trim() || null, contacto_nombre?.trim() || null,
             notas?.trim() || null, estado, idProv, idLocal]
        );
        if (r.rows.length === 0) return res.status(404).json({ error: 'Proveedor no encontrado.' });
        res.json({ success: true, proveedor: r.rows[0] });
    } catch (err) {
        console.error('Error actualizando proveedor:', err);
        res.status(500).json({ error: 'Error interno del servidor.' });
    }
});

app.delete('/api/proveedores/:id', requireAuth, requireAprobado, requireAdmin, async (req, res) => {
    try {
        const idLocal = Number(req.user.id_local);
        const idProv = Number(req.params.id);
        await db.query(`DELETE FROM proveedores WHERE id_proveedor = $1 AND id_local = $2`, [idProv, idLocal]);
        res.json({ success: true });
    } catch (err) {
        console.error('Error eliminando proveedor:', err);
        res.status(500).json({ error: 'Error interno del servidor.' });
    }
});

// =====================================================
// EMPLEADOS / NÓMINA (v1.5.5)
// =====================================================
app.get('/api/empleados', requireAuth, requireAprobado, async (req, res) => {
    try {
        const idLocal = Number(req.user.id_local);
        const { rows } = await db.query(
            `SELECT * FROM empleados WHERE id_local = $1 ORDER BY estado DESC, nombre`,
            [idLocal]
        );
        res.json(rows);
    } catch (err) {
        console.error('Error listando empleados:', err);
        res.status(500).json({ error: 'Error interno del servidor.' });
    }
});

app.post('/api/empleados', requireAuth, requireAprobado, requireAdmin, async (req, res) => {
    try {
        const idLocal = Number(req.user.id_local);
        const { nombre, documento_identidad, telefono, correo, direccion, cargo, salario_base, tipo_contrato, fecha_ingreso, notas, banco, tipo_cuenta, cuenta_bancaria, periodicidad_pago } = req.body;
        if (!nombre || !nombre.trim()) {
            return res.status(400).json({ error: 'El nombre del empleado es obligatorio.' });
        }
        const r = await db.query(
            `INSERT INTO empleados (id_local, nombre, documento_identidad, telefono, correo, direccion, cargo, salario_base, tipo_contrato, fecha_ingreso, notas, banco, tipo_cuenta, cuenta_bancaria, periodicidad_pago)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, COALESCE($10::date, CURRENT_DATE), $11, $12, $13, $14, $15)
             RETURNING *`,
            [idLocal, nombre.trim(), documento_identidad?.trim() || null, telefono?.trim() || null,
             correo?.trim() || null, direccion?.trim() || null, cargo?.trim() || null,
             parseFloat(salario_base) || 0, tipo_contrato?.trim() || 'Indefinido',
             fecha_ingreso || null, notas?.trim() || null,
             banco?.trim() || null, tipo_cuenta?.trim() || 'Ahorros',
             cuenta_bancaria?.trim() || null, periodicidad_pago?.trim() || 'Mensual']
        );
        res.json({ success: true, empleado: r.rows[0] });
    } catch (err) {
        console.error('Error creando empleado:', err);
        res.status(500).json({ error: 'Error interno del servidor.' });
    }
});

app.put('/api/empleados/:id', requireAuth, requireAprobado, requireAdmin, async (req, res) => {
    try {
        const idLocal = Number(req.user.id_local);
        const idEmp = Number(req.params.id);
        const { nombre, documento_identidad, telefono, correo, direccion, cargo, salario_base, tipo_contrato, fecha_ingreso, fecha_salida, estado, notas, banco, tipo_cuenta, cuenta_bancaria, periodicidad_pago } = req.body;
        const r = await db.query(
            `UPDATE empleados SET
                nombre = COALESCE($1, nombre),
                documento_identidad = $2, telefono = $3, correo = $4, direccion = $5,
                cargo = $6, salario_base = COALESCE($7, salario_base),
                tipo_contrato = COALESCE($8, tipo_contrato),
                fecha_ingreso = COALESCE($9::date, fecha_ingreso),
                fecha_salida = $10::date,
                estado = COALESCE($11, estado),
                notas = $12,
                banco = $13, tipo_cuenta = $14, cuenta_bancaria = $15, periodicidad_pago = $16,
                updated_at = NOW()
             WHERE id_empleado = $17 AND id_local = $18
             RETURNING *`,
            [nombre?.trim() || null, documento_identidad?.trim() || null, telefono?.trim() || null,
             correo?.trim() || null, direccion?.trim() || null, cargo?.trim() || null,
             parseFloat(salario_base) || null, tipo_contrato?.trim() || null,
             fecha_ingreso || null, fecha_salida || null, estado, notas?.trim() || null,
             banco?.trim() || null, tipo_cuenta?.trim() || null, cuenta_bancaria?.trim() || null, periodicidad_pago?.trim() || null,
             idEmp, idLocal]
        );
        if (r.rows.length === 0) return res.status(404).json({ error: 'Empleado no encontrado.' });
        res.json({ success: true, empleado: r.rows[0] });
    } catch (err) {
        console.error('Error actualizando empleado:', err);
        res.status(500).json({ error: 'Error interno del servidor.' });
    }
});

app.delete('/api/empleados/:id', requireAuth, requireAprobado, requireAdmin, async (req, res) => {
    try {
        const idLocal = Number(req.user.id_local);
        const idEmp = Number(req.params.id);
        await db.query(`DELETE FROM empleados WHERE id_empleado = $1 AND id_local = $2`, [idEmp, idLocal]);
        res.json({ success: true });
    } catch (err) {
        console.error('Error eliminando empleado:', err);
        res.status(500).json({ error: 'Error interno del servidor.' });
    }
});

// =======================================================
// NÓMINA — PAGOS (v1.9.0)
// =======================================================

// GET /api/nomina/configuracion — cuenta bancaria del negocio
app.get('/api/nomina/configuracion', requireAuth, requireAprobado, async (req, res) => {
    try {
        const idLocal = Number(req.user.id_local);
        const { rows } = await db.query('SELECT * FROM configuracion_pago WHERE id_local = $1', [idLocal]);
        res.json(rows[0] || {});
    } catch (err) {
        console.error('Error leyendo configuración de pago:', err);
        res.status(500).json({ error: 'Error interno del servidor.' });
    }
});

// PUT /api/nomina/configuracion — guardar cuenta bancaria del negocio
app.put('/api/nomina/configuracion', requireAuth, requireAprobado, requireAdmin, async (req, res) => {
    try {
        const idLocal = Number(req.user.id_local);
        const { banco, tipo_cuenta, numero_cuenta, titular } = req.body;
        await db.query(`
            INSERT INTO configuracion_pago (id_local, banco, tipo_cuenta, numero_cuenta, titular, updated_at)
            VALUES ($1, $2, $3, $4, $5, NOW())
            ON CONFLICT (id_local)
            DO UPDATE SET banco=$2, tipo_cuenta=$3, numero_cuenta=$4, titular=$5, updated_at=NOW()
        `, [idLocal, banco?.trim() || null, tipo_cuenta?.trim() || 'Ahorros', numero_cuenta?.trim() || null, titular?.trim() || null]);
        res.json({ success: true });
    } catch (err) {
        console.error('Error guardando configuración de pago:', err);
        res.status(500).json({ error: 'Error interno del servidor.' });
    }
});

// GET /api/nomina/pagos?periodo= — listar pagos de nómina
app.get('/api/nomina/pagos', requireAuth, requireAprobado, async (req, res) => {
    try {
        const idLocal = Number(req.user.id_local);
        const { periodo } = req.query;
        const params = [idLocal];
        let sql = `SELECT p.*, e.nombre AS empleado_nombre, e.banco, e.tipo_cuenta, e.cuenta_bancaria
                   FROM pagos_nomina p
                   LEFT JOIN empleados e ON p.id_empleado = e.id_empleado
                   WHERE p.id_local = $1`;
        if (periodo) { params.push(periodo); sql += ` AND p.periodo = $${params.length}`; }
        sql += ' ORDER BY p.created_at DESC';
        const { rows } = await db.query(sql, params);
        res.json(rows);
    } catch (err) {
        console.error('Error listando pagos de nómina:', err);
        res.status(500).json({ error: 'Error interno del servidor.' });
    }
});

// POST /api/nomina/pagos — registrar pago de nómina (uno o varios empleados)
app.post('/api/nomina/pagos', requireAuth, requireAprobado, requireAdmin, async (req, res) => {
    try {
        const idLocal = Number(req.user.id_local);
        const { periodo, empleados, metodo_pago, notas } = req.body;
        if (!periodo || !Array.isArray(empleados) || empleados.length === 0) {
            return res.status(400).json({ error: 'Se requiere periodo y al menos un empleado.' });
        }
        const creados = [];
        for (const emp of empleados) {
            const r = await db.query(
                `INSERT INTO pagos_nomina (id_local, id_empleado, periodo, monto, metodo_pago, estado, notas)
                 VALUES ($1, $2, $3, $4, $5, 'Pendiente', $6) RETURNING *`,
                [idLocal, emp.id_empleado, periodo, parseFloat(emp.monto) || 0, metodo_pago || 'Transferencia', notas?.trim() || null]
            );
            creados.push(r.rows[0]);
        }
        res.json({ success: true, pagos: creados });
    } catch (err) {
        console.error('Error creando pagos de nómina:', err);
        res.status(500).json({ error: 'Error interno del servidor.' });
    }
});

// PUT /api/nomina/pagos/:id — marcar pago como Pagado / Pendiente
app.put('/api/nomina/pagos/:id', requireAuth, requireAprobado, requireAdmin, async (req, res) => {
    try {
        const idLocal = Number(req.user.id_local);
        const idPago = Number(req.params.id);
        const { estado, fecha_pago } = req.body;
        const r = await db.query(
            `UPDATE pagos_nomina SET estado = COALESCE($1, estado), fecha_pago = COALESCE($2::timestamp, fecha_pago)
             WHERE id_pago = $3 AND id_local = $4 RETURNING *`,
            [estado || null, fecha_pago || null, idPago, idLocal]
        );
        if (r.rows.length === 0) return res.status(404).json({ error: 'Pago no encontrado.' });
        res.json({ success: true, pago: r.rows[0] });
    } catch (err) {
        console.error('Error actualizando pago de nómina:', err);
        res.status(500).json({ error: 'Error interno del servidor.' });
    }
});

// DELETE /api/nomina/pagos/:id — eliminar pago
app.delete('/api/nomina/pagos/:id', requireAuth, requireAprobado, requireAdmin, async (req, res) => {
    try {
        const idLocal = Number(req.user.id_local);
        const idPago = Number(req.params.id);
        await db.query('DELETE FROM pagos_nomina WHERE id_pago = $1 AND id_local = $2', [idPago, idLocal]);
        res.json({ success: true });
    } catch (err) {
        console.error('Error eliminando pago de nómina:', err);
        res.status(500).json({ error: 'Error interno del servidor.' });
    }
});

// =======================================================
// ATENCIÓN AL CLIENTE / SOPORTE (v1.9.0)
// =======================================================
(async () => {
    try {
        await db.query(`
            CREATE TABLE IF NOT EXISTS tickets_soporte (
                id_ticket SERIAL PRIMARY KEY,
                id_local INTEGER REFERENCES locales(id_local) ON DELETE SET NULL,
                nombre VARCHAR(200) NOT NULL,
                correo VARCHAR(150),
                asunto VARCHAR(200),
                mensaje TEXT NOT NULL,
                estado VARCHAR(20) DEFAULT 'Abierto',
                respuesta TEXT,
                created_at TIMESTAMP DEFAULT NOW()
            )
        `);
    } catch (e) {
        console.error('Error creando tabla tickets_soporte:', e.message);
    }
})();

// POST /api/soporte/contacto — enviar ticket de soporte (con sesión)
app.post('/api/soporte/contacto', requireAuth, requireAprobado, async (req, res) => {
    try {
        const idLocal = Number(req.user.id_local);
        const { nombre, correo, asunto, mensaje } = req.body;
        if (!nombre?.trim() || !mensaje?.trim()) {
            return res.status(400).json({ error: 'Nombre y mensaje son obligatorios.' });
        }
        const r = await db.query(
            `INSERT INTO tickets_soporte (id_local, nombre, correo, asunto, mensaje)
             VALUES ($1, $2, $3, $4, $5) RETURNING *`,
            [idLocal, nombre.trim(), correo?.trim() || null, asunto?.trim() || 'Consulta general', mensaje.trim()]
        );
        // Notificar por correo al soporte (super-admin)
        if (transporter) {
            const supR = await db.query('SELECT correo FROM super_admins WHERE estado = true LIMIT 1');
            if (supR.rows.length > 0) {
                await enviarEmail({
                    to: supR.rows[0].correo,
                    subject: `[Soporte] ${asunto || 'Consulta'} — ${nombre.trim()}`,
                    html: `<h3>Nuevo ticket de soporte</h3>
                           <p><b>Nombre:</b> ${nombre.trim()}</p>
                           <p><b>Correo:</b> ${correo || '—'}</p>
                           <p><b>Local:</b> ${idLocal}</p>
                           <p><b>Mensaje:</b></p><p>${mensaje.trim()}</p>`,
                    tipo: 'soporte'
                });
            }
        }
        res.json({ success: true, ticket: r.rows[0] });
    } catch (err) {
        console.error('Error creando ticket de soporte:', err);
        res.status(500).json({ error: 'Error interno del servidor.' });
    }
});

// GET /api/soporte/tickets — listar tickets del local (admin)
app.get('/api/soporte/tickets', requireAuth, requireAprobado, requireAdmin, async (req, res) => {
    try {
        const idLocal = Number(req.user.id_local);
        const { rows } = await db.query(
            'SELECT * FROM tickets_soporte WHERE id_local = $1 ORDER BY created_at DESC',
            [idLocal]
        );
        res.json(rows);
    } catch (err) {
        console.error('Error listando tickets:', err);
        res.status(500).json({ error: 'Error interno del servidor.' });
    }
});

// =======================================================
// BOT DE AUTOMATIZACIONES (v1.9.0)
// Reportes automáticos por correo para el super-admin
// =======================================================

// Genera el resumen del reporte (ventas, usuarios, locales, tickets)
async function generarResumenReporte(desde, hasta) {
    const [localesR, usuariosR, ventasR, ticketsR, nuevosR] = await Promise.all([
        db.query('SELECT COUNT(*)::int AS total FROM locales'),
        db.query('SELECT COUNT(*)::int AS total FROM usuarios'),
        db.query(
            `SELECT COALESCE(SUM(total_neto),0) AS total, COUNT(*)::int AS cantidad
             FROM ventas WHERE fecha_venta BETWEEN $1 AND $2`,
            [desde, hasta]
        ),
        db.query(`SELECT COUNT(*)::int AS total FROM tickets_soporte WHERE estado = 'Abierto'`),
        db.query(
            `SELECT COUNT(*)::int AS total FROM usuarios WHERE created_at BETWEEN $1 AND $2`,
            [desde, hasta]
        )
    ]);
    return {
        total_locales: localesR.rows[0].total,
        total_usuarios: usuariosR.rows[0].total,
        ventas_periodo: ventasR.rows[0].total,
        ventas_cantidad: ventasR.rows[0].cantidad,
        tickets_abiertos: ticketsR.rows[0].total,
        nuevos_usuarios: nuevosR.rows[0].total
    };
}

// Genera y envía el reporte (usado por el endpoint y el cron)
async function enviarReporteAutomatico(tipo = 'semanal') {
    const ahora = new Date();
    const desde = new Date(ahora);
    if (tipo === 'mensual') desde.setDate(1);
    else desde.setDate(ahora.getDate() - 7);

    const resumen = await generarResumenReporte(desde.toISOString(), ahora.toISOString());
    const supR = await db.query('SELECT correo, nombre FROM super_admins WHERE estado = true LIMIT 1');
    if (supR.rows.length === 0) return { success: false, error: 'No hay super-admin activo.' };

    const fmtCOP = (v) => new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(Number(v) || 0);
    const html = `
        <div style="font-family:Arial,sans-serif;max-width:600px;margin:auto">
          <h2 style="color:#7ed957">📊 Reporte ${tipo === 'mensual' ? 'Mensual' : 'Semanal'} — Sistema de Ventas POS</h2>
          <p>Hola <b>${supR.rows[0].nombre}</b>, este es el resumen del periodo:</p>
          <table style="width:100%;border-collapse:collapse;margin:1rem 0">
            <tr><td style="padding:8px;border:1px solid #ddd">🏪 Locales registrados</td><td style="padding:8px;border:1px solid #ddd;font-weight:bold">${resumen.total_locales}</td></tr>
            <tr><td style="padding:8px;border:1px solid #ddd">👥 Usuarios totales</td><td style="padding:8px;border:1px solid #ddd;font-weight:bold">${resumen.total_usuarios}</td></tr>
            <tr><td style="padding:8px;border:1px solid #ddd">🆕 Nuevos usuarios del periodo</td><td style="padding:8px;border:1px solid #ddd;font-weight:bold">${resumen.nuevos_usuarios}</td></tr>
            <tr><td style="padding:8px;border:1px solid #ddd">💰 Ventas del periodo</td><td style="padding:8px;border:1px solid #ddd;font-weight:bold">${fmtCOP(resumen.ventas_periodo)} (${resumen.ventas_cantidad} ventas)</td></tr>
            <tr><td style="padding:8px;border:1px solid #ddd">🎫 Tickets de soporte abiertos</td><td style="padding:8px;border:1px solid #ddd;font-weight:bold">${resumen.tickets_abiertos}</td></tr>
          </table>
          <p style="color:#888;font-size:0.85rem">Generado automáticamente por el bot de automatizaciones.</p>
        </div>`;

    const env = await enviarEmail({
        to: supR.rows[0].correo,
        subject: `📊 Reporte ${tipo === 'mensual' ? 'Mensual' : 'Semanal'} del sistema`,
        html,
        tipo: 'reporte_automatico'
    });
    return { success: true, enviado: env.success, resumen };
}

// GET /api/super/tickets — todos los tickets de soporte (super-admin)
app.get('/api/super/tickets', requireSuperAdmin, async (req, res) => {
    try {
        const { rows } = await db.query(
            'SELECT * FROM tickets_soporte ORDER BY created_at DESC LIMIT 50'
        );
        res.json(rows);
    } catch (err) {
        console.error('Error listando tickets globales:', err);
        res.status(500).json({ error: 'Error interno del servidor.' });
    }
});

// POST /api/super/reporte — enviar reporte manualmente
app.post('/api/super/reporte', requireSuperAdmin, async (req, res) => {
    try {
        const { tipo = 'semanal' } = req.body;
        const resultado = await enviarReporteAutomatico(tipo);
        res.json(resultado);
    } catch (err) {
        console.error('Error generando reporte:', err);
        res.status(500).json({ error: 'Error interno del servidor.' });
    }
});

// Cron: reporte semanal (lunes 8am) y mensual (día 1, 8am)
function programarReportes() {
    const check = () => {
        const ahora = new Date();
        const dia = ahora.getDay();      // 1 = lunes
        const fecha = ahora.getDate();   // día del mes
        const hora = ahora.getHours();
        if (hora === 8) {
            if (dia === 1) {
                console.log('🤖 Bot: enviando reporte semanal...');
                enviarReporteAutomatico('semanal').catch(() => {});
            }
            if (fecha === 1) {
                console.log('🤖 Bot: enviando reporte mensual...');
                enviarReporteAutomatico('mensual').catch(() => {});
            }
        }
    };
    check();
    setInterval(check, 60 * 60 * 1000); // cada hora
}
programarReportes();

// =======================================================
// IMÁGENES DE PRODUCTO
// =======================================================

// POST /api/productos/:id/imagen — subir o reemplazar imagen
app.post('/api/productos/:id/imagen', requireAuth, requireAprobado, uploadProducto.single('imagen'), async (req, res) => {
    try {
        const idLocal = Number(req.user.id_local);
        const idProd = Number(req.params.id);
        if (!req.file) return res.status(400).json({ error: 'No se recibió ninguna imagen.' });

        // Construir URL pública
        const imageUrl = `/uploads/productos/${req.file.filename}`;

        // Eliminar imagen anterior si existe
        const old = await db.query('SELECT imagen_url FROM productos WHERE id_producto=$1 AND id_local=$2', [idProd, idLocal]);
        if (old.rows[0]?.imagen_url) {
            const oldPath = path.join(__dirname, old.rows[0].imagen_url);
            if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath);
        }

        await db.query('UPDATE productos SET imagen_url=$1 WHERE id_producto=$2 AND id_local=$3', [imageUrl, idProd, idLocal]);
        res.json({ success: true, imagen_url: imageUrl });
    } catch (err) {
        console.error('Error subiendo imagen:', err);
        res.status(500).json({ error: 'Error interno del servidor.' });
    }
});

// DELETE /api/productos/:id/imagen — eliminar imagen
app.delete('/api/productos/:id/imagen', requireAuth, requireAprobado, async (req, res) => {
    try {
        const idLocal = Number(req.user.id_local);
        const idProd = Number(req.params.id);
        const r = await db.query('SELECT imagen_url FROM productos WHERE id_producto=$1 AND id_local=$2', [idProd, idLocal]);
        const imgUrl = r.rows[0]?.imagen_url;
        if (imgUrl) {
            const fullPath = path.join(__dirname, imgUrl);
            if (fs.existsSync(fullPath)) fs.unlinkSync(fullPath);
        }
        await db.query('UPDATE productos SET imagen_url=NULL WHERE id_producto=$1 AND id_local=$2', [idProd, idLocal]);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: 'Error interno del servidor.' });
    }
});

// =======================================================
// v1.7.2: GALERÍA DE IMÁGENES DE PRODUCTOS
// =======================================================
// Un producto puede tener varias imágenes (como en e-commerce).
// La primera imagen (orden 0) se usa como imagen principal.

// Crear tabla si no existe (se ejecuta una sola vez al arrancar)
(async () => {
    try {
        await db.query(`
            CREATE TABLE IF NOT EXISTS producto_imagenes (
                id SERIAL PRIMARY KEY,
                id_producto INTEGER NOT NULL REFERENCES productos(id_producto) ON DELETE CASCADE,
                url VARCHAR(500) NOT NULL,
                orden INTEGER DEFAULT 0,
                created_at TIMESTAMP DEFAULT NOW()
            )
        `);
        console.log('[v1.7.2] Tabla producto_imagenes lista');
    } catch (e) {
        console.error('Error creando tabla producto_imagenes:', e.message);
    }
})();

// POST /api/productos/:id/imagenes — subir una o varias imágenes (multipart, campo "imagenes")
app.post('/api/productos/:id/imagenes', requireAuth, requireAprobado, uploadProducto.array('imagenes', 10), async (req, res) => {
    try {
        const idLocal = Number(req.user.id_local);
        const idProd = Number(req.params.id);
        if (!req.files || req.files.length === 0) {
            return res.status(400).json({ error: 'No se recibió ninguna imagen.' });
        }
        // Verificar que el producto pertenece al local
        const prod = await db.query('SELECT id_producto FROM productos WHERE id_producto=$1 AND id_local=$2', [idProd, idLocal]);
        if (prod.rows.length === 0) {
            return res.status(404).json({ error: 'Producto no encontrado.' });
        }
        // Obtener el siguiente orden disponible
        const ord = await db.query('SELECT COALESCE(MAX(orden), -1) + 1 as next FROM producto_imagenes WHERE id_producto=$1', [idProd]);
        let orden = Number(ord.rows[0].next);

        const urls = [];
        for (const file of req.files) {
            const url = `/uploads/productos/${file.filename}`;
            await db.query('INSERT INTO producto_imagenes (id_producto, url, orden) VALUES ($1, $2, $3)', [idProd, url, orden]);
            urls.push({ url, orden });
            orden++;
        }
        // Si el producto no tenía imagen principal, usar la primera subida
        const cur = await db.query('SELECT imagen_url FROM productos WHERE id_producto=$1', [idProd]);
        if (!cur.rows[0]?.imagen_url && urls.length > 0) {
            await db.query('UPDATE productos SET imagen_url=$1 WHERE id_producto=$2', [urls[0].url, idProd]);
        }
        res.json({ success: true, imagenes: urls });
    } catch (err) {
        console.error('Error subiendo imágenes:', err);
        res.status(500).json({ error: 'Error interno del servidor.' });
    }
});

// GET /api/productos/:id/imagenes — listar imágenes de un producto
app.get('/api/productos/:id/imagenes', requireAuth, requireAprobado, async (req, res) => {
    try {
        const idLocal = Number(req.user.id_local);
        const idProd = Number(req.params.id);
        const prod = await db.query('SELECT id_producto FROM productos WHERE id_producto=$1 AND id_local=$2', [idProd, idLocal]);
        if (prod.rows.length === 0) return res.status(404).json({ error: 'Producto no encontrado.' });
        const r = await db.query('SELECT id, url, orden FROM producto_imagenes WHERE id_producto=$1 ORDER BY orden ASC', [idProd]);
        res.json(r.rows);
    } catch (err) {
        res.status(500).json({ error: 'Error interno del servidor.' });
    }
});

// DELETE /api/productos/:id/imagenes/:idImagen — eliminar una imagen de la galería
app.delete('/api/productos/:id/imagenes/:idImagen', requireAuth, requireAprobado, async (req, res) => {
    try {
        const idLocal = Number(req.user.id_local);
        const idProd = Number(req.params.id);
        const idImagen = Number(req.params.idImagen);
        // Verificar que el producto pertenece al local
        const prod = await db.query('SELECT id_producto FROM productos WHERE id_producto=$1 AND id_local=$2', [idProd, idLocal]);
        if (prod.rows.length === 0) return res.status(404).json({ error: 'Producto no encontrado.' });

        const img = await db.query('SELECT url FROM producto_imagenes WHERE id=$1 AND id_producto=$2', [idImagen, idProd]);
        if (img.rows.length === 0) return res.status(404).json({ error: 'Imagen no encontrada.' });

        // Borrar archivo del disco
        const fullPath = path.join(__dirname, img.rows[0].url);
        if (fs.existsSync(fullPath)) fs.unlinkSync(fullPath);

        await db.query('DELETE FROM producto_imagenes WHERE id=$1 AND id_producto=$2', [idImagen, idProd]);

        // Si la imagen eliminada era la principal, reasignar la primera restante
        const cur = await db.query('SELECT imagen_url FROM productos WHERE id_producto=$1', [idProd]);
        if (cur.rows[0]?.imagen_url === img.rows[0].url) {
            const next = await db.query('SELECT url FROM producto_imagenes WHERE id_producto=$1 ORDER BY orden ASC LIMIT 1', [idProd]);
            await db.query('UPDATE productos SET imagen_url=$1 WHERE id_producto=$2', [next.rows[0]?.url || null, idProd]);
        }
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: 'Error interno del servidor.' });
    }
});

// =======================================================
// E-COMMERCE — INTEGRACIONES
// =======================================================

// Crear tabla si no existe (se ejecuta una sola vez al arrancar)
(async () => {
    try {
        await db.query(`
            CREATE TABLE IF NOT EXISTS ecommerce_integraciones (
                id SERIAL PRIMARY KEY,
                id_local INTEGER REFERENCES locales(id_local) ON DELETE CASCADE,
                plataforma VARCHAR(50) NOT NULL,
                nombre_tienda VARCHAR(200),
                access_token TEXT,
                shop_domain VARCHAR(200),
                activa BOOLEAN DEFAULT true,
                fecha_conexion TIMESTAMP DEFAULT NOW()
            )
        `);
    } catch (e) {
        console.error('Error creando tabla ecommerce_integraciones:', e.message);
    }
})();

// GET /api/ecommerce/integraciones — listar integraciones del local
app.get('/api/ecommerce/integraciones', requireAuth, requireAprobado, async (req, res) => {
    try {
        const idLocal = Number(req.user.id_local);
        const { rows } = await db.query(
            'SELECT id, plataforma, nombre_tienda, shop_domain, activa, fecha_conexion FROM ecommerce_integraciones WHERE id_local=$1 ORDER BY fecha_conexion DESC',
            [idLocal]
        );
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: 'Error interno del servidor.' });
    }
});

// POST /api/ecommerce/conectar — conectar tienda por URL (todas las plataformas)
app.post('/api/ecommerce/conectar', requireAuth, requireAprobado, async (req, res) => {
    try {
        const idLocal = Number(req.user.id_local);
        const { plataforma, url_tienda, nombre_tienda, access_token, consumer_key, consumer_secret } = req.body;
        if (!plataforma || !url_tienda) {
            return res.status(400).json({ error: 'Se requiere plataforma y URL de la tienda.' });
        }
        // Validar y normalizar URL
        let url;
        try {
            url = new URL(url_tienda.includes('://') ? url_tienda : 'https://' + url_tienda);
        } catch {
            return res.status(400).json({ error: 'La URL de la tienda no es válida.' });
        }
        const domain = url.hostname.replace(/^www\./, '');
        const tiendaNombre = nombre_tienda || domain;

        // Shopify: verificar token si se proporciona
        if (plataforma === 'shopify' && access_token) {
            const verifyRes = await fetch(`https://${domain}/admin/api/2024-01/shop.json`, {
                headers: { 'X-Shopify-Access-Token': access_token }
            });
            if (!verifyRes.ok) {
                return res.status(400).json({ error: 'No se pudo verificar la tienda Shopify. Revisa el dominio y el token.' });
            }
            const shopData = await verifyRes.json();
            if (shopData.shop?.name) tiendaNombre = shopData.shop.name;
        }

        // WooCommerce: verificar credenciales si se proporcionan
        if (plataforma === 'woocommerce' && consumer_key && consumer_secret) {
            const base = url.origin;
            try {
                const verifyRes = await fetch(`${base}/wp-json/wc/v3/products?per_page=1`, {
                    headers: { 'Authorization': 'Basic ' + Buffer.from(consumer_key + ':' + consumer_secret).toString('base64') }
                });
                if (!verifyRes.ok) {
                    return res.status(400).json({ error: 'No se pudieron verificar las credenciales de WooCommerce.' });
                }
            } catch {
                return res.status(400).json({ error: 'No se pudo conectar con la tienda WooCommerce. Revisa la URL.' });
            }
        }

        // Guardar credenciales (token o consumer key/secret) según plataforma
        const credenciales = plataforma === 'woocommerce'
            ? (consumer_key && consumer_secret ? JSON.stringify({ consumer_key, consumer_secret }) : null)
            : (access_token || null);

        // Asegurar constraint UNIQUE antes del upsert
        try {
            await db.query(`ALTER TABLE ecommerce_integraciones ADD CONSTRAINT uq_local_plat_shop UNIQUE(id_local, plataforma, shop_domain)`);
        } catch {}

        await db.query(`
            INSERT INTO ecommerce_integraciones (id_local, plataforma, nombre_tienda, shop_domain, access_token, activa)
            VALUES ($1, $2, $3, $4, $5, true)
            ON CONFLICT (id_local, plataforma, shop_domain)
            DO UPDATE SET nombre_tienda=$3, access_token=$5, activa=true, fecha_conexion=NOW()
        `, [idLocal, plataforma, tiendaNombre, domain, credenciales]);

        res.json({ success: true, nombre_tienda: tiendaNombre });
    } catch (err) {
        console.error('Error conectando tienda:', err);
        res.status(500).json({ error: 'Error interno del servidor.' });
    }
});

// POST /api/ecommerce/shopify/conectar — guardar integración Shopify
app.post('/api/ecommerce/shopify/conectar', requireAuth, requireAprobado, async (req, res) => {
    try {
        const idLocal = Number(req.user.id_local);
        const { shop_domain, access_token, nombre_tienda } = req.body;
        if (!shop_domain || !access_token) {
            return res.status(400).json({ error: 'Se requiere shop_domain y access_token.' });
        }
        // Normalizar dominio
        const domain = shop_domain.replace(/^https?:\/\//, '').replace(/\/$/, '');

        // Verificar que la tienda existe antes de guardar
        const verifyRes = await fetch(`https://${domain}/admin/api/2024-01/shop.json`, {
            headers: { 'X-Shopify-Access-Token': access_token }
        });
        if (!verifyRes.ok) {
            return res.status(400).json({ error: 'No se pudo verificar la tienda Shopify. Revisa el dominio y el token.' });
        }
        const shopData = await verifyRes.json();
        const tiendaNombre = nombre_tienda || shopData.shop?.name || domain;

        // Upsert
        await db.query(`
            INSERT INTO ecommerce_integraciones (id_local, plataforma, nombre_tienda, shop_domain, access_token, activa)
            VALUES ($1, 'shopify', $2, $3, $4, true)
            ON CONFLICT (id_local, plataforma, shop_domain)
            DO UPDATE SET access_token=$4, nombre_tienda=$2, activa=true, fecha_conexion=NOW()
        `, [idLocal, tiendaNombre, domain, access_token]);

        // Agregar UNIQUE constraint si no existe (manejo en código, no crashea)
        try {
            await db.query(`ALTER TABLE ecommerce_integraciones ADD CONSTRAINT uq_local_plat_shop UNIQUE(id_local, plataforma, shop_domain)`);
        } catch {}

        res.json({ success: true, nombre_tienda: tiendaNombre });
    } catch (err) {
        console.error('Error conectando Shopify:', err);
        res.status(500).json({ error: 'Error interno del servidor.' });
    }
});

// DELETE /api/ecommerce/integraciones/:id — desconectar
app.delete('/api/ecommerce/integraciones/:id', requireAuth, requireAprobado, requireAdmin, async (req, res) => {
    try {
        const idLocal = Number(req.user.id_local);
        const id = Number(req.params.id);
        await db.query('DELETE FROM ecommerce_integraciones WHERE id=$1 AND id_local=$2', [id, idLocal]);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: 'Error interno del servidor.' });
    }
});

// POST /api/ecommerce/shopify/sync-productos — publicar productos POS en Shopify
app.post('/api/ecommerce/shopify/sync-productos', requireAuth, requireAprobado, requireAdmin, async (req, res) => {
    try {
        const idLocal = Number(req.user.id_local);
        const { integracion_id } = req.body;

        // Obtener credenciales de la integración
        const intR = await db.query(
            'SELECT shop_domain, access_token FROM ecommerce_integraciones WHERE id=$1 AND id_local=$2 AND plataforma=$3',
            [integracion_id, idLocal, 'shopify']
        );
        if (intR.rows.length === 0) return res.status(404).json({ error: 'Integración no encontrada.' });
        const { shop_domain, access_token } = intR.rows[0];

        // Obtener productos del local
        const prodR = await db.query(
            `SELECT p.id_producto, p.nombre_producto, p.precio_venta, p.stock_actual, p.imagen_url,
                    c.nombre_categoria
             FROM productos p
             LEFT JOIN categorias c ON p.id_categoria = c.id_categoria
             WHERE p.id_local=$1 AND p.stock_actual > 0`,
            [idLocal]
        );

        let sincronizados = 0;
        const errores = [];

        for (const prod of prodR.rows) {
            try {
                const shopifyProduct = {
                    product: {
                        title: prod.nombre_producto,
                        product_type: prod.nombre_categoria || 'General',
                        variants: [{
                            price: String(prod.precio_venta),
                            inventory_quantity: prod.stock_actual,
                            inventory_management: 'shopify'
                        }]
                    }
                };

                const r = await fetch(`https://${shop_domain}/admin/api/2024-01/products.json`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'X-Shopify-Access-Token': access_token
                    },
                    body: JSON.stringify(shopifyProduct)
                });

                if (r.ok) sincronizados++;
                else errores.push(`${prod.nombre_producto}: ${r.status}`);
            } catch (e) {
                errores.push(`${prod.nombre_producto}: ${e.message}`);
            }
        }

        res.json({
            success: true,
            total: prodR.rows.length,
            sincronizados,
            errores
        });
    } catch (err) {
        console.error('Error sincronizando con Shopify:', err);
        res.status(500).json({ error: 'Error interno del servidor.' });
    }
});

// POST /api/ecommerce/woocommerce/sync-productos — publicar productos POS en WooCommerce
app.post('/api/ecommerce/woocommerce/sync-productos', requireAuth, requireAprobado, requireAdmin, async (req, res) => {
    try {
        const idLocal = Number(req.user.id_local);
        const { integracion_id } = req.body;

        const intR = await db.query(
            'SELECT shop_domain, access_token FROM ecommerce_integraciones WHERE id=$1 AND id_local=$2 AND plataforma=$3',
            [integracion_id, idLocal, 'woocommerce']
        );
        if (intR.rows.length === 0) return res.status(404).json({ error: 'Integración no encontrada.' });
        const { shop_domain, access_token } = intR.rows[0];
        let creds;
        try { creds = JSON.parse(access_token); } catch { creds = null; }
        if (!creds?.consumer_key || !creds?.consumer_secret) {
            return res.status(400).json({ error: 'La integración WooCommerce no tiene credenciales válidas.' });
        }
        const base = 'https://' + shop_domain;
        const auth = 'Basic ' + Buffer.from(creds.consumer_key + ':' + creds.consumer_secret).toString('base64');

        const prodR = await db.query(
            `SELECT p.id_producto, p.nombre_producto, p.precio_venta, p.stock_actual, p.imagen_url,
                    c.nombre_categoria
             FROM productos p
             LEFT JOIN categorias c ON p.id_categoria = c.id_categoria
             WHERE p.id_local=$1 AND p.stock_actual > 0`,
            [idLocal]
        );

        let sincronizados = 0;
        const errores = [];

        for (const prod of prodR.rows) {
            try {
                const wcProduct = {
                    name: prod.nombre_producto,
                    type: 'simple',
                    regular_price: String(prod.precio_venta),
                    manage_stock: true,
                    stock_quantity: prod.stock_actual,
                    categories: prod.nombre_categoria ? [{ name: prod.nombre_categoria }] : []
                };
                const r = await fetch(`${base}/wp-json/wc/v3/products`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'Authorization': auth },
                    body: JSON.stringify(wcProduct)
                });
                if (r.ok) sincronizados++;
                else errores.push(`${prod.nombre_producto}: ${r.status}`);
            } catch (e) {
                errores.push(`${prod.nombre_producto}: ${e.message}`);
            }
        }

        res.json({ success: true, total: prodR.rows.length, sincronizados, errores });
    } catch (err) {
        console.error('Error sincronizando con WooCommerce:', err);
        res.status(500).json({ error: 'Error interno del servidor.' });
    }
});

// ─────────────────────────────────────────────────────────
// COTIZACIONES (v1.8.0)
// Una cotización es una oferta de precios a un cliente sin
// afectar inventario. Puede convertirse en venta después.
// ─────────────────────────────────────────────────────────
(async () => {
    try {
        await db.query(`
            CREATE TABLE IF NOT EXISTS cotizaciones (
                id_cotizacion SERIAL PRIMARY KEY,
                id_local INTEGER NOT NULL REFERENCES locales(id_local),
                id_cliente INTEGER REFERENCES clientes(id_cliente),
                nombre_cliente VARCHAR(200),
                subtotal NUMERIC(14,2) DEFAULT 0,
                descuento NUMERIC(14,2) DEFAULT 0,
                total NUMERIC(14,2) DEFAULT 0,
                estado VARCHAR(20) DEFAULT 'Pendiente',
                valida_hasta DATE,
                notas TEXT,
                creado_por INTEGER REFERENCES usuarios(id_usuario),
                created_at TIMESTAMP DEFAULT NOW()
            )
        `);
        await db.query(`
            CREATE TABLE IF NOT EXISTS detalle_cotizaciones (
                id_detalle SERIAL PRIMARY KEY,
                id_cotizacion INTEGER NOT NULL REFERENCES cotizaciones(id_cotizacion) ON DELETE CASCADE,
                id_producto INTEGER REFERENCES productos(id_producto),
                nombre_producto VARCHAR(300),
                cantidad INTEGER DEFAULT 1,
                precio_unitario NUMERIC(14,2) DEFAULT 0,
                subtotal NUMERIC(14,2) DEFAULT 0
            )
        `);
        console.log('[v1.8.0] Tablas cotizaciones listas');
    } catch (e) {
        console.error('Error creando tablas de cotizaciones:', e.message);
    }
})();

// POST /api/cotizaciones — crear una cotización con sus items
app.post('/api/cotizaciones', requireAuth, requireAprobado, async (req, res) => {
    const client = await db.connect();
    try {
        const { id_cliente, nombre_cliente, items, descuento = 0, valida_hasta, notas } = req.body;
        if (!items || !Array.isArray(items) || items.length === 0) {
            return res.status(400).json({ error: 'La cotización debe tener al menos un producto.' });
        }
        const idLocal = Number(req.user.id_local);
        const desc = parseFloat(descuento) || 0;

        // Calcular subtotal y total con precios del servidor (no confiar en el cliente)
        let subtotal = 0;
        const itemsFinales = [];
        for (const it of items) {
            const idProd = Number(it.id_producto);
            const cant = Math.max(1, parseInt(it.cantidad) || 1);
            const prod = await client.query(
                'SELECT id_producto, nombre_producto, precio_venta FROM productos WHERE id_producto=$1 AND id_local=$2',
                [idProd, idLocal]
            );
            if (prod.rows.length === 0) {
                return res.status(404).json({ error: 'Producto no encontrado: ' + idProd });
            }
            const precio = parseFloat(prod.rows[0].precio_venta) || 0;
            const sub = precio * cant;
            subtotal += sub;
            itemsFinales.push({
                id_producto: idProd,
                nombre_producto: prod.rows[0].nombre_producto,
                cantidad: cant,
                precio_unitario: precio,
                subtotal: sub
            });
        }
        const total = Math.max(0, subtotal - desc);

        await client.query('BEGIN');
        const ins = await client.query(
            `INSERT INTO cotizaciones (id_local, id_cliente, nombre_cliente, subtotal, descuento, total, estado, valida_hasta, notas, creado_por)
             VALUES ($1,$2,$3,$4,$5,$6,'Pendiente',$7,$8,$9) RETURNING id_cotizacion`,
            [idLocal, id_cliente || null, nombre_cliente || null, subtotal, desc, total, valida_hasta || null, notas || null, req.user.id_usuario]
        );
        const idCot = ins.rows[0].id_cotizacion;
        for (const it of itemsFinales) {
            await client.query(
                `INSERT INTO detalle_cotizaciones (id_cotizacion, id_producto, nombre_producto, cantidad, precio_unitario, subtotal)
                 VALUES ($1,$2,$3,$4,$5,$6)`,
                [idCot, it.id_producto, it.nombre_producto, it.cantidad, it.precio_unitario, it.subtotal]
            );
        }
        await client.query('COMMIT');
        res.json({ success: true, id_cotizacion: idCot, total });
    } catch (err) {
        await client.query('ROLLBACK').catch(() => {});
        console.error('Error creando cotización:', err);
        res.status(500).json({ error: 'Error interno del servidor.' });
    } finally {
        client.release();
    }
});

// GET /api/cotizaciones — listar cotizaciones del local (con filtro por estado)
app.get('/api/cotizaciones', requireAuth, requireAprobado, async (req, res) => {
    try {
        const idLocal = Number(req.user.id_local);
        const { estado } = req.query;
        let sql = `
            SELECT c.id_cotizacion, c.nombre_cliente, c.subtotal, c.descuento, c.total,
                   c.estado, c.valida_hasta, c.notas, c.created_at,
                   COALESCE(cl.nombre_razon_social, c.nombre_cliente) AS cliente_nombre,
                   (SELECT COUNT(*) FROM detalle_cotizaciones d WHERE d.id_cotizacion = c.id_cotizacion) AS num_items
            FROM cotizaciones c
            LEFT JOIN clientes cl ON c.id_cliente = cl.id_cliente
            WHERE c.id_local = $1
        `;
        const params = [idLocal];
        if (estado) {
            params.push(estado);
            sql += ` AND c.estado = $${params.length}`;
        }
        sql += ` ORDER BY c.created_at DESC LIMIT 200`;
        const r = await db.query(sql, params);
        res.json(r.rows);
    } catch (err) {
        console.error('Error listando cotizaciones:', err);
        res.status(500).json({ error: 'Error interno del servidor.' });
    }
});

// GET /api/cotizaciones/:id — detalle con items
app.get('/api/cotizaciones/:id', requireAuth, requireAprobado, async (req, res) => {
    try {
        const idLocal = Number(req.user.id_local);
        const idCot = Number(req.params.id);
        const c = await db.query(
            `SELECT c.*, COALESCE(cl.nombre_razon_social, c.nombre_cliente) AS cliente_nombre
             FROM cotizaciones c LEFT JOIN clientes cl ON c.id_cliente = cl.id_cliente
             WHERE c.id_cotizacion=$1 AND c.id_local=$2`,
            [idCot, idLocal]
        );
        if (c.rows.length === 0) return res.status(404).json({ error: 'Cotización no encontrada.' });
        const items = await db.query(
            'SELECT id_detalle, id_producto, nombre_producto, cantidad, precio_unitario, subtotal FROM detalle_cotizaciones WHERE id_cotizacion=$1 ORDER BY id_detalle',
            [idCot]
        );
        res.json({ ...c.rows[0], items: items.rows });
    } catch (err) {
        console.error('Error en detalle de cotización:', err);
        res.status(500).json({ error: 'Error interno del servidor.' });
    }
});

// PUT /api/cotizaciones/:id — actualizar estado y/o datos
app.put('/api/cotizaciones/:id', requireAuth, requireAprobado, async (req, res) => {
    try {
        const idLocal = Number(req.user.id_local);
        const idCot = Number(req.params.id);
        const { estado, nombre_cliente, valida_hasta, notas } = req.body;
        const estadosValidos = ['Pendiente', 'Aprobada', 'Rechazada', 'Vencida'];
        if (estado && !estadosValidos.includes(estado)) {
            return res.status(400).json({ error: 'Estado inválido.' });
        }
        const c = await db.query('SELECT id_cotizacion FROM cotizaciones WHERE id_cotizacion=$1 AND id_local=$2', [idCot, idLocal]);
        if (c.rows.length === 0) return res.status(404).json({ error: 'Cotización no encontrada.' });
        await db.query(
            `UPDATE cotizaciones SET estado=COALESCE($1, estado), nombre_cliente=COALESCE($2, nombre_cliente),
             valida_hasta=COALESCE($3, valida_hasta), notas=COALESCE($4, notas) WHERE id_cotizacion=$5`,
            [estado || null, nombre_cliente || null, valida_hasta || null, notas || null, idCot]
        );
        res.json({ success: true });
    } catch (err) {
        console.error('Error actualizando cotización:', err);
        res.status(500).json({ error: 'Error interno del servidor.' });
    }
});

// DELETE /api/cotizaciones/:id — eliminar
app.delete('/api/cotizaciones/:id', requireAuth, requireAprobado, async (req, res) => {
    try {
        const idLocal = Number(req.user.id_local);
        const idCot = Number(req.params.id);
        const c = await db.query('SELECT id_cotizacion FROM cotizaciones WHERE id_cotizacion=$1 AND id_local=$2', [idCot, idLocal]);
        if (c.rows.length === 0) return res.status(404).json({ error: 'Cotización no encontrada.' });
        await db.query('DELETE FROM cotizaciones WHERE id_cotizacion=$1', [idCot]);
        res.json({ success: true });
    } catch (err) {
        console.error('Error eliminando cotización:', err);
        res.status(500).json({ error: 'Error interno del servidor.' });
    }
});

// POST /api/cotizaciones/:id/convertir-venta — convierte la cotización en una venta
app.post('/api/cotizaciones/:id/convertir-venta', requireAuth, requireAprobado, async (req, res) => {
    const client = await db.connect();
    try {
        const idLocal = Number(req.user.id_local);
        const idCot = Number(req.params.id);
        const { metodo_pago = 'Efectivo' } = req.body;

        const cot = await client.query(
            'SELECT * FROM cotizaciones WHERE id_cotizacion=$1 AND id_local=$2',
            [idCot, idLocal]
        );
        if (cot.rows.length === 0) return res.status(404).json({ error: 'Cotización no encontrada.' });
        const cotizacion = cot.rows[0];

        const items = await client.query(
            'SELECT id_producto, cantidad, precio_unitario FROM detalle_cotizaciones WHERE id_cotizacion=$1',
            [idCot]
        );

        // Verificar turno abierto
        const turno = await client.query(
            `SELECT id_turno FROM turnos_caja WHERE id_local=$1 AND estado_turno='Abierto' ORDER BY id_turno DESC LIMIT 1`,
            [idLocal]
        );
        if (turno.rows.length === 0) {
            return res.status(400).json({ error: 'No hay un turno de caja abierto. Abre el turno desde el Dashboard.' });
        }
        const idTurno = turno.rows[0].id_turno;

        await client.query('BEGIN');

        // Verificar stock y descontar
        for (const it of items.rows) {
            const prod = await client.query('SELECT stock_actual FROM productos WHERE id_producto=$1 AND id_local=$2', [it.id_producto, idLocal]);
            if (prod.rows.length === 0) {
                await client.query('ROLLBACK').catch(() => {});
                return res.status(404).json({ error: 'Producto no encontrado.' });
            }
            if (parseInt(prod.rows[0].stock_actual) < parseInt(it.cantidad)) {
                await client.query('ROLLBACK').catch(() => {});
                return res.status(400).json({ error: 'Stock insuficiente para uno de los productos.' });
            }
            await client.query('UPDATE productos SET stock_actual = stock_actual - $1 WHERE id_producto=$2', [it.cantidad, it.id_producto]);
        }

        const venta = await client.query(
            `INSERT INTO ventas (id_usuario, id_local, id_cliente, id_turno, subtotal, descuento_total, impuestos, total_neto, metodo_pago, estado_factura, fecha_venta)
             VALUES ($1,$2,$3,$4,$5,$6,0,$7,$8,'Local',(NOW() AT TIME ZONE 'America/Bogota')) RETURNING id_venta`,
            [req.user.id_usuario, idLocal, cotizacion.id_cliente, idTurno, cotizacion.subtotal, cotizacion.descuento, cotizacion.total, metodo_pago]
        );
        const idVenta = venta.rows[0].id_venta;

        for (const it of items.rows) {
            await client.query(
                `INSERT INTO detalle_ventas (id_venta, id_producto, cantidad, precio_unitario_cobrado, descuento_aplicado, subtotal)
                 VALUES ($1,$2,$3,$4,0,$5)`,
                [idVenta, it.id_producto, it.cantidad, it.precio_unitario, parseFloat(it.precio_unitario) * parseInt(it.cantidad)]
            );
        }

        // Marcar la cotización como aprobada
        await client.query(`UPDATE cotizaciones SET estado='Aprobada' WHERE id_cotizacion=$1`, [idCot]);

        await client.query('COMMIT');
        res.json({ success: true, id_venta: idVenta });
    } catch (err) {
        await client.query('ROLLBACK').catch(() => {});
        console.error('Error convirtiendo cotización en venta:', err);
        res.status(500).json({ error: 'Error interno del servidor.' });
    } finally {
        client.release();
    }
});

// =====================================================
// v1.5.6: ERROR HANDLER GLOBAL
// =====================================================
// Centraliza el manejo de errores de Express (multer, JSON malformado, CORS,
// rutas no encontradas, y cualquier error no capturado por los handlers).
// NUNCA filtra detalles internos (stack traces, SQL, rutas) al cliente.
app.use((err, req, res, next) => {
    // Errores de multer (tamaño de archivo, tipo no permitido)
    if (err instanceof multer.MulterError) {
        const msg = err.code === 'LIMIT_FILE_SIZE'
            ? 'El archivo supera el tamaño máximo de 5 MB.'
            : 'Error subiendo el archivo.';
        return res.status(400).json({ error: msg });
    }
    // Error de multer lanzado por fileFilter (extensión no permitida)
    if (err && err.message && err.message.includes('Solo se permiten imágenes')) {
        return res.status(400).json({ error: err.message });
    }
    // JSON malformado en el body
    if (err && err.type === 'entity.parse.failed') {
        return res.status(400).json({ error: 'JSON inválido en la solicitud.' });
    }
    // CORS: el mensaje de origen no permitido es seguro de mostrar
    if (err && err.message && err.message.startsWith('Origen no permitido')) {
        return res.status(403).json({ error: err.message });
    }
    // Cualquier otro error: log interno detallado + respuesta genérica
    console.error(`[ErrorHandler] ${req.method} ${req.originalUrl}:`, err);
    res.status(err.status || 500).json({ error: 'Error interno del servidor.' });
});

// 404 para rutas no definidas (después de todas las rutas)
app.use((req, res) => {
    res.status(404).json({ error: 'Ruta no encontrada.' });
});

const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || '0.0.0.0';
app.listen(PORT, HOST, () => {
    console.log(`Backend server running on http://${HOST}:${PORT}`);
    console.log(`   Local:    http://localhost:${PORT}`);
    console.log(`   Network:  http://0.0.0.0:${PORT}`);
    console.log(`   Health:   http://localhost:${PORT}/api/health`);
});
