const fs = require('fs');
const { Client } = require('pg');

const connectionString = 'postgresql://neondb_owner:npg_2MvedAqOpKf9@ep-billowing-flower-atimh18c-pooler.c-9.us-east-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require';

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
