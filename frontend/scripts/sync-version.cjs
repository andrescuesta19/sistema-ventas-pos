#!/usr/bin/env node
/**
 * Sincroniza la versión del frontend al backend para que el backend empaquetado
 * pueda devolver la versión correcta en /api/health (v1.5.4+).
 *
 * Uso: node scripts/sync-version.cjs
 * Se ejecuta automáticamente como `prebuild` antes de `npm run build`.
 */

const fs = require('fs');
const path = require('path');

const FRONTEND_PKG = path.join(__dirname, '..', 'package.json');
const BACKEND_VERSION_FILE = path.join(__dirname, '..', '..', 'backend', 'frontend-version.json');

try {
  const pkg = JSON.parse(fs.readFileSync(FRONTEND_PKG, 'utf8'));
  const version = pkg.version || 'desconocida';
  const out = { version, name: pkg.name, syncedAt: new Date().toISOString() };
  fs.writeFileSync(BACKEND_VERSION_FILE, JSON.stringify(out, null, 2));
  console.log(`[sync-version] ${version} → backend/frontend-version.json`);
} catch (err) {
  console.error('[sync-version] Error:', err.message);
  process.exit(1);
}
