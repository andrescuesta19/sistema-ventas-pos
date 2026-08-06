require('dotenv').config();
const fs = require('fs');
const { Client } = require('pg');

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  console.error('❌ ERROR: DATABASE_URL no está configurada en el archivo .env');
  process.exit(1);
}

const client = new Client({
  connectionString: connectionString,
});

async function migrate() {
  try {
    await client.connect();
    console.log('Conectado a Neon DB');

    // Drop tables if they exist to start fresh
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

    const schema = fs.readFileSync('schema.sql', 'utf8');
    await client.query(schema);
    console.log('Schema ejecutado correctamente');

    const seed = fs.readFileSync('seed.sql', 'utf8');
    await client.query(seed);
    console.log('Seed ejecutado correctamente');

  } catch (err) {
    console.error('Error ejecutando migración:', err);
  } finally {
    await client.end();
  }
}

migrate();
