// Ejecuta la migración v2.2.6 directamente contra Neon
// Uso: node backend/scripts/aplicar-migracion-v2.2.6.js
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
        path.join(__dirname, '..', 'migrations', 'v2.2.6-productos-destacados.sql'),
        'utf8'
    );
    try {
        console.log('[migración v2.2.6] Aplicando cambios a productos...');
        await pool.query(sql);
        console.log('[migración v2.2.6] ✅ Columnas destacado y posicion_destacado agregadas');
        // Verificar
        const r = await pool.query(`
            SELECT column_name, data_type, is_nullable, column_default
            FROM information_schema.columns
            WHERE table_name='productos' AND column_name IN ('destacado','posicion_destacado')
        `);
        console.table(r.rows);
    } catch (err) {
        console.error('❌ Error:', err.message);
        process.exit(1);
    } finally {
        await pool.end();
    }
})();
