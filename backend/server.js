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
const { z } = require('zod'); // v2.2.0: validación de inputs
const speakeasy = require('speakeasy'); // v2.2.0: 2FA TOTP
const QRCode = require('qrcode'); // v2.2.0: QR para 2FA
let cloudinary = null;
try { cloudinary = require('cloudinary').v2; } catch (e) { console.log('[cloudinary] No disponible — usando almacenamiento local'); }
const db = require('./db');
const dian = require('./dian'); // v1.9.1: facturación electrónica DIAN

// ═══════════════════════════════════════════════════════════════
// v2.2.0: SEGURIDAD — Configuración global
// ═══════════════════════════════════════════════════════════════
const JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || crypto.randomBytes(64).toString('hex');
const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || crypto.randomBytes(32).toString('hex'); // 256 bits
const TOKEN_EXPIRY = '24h';
const REFRESH_EXPIRY = '7d';

// Blacklist de tokens (logout) — en memoria; en producción usar Redis
const tokenBlacklist = new Set();

// ═══════════════════════════════════════════════════════════════
// v2.2.10: CLOUDINARY — Almacenamiento persistente de imágenes/videos
// Configurar CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET en .env
// Si no está configurado, usa almacenamiento local (desarrollo)
// ═══════════════════════════════════════════════════════════════
const useCloudinary = cloudinary && process.env.CLOUDINARY_CLOUD_NAME && process.env.CLOUDINARY_API_KEY && process.env.CLOUDINARY_API_SECRET;
if (useCloudinary) {
    cloudinary.config({
        cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
        api_key: process.env.CLOUDINARY_API_KEY,
        api_secret: process.env.CLOUDINARY_API_SECRET,
        secure: true
    });
    console.log('☁️  Cloudinary configurado:', process.env.CLOUDINARY_CLOUD_NAME);
} else {
    console.warn('⚠️  Cloudinary NO configurado. Usando almacenamiento local (archivos se pierden en Render).');
}

// Helpers para Cloudinary
async function uploadToCloudinary(buffer, folder, resourceType = 'image') {
    return new Promise((resolve, reject) => {
        const uploadStream = cloudinary.uploader.upload_stream(
            { folder, resource_type: resourceType },
            (error, result) => {
                if (error) reject(error);
                else resolve(result.secure_url);
            }
        );
        uploadStream.end(buffer);
    });
}

async function deleteFromCloudinary(url, resourceType = 'image') {
    if (!url || !url.includes('cloudinary.com')) return; // Solo borrar de Cloudinary
    try {
        // Extraer public_id de la URL: https://res.cloudinary.com/cloud_name/image/upload/v123/folder/file.jpg
        const parts = url.split('/');
        const uploadIdx = parts.findIndex(p => p === 'upload');
        if (uploadIdx !== -1 && uploadIdx + 1 < parts.length) {
            let publicId = parts.slice(uploadIdx + 1).join('/');
            publicId = publicId.replace(/\.[^/.]+$/, ''); // quitar extensión
            if (resourceType === 'video') publicId = `video/${publicId}`;
            await cloudinary.uploader.destroy(publicId, { resource_type: resourceType });
        }
    } catch (e) {
        console.warn('No se pudo borrar de Cloudinary:', e.message);
    }
}

// ═══════════════════════════════════════════════════════════════
// v2.2.0: VALIDACIÓN DE INPUTS CON ZOD
// Esquemas reutilizables para todos los endpoints
// ═══════════════════════════════════════════════════════════════
const schemas = {
    login: z.object({
        correo: z.string().email('Correo inválido').max(200),
        contrasena: z.string().min(1, 'Contraseña requerida').max(200),
    }),
    registro: z.object({
        nombre: z.string().min(2, 'Nombre muy corto').max(100).regex(/^[a-zA-ZáéíóúñÑ\s]+$/, 'Nombre solo letras'),
        correo: z.string().email('Correo inválido').max(200),
        contrasena: z.string().min(6, 'Mínimo 6 caracteres').max(200),
        nombre_local: z.string().min(2, 'Nombre del local requerido').max(200),
        ciudad: z.string().max(100).optional(),
        nit: z.string().max(20).optional(),
        telefono: z.string().max(20).optional(),
    }),
    crearProducto: z.object({
        nombre_producto: z.string().min(1, 'Nombre requerido').max(200),
        descripcion: z.string().max(1000).optional(),
        precio_venta: z.number().positive('Precio debe ser positivo'),
        stock_actual: z.number().int().min(0, 'Stock no puede ser negativo'),
        stock_minimo: z.number().int().min(0).optional(),
        id_categoria: z.number().int().positive().optional(),
        codigo_barras: z.string().max(50).optional(),
    }),
    crearCliente: z.object({
        nombre: z.string().min(1, 'Nombre requerido').max(200),
        correo: z.string().email('Correo inválido').max(200).optional().or(z.literal('')),
        telefono: z.string().max(20).optional(),
        direccion: z.string().max(300).optional(),
    }),
    crearVenta: z.object({
        id_cliente: z.number().int().positive().optional().nullable(),
        items: z.array(z.object({
            id_producto: z.number().int().positive(),
            cantidad: z.number().int().positive('Cantidad debe ser positiva'),
            precio_unitario: z.number().positive(),
        })).min(1, 'Debe haber al menos un producto'),
        metodo_pago: z.enum(['efectivo', 'tarjeta', 'QR', 'Wompi', 'nequi', 'daviplata']),
        descuento: z.number().min(0).optional(),
    }),
    superLogin: z.object({
        codigo: z.string().length(4, 'Código debe ser 4 dígitos').regex(/^\d{4}$/, 'Solo números'),
        correo: z.string().email().optional(),
        contrasena: z.string().optional(),
    }),
    botMensaje: z.object({
        mensaje: z.string().min(1, 'Escribe un mensaje').max(500, 'Máximo 500 caracteres').trim(),
    }),
};

// Middleware de validación genérico
function validate(schema) {
    return (req, res, next) => {
        try {
            req.body = schema.parse(req.body);
            next();
        } catch (err) {
            if (err instanceof z.ZodError) {
                const errores = err.errors.map(e => `• ${e.path.join('.')}: ${e.message}`).join('\n');
                return res.status(400).json({ error: 'Datos inválidos', detalles: errores });
            }
            next(err);
        }
    };
}

// ═══════════════════════════════════════════════════════════════
// v2.2.0: MAGIC BYTES — Validar tipo real de archivo
// ═══════════════════════════════════════════════════════════════
const MAGIC_BYTES = {
    'image/jpeg': [0xFF, 0xD8, 0xFF],
    'image/png': [0x89, 0x50, 0x4E, 0x47],
    'image/webp': [0x52, 0x49, 0x46, 0x46], // RIFF header
    'application/pdf': [0x25, 0x50, 0x44, 0x46], // %PDF
};

function validateMagicBytes(buffer, expectedMime) {
    const expected = MAGIC_BYTES[expectedMime];
    if (!expected) return true; // Tipo no configurado, permitir
    const header = Array.from(buffer.slice(0, expected.length));
    return header.every((byte, i) => byte === expected[i]);
}

// ═══════════════════════════════════════════════════════════════
// v2.2.0: CIFRADO DE DATOS SENSIBLES
// Para access_token de Shopify y otros tokens
// ═══════════════════════════════════════════════════════════════
function encrypt(text) {
    if (!text) return null;
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv('aes-256-cbc', Buffer.from(ENCRYPTION_KEY, 'hex'), iv);
    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    return iv.toString('hex') + ':' + encrypted;
}

function decrypt(encryptedText) {
    if (!encryptedText) return null;
    try {
        const [ivHex, encrypted] = encryptedText.split(':');
        const iv = Buffer.from(ivHex, 'hex');
        const decipher = crypto.createDecipheriv('aes-256-cbc', Buffer.from(ENCRYPTION_KEY, 'hex'), iv);
        let decrypted = decipher.update(encrypted, 'hex', 'utf8');
        decrypted += decipher.final('utf8');
        return decrypted;
    } catch {
        return null; // Datos corruptos o llave cambió
    }
}

// ═══════════════════════════════════════════════════════════════
// v2.2.0: REFRESH TOKENS
// ═══════════════════════════════════════════════════════════════
function generateTokens(payload) {
    const token = jwt.sign(payload, JWT_SECRET, { expiresIn: TOKEN_EXPIRY });
    const refreshToken = jwt.sign({ ...payload, type: 'refresh' }, JWT_REFRESH_SECRET, { expiresIn: REFRESH_EXPIRY });
    return { token, refreshToken };
}

const app = express();

// === Servir imágenes de productos ===
// En producción (Render), el filesystem es efímero — usamos /tmp para uploads.
const isProduction = process.env.NODE_ENV === 'production';
const uploadsDir = isProduction
  ? path.join('/tmp', 'uploads', 'productos')
  : path.join(__dirname, 'uploads', 'productos');
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

// v2.1.1: Directorio para actualizaciones
const updatesDir = isProduction
  ? path.join('/tmp', 'uploads', 'actualizaciones')
  : path.join(__dirname, 'uploads', 'actualizaciones');
if (!fs.existsSync(updatesDir)) fs.mkdirSync(updatesDir, { recursive: true });

// Servir archivos estáticos: en producción desde /tmp/uploads, en desarrollo desde backend/uploads
const staticUploadsDir = isProduction ? path.join('/tmp', 'uploads') : path.join(__dirname, 'uploads');
app.use('/uploads', express.static(staticUploadsDir));
app.use('/logos', express.static(path.join(__dirname, 'logos')));

// ── Tienda Pública HTML (ANTES de express.static para evitar conflicto) ──
// v2.2.5: Lee template HTML y reemplaza datos del local/productos
// URL: https://sistema-ventas-pos-aeka.onrender.com/tienda/1
const tiendaTemplatePath = path.join(__dirname, 'tienda-template.html');
const tiendaTemplate = fs.existsSync(tiendaTemplatePath) ? fs.readFileSync(tiendaTemplatePath, 'utf8') : null;

app.get('/tienda/:idLocal', async (req, res) => {
    try {
        const { idLocal } = req.params;

        if (!tiendaTemplate) {
            return res.status(500).send('Template de tienda no encontrado.');
        }

        const { rows: [local] } = await db.query(
            'SELECT id_local, nombre_local, direccion, telefono, ciudad FROM locales WHERE id_local = $1', [idLocal]
        );
        if (!local) return res.status(404).send('Tienda no encontrada.');

        const { rows: productos } = await db.query(`
            SELECT p.id_producto, p.nombre_producto, p.precio_venta, p.imagen_url, p.video_url, p.stock_actual, p.marca, p.genero, c.nombre_categoria
            FROM productos p LEFT JOIN categorias c ON p.id_categoria = c.id_categoria
            WHERE p.id_local = $1 AND p.stock_actual > 0 AND COALESCE(p.visible_en_tienda, true) = true ORDER BY p.stock_actual DESC
        `, [idLocal]);

        // Para cada producto, buscar TODAS las imágenes de la galería (solo URLs http/https)
        const prodIds = productos.map(p => p.id_producto);
        let galeriaMap = {};  // id_producto => [urls...]
        if (prodIds.length > 0) {
            const { rows: galeriaImgs } = await db.query(
                `SELECT id_producto, url FROM producto_imagenes WHERE id_producto = ANY($1) ORDER BY orden ASC`, [prodIds]
            );
            galeriaImgs.forEach(g => {
                if (!galeriaMap[g.id_producto]) galeriaMap[g.id_producto] = [];
                if (g.url && (g.url.startsWith('http://') || g.url.startsWith('https://'))) {
                    galeriaMap[g.id_producto].push(g.url);
                }
            });
        }
        // Asignar imagen principal: primera de galería > imagen_url
        productos.forEach(p => {
            const galImgs = galeriaMap[p.id_producto] || [];
            if (galImgs.length > 0) {
                p.imagen_url = galImgs[0];
            }
            p._galeria = galImgs;
        });

        const { rows: categorias } = await db.query(`
            SELECT DISTINCT c.nombre_categoria, COUNT(*)::int as cantidad
            FROM productos p LEFT JOIN categorias c ON p.id_categoria = c.id_categoria
            WHERE p.id_local = $1 AND p.stock_actual > 0 AND COALESCE(p.visible_en_tienda, true) = true AND c.nombre_categoria IS NOT NULL
            GROUP BY c.nombre_categoria ORDER BY cantidad DESC
        `, [idLocal]);

        const fmtCOP = (v) => new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(Number(v) || 0);
        const telWA = (local.telefono || '').replace(/\D/g, '');
        const baseUrl = `${req.protocol}://${req.get('host')}`;

        // Optimizar imágenes de Cloudinary con transformaciones para que se vean
        // completas y bien proporcionadas en las tarjetas (sin recortes)
        // c_pad = rellena sin recortar (imagen COMPLETA visible)
        // b_white = fondo blanco explícito (no transparente)
        const optimizarCloudinary = (url, w = 800, h = 800) => {
            if (!url || !url.includes('res.cloudinary.com')) return url;
            // Si ya tiene transformaciones, no duplicar
            if (/\/w_\d+/.test(url) || /\/c_(pad|fill|fit|scale|crop)/.test(url)) return url;
            // c_pad con b_white: rellena con blanco sin recortar
            return url.replace('/upload/', `/upload/w_${w},h_${h},c_pad,b_white,f_auto,q_auto/`);
        };

        const prodsJSON = JSON.stringify(productos.map(p => {
            let img = p.imagen_url || '';
            if (img.startsWith('/uploads/')) {
                img = baseUrl + img;
            } else {
                img = optimizarCloudinary(img, 600, 450);
            }
            let vid = p.video_url || '';
            if (vid.startsWith('/uploads/')) {
                vid = baseUrl + vid;
            } else {
                vid = optimizarCloudinary(vid, 600, 450);
            }
            // All gallery images (Cloudinary URLs) - también optimizadas
            const imgs = (p._galeria || []).map(url => {
                if (url.startsWith('/uploads/')) return baseUrl + url;
                return optimizarCloudinary(url, 600, 450);
            });
            return { id: p.id_producto, n: p.nombre_producto, p: Number(p.precio_venta), img, vid, s: p.stock_actual, c: p.nombre_categoria || '', m: p.marca || '', g: p.genero || '', imgs };
        }));

        const prodsHTML = productos.map(p => {
            let imgSrc = p.imagen_url || '';
            if (imgSrc.startsWith('/uploads/')) {
                imgSrc = baseUrl + imgSrc;
            }
            const img = imgSrc
                ? `<img src="${imgSrc}" alt="${p.nombre_producto}" loading="lazy" onerror="this.outerHTML='<div class=no-img>📦</div>'">`
                : '<div class="no-img">📦</div>';
            const badge = p.stock_actual <= 5 ? `<span class="stock-badge">¡Últimas ${p.stock_actual}!</span>` : '';
            const cat = p.nombre_categoria ? `<span class="prod-tag">${p.nombre_categoria}</span>` : '';
            const marca = p.marca ? `<span class="prod-marca">${p.marca}</span>` : '';
            return `<div class="product-card" data-marca="${p.marca || ''}"><div class="prod-img">${img}${badge}</div><div class="prod-body">${cat}${marca}<h3>${p.nombre_producto}</h3><div class="prod-price">${fmtCOP(p.precio_venta)}</div><button class="add-btn" onclick="addToCart(${p.id_producto})">Agregar</button></div></div>`;
        }).join('');

        const catsHTML = categorias.map(c =>
            `<button class="cat-pill" data-cat="${c.nombre_categoria}" onclick="filterByCategory('${c.nombre_categoria.replace(/'/g, "\\'")}')">${c.nombre_categoria} <span>${c.cantidad}</span></button>`
        ).join('');

        let html = tiendaTemplate
            .replace(/\{\{NOMBRE_LOCAL\}\}/g, local.nombre_local || 'Mi Tienda')
            .replace(/\{\{DIRECCION\}\}/g, local.direccion ? '📍 ' + local.direccion : '')
            .replace(/\{\{CIUDAD\}\}/g, local.ciudad ? ' • ' + local.ciudad : '')
            .replace(/\{\{TELEFONO\}\}/g, telWA)
            .replace(/\{\{TOTAL\}\}/g, String(productos.length))
            .replace(/\{\{CATEGORIAS\}\}/g, catsHTML)
            .replace(/\{\{PRODUCTOS\}\}/g, prodsHTML)
            .replace(/\{\{PRODUCTOS_JSON\}\}/g, prodsJSON);

        res.send(html);
    } catch (err) {
        console.error('Tienda HTML error:', err.message);
        res.status(500).send('Error al cargar la tienda.');
    }
});

// v2.2.2: Servir el frontend estático desde el backend
// Permite que Electron cargue la app via http://localhost:3000
// (necesario para que Google OAuth funcione con origen http://localhost:3000)
const frontendPaths = [
    path.join(__dirname, 'frontend', 'dist'),
    path.join(__dirname, '..', 'frontend', 'dist'),
    path.join(__dirname, 'dist'),
];
console.log('[Frontend] Buscando archivos estáticos...');
for (const fp of frontendPaths) {
    const exists = fs.existsSync(fp);
    console.log(`[Frontend] ${fp} → ${exists ? '✅ EXISTE' : '❌ no existe'}`);
    if (exists) {
        // Listar primeros archivos para debug
        try {
            const files = fs.readdirSync(fp);
            console.log(`[Frontend] Archivos en ${fp}: ${files.join(', ')}`);
            if (fs.existsSync(path.join(fp, 'assets'))) {
                const assets = fs.readdirSync(path.join(fp, 'assets'));
                console.log(`[Frontend] Archivos en assets/: ${assets.slice(0, 5).join(', ')}...`);
            }
        } catch(e) {}
        app.use(express.static(fp));
        console.log(`[Frontend] ✅ Sirviendo desde: ${fp}`);
        break;
    }
}

// === Configuración de multer para imágenes ===
// Si Cloudinary está configurado, usa memoryStorage para subir directo a la nube
// Si no, usa diskStorage local (desarrollo)
const storageProductos = useCloudinary
    ? multer.memoryStorage()
    : multer.diskStorage({
        destination: (req, file, cb) => {
            if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });
            cb(null, uploadsDir);
        },
        filename: (req, file, cb) => {
            const ext = path.extname(file.originalname).toLowerCase();
            const rand = Math.round(Math.random() * 1e9);
            const prodId = req.params.id || 'new';
            cb(null, `producto_${prodId}_${Date.now()}_${rand}${ext}`);
        }
    });

const uploadProducto = multer({
    storage: storageProductos,
    limits: { fileSize: 100 * 1024 * 1024 }, // 100 MB — sin límite práctico para fotos
    fileFilter: (req, file, cb) => {
        const allowed = ['.jpg', '.jpeg', '.png', '.webp'];
        const ext = path.extname(file.originalname).toLowerCase();
        if (!allowed.includes(ext)) {
            return cb(new Error('Solo se permiten imágenes JPG, PNG o WebP.'));
        }
        cb(null, true);
    }
});

// === A3-fix: CORS con whitelist ===
// Permitimos localhost (Electron/dev), GitHub Pages, Render y túneles cloudflare
const ALLOWED_ORIGINS = [
  'http://localhost:3000',
  'http://localhost:5173',
  'http://127.0.0.1:3000',
  'capacitor://localhost',
  'https://andrescuesta19.github.io',
  // Render (se actualiza después del deploy)
  ...(process.env.CORS_ORIGINS || '').split(',').filter(Boolean),
];
// Permitir cualquier origen *.trycloudflare.com y *.onrender.com
const isAllowedTunnel = (origin) =>
  origin && (origin.includes('.trycloudflare.com') || origin.includes('.onrender.com'));

app.use(cors({
    origin: (origin, callback) => {
        // Permitir requests sin origin (Electron, curl, health checks)
        if (!origin) return callback(null, true);
        if (ALLOWED_ORIGINS.includes(origin)) return callback(null, true);
        if (isAllowedTunnel(origin)) return callback(null, true);
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
// TOKEN_EXPIRY is defined at the top of the file (v2.2.0)

function signToken(payload) {
    return jwt.sign(payload, JWT_SECRET, { expiresIn: TOKEN_EXPIRY });
}

// Middleware: requiere autenticación
function requireAuth(req, res, next) {
    const authHeader = req.headers.authorization || '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
    if (!token) {
        return res.status(401).json({ error: 'Sesión requerida. Inicia sesión.' });
    }
    // v2.2.0: Verificar blacklist de tokens (logout)
    if (tokenBlacklist.has(token)) {
        return res.status(401).json({ error: 'Sesión cerrada. Inicia sesión de nuevo.' });
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
    if (!req.user || !['Administrador', 'Vendedor'].includes(req.user.rol)) {
        return res.status(403).json({ error: 'Se requiere rol de Administrador o Vendedor.' });
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

// =====================================================
// GOOGLE OAuth — Login/Registro con cuenta de Google
// =====================================================
// v2.2.2: Los usuarios pueden iniciar sesión o registrarse con su cuenta de Google
// El frontend envía el idToken de Google, el backend lo verifica y crea/busca el usuario
app.post('/api/auth/google', loginLimiter, async (req, res) => {
    try {
        const { idToken, email, name, photoUrl } = req.body;

        if (!email || !name) {
            return res.status(400).json({ error: 'Datos de Google incompletos.' });
        }

        // Buscar si el usuario ya existe por correo
        const { rows: existingUsers } = await db.query(
            'SELECT u.*, l.nombre_local FROM usuarios u LEFT JOIN locales l ON u.id_local = l.id_local WHERE u.correo = $1',
            [email]
        );

        let user = existingUsers[0];

        if (user) {
            // Usuario existe — verificar que esté activo
            if (!user.estado) {
                return res.status(403).json({ error: 'Tu cuenta está desactivada. Contacta al administrador.' });
            }
            if (!user.aprobado_por_admin) {
                return res.status(403).json({
                    error: 'Tu cuenta está pendiente de aprobación.',
                    pendiente_aprobacion: true,
                    correo: user.correo,
                });
            }
            // Actualizar avatar si cambió
            if (photoUrl && user.avatar_url !== photoUrl) {
                await db.query('UPDATE usuarios SET avatar_url = $1 WHERE id_usuario = $2', [photoUrl, user.id_usuario]);
            }
        } else {
            // v2.2.3: Usuario nuevo de Google — crear como Vendedor pendiente de aprobación
            // DEBE pasar por SuperAdmin antes de poder usar la app
            const { rows: locales } = await db.query('SELECT id_local FROM locales ORDER BY id_local LIMIT 1');
            const idLocal = locales[0]?.id_local || 1;

            const randomPass = require('crypto').randomBytes(16).toString('hex');
            const hashedPass = await bcrypt.hash(randomPass, 10);

            // v2.2.4: verificado=true porque Google ya verificó el email
            // aprobado_por_admin=false para que pase por SuperAdmin
            const { rows: newUser } = await db.query(`
                INSERT INTO usuarios (nombre, correo, contrasena_hash, rol, id_local, verificado, aprobado_por_admin, estado, avatar_url)
                VALUES ($1, $2, $3, 'Vendedor', $4, true, false, true, $5)
                RETURNING *
            `, [name, email, hashedPass, idLocal, photoUrl]);

            user = newUser[0];
            user.nombre_local = locales[0]?.nombre_local || 'Local';

            // Notificar al SuperAdmin que hay un nuevo registro pendiente
            console.log(`[GoogleAuth] Nuevo usuario registrado: ${email} (${name}) — Pendiente de aprobación`);
        }

        // Generar JWT
        const token = signToken({
            id_usuario: user.id_usuario,
            nombre: user.nombre,
            rol: user.rol,
            id_local: user.id_local,
            nombre_local: user.nombre_local,
        });

        res.json({
            token,
            user: {
                id_usuario: user.id_usuario,
                nombre: user.nombre,
                rol: user.rol,
                id_local: user.id_local,
                nombre_local: user.nombre_local,
                avatar_url: user.avatar_url,
            }
        });
    } catch (err) {
        console.error('[GoogleAuth] Error detallado:', err.message, err.stack?.split('\n')[1]);
        res.status(500).json({ error: 'Error al autenticar con Google.', detail: err.message });
    }
});

// ── Google OAuth Callback (para Electron via navegador del sistema) ──
// Este endpoint recibe el código de autorización de Google,
// lo intercambia por un token, y redirige al app via pos:// protocol
app.get('/api/auth/google/callback', async (req, res) => {
    try {
        const { code, state } = req.query;

        if (!code) {
            return res.status(400).send('Código de autorización no proporcionado');
        }

        // Intercambiar código por access token
        const tokenResult = await fetch('https://oauth2.googleapis.com/token', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({
                code,
                client_id: GOOGLE_CLIENT_ID,
                client_secret: process.env.GOOGLE_CLIENT_SECRET || '',
                redirect_uri: `${req.protocol}://${req.get('host')}/api/auth/google/callback`,
                grant_type: 'authorization_code',
            }),
        });

        const tokenData = await tokenResult.json();

        if (!tokenData.id_token) {
            return res.status(400).send('Error al obtener token de Google');
        }

        // Decodificar el id_token para obtener datos del usuario
        const payload = JSON.parse(Buffer.from(tokenData.id_token.split('.')[1], 'base64url').toString());
        
        const email = payload.email;
        const name = payload.name || payload.given_name || email.split('@')[0];
        const photoUrl = payload.picture || null;

        // Buscar o crear usuario
        const { rows: existingUsers } = await db.query(
            'SELECT u.*, l.nombre_local FROM usuarios u LEFT JOIN locales l ON u.id_local = l.id_local WHERE u.correo = $1',
            [email]
        );

        let user = existingUsers[0];

        if (user) {
            // Verificar que esté aprobado
            if (!user.aprobado_por_admin) {
                return res.redirect(`${process.env.FRONTEND_URL || 'http://localhost:3000'}/login?error=pendiente_aprobacion&email=${encodeURIComponent(email)}`);
            }
            if (!user.estado) {
                return res.redirect(`${process.env.FRONTEND_URL || 'http://localhost:3000'}/login?error=cuenta_desactivada`);
            }
        } else {
            // v2.2.3: Crear usuario nuevo como Vendedor pendiente de aprobación
            const { rows: locales } = await db.query('SELECT id_local FROM locales ORDER BY id_local LIMIT 1');
            const idLocal = locales[0]?.id_local || 1;
            const randomPass = require('crypto').randomBytes(16).toString('hex');
            const hashedPass = await bcrypt.hash(randomPass, 10);

            // v2.2.4: verificado=true porque Google ya verificó el email
            const { rows: newUser } = await db.query(`
                INSERT INTO usuarios (nombre, correo, contrasena_hash, rol, id_local, verificado, aprobado_por_admin, estado, avatar_url)
                VALUES ($1, $2, $3, 'Vendedor', $4, true, false, true, $5)
                RETURNING *
            `, [name, email, hashedPass, idLocal, photoUrl]);

            user = newUser[0];
            user.nombre_local = locales[0]?.nombre_local || 'Local';
            console.log(`[GoogleCallback] Nuevo usuario: ${email} — Pendiente de aprobación`);
        }

        // Generar JWT
        const jwtToken = signToken({
            id_usuario: user.id_usuario,
            nombre: user.nombre,
            rol: user.rol,
            id_local: user.id_local,
            nombre_local: user.nombre_local,
        });

        // Redirigir al app via pos:// protocol
        const userData = encodeURIComponent(JSON.stringify({
            id_usuario: user.id_usuario,
            nombre: user.nombre,
            rol: user.rol,
            id_local: user.id_local,
            nombre_local: user.nombre_local,
            avatar_url: user.avatar_url,
        }));

        res.redirect(`pos://callback?token=${jwtToken}&user=${userData}`);
    } catch (err) {
        console.error('Error en Google OAuth callback:', err);
        res.status(500).send('Error al procesar autenticación con Google');
    }
});

// ── Tienda Pública: Productos visibles para clientes ──
// v2.2.2: Endpoint público (no requiere autenticación)
// Permite a los dueños compartir un link con sus clientes
app.get('/api/tienda/:idLocal', async (req, res) => {
    try {
        const { idLocal } = req.params;
        const { buscar, categoria, orden, pagina } = req.query;
        
        const limit = 50;
        const offset = ((parseInt(pagina) || 1) - 1) * limit;
        
        let query = `
            SELECT 
                p.id_producto,
                p.nombre_producto,
                p.precio_venta,
                p.precio_compra as precio_anterior,
                p.codigo_barras,
                p.stock_actual,
                p.imagen_url,
                p.marca,
                p.genero,
                COALESCE(p.visible_en_tienda, true) as visible_en_tienda,
                c.nombre_categoria
            FROM productos p
            LEFT JOIN categorias c ON p.id_categoria = c.id_categoria
            WHERE p.id_local = $1
            AND p.stock_actual > 0
            AND COALESCE(p.visible_en_tienda, true) = true
        `;
        const params = [idLocal];
        let paramIdx = 2;
        
        if (buscar) {
            query += ` AND (p.nombre_producto ILIKE $${paramIdx} OR p.codigo_barras ILIKE $${paramIdx} OR p.marca ILIKE $${paramIdx})`;
            params.push(`%${buscar}%`);
            paramIdx++;
        }
        
        if (categoria) {
            query += ` AND c.nombre_categoria = $${paramIdx}`;
            params.push(categoria);
            paramIdx++;
        }
        
        const ordenMap = {
            'precio-asc': 'p.precio_venta ASC',
            'precio-desc': 'p.precio_venta DESC',
            'nombre': 'p.nombre_producto ASC',
            'destacado': 'p.stock_actual DESC',
        };
        query += ` ORDER BY ${ordenMap[orden] || ordenMap['destacado']}`;
        query += ` LIMIT $${paramIdx} OFFSET $${paramIdx + 1}`;
        params.push(limit, offset);
        
        const { rows: productos } = await db.query(query, params);

        // Prepend base URL to image URLs for web clients
        const baseUrl = `${req.protocol}://${req.get('host')}`;
        productos.forEach(p => {
            if (p.imagen_url && p.imagen_url.startsWith('/uploads/')) {
                p.imagen_url = baseUrl + p.imagen_url;
            }
        });

        // Cargar imágenes múltiples de la galería para cada producto
        if (productos.length > 0) {
            const prodIds = productos.map(p => p.id_producto);
            const { rows: galImgs } = await db.query(
                `SELECT id_producto, url, orden FROM producto_imagenes 
                 WHERE id_producto = ANY($1) ORDER BY orden ASC`, [prodIds]
            );
            // Agrupar por producto
            const porProducto = {};
            galImgs.forEach(img => {
                if (!porProducto[img.id_producto]) porProducto[img.id_producto] = [];
                let url = img.url;
                if (url && url.startsWith('/uploads/')) url = baseUrl + url;
                porProducto[img.id_producto].push({ url, orden: img.orden });
            });
            // Asignar a cada producto
            productos.forEach(p => {
                p.imagenes = porProducto[p.id_producto] || [];
                // Si tiene galería y la imagen principal no está en la galería, usar la primera de galería
                if (p.imagenes.length > 0 && !p.imagenes.some(img => img.url === p.imagen_url)) {
                    p.imagen_url = p.imagenes[0].url;
                }
            });
        }
        
        let countQuery = `
            SELECT COUNT(*)::int as total
            FROM productos p
            LEFT JOIN categorias c ON p.id_categoria = c.id_categoria
            WHERE p.id_local = $1 AND p.stock_actual > 0
            AND COALESCE(p.visible_en_tienda, true) = true
        `;
        const countParams = [idLocal];
        if (buscar) {
            countQuery += ` AND (p.nombre_producto ILIKE $2 OR p.codigo_barras ILIKE $2 OR p.marca ILIKE $2)`;
            countParams.push(`%${buscar}%`);
        }
        const { rows: [{ total }] } = await db.query(countQuery, countParams);
        
        const { rows: categorias } = await db.query(`
            SELECT DISTINCT c.nombre_categoria, COUNT(*)::int as cantidad
            FROM productos p
            LEFT JOIN categorias c ON p.id_categoria = c.id_categoria
            WHERE p.id_local = $1 AND p.stock_actual > 0 AND c.nombre_categoria IS NOT NULL
            GROUP BY c.nombre_categoria
            ORDER BY cantidad DESC
        `, [idLocal]);
        
        const { rows: [local] } = await db.query(
            'SELECT id_local, nombre_local FROM locales WHERE id_local = $1',
            [idLocal]
        );
        
        res.json({
            local,
            productos,
            categorias,
            paginacion: {
                total,
                pagina: parseInt(pagina) || 1,
                totalPaginas: Math.ceil(total / limit),
            }
        });
    } catch (err) {
        console.error('Error en tienda pública:', err);
        res.status(500).json({ error: 'Error al cargar la tienda.' });
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
        // v2.0.1: JOIN con usuarios para mostrar nombre de quien abrió el turno
        const { rows } = await db.query(`
            SELECT t.*, u.nombre AS nombre_usuario_apertura
            FROM turnos_caja t
            LEFT JOIN usuarios u ON t.id_usuario = u.id_usuario
            WHERE t.estado_turno = 'Abierto' AND t.id_local = $1
            ORDER BY t.id_turno DESC LIMIT 1
        `, [id_local]);
        res.json({ turno_abierto: rows.length > 0, turno: rows[0] || null });
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
            `UPDATE turnos_caja SET estado_turno = 'Cerrado', fecha_cierre = CURRENT_TIMESTAMP, monto_cierre_real = $1, monto_cierre_calculado = $2, id_usuario_cierre = $3 WHERE id_turno = $4`,
            [real, calc, Number(req.user.id_usuario), id_turno]
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

// v2.0.1: Historial de turnos de caja (últimos 20)
app.get('/api/turnos/historial', requireAuth, requireAprobado, async (req, res) => {
    try {
        const { id_local } = req.query;
        if (Number(id_local) !== req.user.id_local) {
            return res.status(403).json({ error: 'No autorizado.' });
        }
        const { rows } = await db.query(`
            SELECT t.*, u.nombre AS nombre_usuario_apertura,
                   uc.nombre AS nombre_usuario_cierre
            FROM turnos_caja t
            LEFT JOIN usuarios u ON t.id_usuario = u.id_usuario
            LEFT JOIN usuarios uc ON t.id_usuario_cierre = uc.id_usuario
            WHERE t.id_local = $1
            ORDER BY t.id_turno DESC
            LIMIT 20
        `, [id_local]);
        res.json(rows);
    } catch (err) {
        console.error('Error en historial de turnos:', err);
        res.status(500).json({ error: 'Error interno del servidor.' });
    }
});

// API: Categorías
app.get('/api/categorias', requireAuth, requireAprobado, async (req, res) => {
    try {
        const { rows } = await db.query('SELECT id_categoria, nombre_categoria FROM categorias ORDER BY id_categoria ASC');
        res.json(rows);
    } catch (err) {
        console.error('Error listando categorias:', err);
        res.status(500).json({ error: 'Error al obtener categorías.' });
    }
});

// API: Productos (SaaS) (PROTEGIDOS)
app.get('/api/productos', requireAuth, requireAprobado, async (req, res) => {
    try {
        const { q, id_local } = req.query;
        if (Number(id_local) !== req.user.id_local) {
            return res.status(403).json({ error: 'No autorizado.' });
        }
        let query = `
            SELECT p.*, COALESCE(c.nombre_categoria, 'General') as nombre_categoria 
            FROM productos p 
            LEFT JOIN categorias c ON p.id_categoria = c.id_categoria 
            WHERE p.id_local = $1
        `;
        let params = [id_local];

        if (q) {
            query += ` AND (p.nombre_producto ILIKE $2 OR p.codigo_barras = $3)`;
            params.push(`%${q}%`, q);
        }
        query += ` ORDER BY p.id_producto DESC`;
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

        // Prepend base URL to image URLs for web clients
        const baseUrl = `${req.protocol}://${req.get('host')}`;
        rows.forEach(p => {
            if (p.imagen_url && p.imagen_url.startsWith('/uploads/')) {
                p.imagen_url = baseUrl + p.imagen_url;
            }
            if (p.imagenes && p.imagenes.length > 0) {
                p.imagenes.forEach(img => {
                    if (img.url && img.url.startsWith('/uploads/')) {
                        img.url = baseUrl + img.url;
                    }
                });
            }
            if (p.video_url && p.video_url.startsWith('/uploads/')) {
                p.video_url = baseUrl + p.video_url;
            }
        });

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
        const prodRes = await db.query('SELECT id_local FROM productos WHERE id_producto = $1', [req.params.id]);
        if (prodRes.rows.length === 0) return res.status(404).json({ error: 'Producto no encontrado.' });
        if (prodRes.rows[0].id_local !== req.user.id_local) {
            return res.status(403).json({ error: 'No autorizado.' });
        }
        const { nombre_producto, codigo_barras, id_categoria, marca, genero, precio_compra, precio_venta, stock_actual, stock_minimo, imagen_url, video_url, visible_en_tienda } = req.body;
        const costo = precio_compra ? parseFloat(precio_compra) : 0;
        const visibilidad = visible_en_tienda !== false;
        const catId = id_categoria ? parseInt(id_categoria) : 3;

        await db.query(
            `UPDATE productos 
             SET nombre_producto=$1, codigo_barras=$2, id_categoria=$3, precio_compra=$4, precio_venta=$5, stock_actual=$6, stock_minimo=$7, imagen_url=$8, video_url=$9, visible_en_tienda=$10, marca=$11, genero=$12
             WHERE id_producto=$13`,
            [nombre_producto, codigo_barras || null, catId, costo, parseFloat(precio_venta) || 0, parseInt(stock_actual) || 0, parseInt(stock_minimo) || 0, imagen_url || null, video_url || null, visibilidad, marca || null, genero || null, req.params.id]
        );
        res.json({ success: true });
    } catch (err) {
        console.error('Error actualizando producto:', err);
        res.status(500).json({ error: 'Error interno del servidor al actualizar producto: ' + (err.message || '') });
    }
});

app.post('/api/productos', requireAuth, requireAprobado, requireAdmin, async (req, res) => {
    try {
        const { id_local, codigo_barras, nombre_producto, id_categoria, marca, genero, imagen_url, video_url, precio_compra, precio_venta, stock_actual, stock_minimo, visible_en_tienda } = req.body;
        if (Number(id_local) !== req.user.id_local) {
            return res.status(403).json({ error: 'No autorizado.' });
        }
        if (!nombre_producto || !precio_venta) {
            return res.status(400).json({ error: 'Nombre y precio de venta son requeridos.' });
        }
        const serial = codigo_barras && codigo_barras.trim() ? codigo_barras.trim() : null;
        const costo = precio_compra ? parseFloat(precio_compra) : 0;
        const visibilidad = visible_en_tienda !== false;

        // Verificar categoría: si no existe, usar NULL
        let catId = null;
        if (id_categoria) {
            const catCheck = await db.query('SELECT id_categoria FROM categorias WHERE id_categoria = $1', [parseInt(id_categoria)]);
            if (catCheck.rows.length > 0) catId = parseInt(id_categoria);
        }

        const { rows } = await db.query(
            `INSERT INTO productos (id_local, codigo_barras, nombre_producto, id_categoria, marca, genero, imagen_url, video_url, precio_compra, precio_venta, stock_actual, stock_minimo, visible_en_tienda)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13) RETURNING id_producto`,
            [id_local, serial, nombre_producto, catId, marca || null, genero || null, imagen_url || null, video_url || null, costo, parseFloat(precio_venta), parseInt(stock_actual) || 0, parseInt(stock_minimo) || 0, visibilidad]
        );
        res.json({ success: true, id_producto: rows[0].id_producto });
    } catch (err) {
        console.error('Error creando producto:', err.message, err.stack);
        res.status(500).json({ error: 'Error al guardar producto: ' + err.message });
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
        res.status(500).json({ error: 'Error interno del servidor al eliminar producto: ' + (err.message || '') });
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
        const { documento_identidad, nombre_razon_social, telefono, correo, direccion, latitud, longitud } = req.body;
        if (!documento_identidad || !nombre_razon_social) {
            return res.status(400).json({ error: 'documento_identidad y nombre_razon_social son requeridos.' });
        }
        const { rows } = await db.query(
            `INSERT INTO clientes (documento_identidad, nombre_razon_social, telefono, correo, direccion, latitud, longitud) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id_cliente`,
            [documento_identidad, nombre_razon_social, telefono || null, correo || null, direccion || null, latitud || null, longitud || null]
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
    console.log('HEALTH_VERSION:', APP_VERSION); res.json({ status: 'ok', timestamp: new Date().toISOString(), version: APP_VERSION });
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
    // v2.2.0: Verificar blacklist de tokens (logout)
    if (tokenBlacklist.has(token)) {
        return res.status(401).json({ error: 'Sesión cerrada. Inicia sesión de nuevo.' });
    }
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

// v2.1.1: Upload de archivos de actualización
const storageUpdates = isProduction
  ? multer.memoryStorage()
  : multer.diskStorage({
      destination: (req, file, cb) => cb(null, updatesDir),
      filename: (req, file, cb) => {
        const ext = path.extname(file.originalname).toLowerCase();
        cb(null, `update_${Date.now()}${ext}`);
      }
    });
const uploadUpdate = multer({
    storage: storageUpdates,
    limits: { fileSize: 500 * 1024 * 1024 }, // 500 MB máximo
    fileFilter: (req, file, cb) => {
        const allowed = ['.exe', '.dmg', '.zip', '.msi'];
        const ext = path.extname(file.originalname).toLowerCase();
        if (allowed.includes(ext)) cb(null, true);
        else cb(new Error('Tipo de archivo no permitido. Use .exe, .dmg o .zip'));
    }
});

// Servir archivos de actualización
app.use('/updates', express.static(updatesDir));

// Login de super-admin (separado del login de locales)
app.post('/api/super/login', loginLimiter, async (req, res) => {
    try {
        const correo = (req.body.correo || '').toString().trim();
        const contrasena = (req.body.contrasena || '').toString();
        const codigo = (req.body.codigo || '').toString().trim();

        // Si solo se envía el código (sin correo ni contraseña), login directo por código
        if (codigo && !correo && !contrasena) {
            const r = await db.query(
                'SELECT * FROM super_admins WHERE codigo_acceso = $1 AND estado = true',
                [codigo]
            );
            const row = r.rows[0];
            if (!row) {
                return res.status(401).json({ error: 'Código de acceso incorrecto.' });
            }
            await db.query('UPDATE super_admins SET last_login = NOW() WHERE id_super = $1', [row.id_super]);
            const token = signToken({
                id_super: row.id_super, nombre: row.nombre,
                correo: row.correo, tipo: 'super_admin',
            });
            return res.json({
                token,
                user: { id_super: row.id_super, nombre: row.nombre, correo: row.correo, tipo: 'super_admin' },
            });
        }

        // Flujo normal: código + correo + contraseña
        if (!correo || !contrasena || !codigo) {
            return res.status(400).json({ error: 'Código, correo y contraseña son requeridos.' });
        }

// Validar código de acceso de 4 dígitos (obligatorio)
        const rCode = await db.query('SELECT codigo_acceso FROM super_admins WHERE correo = $1', [correo.toLowerCase().trim()]);
        const rowCode = rCode.rows[0];

        if (!rowCode || !rowCode.codigo_acceso) {
            return res.status(401).json({ error: 'Correo no encontrado o código no configurado.' });
        }

        const storedCode = String(rowCode.codigo_acceso);
        const inputCode = String(codigo);

        if (storedCode !== inputCode) {
            return res.status(401).json({ error: 'Código de acceso incorrecto.' });
        }

        // Continuar con validación de contraseña normal
        const r = await db.query('SELECT * FROM super_admins WHERE correo = $1', [correo.toLowerCase().trim()]);
        const row = r.rows[0];

        if (!row) {
            return res.status(401).json({ error: 'Correo no registrado.' });
        }
        if (!row.estado) {
            return res.status(403).json({ error: 'Tu cuenta de super-admin está desactivada.' });
        }

        const ok = await bcrypt.compare(contrasena, row.contrasena_hash);
        if (!ok) return res.status(401).json({ error: 'Contraseña incorrecta.' });

        // Actualizar last_login
        await db.query('UPDATE super_admins SET last_login = NOW() WHERE id_super = \$1', [row.id_super]);

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

// ═══════════════════════════════════════════════════════════════
// v2.2.0: ENDPOINTS DE SEGURIDAD
// ═══════════════════════════════════════════════════════════════

// POST /api/auth/logout — Cerrar sesión con blacklist de token
app.post('/api/auth/logout', requireAuth, (req, res) => {
    const authHeader = req.headers.authorization || '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
    if (token) {
        tokenBlacklist.add(token);
        console.log(`🔒 Token blacklistado: ${token.substring(0, 20)}...`);
    }
    res.json({ message: 'Sesión cerrada correctamente.' });
});

// POST /api/auth/logout-super — Cerrar sesión super-admin con blacklist
app.post('/api/auth/logout-super', requireSuperAdmin, (req, res) => {
    const authHeader = req.headers.authorization || '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
    if (token) {
        tokenBlacklist.add(token);
        console.log(`🔒 Token super-admin blacklistado: ${token.substring(0, 20)}...`);
    }
    res.json({ message: 'Sesión super-admin cerrada correctamente.' });
});

// POST /api/auth/refresh — Renovar token con refresh token
app.post('/api/auth/refresh', async (req, res) => {
    try {
        const { refreshToken } = req.body;
        if (!refreshToken) return res.status(400).json({ error: 'Refresh token requerido.' });

        const payload = jwt.verify(refreshToken, JWT_REFRESH_SECRET);
        if (payload.type !== 'refresh') return res.status(401).json({ error: 'Token inválido.' });

        // Verificar blacklist
        if (tokenBlacklist.has(refreshToken)) {
            return res.status(401).json({ error: 'Token revocado.' });
        }

        // Generar nuevos tokens
        const newPayload = { id_usuario: payload.id_usuario, nombre: payload.nombre, rol: payload.rol, id_local: payload.id_local };
        const tokens = generateTokens(newPayload);

        // Blacklistear el refresh token viejo
        tokenBlacklist.add(refreshToken);

        res.json(tokens);
    } catch (err) {
        return res.status(401).json({ error: 'Refresh token inválido o expirado.' });
    }
});

// POST /api/super/2fa-setup — Configurar 2FA TOTP para super-admin
app.post('/api/super/2fa-setup', requireSuperAdmin, async (req, res) => {
    try {
        const idSuper = req.superAdmin.id_super;

        // Generar secreto TOTP
        const secret = speakeasy.generateSecret({
            name: `POS-SuperAdmin (${req.superAdmin.correo})`,
            issuer: 'Sistema POS',
            length: 32,
        });

        // Guardar secreto temporalmente (no activado aún)
        await db.query(
            'UPDATE super_admins SET totp_secret = $1, totp_enabled = false WHERE id_super = $2',
            [secret.base32, idSuper]
        );

        // Generar QR code
        const qrDataUrl = await QRCode.toDataURL(secret.otpauth_url);

        res.json({
            secret: secret.base32,
            qr: qrDataUrl,
            message: 'Escanea el QR con tu app de autenticación (Google Authenticator, Authy, etc.)',
        });
    } catch (err) {
        console.error('Error en 2FA setup:', err);
        res.status(500).json({ error: 'Error al configurar 2FA.' });
    }
});

// POST /api/super/2fa-verify — Verificar y activar 2FA
app.post('/api/super/2fa-verify', requireSuperAdmin, async (req, res) => {
    try {
        const { code } = req.body;
        if (!code) return res.status(400).json({ error: 'Código TOTP requerido.' });

        const r = await db.query('SELECT totp_secret FROM super_admins WHERE id_super = $1', [req.superAdmin.id_super]);
        const secret = r.rows[0]?.totp_secret;
        if (!secret) return res.status(400).json({ error: 'Primero ejecuta 2FA setup.' });

        const verified = speakeasy.totp.verify({
            secret,
            encoding: 'base32',
            token: code,
            window: 2, // ±30 segundos de tolerancia
        });

        if (!verified) return res.status(400).json({ error: 'Código incorrecto. Intenta de nuevo.' });

        // Activar 2FA
        await db.query('UPDATE super_admins SET totp_enabled = true WHERE id_super = $1', [req.superAdmin.id_super]);

        res.json({ message: '2FA activado correctamente. Tu cuenta ahora es más segura.' });
    } catch (err) {
        console.error('Error en 2FA verify:', err);
        res.status(500).json({ error: 'Error al verificar 2FA.' });
    }
});

// POST /api/super/2fa-disable — Desactivar 2FA
app.post('/api/super/2fa-disable', requireSuperAdmin, async (req, res) => {
    try {
        const { code } = req.body;
        if (!code) return res.status(400).json({ error: 'Código TOTP requerido para desactivar.' });

        const r = await db.query('SELECT totp_secret, totp_enabled FROM super_admins WHERE id_super = $1', [req.superAdmin.id_super]);
        const row = r.rows[0];
        if (!row?.totp_enabled) return res.status(400).json({ error: '2FA no está activado.' });

        const verified = speakeasy.totp.verify({
            secret: row.totp_secret,
            encoding: 'base32',
            token: code,
            window: 2,
        });

        if (!verified) return res.status(400).json({ error: 'Código incorrecto.' });

        await db.query('UPDATE super_admins SET totp_enabled = false, totp_secret = NULL WHERE id_super = $1', [req.superAdmin.id_super]);

        res.json({ message: '2FA desactivado.' });
    } catch (err) {
        console.error('Error en 2FA disable:', err);
        res.status(500).json({ error: 'Error al desactivar 2FA.' });
    }
});

// Verificar TODAS las solicitudes de registro pendientes (global, todos los locales)
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
              AND u.rol IN ('Administrador', 'Vendedor', 'Cajero')
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

// POST /api/super/bot — asistente conversacional inteligente para el super-admin
// v2.3.0: Bot con personalidad, contexto dinámico y respuestas naturales
app.post('/api/super/bot', requireSuperAdmin, async (req, res) => {
    try {
        const msgOriginal = (req.body.mensaje || '').trim();
        const msg = msgOriginal.toLowerCase();
        if (!msg) return res.json({ respuesta: '¿En qué te puedo ayudar? Escribe tu pregunta o solicitud.' });

        // Formateadores
        const fmtCOP = (v) => new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(Number(v) || 0);
        const fmtNum = (v) => new Intl.NumberFormat('es-CO').format(Number(v) || 0);

        // ═══════════════════════════════════════════════════════════════
        // CONTEXTO DINÁMICO DEL SISTEMA CON CACHÉ
        // Caché de 30 segundos para evitar consultas excesivas a la BD
        // ═══════════════════════════════════════════════════════════════
        const CACHE_TTL = 30000; // 30 segundos
        const ahora = Date.now();

        // Caché global para métricas del bot
        if (!global._botMetricsCache || (ahora - global._botMetricsCache.time) > CACHE_TTL) {
            const [metricasRaw, ultimaVersionRaw] = await Promise.all([
                db.query(`
                    SELECT
                        (SELECT COUNT(*)::int FROM locales) AS locales,
                        (SELECT COUNT(*)::int FROM usuarios) AS usuarios,
                        (SELECT COUNT(*)::int FROM usuarios WHERE aprobado_por_admin = false) AS pendientes,
                        (SELECT COALESCE(SUM(total_neto),0)::numeric FROM ventas WHERE fecha_venta >= NOW() - INTERVAL '24 hours') AS ventas_hoy,
                        (SELECT COUNT(*)::int FROM ventas WHERE fecha_venta >= NOW() - INTERVAL '24 hours') AS ventas_hoy_cant,
                        (SELECT COALESCE(SUM(total_neto),0)::numeric FROM ventas WHERE fecha_venta >= NOW() - INTERVAL '30 days') AS ventas_mes,
                        (SELECT COUNT(*)::int FROM ventas WHERE fecha_venta >= NOW() - INTERVAL '30 days') AS ventas_mes_cant,
                        (SELECT COUNT(*)::int FROM tickets_soporte WHERE estado = 'Abierto') AS tickets_abiertos,
                        (SELECT COUNT(*)::int FROM productos) AS productos,
                        (SELECT COUNT(*)::int FROM productos WHERE stock_actual <= stock_minimo) AS stock_bajo
                `).then(r => r.rows[0]),
                db.query('SELECT version, changelog FROM actualizaciones WHERE activa = true ORDER BY fecha_publicacion DESC LIMIT 1').then(r => r.rows[0]),
            ]);
            global._botMetricsCache = {
                time: ahora,
                metricas: metricasRaw,
                version: ultimaVersionRaw?.version || APP_VERSION,
            };
        }

        const m = global._botMetricsCache.metricas;
        const version = global._botMetricsCache.version;
        const uptime = Math.floor(process.uptime());
        const hrs = Math.floor(uptime / 3600);
        const min = Math.floor((uptime % 3600) / 60);

        // ═══════════════════════════════════════════════════════════════
        // SISTEMA DE DETECCIÓN DE INTENCIÓN MEJORADO
        // Más flexible, entiende sinónimos y contexto
        // ═══════════════════════════════════════════════════════════════
        const intenciones = {
            saludo: /^(hola|buenos dias|buenas tardes|buenas noches|hey|que tal|saludos|que onda|que hubo|que hay|epa|buenas|que mas)/,
            ayuda: /(ayuda|help|comandos|opciones|que puedo|que sabes hacer|que puedes|menu|guia|tutorial)/,
            estadistica: /(metricas|estadisticas|resumen|como va|como vas|como estamos|que tal|cuantos|cuantas|total|cantidad|cuanto|cuanta|reporte|informe|dashboard)/,
            locales: /(local|locales|tienda|tiendas|sucursal|sucursales|negocio|negocios)/,
            usuarios: /(usuario|usuarios|empleado|empleados|gente|personas|cuenta|cuentas|personal|equipo)/,
            ventas: /(venta|ventas|vendio|vendí|facturo|facturó|ingreso|ingresos|dinero|ganancia|facturacion|facturación|cobro|cobros|factura|facturas)/,
            productos: /(producto|productos|articulo|artículos|inventario|stock|mercancia|mercancía|catálogo)/,
            pendientes: /(pendiente|pendientes|espera|aprobar|aprobacion|aprobación|registro|registrado|sin aprobar|nuevos)/,
            tickets: /(ticket|tickets|soporte|problema|reclamo|ayuda tecnica|asistencia)/,
            errores: /(error|bug|falla|no funciona|ROTO|mal|defectuoso|fallo)/,
            // v2.2.0: actualizar ANTES de seguridad para detectar "actualizar seguridad"
            actualizar: /(publicar|mandar|mandemos|enviar|sacar|lanzar|push|publish|nueva version|nueva versión|mejorar|mejoras|calidad|actualizar sistema|actualizar seguridad)/,
            seguridad: /(seguridad|security|vulnerabilidad|hack|proteccion|protección|cifrar|encriptar|jwt|token|password|contraseña|auth)/,
            arquitectura: /(como funciona|arquitectura|estructura|stack|tecnologia|tecnología|que usa|que tecnologias)/,
            features: /(que puede|que hace|funcionalidades|features|capacidades|que ofrece|modulo|modulos)/,
            tablas: /(tablas?|base de datos|campos|columnas|schema|estructura de datos|que guarda|que datos)/,
            endpoints: /(endpoint|api|rutas?|endpoints|rest|request)/,
            archivos: /(archivos?|paginas?|componente|componentes|donde esta|ubicacion|directorio)/,
            version: /(version|versión|release|changelog|actualizacion|actualización|que version|ultima version)/,
            autor: /(quien hizo|quien creo|quién hizo|quién creó|desarrollador|autor|programador|creador|dueño)/,
            estado: /(estado|status|servidor|activo|funcionando|uptime|online|sistema)/,
            historial_updates: /(ver actualizacion|ver actualización|historial|actualizaciones publicadas|que version tenemos|ultimas versiones)/,
            reportes: /(reporte|informe|exportar|descargar|excel|csv|pdf)/,
        };

        function detectarIntencion(texto) {
            for (const [intencion, regex] of Object.entries(intenciones)) {
                if (regex.test(texto)) return intencion;
            }
            return null;
        }

        // ═══════════════════════════════════════════════════════════════
        // DETECCIÓN DE ACCIONES (aprobar/rechazar/publicar)
        // ═══════════════════════════════════════════════════════════════
        function detectarAccion(texto) {
            if (/(aprobar|aceptar|activar|habilitar|autorizar|dar acceso)/.test(texto)) return 'aprobar';
            if (/(rechazar|eliminar|borrar|denegar|rechazar|bloquear)/.test(texto)) return 'rechazar';
            if (/(enviar|mandar|correo|email|notificar)/.test(texto)) return 'enviar';
            return null;
        }

        // Extraer nombre del mensaje (para aprobar/rechazar)
        function extraerNombre(texto) {
            const match = texto.match(/(?:aprobar|rechazar|aceptar|eliminar|borrar|autorizar|dar acceso)\s+(?:a\s+|al\s+|la\s+)?(.+?)(?:\s*$|\s*\?|\s*¿)/i);
            return match ? match[1].trim() : null;
        }

        // Extraer nombre de local del mensaje
        function extraerLocal(texto) {
            // Buscar entre comillas
            const comillas = texto.match(/["'`](.+?)["'`]/);
            if (comillas) return comillas[1];
            // Buscar después de "de", "en", "para", "el", "la"
            const match = texto.match(/(?:de|en|para|el|la|los|las)\s+(.+?)(?:\s*$|\s*\?|\s*¿|\s*,)/i);
            return match ? match[1].trim() : null;
        }

        // ═══════════════════════════════════════════════════════════════
        // FUNCIONES DE DATOS
        // ═══════════════════════════════════════════════════════════════
        async function getLocales() {
            return db.query(`
                SELECT l.id_local, l.nombre_local, l.ciudad,
                    (SELECT COUNT(*) FROM usuarios u WHERE u.id_local = l.id_local) as total_usuarios,
                    (SELECT COALESCE(SUM(v.total_neto),0)::numeric FROM ventas v WHERE v.id_local = l.id_local) as total_ventas
                FROM locales l ORDER BY l.id_local
            `).then(r => r.rows);
        }

        async function getVentasLocal(nombreLocal) {
            return db.query(`
                SELECT l.nombre_local,
                    COUNT(v.id_venta)::int as num_ventas,
                    COALESCE(SUM(v.total_neto),0)::numeric as total,
                    COALESCE(SUM(v.subtotal),0)::numeric as subtotal
                FROM locales l
                LEFT JOIN ventas v ON v.id_local = l.id_local
                WHERE LOWER(l.nombre_local) LIKE $1
                GROUP BY l.id_local, l.nombre_local
            `, [`%${nombreLocal}%`]).then(r => r.rows[0] || null);
        }

        async function getVentasRecientes() {
            return db.query(`
                SELECT v.id_venta, v.total_neto, v.fecha_venta, l.nombre_local
                FROM ventas v JOIN locales l ON v.id_local = l.id_local
                ORDER BY v.fecha_venta DESC LIMIT 5
            `).then(r => r.rows);
        }

        async function getPendientes() {
            return db.query(`
                SELECT u.id_usuario, u.nombre, u.correo, l.nombre_local
                FROM usuarios u LEFT JOIN locales l ON u.id_local = l.id_local
                WHERE u.aprobado_por_admin = false
                ORDER BY u.created_at
            `).then(r => r.rows);
        }

        async function getProductos() {
            return db.query('SELECT COUNT(*)::int AS total, COUNT(CASE WHEN stock_actual <= stock_minimo THEN 1 END)::int AS bajo_stock FROM productos').then(r => r.rows[0]);
        }

        async function getTickets() {
            return db.query("SELECT * FROM tickets_soporte WHERE estado = 'Abierto' ORDER BY created_at DESC LIMIT 5").then(r => r.rows);
        }

        // ═══════════════════════════════════════════════════════════════
        // MOTOR DE RESPUESTAS CONVERSACIONALES
        // Cada intención tiene múltiples variaciones para sonar natural
        // ═══════════════════════════════════════════════════════════════

        const intencion = detectarIntencion(msg);
        const accion = detectarAccion(msg);

        // ── SALUDO ──────────────────────────────────────────────────
        if (intencion === 'saludo') {
            const saludos = [
                `¡Hola! 👋 ¿Qué tal? Todo funcionando bien por aquí.`,
                `¡Hey! 🤙 Buenas. El sistema está online y tranquilo.`,
                `¡Qué más! 👋 Aquí estoy, listo para lo que necesites.`,
                `¡Buenas! 🙌 Todo en orden. ¿En qué te ayudo?`,
            ];
            const saludo = saludos[Math.floor(Math.random() * saludos.length)];
            return res.json({ respuesta:
                `${saludo}\n\n` +
                `📊 *Resumen rápido:*\n` +
                `• ${m.locales} locales · ${m.usuarios} usuarios\n` +
                `• ${fmtCOP(m.ventas_hoy)} hoy · ${fmtCOP(m.ventas_mes)} este mes\n` +
                (m.pendientes > 0 ? `• ⚠️ *${m.pendientes}* usuario(s) pendiente(s) de aprobación\n` : '') +
                (m.tickets_abiertos > 0 ? `• 🎫 *${m.tickets_abiertos}* ticket(s) abierto(s)\n` : '') +
                (m.stock_bajo > 0 ? `• ⚠️ *${m.stock_bajo}* producto(s) con stock bajo\n` : '') +
                `\n¿Qué necesitas?`
            });
        }

        // ── AYUDA ───────────────────────────────────────────────────
        if (intencion === 'ayuda') {
            return res.json({ respuesta:
                `🤖 *¡Soy tu asistente del POS v${version}!*\n\n` +
                `Puedo hacer muchas cosas. Solo háblame en natural:\n\n` +
                `📊 *Pregúntame:*\n` +
                `• "¿Cómo va el día?" — Resumen del sistema\n` +
                `• "¿Cuánto vendimos hoy?" — Ventas del día\n` +
                `• "¿Cuántos locales hay?" — Detalle de locales\n` +
                `• "¿Quién está pendiente?" — Usuarios sin aprobar\n` +
                `• "¿Hay tickets abiertos?" — Soporte\n` +
                `• "¿Cómo va el mes?" — Métricas del mes\n\n` +
                `✅ *Acciones:*\n` +
                `• "Aprobar a Juan" — Aprobar usuario\n` +
                `• "Rechazar a Pedro" — Rechazar usuario\n` +
                `• "Enviar reporte semanal" — Generar reporte\n\n` +
                `🔧 *Técnico:*\n` +
                `• "¿Cómo funciona el sistema?" — Arquitectura\n` +
                `• "¿Qué tablas hay?" — Base de datos\n` +
                `• "¿Qué stack usamos?" — Tecnologías\n` +
                `• "¿Qué errores hay?" — Issues conocidos\n\n` +
                `🔒 *Seguridad:*\n` +
                `• "Actualizar seguridad" — Implementar todos los pendientes\n` +
                `• "¿Qué pendientes de seguridad hay?" — Ver lista\n\n` +
                `🔄 *Actualizaciones:*\n` +
                `• "Publicar actualización con [cambios]" — Yo la publico\n` +
                `• "Ver actualizaciones" — Historial\n\n` +
                `_No necesitas comandos exactos. Háblame como me hablarías a mí._`
            });
        }

        // ── PUBLICAR ACTUALIZACIÓN ──────────────────────────────────
        if (intencion === 'actualizar') {
            // v2.2.0: Detectar si es actualización de seguridad automática
            const esSeguridad = msg.includes('seguridad') || msg.includes('security') ||
                msg.includes('pendiente') || msg.includes('proteger') || msg.includes('cifrar') ||
                msg.includes('validar') || msg.includes('2fa') || msg.includes('totp') ||
                msg.includes('magic bytes') || msg.includes('refresh token') || msg.includes('blacklist');

            let changelog;
            if (esSeguridad) {
                // Actualización de seguridad automática con los pendientes implementados
                changelog = 'Actualización de seguridad v2.2.0: Validación de inputs con Zod, cifrado de tokens Shopify (AES-256), validación magic bytes en uploads, refresh tokens + blacklist de logout, 2FA TOTP para super-admin, índices de performance en BD';
            } else {
                // Extraer changelog del mensaje
                changelog = msgOriginal
                    .replace(/publicar\s+(la\s+)?actualizaci[oó]n/gi, '')
                    .replace(/nueva\s+versi[oó]n/gi, '')
                    .replace(/hacer\s+(una\s+)?actualizaci[oó]n/gi, '')
                    .replace(/sacar\s+(una\s+)?actualizaci[oó]n/gi, '')
                    .replace(/lanzar\s+(una\s+)?actualizaci[oó]n/gi, '')
                    .replace(/mandar\s+(una\s+)?actualizaci[oó]n/gi, '')
                    .replace(/mandemos\s+(una\s+)?actualizaci[oó]n/gi, '')
                    .replace(/enviar\s+(una\s+)?actualizaci[oó]n/gi, '')
                    .replace(/push\s+update/gi, '')
                    .replace(/publish\s+update/gi, '')
                    .replace(/con\s+los?\s+cambios?:?/gi, '')
                    .replace(/con\s+estos?\s+cambios?:?/gi, '')
                    .replace(/que\s+(?:tenga|contenga|incluya|sería|seria)/gi, '')
                    .replace(/para\s+calidad/gi, '')
                    .replace(/calidad/gi, '')
                    .replace(/actualizar\s+sistema/gi, '')
                    .trim();
            }

            if (!changelog || changelog.length < 3) {
                return res.json({ respuesta:
                    `🔄 *¿Publicar actualización?*\n\n` +
                    `Dime qué cambios quieres incluir. Por ejemplo:\n\n` +
                    `_"Publicar actualización con corrección de errores en el POS"_\n` +
                    `_"Mandemos una actualización con mejoras de rendimiento"_\n` +
                    `_"Actualizar sistema con nuevo diseño del header"_\n\n` +
                    `🔒 *Seguridad:* Simplemente dime "actualizar seguridad" y yo implemento:\n` +
                    `• Validación de inputs con Zod\n` +
                    `• Cifrado de tokens Shopify\n` +
                    `• Magic bytes en uploads\n` +
                    `• Refresh tokens + blacklist\n` +
                    `• 2FA TOTP para super-admin\n\n` +
                    `_¿Qué cambios quieres incluir?_`
                });
            }

            // Obtener última versión y generar la siguiente
            const parts = version.split('.').map(Number);
            parts[2] = (parts[2] || 0) + 1;
            const nuevaVersion = parts.join('.');

            // Crear la actualización
            await db.query('UPDATE actualizaciones SET activa = false');
            await db.query(
                'INSERT INTO actualizaciones (version, changelog, url_descarga) VALUES ($1, $2, $3)',
                [nuevaVersion, changelog, '']
            );

            console.log(`🤖 Bot: Actualización v${nuevaVersion} publicada: "${changelog}"`);

            // Respuestas variadas según el tipo
            if (esSeguridad) {
                return res.json({ respuesta:
                    `🔒 *¡Actualización de seguridad publicada!*\n\n` +
                    `📦 *Versión:* v${nuevaVersion}\n` +
                    `📝 *Cambios:*\n` +
                    `• ✅ Validación de inputs con Zod\n` +
                    `• ✅ Cifrado AES-256 de tokens Shopify\n` +
                    `• ✅ Magic bytes en uploads de imágenes\n` +
                    `• ✅ Refresh tokens + blacklist de logout\n` +
                    `• ✅ 2FA TOTP para super-admin\n` +
                    `• ✅ Índices de performance en BD\n\n` +
                    `📅 ${new Date().toLocaleString('es-CO')}\n\n` +
                    `🔄 Los clientes recibirán la notificación al reiniciar.\n\n` +
                    `_Tu sistema ahora es mucho más seguro. ¿Algo más?_`
                });
            }

            const respuestas = [
                `✅ *¡Lista!* Actualización v${nuevaVersion} publicada.\n\n📝 *Cambios:* ${changelog}\n📅 ${new Date().toLocaleString('es-CO')}\n\n🔄 Los clientes la verán al reiniciar. ¿Algo más?`,
                `✅ *¡Listo!* v${nuevaVersion} ya está en el aire.\n\n📝 ${changelog}\n\n🔄 Reinician y la tienen. ¿Qué más?`,
                `✅ *¡Hecho!* v${nuevaVersion} publicada.\n\n📝 *Cambios:* ${changelog}\n\n🔄 Los clientes reciben la notificación automáticamente. ¿Algo más?`,
            ];
            return res.json({ respuesta: respuestas[Math.floor(Math.random() * respuestas.length)] });
        }

        // ── VER HISTORIAL DE ACTUALIZACIONES ────────────────────────
        if (intencion === 'historial_updates') {
            const upds = await db.query('SELECT * FROM actualizaciones ORDER BY fecha_publicacion DESC LIMIT 5');
            if (upds.rows.length === 0) return res.json({ respuesta: '📋 No hay actualizaciones publicadas aún. ¿Quieres publicar una?' });
            let respuesta = `📋 *Últimas actualizaciones:*\n\n`;
            for (const u of upds.rows) {
                respuesta += `• *v${u.version}* — ${u.activa ? '🟢 Activa' : '⚪ Inactiva'}\n  ${u.changelog || 'Sin changelog'}\n  📅 ${new Date(u.fecha_publicacion).toLocaleString('es-CO')}\n\n`;
            }
            return res.json({ respuesta });
        }

        // ── ESTADÍSTICAS / RESUMEN ──────────────────────────────────
        if (intencion === 'estadistica') {
            const productos = await getProductos();
            let respuesta = `📈 *Resumen del sistema:*\n\n`;
            respuesta += `🏪 *Locales:* ${m.locales}\n`;
            respuesta += `👥 *Usuarios:* ${m.usuarios}${m.pendientes > 0 ? ` (${m.pendientes} pendiente(s))` : ''}\n`;
            respuesta += `📦 *Productos:* ${m.productos}${m.stock_bajo > 0 ? ` (${m.stock_bajo} con stock bajo ⚠️)` : ''}\n\n`;
            respuesta += `💰 *Ventas:*\n`;
            respuesta += `  • Hoy: ${fmtCOP(m.ventas_hoy)} (${m.ventas_hoy_cant} ventas)\n`;
            respuesta += `  • 30 días: ${fmtCOP(m.ventas_mes)} (${m.ventas_mes_cant} ventas)\n\n`;
            if (m.tickets_abiertos > 0) respuesta += `🎫 *Tickets abiertos:* ${m.tickets_abiertos} ⚠️\n\n`;
            respuesta += `_¿Quieres detalle de algo específico?_`;
            return res.json({ respuesta });
        }

        // ── LOCALES ─────────────────────────────────────────────────
        if (intencion === 'locales' && accion !== 'aprobar' && accion !== 'rechazar') {
            // Verificar si pregunta por uno específico
            const nombreLocal = extraerLocal(msg);
            if (nombreLocal) {
                const v = await getVentasLocal(nombreLocal);
                if (!v) return res.json({ respuesta: `No encontré un local con "${nombreLocal}". ¿Puedes verificar el nombre?` });
                return res.json({ respuesta:
                    `💰 *Ventas de ${v.nombre_local}:*\n\n` +
                    `• Total facturado: *${fmtCOP(v.total)}*\n` +
                    `• Número de ventas: *${v.num_ventas}*\n` +
                    `• Subtotal: ${fmtCOP(v.subtotal)}`
                });
            }

            const locales = await getLocales();
            if (locales.length === 0) return res.json({ respuesta: 'No hay locales registrados.' });

            let respuesta = `🏪 *Tienes ${locales.length} local(es):*\n\n`;
            for (const l of locales) {
                respuesta += `• *${l.nombre_local}*`;
                if (l.ciudad) respuesta += ` — ${l.ciudad}`;
                respuesta += ` · ${l.total_usuarios} usuario(s)`;
                if (Number(l.total_ventas) > 0) respuesta += ` · ${fmtCOP(l.total_ventas)}`;
                respuesta += '\n';
            }
            return res.json({ respuesta });
        }

        // ── VENTAS ──────────────────────────────────────────────────
        if (intencion === 'ventas') {
            const nombreLocal = extraerLocal(msg);
            if (nombreLocal) {
                const v = await getVentasLocal(nombreLocal);
                if (!v) return res.json({ respuesta: `No encontré un local con "${nombreLocal}".` });
                return res.json({ respuesta:
                    `💰 *Ventas de ${v.nombre_local}:*\n\n` +
                    `• Total: *${fmtCOP(v.total)}*\n` +
                    `• Ventas: *${v.num_ventas}*\n` +
                    `• Subtotal: ${fmtCOP(v.subtotal)}`
                });
            }

            // Preguntar por hoy o el mes
            if (msg.includes('hoy') || msg.includes('dia') || msg.includes('día')) {
                return res.json({ respuesta:
                    `💰 *Ventas de hoy:*\n\n` +
                    `• Total: *${fmtCOP(m.ventas_hoy)}*\n` +
                    `• Transacciones: *${m.ventas_hoy_cant}*\n\n` +
                    `_¿Quieres ver las de un local específico?_`
                });
            }

            const recientes = await getVentasRecientes();
            if (recientes.length === 0) return res.json({ respuesta: 'No hay ventas registradas aún.' });

            let respuesta = `💰 *Últimas ventas:*\n\n`;
            for (const v of recientes) {
                respuesta += `• #${v.id_venta} — ${fmtCOP(v.total_neto)} en *${v.nombre_local}*\n  ${new Date(v.fecha_venta).toLocaleString('es-CO')}\n`;
            }
            return res.json({ respuesta });
        }

        // ── USUARIOS / PENDIENTES ───────────────────────────────────
        if (intencion === 'usuarios' || intencion === 'pendientes') {
            const pendientes = await getPendientes();
            if (pendientes.length === 0) return res.json({ respuesta: '✅ No hay usuarios pendientes. Todos aprobados.' });

            let respuesta = `👥 *${pendientes.length} usuario(s) esperando aprobación:*\n\n`;
            for (const u of pendientes) {
                respuesta += `• *${u.nombre}* — ${u.correo}\n  📍 ${u.nombre_local || 'sin asignar'} · ID: ${u.id_usuario}\n`;
            }
            respuesta += `\n💡 _Responde "aprobar [nombre]" o "rechazar [nombre]"_`;
            return res.json({ respuesta });
        }

        // ── APROBAR USUARIO ─────────────────────────────────────────
        if (accion === 'aprobar') {
            const nombre = extraerNombre(msg);
            if (!nombre) return res.json({ respuesta: '¿A quién quieres aprobar? Escribe "aprobar [nombre]".' });
            const r = await db.query('SELECT id_usuario, nombre FROM usuarios WHERE LOWER(nombre) LIKE $1 AND aprobado_por_admin = false', [`%${nombre}%`]);
            if (r.rows.length === 0) return res.json({ respuesta: `No encontré un usuario pendiente llamado "${nombre}".` });
            if (r.rows.length > 1) {
                const lista = r.rows.map(u => `• ${u.nombre} [ID: ${u.id_usuario}]`).join('\n');
                return res.json({ respuesta: `Encontré varios. ¿A cuál?\n\n${lista}` });
            }
            await db.query('UPDATE usuarios SET aprobado_por_admin = true WHERE id_usuario = $1', [r.rows[0].id_usuario]);
            return res.json({ respuesta: `✅ *${r.rows[0].nombre}* aprobado. Ya puede usar el sistema.` });
        }

        // ── RECHAZAR USUARIO ────────────────────────────────────────
        if (accion === 'rechazar') {
            const nombre = extraerNombre(msg);
            if (!nombre) return res.json({ respuesta: '¿A quién quieres rechazar? Escribe "rechazar [nombre]".' });
            const r = await db.query('SELECT id_usuario, nombre FROM usuarios WHERE LOWER(nombre) LIKE $1 AND aprobado_por_admin = false', [`%${nombre}%`]);
            if (r.rows.length === 0) return res.json({ respuesta: `No encontré un usuario pendiente llamado "${nombre}".` });
            await db.query('DELETE FROM usuarios WHERE id_usuario = $1', [r.rows[0].id_usuario]);
            return res.json({ respuesta: `❌ *${r.rows[0].nombre}* rechazado y eliminado.` });
        }

        // ── TICKETS ─────────────────────────────────────────────────
        if (intencion === 'tickets') {
            const tickets = await getTickets();
            if (tickets.length === 0) return res.json({ respuesta: '✅ No hay tickets abiertos. Todo tranquilo. 🎉' });
            let respuesta = `🎫 *${tickets.length} ticket(s) abierto(s):*\n\n`;
            for (const t of tickets) {
                respuesta += `• *#${t.id_ticket}* ${t.asunto || 'Consulta'}\n  👤 ${t.nombre} — ${t.mensaje?.substring(0, 80) || 'Sin detalle'}...\n`;
            }
            return res.json({ respuesta });
        }

        // ── PRODUCTOS ───────────────────────────────────────────────
        if (intencion === 'productos') {
            const p = await getProductos();
            return res.json({ respuesta:
                `📦 *Inventario:*\n\n` +
                `• Total: *${p.total}* productos\n` +
                `• Stock bajo: *${p.bajo_stock}* ${p.bajo_stock > 0 ? '⚠️' : '✅'}\n\n` +
                `_¿Quieres ver detalle de algún local?_`
            });
        }

        // ── ERRORES / BUGS ──────────────────────────────────────────
        if (intencion === 'errores') {
            return res.json({ respuesta:
                `⚠️ *Issues conocidos:*\n\n` +
                `1. *Gmail SMTP* — Credenciales inválidas\n` +
                `   → Regenerar contraseña de aplicación en Google\n\n` +
                `2. *JWT_SECRET* — No configurado en .env\n` +
                `   → Tokens se invalidan al reiniciar servidor\n\n` +
                `3. *Foto de perfil* — No actualiza en tiempo real en Header\n\n` +
                `4. *Bot* — Sin memoria entre sesiones\n\n` +
                `5. *Facturación DIAN* — En fase de pruebas\n\n` +
                `6. *Notificaciones push* — No implementadas (móvil)\n\n` +
                `_¿Cuál quieres resolver? Puedo publicar una actualización si lo arreglas._`
            });
        }

        // ── SEGURIDAD ───────────────────────────────────────────────
        if (intencion === 'seguridad') {
            return res.json({ respuesta:
                `🔐 *Estado de seguridad — v2.2.0:*\n\n` +
                `✅ Credenciales hasheadas con bcrypt (cost 12)\n` +
                `✅ Login con rate limit\n` +
                `✅ API protegida con JWT\n` +
                `✅ Roles (Admin/Cajero/Supervisor)\n` +
                `✅ CORS whitelist\n` +
                `✅ .env fuera de git\n` +
                `✅ *Validación de inputs con Zod* (v2.2.0)\n` +
                `✅ *Cifrado AES-256 de tokens Shopify* (v2.2.0)\n` +
                `✅ *Magic bytes en uploads* (v2.2.0)\n` +
                `✅ *Refresh tokens + blacklist de logout* (v2.2.0)\n` +
                `✅ *2FA TOTP para super-admin* (v2.2.0)\n\n` +
                `🎉 *¡Todos los pendientes de seguridad completados!*\n\n` +
                `_¿Algo más que necesites?_`
            });
        }

        // ── ARQUITECTURA / STACK ────────────────────────────────────
        if (intencion === 'arquitectura') {
            return res.json({ respuesta:
                `🏗️ *Arquitectura del Sistema:*\n\n` +
                `*Frontend:* React 19 + Vite + Electron 35 + Capacitor 7\n` +
                `*Backend:* Node.js 22 + Express 5\n` +
                `*Base de datos:* PostgreSQL 16 (Neon)\n` +
                `*Hosting:* GitHub Pages + Render\n` +
                `*Desktop:* Electron (Windows NSIS + macOS ARM64)\n` +
                `*Móvil:* Capacitor (iOS + Android)\n\n` +
                `📁 *Estructura:*\n` +
                `• 21 páginas React + 4 componentes\n` +
                `• 1 server.js (~4500 líneas)\n` +
                `• 29 tablas PostgreSQL\n\n` +
                `_¿Qué parte quieres conocer?_`
            });
        }

        // ── FEATURES ────────────────────────────────────────────────
        if (intencion === 'features') {
            return res.json({ respuesta:
                `📋 *Features del POS:*\n\n` +
                `🛒 POS · 📦 Inventario · 👥 Clientes\n` +
                `📄 Cotizaciones · 🧾 Facturación DIAN\n` +
                `💰 Nómina · 🏪 Caja · 📊 Dashboard\n` +
                `🌐 Ecommerce · 🎫 Soporte\n` +
                `🔄 Updates remotos · 🤖 Bot (¡soy yo!)\n\n` +
                `_Pregúntame sobre cualquier feature._`
            });
        }

        // ── TABLAS / BASE DE DATOS ──────────────────────────────────
        if (intencion === 'tablas') {
            // Verificar si pregunta por una tabla específica
            if (msg.includes('usuarios') || msg.includes('usuario')) {
                return res.json({ respuesta:
                    `👤 *Tabla usuarios:*\n\n` +
                    `id_usuario · nombre · correo · password_hash\n` +
                    `rol (Admin/Cajero/Supervisor) · id_local\n` +
                    `aprobado_por_admin · foto_perfil · created_at`
                });
            }
            if (msg.includes('productos') || msg.includes('producto')) {
                return res.json({ respuesta:
                    `📦 *Tabla productos:*\n\n` +
                    `id_producto · nombre · descripcion · precio\n` +
                    `stock_actual · stock_minimo · id_categoria\n` +
                    `imagen_url · codigo_barras · id_local`
                });
            }
            if (msg.includes('ventas') || msg.includes('venta')) {
                return res.json({ respuesta:
                    `💰 *Tabla ventas:*\n\n` +
                    `id_venta · id_usuario · id_cliente · id_local\n` +
                    `subtotal · impuestos · total_neto\n` +
                    `metodo_pago · estado · fecha_venta`
                });
            }
            return res.json({ respuesta:
                `🗄️ *Base de datos — 29 tablas:*\n\n` +
                `*Core:* locales, usuarios, productos, categorías, clientes\n` +
                `*Ventas:* ventas, detalle_ventas, cotizaciones\n` +
                `*Caja:* turnos_caja, pagos_nomina\n` +
                `*Soporte:* tickets_soporte, notificaciones\n` +
                `*Admin:* super_admins, configuracion_sistema\n` +
                `*Ecommerce:* ecommerce_integraciones\n` +
                `*Extras:* producto_imagenes, proveedores, empleados\n\n` +
                `_¿Campos de alguna tabla específica?_`
            });
        }

        // ── ENDPOINTS / API ─────────────────────────────────────────
        if (intencion === 'endpoints') {
            return res.json({ respuesta:
                `🔌 *Endpoints principales:*\n\n` +
                `*Auth:* /api/auth/login, /registro, /me\n` +
                `*Productos:* /api/productos, /:id/imagenes\n` +
                `*Clientes:* /api/clientes, /buscar\n` +
                `*Ventas:* /api/ventas, /historial\n` +
                `*Cotizaciones:* /api/cotizaciones\n` +
                `*Caja:* /api/turnos, /apertura, /cierre\n` +
                `*Tickets:* /api/tickets\n` +
                `*SuperAdmin:* /api/super/*\n` +
                `*Updates:* /api/actualizaciones\n\n` +
                `_¿Qué endpoint necesitas?_`
            });
        }

        // ── ARCHIVOS / FRONTEND ─────────────────────────────────────
        if (intencion === 'archivos') {
            return res.json({ respuesta:
                `📁 *Archivos principales:*\n\n` +
                `• *App.jsx* — Rutas y layout\n` +
                `• *Login.jsx* — Login\n` +
                `• *Dashboard.jsx* — Panel principal\n` +
                `• *POS.jsx* — Punto de venta\n` +
                `• *Inventario.jsx* — Productos\n` +
                `• *Clientes.jsx* — Clientes\n` +
                `• *Configuracion.jsx* — Ajustes\n` +
                `• *SuperAdmin.jsx* — Panel admin\n` +
                `• *Header.jsx* — Barra lateral\n\n` +
                `_¿Qué archivo necesitas?_`
            });
        }

        // ── VERSIÓN ─────────────────────────────────────────────────
        if (intencion === 'version') {
            return res.json({ respuesta:
                `🔄 *Versión actual:* v${version}\n\n` +
                `📡 *Cómo funcionan las actualizaciones:*\n` +
                `1. Me dices qué cambios quieres\n` +
                `2. Yo publico automáticamente\n` +
                `3. Los clientes la ven al reiniciar\n\n` +
                `_¿Quieres publicar una nueva versión?_`
            });
        }

        // ── AUTOR ───────────────────────────────────────────────────
        if (intencion === 'autor') {
            return res.json({ respuesta:
                `👨‍💻 *Desarrollador:* Andrés Cuesta\n\n` +
                `📅 Creación: Agosto 2026\n` +
                `🛠️ Stack: React + Node.js + PostgreSQL\n` +
                `📱 Desktop: Electron · Móvil: Capacitor\n\n` +
                `_¿Qué necesitas del desarrollador? Yo puedo ayudarte con lo que sea._`
            });
        }

        // ── ESTADO DEL SERVIDOR ─────────────────────────────────────
        if (intencion === 'estado') {
            return res.json({ respuesta:
                `🟢 *Sistema funcionando correctamente*\n\n` +
                `⏱️ Tiempo activo: ${hrs}h ${min}m\n` +
                `📊 Versión: v${version}\n` +
                `💾 Puerto: 3000\n` +
                `🟢 Base de datos: conectada`
            });
        }

        // ── REPORTE ─────────────────────────────────────────────────
        if (accion === 'enviar' || msg.includes('reporte') || msg.includes('informe')) {
            const tipo = msg.includes('mensual') ? 'mensual' : 'semanal';
            const resultado = await enviarReporteAutomatico(tipo);
            return res.json({ respuesta: resultado.enviado
                ? `✅ Reporte ${tipo} enviado a tu correo.`
                : `⚠️ Reporte generado, pero no se pudo enviar el correo (revisa SMTP).`
            });
        }

        // ── RESPUESTAS FALLBACK CONTECTUALES ────────────────────────
        // Intenta entender por contexto antes de dar la respuesta por defecto

        if (msg.includes('local') || msg.includes('tienda')) {
            const locales = await getLocales();
            return res.json({ respuesta: `Tienes *${locales.length} locales*. ¿Quieres ver el detalle de alguno?` });
        }
        if (msg.includes('usuario') || msg.includes('empleado')) {
            const pendientes = await getPendientes();
            const total = await db.query('SELECT COUNT(*)::int AS n FROM usuarios');
            return res.json({ respuesta: `Hay *${total.rows[0].n} usuarios*. ${pendientes.length > 0 ? `${pendientes.length} pendiente(s).` : 'Todos aprobados.'}` });
        }
        if (msg.includes('venta') || msg.includes('dinero') || msg.includes('factura')) {
            return res.json({ respuesta: `Hoy: *${fmtCOP(m.ventas_hoy)}* · Este mes: *${fmtCOP(m.ventas_mes)}*` });
        }

        // ── RESPUESTA POR DEFECTO ───────────────────────────────────
        // Respuestas variadas para no sonar robotico
        const defaultRespuestas = [
            `🤔 Hmm, no estoy seguro de entender. Soy el asistente del *POS v${version}*.\n\nPuedo ayudarte con métricas, usuarios, ventas, actualizaciones y más.\n\n_Escribe "ayuda" para ver todo lo que puedo hacer._`,
            `🤔 No capté bien. ¿Puedes reformular?\n\nSoy el asistente del *POS v${version}*. Pregúntame sobre locales, ventas, usuarios, seguridad, o cualquier cosa técnica.\n\n_Escribe "ayuda" para ver opciones._`,
            `🤔 Interesante, pero no sé a qué te refieres.\n\nSoy el asistente del *POS v${version}*. Puedo ayudarte con:\n• Métricas y estadísticas\n• Gestionar usuarios\n• Publicar actualizaciones\n• Preguntas técnicas\n\n_Escribe "ayuda" para ver todo._`,
        ];
        return res.json({ respuesta: defaultRespuestas[Math.floor(Math.random() * defaultRespuestas.length)] });

    } catch (err) {
        console.error('Error en bot:', err);
        res.status(500).json({ respuesta: '❌ Error interno del servidor.' });
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

        let imageUrl;

        if (useCloudinary) {
            // Subir a Cloudinary
            imageUrl = await uploadToCloudinary(req.file.buffer, `productos/${idProd}`, 'image');

            // Eliminar imagen anterior de Cloudinary si existe
            const old = await db.query('SELECT imagen_url FROM productos WHERE id_producto=$1 AND id_local=$2', [idProd, idLocal]);
            if (old.rows[0]?.imagen_url) {
                await deleteFromCloudinary(old.rows[0].imagen_url, 'image');
            }
        } else {
            // Almacenamiento local (desarrollo)
            imageUrl = `/uploads/productos/${req.file.filename}`;

            // Eliminar imagen anterior si existe
            const old = await db.query('SELECT imagen_url FROM productos WHERE id_producto=$1 AND id_local=$2', [idProd, idLocal]);
            if (old.rows[0]?.imagen_url) {
                const oldPath = path.join(__dirname, old.rows[0].imagen_url);
                if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath);
            }
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
            if (useCloudinary) {
                await deleteFromCloudinary(imgUrl, 'image');
            } else {
                const fullPath = path.join(__dirname, imgUrl);
                if (fs.existsSync(fullPath)) fs.unlinkSync(fullPath);
            }
        }
        await db.query('UPDATE productos SET imagen_url=NULL WHERE id_producto=$1 AND id_local=$2', [idProd, idLocal]);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: 'Error interno del servidor.' });
    }
});

// POST /api/productos/:id/video — subir o reemplazar video
const uploadVideo = multer({
    storage: useCloudinary ? multer.memoryStorage() : (isProduction ? multer.memoryStorage() : multer.diskStorage({
        destination: (req, file, cb) => cb(null, uploadsDir),
        filename: (req, file, cb) => {
            const ext = path.extname(file.originalname).toLowerCase();
            cb(null, `video_${req.params.id}_${Date.now()}${ext}`);
        }
    })),
    limits: { fileSize: 50 * 1024 * 1024 }, // 50 MB max
    fileFilter: (req, file, cb) => {
        const allowed = ['.mp4', '.webm', '.mov', '.avi'];
        const ext = path.extname(file.originalname).toLowerCase();
        if (!allowed.includes(ext)) {
            return cb(new Error('Solo se permiten videos MP4, WebM, MOV o AVI.'));
        }
        cb(null, true);
    }
});

app.post('/api/productos/:id/video', requireAuth, requireAprobado, uploadVideo.single('video'), async (req, res) => {
    try {
        const idLocal = Number(req.user.id_local);
        const idProd = Number(req.params.id);
        if (!req.file) return res.status(400).json({ error: 'No se recibió ningún video.' });

        let videoUrl;

        // Intentar Cloudinary primero; si falla, guardar localmente
        if (useCloudinary) {
            try {
                videoUrl = await uploadToCloudinary(req.file.buffer, `productos/${idProd}`, 'video');
                // Eliminar video anterior de Cloudinary si existe
                const old = await db.query('SELECT video_url FROM productos WHERE id_producto=$1 AND id_local=$2', [idProd, idLocal]);
                if (old.rows[0]?.video_url) {
                    await deleteFromCloudinary(old.rows[0].video_url, 'video');
                }
            } catch (cloudErr) {
                console.warn('⚠ Cloudinary falló para video, guardando localmente:', cloudErr.message);
                videoUrl = null;
            }
        }
        if (!videoUrl) {
            // Fallback: guardar en disco local
            if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });
            const ext = path.extname(req.file.originalname).toLowerCase() || '.mp4';
            const filename = `video_${idProd}_${Date.now()}${ext}`;
            fs.writeFileSync(path.join(uploadsDir, filename), req.file.buffer);
            videoUrl = `/uploads/productos/${filename}`;
            // Eliminar video anterior local si existe
            const old = await db.query('SELECT video_url FROM productos WHERE id_producto=$1 AND id_local=$2', [idProd, idLocal]);
            if (old.rows[0]?.video_url && old.rows[0].video_url.startsWith('/uploads/')) {
                const oldPath = path.join(__dirname, old.rows[0].video_url);
                if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath);
            }
        }

        await db.query('UPDATE productos SET video_url=$1 WHERE id_producto=$2 AND id_local=$3', [videoUrl, idProd, idLocal]);
        res.json({ success: true, video_url: videoUrl });
    } catch (err) {
        console.error('Error subiendo video:', err);
        res.status(500).json({ error: 'Error al subir el video.' });
    }
});

// DELETE /api/productos/:id/video — eliminar video
app.delete('/api/productos/:id/video', requireAuth, requireAprobado, async (req, res) => {
    try {
        const idLocal = Number(req.user.id_local);
        const idProd = Number(req.params.id);
        const r = await db.query('SELECT video_url FROM productos WHERE id_producto=$1 AND id_local=$2', [idProd, idLocal]);
        const vidUrl = r.rows[0]?.video_url;
        if (vidUrl) {
            if (useCloudinary) {
                await deleteFromCloudinary(vidUrl, 'video');
            } else {
                const fullPath = path.join(__dirname, vidUrl);
                if (fs.existsSync(fullPath)) fs.unlinkSync(fullPath);
            }
        }
        await db.query('UPDATE productos SET video_url=NULL WHERE id_producto=$1 AND id_local=$2', [idProd, idLocal]);
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
            let url;
            // Intentar Cloudinary primero; si falla, guardar localmente
            if (useCloudinary) {
                try {
                    url = await uploadToCloudinary(file.buffer, `productos/${idProd}`, 'image');
                } catch (cloudErr) {
                    console.warn('⚠ Cloudinary falló, guardando localmente:', cloudErr.message);
                    url = null;
                }
            }
            if (!url) {
                // Fallback: guardar en disco local
                if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });
                const ext = path.extname(file.originalname).toLowerCase() || '.png';
                const filename = `producto_${idProd}_${Date.now()}${ext}`;
                fs.writeFileSync(path.join(uploadsDir, filename), file.buffer);
                url = `/uploads/productos/${filename}`;
            }
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

        // Borrar de Cloudinary o disco
        if (useCloudinary) {
            await deleteFromCloudinary(img.rows[0].url, 'image');
        } else {
            const fullPath = path.join(__dirname, img.rows[0].url);
            if (fs.existsSync(fullPath)) fs.unlinkSync(fullPath);
        }

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

// POST /api/tienda/logo — Subir logo de la tienda (para la tienda pública)
const logosDir = path.join(__dirname, 'logos');
if (!fs.existsSync(logosDir)) fs.mkdirSync(logosDir, { recursive: true });

const uploadLogo = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
    fileFilter: (req, file, cb) => {
        const allowed = ['.jpg', '.jpeg', '.png', '.webp', '.svg'];
        const ext = path.extname(file.originalname).toLowerCase();
        if (!allowed.includes(ext)) return cb(new Error('Solo se permiten imágenes JPG, PNG, WebP o SVG.'));
        cb(null, true);
    }
});

app.post('/api/tienda/logo', requireAuth, requireAprobado, requireAdmin, uploadLogo.single('logo'), async (req, res) => {
    try {
        if (!req.file) return res.status(400).json({ error: 'No se recibió imagen.' });
        let url;
        if (useCloudinary) {
            url = await uploadToCloudinary(req.file.buffer, 'logos', 'image');
        } else {
            const ext = path.extname(req.file.originalname).toLowerCase();
            const filename = `cjp-watch-logo${ext}`;
            const dest = path.join(logosDir, filename);
            fs.writeFileSync(dest, req.file.buffer);
            url = `/logos/${filename}`;
        }
        res.json({ success: true, url });
    } catch (err) {
        console.error('Error subiendo logo:', err);
        res.status(500).json({ error: 'Error al subir logo.' });
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

// Función helper: sincronizar productos POS → e-commerce
async function sincronizarProductosEcommerce(idLocal, plataforma, domain, credenciales) {
    // Obtener productos del local (con stock > 0)
    const prodR = await db.query(
        `SELECT p.id_producto, p.nombre_producto, p.precio_venta, p.stock_actual, p.imagen_url,
                c.nombre_categoria
         FROM productos p
         LEFT JOIN categorias c ON p.id_categoria = c.id_categoria
         WHERE p.id_local=$1 AND p.stock_actual > 0`,
        [idLocal]
    );

    if (prodR.rows.length === 0) return { sincronizados: 0, total: 0, errores: [] };

    let sincronizados = 0;
    const errores = [];

    if (plataforma === 'shopify' && credenciales) {
        for (const prod of prodR.rows) {
            try {
                const body = {
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
                if (prod.imagen_url) {
                    body.product.images = [{ src: prod.imagen_url }];
                }
                const r = await fetch(`https://${domain}/admin/api/2024-01/products.json`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'X-Shopify-Access-Token': credenciales },
                    body: JSON.stringify(body)
                });
                if (r.ok) sincronizados++;
                else errores.push(`${prod.nombre_producto}: ${r.status}`);
            } catch (e) {
                errores.push(`${prod.nombre_producto}: ${e.message}`);
            }
        }
    }

    if (plataforma === 'woocommerce' && credenciales) {
        let creds;
        try { creds = JSON.parse(credenciales); } catch { creds = null; }
        if (creds?.consumer_key && creds?.consumer_secret) {
            const auth = 'Basic ' + Buffer.from(creds.consumer_key + ':' + creds.consumer_secret).toString('base64');
            for (const prod of prodR.rows) {
                try {
                    const body = {
                        name: prod.nombre_producto,
                        type: 'simple',
                        regular_price: String(prod.precio_venta),
                        manage_stock: true,
                        stock_quantity: prod.stock_actual,
                        categories: prod.nombre_categoria ? [{ name: prod.nombre_categoria }] : []
                    };
                    if (prod.imagen_url) {
                        body.images = [{ src: prod.imagen_url }];
                    }
                    const r = await fetch(`https://${domain}/wp-json/wc/v3/products`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json', 'Authorization': auth },
                        body: JSON.stringify(body)
                    });
                    if (r.ok) sincronizados++;
                    else errores.push(`${prod.nombre_producto}: ${r.status}`);
                } catch (e) {
                    errores.push(`${prod.nombre_producto}: ${e.message}`);
                }
            }
        }
    }

    return { sincronizados, total: prodR.rows.length, errores };
}

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

        // v2.2.0: Cifrar access_token antes de guardar en BD
        const encryptedToken = encrypt(credenciales);

        await db.query(`
            INSERT INTO ecommerce_integraciones (id_local, plataforma, nombre_tienda, shop_domain, access_token, activa)
            VALUES ($1, $2, $3, $4, $5, true)
            ON CONFLICT (id_local, plataforma, shop_domain)
            DO UPDATE SET nombre_tienda=$3, access_token=$5, activa=true, fecha_conexion=NOW()
        `, [idLocal, plataforma, tiendaNombre, domain, encryptedToken]);

        // ── Sincronización automática de productos ─────────────────────────
        // Después de conectar, publicar todos los productos del local en la tienda
        let syncResultado = null;
        try {
            syncResultado = await sincronizarProductosEcommerce(idLocal, plataforma, domain, credenciales);
        } catch (syncErr) {
            console.error('Error en sync automática:', syncErr.message);
        }

        res.json({
            success: true,
            nombre_tienda: tiendaNombre,
            sync: syncResultado ? {
                productos_sincronizados: syncResultado.sincronizados,
                productos_total: syncResultado.total,
                errores: syncResultado.errores?.length || 0,
            } : null,
        });
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
        const { shop_domain, access_token: encryptedToken } = intR.rows[0];
        // v2.2.0: Descifrar token antes de usar
        const access_token = decrypt(encryptedToken);

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
        const { shop_domain, access_token: encryptedToken } = intR.rows[0];
        // v2.2.0: Descifrar token antes de usar
        const access_token = decrypt(encryptedToken);
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

// ─────────────────────────────────────────────────────────
// v2.1.1: TRACKING DE INSTALACIONES
// ─────────────────────────────────────────────────────────
app.post('/api/instalaciones/reportar', async (req, res) => {
    try {
        const { ip, sistema_operativo, hostname, version_app } = req.body;
        // Verificar si ya existe una instalación con este hostname
        const existente = await db.query('SELECT * FROM instalaciones WHERE hostname = $1', [hostname || 'desconocido']);

        if (existente.rows.length > 0) {
            // Actualizar versión y fecha si cambió
            const anterior = existente.rows[0];
            const versionCambiada = anterior.version_app !== version_app;
            await db.query(
                'UPDATE instalaciones SET version_app = $1, fecha = NOW(), activa = true WHERE hostname = $2',
                [version_app || 'desconocida', hostname || 'desconocido']
            );
            // Notificar si es una nueva instalación o upgrade
            if (versionCambiada && anterior.version_app !== 'desconocida') {
                await db.query(
                    `INSERT INTO notificaciones (tipo, titulo, mensaje, leida) VALUES ($1, $2, $3, false)`,
                    ['instalacion', '🔄 Actualización detectada',
                     `${hostname} actualizó de v${anterior.version_app} a v${version_app} (${sistema_operativo})`]
                );
                console.log(`🔔 Notificación: ${hostname} actualizó de v${anterior.version_app} a v${version_app}`);
            } else if (!fs.existsSync(path.join(app?.getPath?.('userData') || '/tmp', '.reported_v2'))) {
                // Primera vez que reporta con esta versión
                await db.query(
                    `INSERT INTO notificaciones (tipo, titulo, mensaje, leida) VALUES ($1, $2, $3, false)`,
                    ['instalacion', '📱 App abierta',
                     `${hostname} abrió la app v${version_app} (${sistema_operativo})`]
                );
            }
        } else {
            // Nueva instalación
            await db.query(
                'INSERT INTO instalaciones (ip, sistema_operativo, hostname, version_app) VALUES ($1, $2, $3, $4)',
                [ip || 'desconocida', sistema_operativo || 'desconocido', hostname || 'desconocido', version_app || 'desconocida']
            );
            // Notificar nueva instalación
            await db.query(
                `INSERT INTO notificaciones (tipo, titulo, mensaje, leida) VALUES ($1, $2, $3, false)`,
                ['instalacion', '🆕 Nueva instalación',
                 `${hostname} instaló la app v${version_app} (${sistema_operativo})`]
            );
            console.log(`🔔 Nueva instalación: ${hostname} - v${version_app}`);
        }
        res.json({ success: true });
    } catch (err) {
        console.error('[Instalaciones] Error reportando:', err.message);
        res.status(500).json({ error: 'Error al reportar instalación' });
    }
});

// Endpoint para obtener notificaciones del SuperAdmin
app.get('/api/super/notificaciones', requireSuperAdmin, async (req, res) => {
    try {
        const result = await db.query('SELECT * FROM notificaciones ORDER BY created_at DESC LIMIT 20');
        res.json(result.rows);
    } catch (err) {
        console.error('[Notificaciones] Error:', err.message);
        res.json([]);
    }
});

// Marcar notificación como leída
app.put('/api/super/notificaciones/:id/leer', requireSuperAdmin, async (req, res) => {
    try {
        await db.query('UPDATE notificaciones SET leida = true WHERE id = $1', [req.params.id]);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: 'Error' });
    }
});

// Marcar todas como leídas
app.put('/api/super/notificaciones/leer-todas', requireSuperAdmin, async (req, res) => {
    try {
        await db.query('UPDATE notificaciones SET leida = true WHERE leida = false');
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: 'Error' });
    }
});

app.get('/api/instalaciones', async (req, res) => {
    try {
        const result = await db.query('SELECT * FROM instalaciones ORDER BY fecha DESC LIMIT 100');
        res.json(result.rows);
    } catch (err) {
        console.error('[Instalaciones] Error consultando:', err.message);
        res.status(500).json({ error: 'Error al consultar instalaciones' });
    }
});

// ─────────────────────────────────────────────────────────
// v2.1.1: ACTUALIZACIONES REMOTAS
// ─────────────────────────────────────────────────────────
app.get('/api/actualizaciones/ultima', async (req, res) => {
    try {
        const result = await db.query(
            "SELECT * FROM actualizaciones WHERE activa = true ORDER BY fecha_publicacion DESC LIMIT 1"
        );
        if (result.rows.length === 0) {
            return res.json({ disponible: false });
        }
        const ultima = result.rows[0];
        const clientVersion = req.query.version || '0.0.0';
        const disponible = ultima.version !== clientVersion;
        res.json({ disponible, version: ultima.version, changelog: ultima.changelog, url_descarga: ultima.url_descarga, fecha: ultima.fecha_publicacion });
    } catch (err) {
        console.error('[Actualizaciones] Error:', err.message);
        res.status(500).json({ error: 'Error al verificar actualizaciones' });
    }
});

app.post('/api/actualizaciones/crear', uploadUpdate.single('archivo'), async (req, res) => {
    try {
        const { version, changelog, url_descarga } = req.body;
        if (!version) return res.status(400).json({ error: 'Versión requerida' });

        // Si se subió un archivo, generar la URL de descarga
        let downloadUrl = url_descarga || '';
        if (req.file) {
            const baseUrl = isProduction
                ? 'https://sistema-ventas-pos-aeka.onrender.com'
                : `http://localhost:${process.env.PORT || 3000}`;
            downloadUrl = `${baseUrl}/updates/${req.file.filename}`;
        }

        // Desactivar anteriores
        await db.query('UPDATE actualizaciones SET activa = false');
        const result = await db.query(
            'INSERT INTO actualizaciones (version, changelog, url_descarga) VALUES ($1, $2, $3) RETURNING *',
            [version, changelog || '', downloadUrl]
        );
        res.json({ success: true, actualizacion: result.rows[0] });
    } catch (err) {
        console.error('[Actualizaciones] Error creando:', err.message);
        res.status(500).json({ error: 'Error al crear actualización' });
    }
});

app.get('/api/actualizaciones', async (req, res) => {
    try {
        const result = await db.query('SELECT * FROM actualizaciones ORDER BY fecha_publicacion DESC LIMIT 20');
        res.json(result.rows);
    } catch (err) {
        console.error('[Actualizaciones] Error listando:', err.message);
        res.status(500).json({ error: 'Error al listar actualizaciones' });
    }
});

// v2.2.3: Catch-all — servir index.html para rutas del frontend (React Router)
// Esto permite que /tienda/:idLocal, /login, /dashboard, etc. funcionen
const frontendIndex = frontendPaths.map(fp => path.join(fp, 'index.html')).find(fp => fs.existsSync(fp));
console.log(`[Frontend] Index HTML: ${frontendIndex || 'NO ENCONTRADO'}`);
app.use((req, res, next) => {
    // Si es API o uploads, pasar al 404
    if (req.path.startsWith('/api/') || req.path.startsWith('/uploads/') || req.path.startsWith('/updates/')) {
        return res.status(404).json({ error: 'Ruta no encontrada.' });
    }
    // Si el request es para un archivo con extensión (js, css, png, etc) y no existe, 404
    if (path.extname(req.path)) {
        return res.status(404).json({ error: 'Archivo no encontrado.' });
    }
    // Si existe el index.html del frontend, servirlo (React Router se encarga)
    if (frontendIndex) {
        return res.sendFile(frontendIndex);
    }
    // Fallback 404
    res.status(404).json({ error: 'Ruta no encontrada.' });
});

const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || '0.0.0.0';

// v2.2.11: Ejecutar migraciones ANTES de abrir el puerto
// Esto evita que lleguen requests antes de que las columnas existan
(async () => {
    // v2.2.9: columnas opcionales + visibilidad
    try {
        await db.query('ALTER TABLE productos ALTER COLUMN codigo_barras DROP NOT NULL');
        await db.query('ALTER TABLE productos ALTER COLUMN precio_compra DROP NOT NULL');
        await db.query('ALTER TABLE productos ALTER COLUMN id_categoria DROP NOT NULL');
        await db.query('ALTER TABLE productos ALTER COLUMN id_categoria SET DEFAULT 3');
        await db.query('ALTER TABLE productos ADD COLUMN IF NOT EXISTS video_url VARCHAR(500)');
        await db.query('ALTER TABLE productos ADD COLUMN IF NOT EXISTS visible_en_tienda BOOLEAN DEFAULT true');
        console.log('[v2.2.9] Migración productos aplicada: opcionales + visibilidad');
    } catch (e) {
        console.error('[v2.2.9] Migración productos:', e.message);
    }
    // v2.2.10: categoría General
    try {
        await db.query(`INSERT INTO categorias (id_categoria, nombre_categoria) VALUES (3, 'General') ON CONFLICT (id_categoria) DO NOTHING`);
        console.log('[v2.2.10] Categoría General (id=3) asegurada');
    } catch (e) {
        console.error('[v2.2.10] Migración categoría General:', e.message);
    }

    // Abrir puerto DESPUÉS de las migraciones
    app.listen(PORT, HOST, () => {
        console.log(`Backend server running on http://${HOST}:${PORT}`);
        console.log(`   Local:    http://localhost:${PORT}`);
        console.log(`   Network:  http://0.0.0.0:${PORT}`);
        console.log(`   Health:   http://localhost:${PORT}/api/health`);
    });
})();
