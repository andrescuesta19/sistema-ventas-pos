require('dotenv').config();
const { Pool } = require('pg');

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  console.error('❌ ERROR: DATABASE_URL no está configurada en el archivo .env');
}

const pool = new Pool({
  connectionString: connectionString,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
  ssl: connectionString && connectionString.includes('sslmode=') ? { rejectUnauthorized: false } : false
});

// En bases de datos cloud (Neon DB), las conexiones inactivas se cierran automáticamente.
// NO debemos hacer process.exit(-1) porque mataba el servidor Express cada vez que Neon cerraba una conexión inactiva.
pool.on('error', (err, client) => {
  console.warn('⚠️ Conexión inactiva con PostgreSQL reconectará automáticamente:', err.message);
});

module.exports = pool;
