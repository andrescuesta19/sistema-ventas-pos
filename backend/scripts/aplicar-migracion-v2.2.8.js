// Ejecuta la migración v2.2.8 directamente contra Neon
// Uso: node backend/scripts/aplicar-migracion-v2.2.8.js
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
        path.join(__dirname, '..', 'migrations', 'v2.2.8-whatsapp-segunda-linea.sql'),
        'utf8'
    );
    try {
        console.log('[migración v2.2.8] Aplicando columna telefono_whatsapp_2 a locales...');
        await pool.query(sql);
        console.log('[migración v2.2.8] ✅ Columna telefono_whatsapp_2 agregada');
        // Verificar
        const r = await pool.query(`
            SELECT column_name, data_type, is_nullable, column_default
            FROM information_schema.columns
            WHERE table_name='locales' AND column_name = 'telefono_whatsapp_2'
        `);
        console.table(r.rows);
    } catch (err) {
        console.error('❌ Error:', err.message);
        process.exit(1);
    } finally {
        await pool.end();
    }
})();