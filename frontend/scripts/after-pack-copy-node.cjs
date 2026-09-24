// Hook afterPack para electron-builder.
// v2.2.10: copia el binario de Node.js + todas sus dylibs al .app empaquetado
// porque process.execPath en Electron no funciona correctamente con
// ELECTRON_RUN_AS_NODE=1 desde un spawn de procesos hijos.
//
// electron-builder espera este archivo como módulo JS CommonJS (no bash).
// Ver: https://www.electron.build/configuration/configuration#AfterPack

const { execFileSync } = require('child_process');
const path = require('path');

module.exports = async function afterPack(context) {
  const appOutDir = context.appOutDir; // ej: ".../release/mac-arm64"
  const platform = context.electronPlatformName; // 'darwin' | 'win32' | 'linux'

  if (platform !== 'darwin' && platform !== 'linux' && platform !== 'win32') {
    console.log(`[afterPack] Plataforma ${platform} no soportada, saltando copia de Node`);
    return;
  }

  const scriptPath = path.join(__dirname, 'post-build-copy-node.sh');
  const appBundle = path.join(appOutDir, `${context.packager.appInfo.productFilename}.app`);

  console.log(`[afterPack] Ejecutando script de copia de Node binario...`);
  console.log(`[afterPack] Script: ${scriptPath}`);
  console.log(`[afterPack] App: ${appBundle}`);

  try {
    execFileSync(scriptPath, [appBundle], { stdio: 'inherit' });
    console.log('[afterPack] ✅ Node binario copiado correctamente');
  } catch (err) {
    console.error('[afterPack] ❌ Error copiando Node binario:', err.message);
    // No throw: electron-builder continuará. El usuario verá error claro
    // cuando intente arrancar el backend.
  }
};