// scripts/reset-db.js
// ⚠️  SCRIPT DESTRUCTIVO: Borra TODAS las tablas y las recrea desde cero.
//     Piérdete todas las ventas, productos, clientes y turnos existentes.
//
// Uso: node scripts/reset-db.js
//
// Genera hashes bcrypt NUEVOS en vivo para garantizar que estas contraseñas
// funcionan 100% (no dependemos de hashes pre-calculados del seed.sql original).

require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const fs = require('fs');
const path = require('path');
const { Client } = require('pg');
const bcrypt = require('bcryptjs');

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
    console.error('❌ ERROR: DATABASE_URL no está configurada en el archivo .env');
    process.exit(1);
}

// ⚠️ M1-fix: Guard de seguridad. Por defecto requiere opt-in explícito para correr,
// porque es DESTRUCTIVO. Ejecutar con ALLOW_DB_RESET=yes-i-know-what-im-doing.
const ALLOW_FLAG = process.env.ALLOW_DB_RESET;
if (ALLOW_FLAG !== 'yes-i-know-what-im-doing') {
    console.error('❌ ESTE SCRIPT ES DESTRUCTIVO: borra TODAS las tablas y datos.');
    console.error('   Para ejecutarlo, setea la variable:');
    console.error('   ALLOW_DB_RESET=yes-i-know-what-im-doing npm run reset');
    console.error('');
    console.error('   Ejemplo (ver contraseñas al final):');
    console.error('   ALLOW_DB_RESET=yes-i-know-what-im-doing SHOW_SEED_CREDS=true npm run reset');
    process.exit(1);
}

// ⚠️ Definir las contraseñas en UN solo lugar, aquí.
// Si quieres cambiarlas, edita solo este objeto.
const CREDENCIALES = {
    locales: [
        {
            nombre: 'iStore Centro',
            direccion: 'Calle 10 # 20-30',
            usuarios: [
                { correo: 'admin@istore.com',   contrasena: 'admin123',  nombre: 'Administrador Centro', rol: 'Administrador' },
                { correo: 'cajero@istore.com',  contrasena: 'cajero123', nombre: 'Cajero Centro',        rol: 'Cajero' },
            ],
        },
        {
            nombre: 'TechShop Norte',
            direccion: 'Avenida 50 # 15-45',
            usuarios: [
                { correo: 'admin@techshop.com', contrasena: 'admin123',  nombre: 'Administrador Norte',  rol: 'Administrador' },
            ],
        },
    ],
    // Clientes de ejemplo
    clientes: [
        { documento: '22222222', nombre: 'Consumidor Final', telefono: '0000000', correo: 'anonimo@pos.com', puntos: 0 },
        { documento: '10203040', nombre: 'Juan Perez',       telefono: '3001234567', correo: 'juan.perez@email.com', puntos: 15 },
    ],
    categorias: ['Smartphones', 'Accesorios'],
    productosPorLocal: {
        1: [ // iStore Centro
            { barras: 'APL-IP13-128', nombre: 'iPhone 13 (128GB)', img: 'https://store.storeimages.cdn-apple.com/4668/as-images.apple.com/is/iphone-13-finish-unselect-gallery-1-202207_GEO_US?wid=5120&hei=2880&fmt=p-jpg&qlt=80&.v=1654894121404', cat: 1, compra: 2300000, venta: 2800000, stock: 15, min: 5 },
            { barras: 'APL-IP14-128', nombre: 'iPhone 14 (128GB)', img: 'https://store.storeimages.cdn-apple.com/4668/as-images.apple.com/is/iphone-14-finish-select-202209-6-1inch-blue?wid=5120&hei=2880&fmt=p-jpg&qlt=80&.v=1661026582322', cat: 1, compra: 2800000, venta: 3300000, stock: 20, min: 5 },
            { barras: 'APL-IP15-128', nombre: 'iPhone 15 (128GB)', img: 'https://store.storeimages.cdn-apple.com/4668/as-images.apple.com/is/iphone-15-finish-select-202309-6-1inch-black?wid=5120&hei=2880&fmt=p-jpg&qlt=80&.v=1692923777972', cat: 1, compra: 3300000, venta: 3800000, stock: 25, min: 5 },
            { barras: 'APL-IP16-128', nombre: 'iPhone 16 (128GB)', img: 'https://store.storeimages.cdn-apple.com/4668/as-images.apple.com/is/iphone-16-finish-select-202409-6-1inch-ultramarine?wid=5120&hei=2880&fmt=p-jpg&qlt=80&.v=1723145610815', cat: 1, compra: 3800000, venta: 4300000, stock: 30, min: 8 },
        ],
        2: [ // TechShop Norte
            { barras: 'APL-IP13-128',  nombre: 'iPhone 13 (128GB)',         img: 'https://store.storeimages.cdn-apple.com/4668/as-images.apple.com/is/iphone-13-finish-unselect-gallery-1-202207_GEO_US?wid=5120&hei=2880&fmt=p-jpg&qlt=80&.v=1654894121404', cat: 1, compra: 2300000, venta: 2750000, stock: 5, min: 5 },
            { barras: 'APL-IP15PM-256', nombre: 'iPhone 15 Pro Max (256GB)', img: 'https://store.storeimages.cdn-apple.com/4668/as-images.apple.com/is/iphone-15-pro-finish-select-202309-6-7inch-naturaltitanium?wid=5120&hei=2880&fmt=p-jpg&qlt=80&.v=1692845702708', cat: 1, compra: 5000000, venta: 5500000, stock: 8, min: 4 },
        ],
    },
};

async function reset() {
    const client = new Client({ connectionString });
    try {
        await client.connect();
        console.log('✅ Conectado a Neon DB\n');

        console.log('🗑️  Eliminando tablas existentes...');
        await client.query(`
            DROP TABLE IF EXISTS detalle_ventas CASCADE;
            DROP TABLE IF EXISTS ventas CASCADE;
            DROP TABLE IF EXISTS turnos_caja CASCADE;
            DROP TABLE IF EXISTS productos CASCADE;
            DROP TABLE IF EXISTS categorias CASCADE;
            DROP TABLE IF EXISTS clientes CASCADE;
            DROP TABLE IF EXISTS usuarios CASCADE;
            DROP TABLE IF EXISTS locales CASCADE;
        `);
        console.log('   Tablas eliminadas\n');

        console.log('🏗️  Ejecutando schema.sql...');
        const schema = fs.readFileSync(path.resolve(__dirname, '../schema.sql'), 'utf8');
        await client.query(schema);
        console.log('   Schema creado\n');

        console.log('🔐 Generando hashes bcrypt NUEVOS en vivo (esto toma unos segundos)...');
        // Generar todos los hashes primero
        // ⚠️ A4-fix: NO logueamos la contraseña en claro. Solo el correo del usuario.
        const hashCache = {};
        const contrasenasUnicas = new Set();
        for (const local of CREDENCIALES.locales) {
            for (const u of local.usuarios) {
                contrasenasUnicas.add(u.contrasena);
            }
        }
        for (const pass of contrasenasUnicas) {
            hashCache[pass] = await bcrypt.hash(pass, 10);
        }
        console.log(`   • ${contrasenasUnicas.size} hashes únicos generados para ${CREDENCIALES.locales.reduce((acc, l) => acc + l.usuarios.length, 0)} usuarios`);
        console.log('');

        // Insertar locales
        console.log('🏪 Insertando locales...');
        const localIds = [];
        for (const local of CREDENCIALES.locales) {
            const res = await client.query(
                'INSERT INTO locales (nombre_local, direccion) VALUES ($1, $2) RETURNING id_local',
                [local.nombre, local.direccion]
            );
            localIds.push(res.rows[0].id_local);
            console.log(`   • ${local.nombre} → id_local=${res.rows[0].id_local}`);
        }
        console.log('');

        // Insertar usuarios con hashes nuevos
        // ⚠️ A4-fix: NO logueamos la contraseña en claro.
        console.log('👤 Insertando usuarios con hashes NUEVOS...');
        for (let i = 0; i < CREDENCIALES.locales.length; i++) {
            const local = CREDENCIALES.locales[i];
            const idLocal = localIds[i];
            for (const u of local.usuarios) {
                const hash = hashCache[u.contrasena];
                await client.query(
                    'INSERT INTO usuarios (id_local, nombre, correo, contrasena_hash, rol) VALUES ($1, $2, $3, $4, $5)',
                    [idLocal, u.nombre, u.correo, hash, u.rol]
                );
                console.log(`   ✓ ${u.correo.padEnd(22)} (${u.rol})`);
            }
        }
        console.log('');

        // Insertar clientes
        console.log('🧑 Insertando clientes...');
        for (const c of CREDENCIALES.clientes) {
            await client.query(
                'INSERT INTO clientes (documento_identidad, nombre_razon_social, telefono, correo, puntos_acumulados) VALUES ($1, $2, $3, $4, $5)',
                [c.documento, c.nombre, c.telefono, c.correo, c.puntos]
            );
            console.log(`   • ${c.nombre} (${c.documento})`);
        }
        console.log('');

        // Insertar categorías
        console.log('🏷️  Insertando categorías...');
        for (const cat of CREDENCIALES.categorias) {
            await client.query('INSERT INTO categorias (nombre_categoria) VALUES ($1)', [cat]);
        }
        console.log('');

        // Insertar productos
        console.log('📦 Insertando productos...');
        for (let i = 0; i < localIds.length; i++) {
            const idLocal = localIds[i];
            const productos = CREDENCIALES.productosPorLocal[idLocal] || [];
            for (const p of productos) {
                await client.query(
                    `INSERT INTO productos (id_local, codigo_barras, nombre_producto, imagen_url, id_categoria, precio_compra, precio_venta, stock_actual, stock_minimo)
                     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
                    [idLocal, p.barras, p.nombre, p.img, p.cat, p.compra, p.venta, p.stock, p.min]
                );
            }
            console.log(`   • ${productos.length} productos para local ${idLocal}`);
        }
        console.log('');

        console.log('🎉 ¡Base de datos reseteada con éxito!\n');
        // ⚠️ A4-fix: Por seguridad, las contraseñas en claro SOLO se muestran si
        // se ejecuta con SHOW_SEED_CREDS=true. Por defecto solo se listan los correos.
        const showCreds = (process.env.SHOW_SEED_CREDS || '').toLowerCase() === 'true';
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.log('USUARIOS CREADOS:');
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        for (const local of CREDENCIALES.locales) {
            console.log(`\n📍 ${local.nombre}:`);
            for (const u of local.usuarios) {
                if (showCreds) {
                    console.log(`   ${u.correo.padEnd(24)} / ${u.contrasena.padEnd(12)} (${u.rol})`);
                } else {
                    console.log(`   ${u.correo.padEnd(24)} (${u.rol})`);
                    console.log(`     contraseña: (ver CREDENCIALES en scripts/reset-db.js o ejecutar con SHOW_SEED_CREDS=true)`);
                }
            }
        }
        if (!showCreds) {
            console.log('\n💡 Para ver las contraseñas, ejecuta: SHOW_SEED_CREDS=true npm run reset');
        }
        console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    } catch (err) {
        console.error('❌ Error reseteando BD:', err);
        process.exit(1);
    } finally {
        await client.end();
    }
}

reset();
