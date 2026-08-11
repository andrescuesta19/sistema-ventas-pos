#!/usr/bin/env node
/**
 * Auto-commit + bump de versión para v1.5.5+
 *
 * - Detecta el último tag (o usa v0.0.0 si no hay)
 * - Hace commit de los cambios actuales con un mensaje descriptivo
 * - (Opcional) Bumpea la versión si --bump se pasa
 *
 * Se ejecuta automáticamente desde `prebuild` (configurable en package.json)
 * cuando hay cambios pendientes antes de un build.
 *
 * Por seguridad, NO empuja (push) sin confirmación del usuario.
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..'); // /Users/.../pos_system
const FRONTEND_PKG = path.join(__dirname, '..', 'package.json');

function sh(cmd, opts = {}) {
  try {
    return execSync(cmd, { cwd: ROOT, stdio: 'pipe', encoding: 'utf8', ...opts }).trim();
  } catch (e) {
    return null;
  }
}

const status = sh('git status --porcelain');
if (!status) {
  console.log('[auto-commit] Sin cambios pendientes, saltando.');
  process.exit(0);
}

const version = JSON.parse(fs.readFileSync(FRONTEND_PKG, 'utf8')).version;
const lines = status.split('\n').filter(Boolean).length;
const files = sh('git status --porcelain | awk \'{print $2}\'') || '';
const fileSummary = files.split('\n').slice(0, 8).map(f => '  - ' + f).join('\n');

const message = `feat: cambios v${version} (auto-commit prebuild)

${lines} archivos modificados:
${fileSummary}
${lines > 8 ? '  ... y ' + (lines - 8) + ' más\n' : ''}
Generado automáticamente antes del build.`;

console.log(`[auto-commit] ${lines} archivos cambiados en v${version}`);

const staged = sh('git add -A');
const committed = sh(`git commit -m ${JSON.stringify(message)}`);

if (committed) {
  console.log('[auto-commit] ✅ Commit creado');
  console.log(committed);
} else {
  console.log('[auto-commit] ⚠ No se pudo crear el commit (posiblemente sin cambios staged)');
}
