#!/usr/bin/env node
/**
 * Aplica una migración SQL específica sin tocar el resto de la BD.
 * Uso: node migrate-file.js <archivo.sql>
 *
 * Pensado para aplicar parches incrementales como v1.5.5-proveedores-nomina.sql
 */

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error('❌ ERROR: DATABASE_URL no está configurada');
  process.exit(1);
}

const file = process.argv[2];
if (!file) {
  console.error('❌ ERROR: pasa el archivo SQL como argumento');
  console.error('   Uso: node migrate-file.js migrations/v1.5.5-proveedores-nomina.sql');
  process.exit(1);
}

const filePath = path.isAbsolute(file) ? file : path.join(__dirname, file);
if (!fs.existsSync(filePath)) {
  console.error(`❌ ERROR: no existe ${filePath}`);
  process.exit(1);
}

const sql = fs.readFileSync(filePath, 'utf8');

async function run() {
  const client = new Client({ connectionString });
  try {
    await client.connect();
    console.log(`✅ Conectado a Neon DB`);
    console.log(`📄 Aplicando migración: ${filePath}`);
    await client.query(sql);
    console.log('✅ Migración aplicada correctamente');
  } catch (err) {
    console.error('❌ Error:', err.message);
    process.exit(1);
  } finally {
    await client.end();
  }
}

run();
