// Ejecuta la migración v2.2.10 directamente contra Neon
// Uso: node backend/scripts/aplicar-migracion-v2.2.10.js
require('dotenv').config({ path: __dirname + '/../.env' });
const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

(async () => {
    const sql = fs.readFileSync(
        path.join(__dirname, '..', 'migrations', 'v2.2.10-ofertas.sql'),
        'utf8'
    );
    try {
        console.log('[migración v2.2.10] Agregando columnas de ofertas a productos...');
        await pool.query(sql);
        console.log('[migración v2.2.10] ✅ Columnas precio_oferta, oferta_activa, fecha_inicio_oferta, fecha_fin_oferta agregadas');
        // Verificar
        const r = await pool.query(`
            SELECT column_name, data_type, is_nullable, column_default
            FROM information_schema.columns
            WHERE table_name='productos' AND column_name IN ('precio_oferta', 'oferta_activa', 'fecha_inicio_oferta', 'fecha_fin_oferta')
            ORDER BY column_name
        `);
        console.table(r.rows);
    } catch (err) {
        console.error('❌ Error:', err.message);
        process.exit(1);
    } finally {
        await pool.end();
    }
})();