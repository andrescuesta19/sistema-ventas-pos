const { app, BrowserWindow, shell, ipcMain, dialog, Menu } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { spawn, exec, execFile } = require('child_process');
const net = require('net');

// ─────────────────────────────────────────────────────────
// PROTOCOLO PERSONALIZADO: pos:// para Google OAuth
// ─────────────────────────────────────────────────────────
// v2.2.2: Registramos el protocolo "pos://" para que Google OAuth
// pueda redirigir de vuelta a la app de Electron.
// Ejemplo: pos://callback?token=xxx
const PROTOCOL_KEY = 'pos';

// ─────────────────────────────────────────────────────────
// BACKEND: Arranque automático en producción + WATCHDOG
// ─────────────────────────────────────────────────────────
// En producción (app empaquetada), arrancamos el backend como proceso hijo.
// El WATCHDOG detecta si el backend se cae y lo reinicia automáticamente.
// En desarrollo, asumimos que el usuario lo arranca por su cuenta.

let backendProcess = null;
let backendStarting = false;
let backendCrashed = false;            // true si el backend se cayó inesperadamente
let backendRestartAttempts = 0;         // contador de reinicios automáticos
let backendMaxRestartAttempts = 5;      // máx reinicios antes de rendirse
let backendLastCrashTime = 0;           // timestamp del último crash
let backendRestartTimer = null;         // timer del reinicio
let backendHealthCheckInterval = null;  // interval que vigila el puerto

function isPortOpen(host, port, timeoutMs = 500) {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    let done = false;
    const finish = (ok) => { if (!done) { done = true; socket.destroy(); resolve(ok); } };
    socket.setTimeout(timeoutMs);
    socket.once('connect', () => finish(true));
    socket.once('timeout', () => finish(false));
    socket.once('error', () => finish(false));
    socket.connect(port, host);
  });
}

async function waitForBackend(port, maxMs = 20000) {
  const start = Date.now();
  const hosts = ['127.0.0.1', '::1'];
  while (Date.now() - start < maxMs) {
    for (const h of hosts) {
      if (await isPortOpen(h, port, 400)) return true;
    }
    await new Promise(r => setTimeout(r, 300));
  }
  return false;
}

function startBackendInProduction() {
  if (backendProcess) return; // ya está corriendo

  const backendDir = path.join(process.resourcesPath, 'backend');
  const serverJs = path.join(backendDir, 'server.js');
  const nodeModules = path.join(backendDir, 'node_modules');

  if (!fs.existsSync(serverJs)) {
    console.error('❌ No se encontró server.js del backend en:', backendDir);
    console.error('   La app está mal empaquetada. Reinstala desde el DMG.');
    return;
  }
  if (!fs.existsSync(nodeModules)) {
    console.error('❌ No se encontró node_modules del backend en:', nodeModules);
    console.error('   La app está mal empaquetada. Reinstala desde el DMG.');
    return;
  }

  // .env: si no existe, copiar desde .env.production
  const envPath = path.join(backendDir, '.env');
  const envProductionPath = path.join(backendDir, '.env.production');
  if (!fs.existsSync(envPath) && fs.existsSync(envProductionPath)) {
    try {
      fs.copyFileSync(envProductionPath, envPath);
      console.log('✅ .env creado desde .env.production');
    } catch (e) {
      console.error('❌ No se pudo crear .env:', e.message);
    }
  }

  console.log(`🚀 Arrancando backend desde: ${backendDir} (intento #${backendRestartAttempts + 1})`);
  backendProcess = spawn(process.execPath, [serverJs], {
    cwd: backendDir,
    env: {
      ...process.env,
      ELECTRON_RUN_AS_NODE: '1',
      PORT: process.env.PORT || '3000',
      HOST: process.env.HOST || '0.0.0.0',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  backendProcess.stdout.on('data', (data) => {
    console.log(`[backend] ${data.toString().trim()}`);
  });
  backendProcess.stderr.on('data', (data) => {
    console.error(`[backend ERROR] ${data.toString().trim()}`);
  });

  backendProcess.on('exit', (code, signal) => {
    const wasKilled = backendProcess && backendProcess._killed;
    console.warn(`⚠ Backend terminó con código ${code}, señal ${signal} (matar: ${wasKilled})`);

    // Si fue matado intencionalmente (killed manualmente o al cerrar la app), no hacer nada
    if (wasKilled) {
      backendProcess = null;
      return;
    }

    // Crash no intencional — activar watchdog
    backendCrashed = true;
    backendProcess = null;
    backendLastCrashTime = Date.now();

    // Si han pasado muchos crashes seguidos, no reiniciar (para no entrar en loop)
    if (backendRestartAttempts >= backendMaxRestartAttempts) {
      console.error(`❌ Backend crasheó ${backendRestartAttempts} veces. No se reiniciará más.`);
      // Notificar al usuario
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('backend:crashed-permanently');
      }
      return;
    }

    backendRestartAttempts += 1;
    console.log(`🔄 Watchdog: reiniciando backend en 3s (intento ${backendRestartAttempts}/${backendMaxRestartAttempts})`);

    // Notificar a la UI que hubo un crash y se va a reiniciar
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('backend:crashed-rebooting', {
        intento: backendRestartAttempts,
        max: backendMaxRestartAttempts,
      });
    }

    // Programar reinicio
    if (backendRestartTimer) clearTimeout(backendRestartTimer);
    backendRestartTimer = setTimeout(() => {
      startBackendInProduction();
      // Esperar a que esté listo
      waitForBackend(parseInt(process.env.PORT || '3000', 10), 15000).then(ready => {
        if (ready) {
          console.log('✅ Backend reiniciado por watchdog');
          backendCrashed = false;
          if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('backend:recovered');
          }
        } else {
          console.error('❌ Backend no se pudo reiniciar');
        }
      });
    }, 3000);
  });

  backendProcess.on('error', (err) => {
    console.error('❌ Error arrancando backend:', err);
  });
}

function killBackend() {
  if (backendProcess) {
    console.log('🛑 Cerrando backend...');
    try {
      backendProcess._killed = true;  // marca para que el handler de exit no haga watchdog
      backendProcess.kill('SIGTERM');
      // Si no muere en 3s, forzar
      setTimeout(() => {
        if (backendProcess) {
          try { backendProcess.kill('SIGKILL'); } catch {}
        }
      }, 3000);
    } catch (e) {
      console.error('Error cerrando backend:', e);
    }
    backendProcess = null;
  }
  if (backendHealthCheckInterval) {
    clearInterval(backendHealthCheckInterval);
    backendHealthCheckInterval = null;
  }
}

// ─────────────────────────────────────────────────────────
// AUTO-UPDATE: solo se carga en producción (no en dev)
// ─────────────────────────────────────────────────────────
let autoUpdater = null;
if (!process.env.ELECTRON_DEV && !process.env.NODE_ENV) {
  try {
    const updater = require('electron-updater');
    autoUpdater = updater.autoUpdater;
    autoUpdater.autoDownload = false; // Pedimos confirmación al usuario
    autoUpdater.autoInstallOnAppQuit = false; // v1.7.3: instalación manual (Squirrel.Mac exige firma)
    console.log('✓ Auto-updater cargado');
  } catch (err) {
    console.warn('⚠ electron-updater no disponible:', err.message);
  }
}

let mainWindow;

function createWindow(loadingMessage = 'Cargando aplicación...') {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 1024,
    minHeight: 700,
    title: 'Sistema Integral de Ventas - POS',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      webSecurity: true,
      devTools: !app.isPackaged, // v2.2.7: bloquear DevTools si está empaquetado
      enableRemoteModule: false,
      preload: path.join(__dirname, 'preload.cjs')
    },
    autoHideMenuBar: false,
    show: false,
    backgroundColor: '#f6f8f7' // neutro — evita flash verde al recargar
  });

  // v2.2.7: Anti-ingeniería inversa en producción
  // Bloquea F12, Ctrl+Shift+I, Ctrl+Shift+J, Ctrl+U, click derecho
  if (app.isPackaged) {
    mainWindow.setMenuBarVisibility(false);
    mainWindow.webContents.on('before-input-event', (event, input) => {
      if (
        input.key === 'F12' ||
        (input.control && input.shift && (input.key === 'I' || input.key === 'i' || input.key === 'J' || input.key === 'j' || input.key === 'C' || input.key === 'c')) ||
        (input.control && (input.key === 'U' || input.key === 'u')) ||
        (input.meta && (input.key === 'U' || input.key === 'u')) // macOS Cmd+U
      ) {
        event.preventDefault();
      }
    });
    mainWindow.webContents.on('context-menu', (event) => {
      event.preventDefault();
    });
  }

  // Splash screen: mientras el backend arranca, mostramos un HTML inline
  // con un spinner. Cuando el backend responda, cargamos la app real.
  if (!isDev) {
    const splashHtml = `<!DOCTYPE html>
<html><head><meta charset="UTF-8"><style>
  body { margin:0; height:100vh; display:flex; flex-direction:column;
         align-items:center; justify-content:center;
         background:#0a1a0e; color:#fff; font-family:system-ui,sans-serif; }
  .spinner { width:56px; height:56px; border:4px solid rgba(126,217,87,0.15);
             border-top-color:#7ed957; border-radius:50%;
             animation:spin 0.9s linear infinite; margin-bottom:1.5rem; }
  @keyframes spin { to { transform:rotate(360deg); } }
  h1 { font-size:1.2rem; font-weight:600; color:#7ed957; margin:0 0 0.5rem; }
  p { color:rgba(255,255,255,0.6); font-size:0.9rem; margin:0; }
  .brand { position:absolute; bottom:1.5rem; font-size:0.75rem;
           color:rgba(255,255,255,0.4); }
</style></head><body>
  <div class="spinner"></div>
  <h1>Sistema Integral de Ventas</h1>
  <p id="msg">${loadingMessage}</p>
  <div class="brand">✦ Desarrollado por Andrés Cuesta</div>
</body></html>`;
    mainWindow.loadURL('data:text/html;charset=UTF-8,' + encodeURIComponent(splashHtml));
  }

  // === DEBUG: Capturar errores del renderer ===
  // v2.2.6: usar app.getPath('temp') para que sea portable entre Mac/Linux/Windows.
  // Antes usaba '/tmp/' hardcoded que en Windows tira ENOENT porque C:\tmp no existe
  // para el usuario estándar. Ahora usa la carpeta temporal del SO.
  const errorLog = path.join(app.getPath('temp'), 'electron-renderer-errors.log');
  const logStream = fs.createWriteStream(errorLog, { flags: 'a' });
  logStream.write(`\n\n=== ${new Date().toISOString()} ===\n`);

  mainWindow.webContents.on('console-message', (event, level, message, line, sourceId) => {
    const levels = ['debug', 'info', 'warning', 'error'];
    const lvl = levels[level] || 'log';
    const line2 = `[renderer ${lvl}] ${sourceId}:${line} → ${message}`;
    console.log(line2);
    logStream.write(line2 + '\n');
  });

  mainWindow.webContents.on('render-process-gone', (event, details) => {
    const msg = `!!! RENDER PROCESS GONE: ${JSON.stringify(details)}`;
    console.error(msg);
    logStream.write(msg + '\n');
  });

  mainWindow.webContents.on('did-fail-load', (event, errorCode, errorDescription, validatedURL) => {
    const msg = `!!! FAILED LOAD: ${errorCode} ${errorDescription} (${validatedURL})`;
    console.error(msg);
    logStream.write(msg + '\n');
  });

  // v2.2.x FIX: Detectar tokens JWT viejos (firmados con secret aleatorio anterior)
  // y limpiarlos automáticamente al arrancar. Solo se ejecuta una vez por versión.
  const SESSION_FIX_FLAG = 'pos_session_fix_v2.2.4_applied';
  mainWindow.webContents.on('did-finish-load', () => {
    if (!mainWindow || mainWindow.isDestroyed()) return;
    mainWindow.webContents.executeJavaScript(`
      (function() {
        try {
          if (localStorage.getItem('${SESSION_FIX_FLAG}')) return;
          const token = localStorage.getItem('pos_token');
          const user = localStorage.getItem('pos_user');
          // Si hay token+user pero el token no empieza con JWT válido, limpiar
          if (token && user && token.split('.').length !== 3) {
            localStorage.removeItem('pos_token');
            localStorage.removeItem('pos_user');
          }
          // También limpiar si el user tiene avatar_url gigante (>200KB base64)
          // que pueda causar lentitud
          if (user && user.length > 500000) {
            try {
              const u = JSON.parse(user);
              if (u.avatar_url && u.avatar_url.length > 300000) {
                u.avatar_url = null;
                localStorage.setItem('pos_user', JSON.stringify(u));
              }
            } catch {}
          }
          localStorage.setItem('${SESSION_FIX_FLAG}', '1');
        } catch (e) {}
      })();
    `).catch(() => {});
  });

  // v1.5.5: DevTools ya no se abren automáticamente al iniciar.
  // Para abrirlas: menú Ver → Toggle Developer Tools, o Cmd+Option+I.
  // (Antes había un openDevTools que era temporal de debug y se quedó.)

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  // Abrir enlaces externos en el navegador
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('http:') || url.startsWith('https:')) {
      shell.openExternal(url);
      return { action: 'deny' };
    }
    return { action: 'allow' };
  });

  // Menú personalizado
  const isMac = process.platform === 'darwin';
  const template = [
    ...(isMac ? [{ role: 'appMenu' }] : []),
    {
      label: 'Archivo',
      submenu: [
        isMac ? { role: 'close' } : { role: 'quit' }
      ]
    },
    {
      label: 'Edición',
      submenu: [
        { role: 'undo' }, { role: 'redo' }, { type: 'separator' },
        { role: 'cut' }, { role: 'copy' }, { role: 'paste' }
      ]
    },
    {
      label: 'Ver',
      submenu: [
        { role: 'reload' },
        { role: 'forceReload' },
        { role: 'toggleDevTools' },
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' }
      ]
    },
    {
      label: 'Ayuda',
      submenu: [
        {
          label: 'Buscar actualizaciones',
          click: () => checkForUpdates(true)
        },
        {
          label: 'Acerca de',
          click: () => {
            dialog.showMessageBox(mainWindow, {
              type: 'info',
              title: 'Acerca de Sistema de Ventas POS',
              message: 'Sistema Integral de Ventas - POS',
              detail: `Versión ${app.getVersion()}\nElectron ${process.versions.electron}\nNode ${process.versions.node}\n\nDesarrollado por Andrés Cuesta\n© 2026 Todos los derechos reservados`,
              buttons: ['OK']
            });
          }
        }
      ]
    }
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));

  const devServerUrl = process.env.VITE_DEV_SERVER_URL || 'http://localhost:5173';

  if (process.env.ELECTRON_DEV === 'true' || process.env.NODE_ENV === 'development') {
    mainWindow.loadURL(devServerUrl);
  }
  // En producción: NO cargamos nada aquí. El splash ya está visible.
  // app.whenReady() cargará la app REAL después de que el backend esté listo.

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// ─────────────────────────────────────────────────────────
// IPC: Handlers para auto-update desde el renderer
// ─────────────────────────────────────────────────────────
ipcMain.handle('app:check-for-updates', async () => {
  return await checkForUpdates(false);
});

ipcMain.handle('app:download-update', async () => {
  if (!autoUpdater) return { success: false, error: 'updater no disponible' };
  try {
    await autoUpdater.downloadUpdate();
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle('app:install-update', async () => {
  if (!autoUpdater) return { success: false, error: 'updater no disponible' };
  try {
    await installUpdateManually();
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle('app:get-version', () => app.getVersion());

ipcMain.handle('app:check-backend', async () => {
  if (isDev) {
    // En desarrollo, asumimos que el usuario lo corre manualmente
    return { running: await isPortOpen('127.0.0.1', BACKEND_PORT, 800) };
  }
  // En producción, el backend es nuestro hijo
  return { running: backendProcess !== null && await isPortOpen('127.0.0.1', BACKEND_PORT, 800) };
});

ipcMain.handle('app:restart-backend', async () => {
  if (isDev) return { success: false, error: 'En desarrollo, arranca el backend manualmente' };
  killBackend();
  await new Promise(r => setTimeout(r, 500));
  startBackendInProduction();
  const ready = await waitForBackend(BACKEND_PORT, 15000);
  return { success: ready, error: ready ? null : 'Backend no respondió en 15s' };
});

// v2.2.2: Abrir enlaces externos en el navegador del sistema
ipcMain.handle('app:open-external', async (event, url) => {
  await shell.openExternal(url);
});

// ─────────────────────────────────────────────────────────
// Función principal de check de updates
// ─────────────────────────────────────────────────────────
async function checkForUpdates(userInitiated = false) {
  if (!autoUpdater) {
    if (userInitiated && mainWindow) {
      await dialog.showMessageBox(mainWindow, {
        type: 'info',
        title: 'Actualizaciones',
        message: 'El sistema de actualizaciones no está disponible en esta compilación.',
        detail: 'Esto es normal en versiones de desarrollo.'
      });
    }
    return { available: false };
  }

  try {
    const result = await autoUpdater.checkForUpdates();
    return { available: !!result?.updateInfo };
  } catch (err) {
    if (userInitiated && mainWindow) {
      await dialog.showMessageBox(mainWindow, {
        type: 'info',
        title: 'Actualizaciones',
        message: 'No se pudo verificar actualizaciones',
        detail: err.message || 'Error desconocido'
      });
    }
    return { available: false, error: err.message };
  }
}

// ─────────────────────────────────────────────────────────
// UPDATER MANUAL (v1.7.3)
// Squirrel.Mac (electron-updater) exige firma de código válida (Developer ID).
// Sin certificado de Apple, la instalación falla con SQRLCodeSignatureErrorDomain.
// Solución: descargar el ZIP, reemplazar el .app en /Applications y relanzar.
// ─────────────────────────────────────────────────────────
const APP_INSTALL_PATH = '/Applications/Sistema de Ventas POS.app';

function findPendingZip() {
  // app.getPath('cache') = ~/Library/Caches (el ZIP descargado vive en
  // ~/Library/Caches/sistema-ventas-pos-updater/pending/)
  const pendingDir = path.join(app.getPath('cache'), 'sistema-ventas-pos-updater', 'pending');
  try {
    const files = fs.readdirSync(pendingDir).filter(f => f.endsWith('.zip'));
    if (files.length === 0) return null;
    // El más reciente
    files.sort((a, b) => fs.statSync(path.join(pendingDir, b)).mtimeMs - fs.statSync(path.join(pendingDir, a)).mtimeMs);
    return path.join(pendingDir, files[0]);
  } catch {
    return null;
  }
}

function execAsync(cmd) {
  return new Promise((resolve, reject) => {
    exec(cmd, { maxBuffer: 10 * 1024 * 1024 }, (err, stdout, stderr) => {
      if (err) reject(new Error(stderr || err.message));
      else resolve(stdout);
    });
  });
}

function execFileAsync(file, args) {
  return new Promise((resolve, reject) => {
    execFile(file, args, { maxBuffer: 10 * 1024 * 1024 }, (err, stdout, stderr) => {
      if (err) reject(new Error(stderr || err.message));
      else resolve(stdout);
    });
  });
}

async function installUpdateManually() {
  const zipPath = findPendingZip();
  if (!zipPath) {
    throw new Error('No se encontró el ZIP de la actualización descargada.');
  }

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pos-update-'));
  const newApp = path.join(tmpDir, 'Sistema de Ventas POS.app');

  console.log(`📦 Descomprimiendo ${zipPath}...`);
  await execAsync(`ditto -x -k "${zipPath}" "${tmpDir}"`);
  if (!fs.existsSync(newApp)) {
    throw new Error('El ZIP no contiene la app esperada.');
  }

  // Preservar el .env real del backend (el ZIP no lo incluye)
  const envPath = path.join(APP_INSTALL_PATH, 'Contents', 'Resources', 'backend', '.env');
  const envBackup = path.join(tmpDir, 'env-backup');
  let hadEnv = false;
  if (fs.existsSync(envPath)) {
    fs.copyFileSync(envPath, envBackup);
    hadEnv = true;
    console.log('🔐 .env real preservado');
  }

  console.log('🔁 Reemplazando la app en /Applications (pedirá tu contraseña)...');
  // execFile evita problemas de quoting con espacios y comillas.
  // El .env se restaura DENTRO del script admin (si no, queda como root y el
  // proceso normal no puede escribirlo). También se hace chown -R al usuario
  // actual porque el backend necesita escribir en backend/uploads/.
  const currentUser = os.userInfo().username;
  const envRestore = hadEnv
    ? ` && cp '${envBackup}' '${envPath}' && chmod 644 '${envPath}'`
    : '';
  const shellCmd = `rm -rf '${APP_INSTALL_PATH}' && cp -R '${newApp}' '${APP_INSTALL_PATH}' && chmod -R 755 '${APP_INSTALL_PATH}' && chown -R ${currentUser}:staff '${APP_INSTALL_PATH}'${envRestore}`;
  const appleScript = `do shell script "${shellCmd}" with administrator privileges`;
  await execFileAsync('osascript', ['-e', appleScript]);

  console.log('🚀 Relanzando la app...');
  // app.exit(0) NO dispara before-quit, así que el backend hijo quedaría vivo
  // ocupando el puerto 3000. Lo matamos explícitamente antes de relanzar.
  if (backendProcess) {
    try { backendProcess.kill('SIGKILL'); } catch {}
    backendProcess = null;
  }
  app.relaunch();
  app.exit(0);
}

// ─────────────────────────────────────────────────────────
// Eventos de auto-updater
// ─────────────────────────────────────────────────────────
if (autoUpdater) {
  autoUpdater.on('checking-for-update', () => {
    console.log('🔄 Buscando actualizaciones...');
    if (mainWindow) mainWindow.webContents.send('update:checking');
  });

  autoUpdater.on('update-available', (info) => {
    console.log(`✨ Actualización disponible: v${info.version}`);
    if (mainWindow) {
      dialog.showMessageBox(mainWindow, {
        type: 'info',
        title: '¡Actualización disponible!',
        message: `Hay una nueva versión disponible: v${info.version}`,
        detail: `Versión actual: ${app.getVersion()}\nNueva versión: ${info.version}\n\n¿Quieres descargarla ahora? La app se reiniciará para instalarla.`,
        buttons: ['Descargar ahora', 'Más tarde'],
        defaultId: 0,
        cancelId: 1
      }).then(({ response }) => {
        if (response === 0) {
          autoUpdater.downloadUpdate().catch(err => {
            console.error('Error descargando:', err);
            dialog.showErrorBox('Error de descarga', err.message);
          });
        }
      });
      mainWindow.webContents.send('update:available', info);
    }
  });

  autoUpdater.on('download-progress', (progress) => {
    const pct = Math.round(progress.percent);
    console.log(`⬇ Descargando: ${pct}%`);
    if (mainWindow) mainWindow.webContents.send('update:progress', progress);
  });

  autoUpdater.on('update-downloaded', (info) => {
    console.log(`✅ Actualización descargada: v${info.version}`);
    if (mainWindow) {
      dialog.showMessageBox(mainWindow, {
        type: 'info',
        title: 'Actualización lista',
        message: `La versión v${info.version} se descargó correctamente.`,
        detail: 'La app se reiniciará para instalar la actualización. Se pedirá tu contraseña de administrador para reemplazar la aplicación.',
        buttons: ['Reiniciar ahora', 'Al cerrar la app'],
        defaultId: 0,
        cancelId: 1
      }).then(async ({ response }) => {
        if (response === 0) {
          try {
            await installUpdateManually();
          } catch (err) {
            console.error('❌ Error instalando actualización:', err);
            dialog.showErrorBox('Error al instalar', err.message);
          }
        }
      });
      mainWindow.webContents.send('update:downloaded', info);
    }
  });

  autoUpdater.on('error', (err) => {
    console.error('❌ Error en auto-updater:', err);
  });

  // Check al iniciar (después de 3s para no bloquear el arranque)
  setTimeout(() => {
    console.log('🔍 Verificando actualizaciones al iniciar...');
    autoUpdater.checkForUpdates().catch(err => console.warn('Check inicial falló:', err.message));
  }, 3000);
}

// ─────────────────────────────────────────────────────────
// v2.1.1: TRACKING DE INSTALACIÓN + CHECK DE ACTUALIZACIONES
// ─────────────────────────────────────────────────────────

async function reportarInstalacion() {
  try {
    // SIEMPRE reportar al abrir (actualiza versión si cambió)
    const http = require('http');
    const data = JSON.stringify({
      ip: 'local',
      sistema_operativo: `${process.platform} ${os.release()}`,
      hostname: os.hostname(),
      version_app: app.getVersion()
    });
    await new Promise((resolve, reject) => {
      const req = http.request(`http://127.0.0.1:${BACKEND_PORT}/api/instalaciones/reportar`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) }
      }, (res) => { res.on('data', () => {}); res.on('end', resolve); });
      req.on('error', reject);
      req.write(data);
      req.end();
    });
    console.log('✅ Instalación reportada al servidor');
  } catch (err) {
    console.warn('⚠ No se pudo reportar instalación:', err.message);
  }
}

async function checkActualizaciones() {
  try {
    const http = require('http');
    const result = await new Promise((resolve, reject) => {
      http.get(`http://127.0.0.1:${BACKEND_PORT}/api/actualizaciones/ultima?version=${app.getVersion()}`, (res) => {
        let body = '';
        res.on('data', (chunk) => body += chunk);
        res.on('end', () => { try { resolve(JSON.parse(body)); } catch { resolve({}); } });
      }).on('error', reject);
    });
    if (result.disponible && mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('update:remote-available', {
        version: result.version,
        changelog: result.changelog,
        url_descarga: result.url_descarga
      });
      console.log(`🔔 Actualización remota disponible: v${result.version}`);
    }
  } catch (err) {
    console.warn('⚠ Check de actualizaciones falló:', err.message);
  }
}

// ─────────────────────────────────────────────────────────
// App lifecycle
// ─────────────────────────────────────────────────────────
const isDev = process.env.NODE_ENV === 'development' || process.env.ELECTRON_DEV === 'true';
const BACKEND_PORT = parseInt(process.env.PORT || '3000', 10);

// v2.2.2: Registrar protocolo personalizado ANTES de app.whenReady()
app.setAsDefaultProtocolClient(PROTOCOL_KEY);

// Manejar URLs del protocolo pos://
// En Mac: app.on('open-url')
// En Windows/Linux: segundo instancia de la app
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.quit();
} else {
  app.on('second-instance', (event, commandLine) => {
    // Windows/Linux: extraer URL del protocolo
    const url = commandLine.find(arg => arg.startsWith(`${PROTOCOL_KEY}://`));
    if (url) {
      handleProtocolUrl(url);
    }
    // Si la ventana está minimizada, restaurarla
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });
}

// Mac: open-url se dispara cuando la app ya está abierta
app.on('open-url', (event, url) => {
  event.preventDefault();
  handleProtocolUrl(url);
});

function handleProtocolUrl(url) {
  // Extraer el token de la URL: pos://callback?token=xxx
  try {
    const parsed = new URL(url);
    const token = parsed.searchParams.get('token');
    const user = parsed.searchParams.get('user');
    
    if (token && mainWindow && !mainWindow.isDestroyed()) {
      // Enviar el token al renderer process
      mainWindow.webContents.send('google-auth-callback', {
        token,
        user: user ? JSON.parse(decodeURIComponent(user)) : null,
      });
      console.log('✅ Google OAuth callback recibido via pos:// protocol');
    }
  } catch (err) {
    console.error('Error procesando protocolo pos://:', err);
  }
}

app.whenReady().then(async () => {
  if (!isDev) {
    // Mostramos splash screen inmediatamente
    createWindow('Iniciando servidor del sistema...');

    // Producción: arrancamos el backend y esperamos a que esté listo
    startBackendInProduction();
    backendStarting = true;
    console.log(`⏳ Esperando al backend en puerto ${BACKEND_PORT}...`);

    // Actualizar el mensaje del splash cada 3s
    let elapsed = 0;
    const splashInterval = setInterval(() => {
      elapsed += 1;
      const msg = `Iniciando servidor del sistema... (${elapsed}s)`;
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.executeJavaScript(
          `var el = document.getElementById('msg'); if(el) el.textContent = ${JSON.stringify(msg)};`
        ).catch(() => {});
      }
    }, 1000);

    // v2.2.7: aumentamos a 60s para tolerar conexiones lentas a Neon
    // (especialmente en primer arranque con Cloudflare delante)
    const ready = await waitForBackend(BACKEND_PORT, 60000);
    clearInterval(splashInterval);
    backendStarting = false;

    if (ready) {
      console.log('✅ Backend listo');
      // Cargamos la app real desde el backend (NO desde el asar)
      // El backend sirve el frontend en /, así que loadURL es más confiable
      // que loadFile porque evita problemas de rutas relativas dentro del asar.
      if (mainWindow) {
        mainWindow.loadURL(`http://localhost:${BACKEND_PORT}`);
      }

      // 🔄 HEALTH CHECK PERIÓDICO (watchdog continuo)
      // Cada 10s verificamos que el backend responda. Si no responde,
      // y el proceso tampoco existe, lo reiniciamos automáticamente.
      backendHealthCheckInterval = setInterval(async () => {
        if (!backendProcess) return; // El watchdog de exit ya está manejando
        const portOpen = await isPortOpen('127.0.0.1', BACKEND_PORT, 1500);
        if (!portOpen && backendProcess) {
          console.warn('⚠ Health check: backend no responde en puerto. Forzando reinicio...');
          try {
            backendProcess._killed = true;
            backendProcess.kill('SIGKILL');
          } catch {}
          // El handler de exit lo va a detectar y reiniciar
        }
      }, 10000);

      // v2.1.1: Reportar instalación + check de actualizaciones remotas
      reportarInstalacion();
      setTimeout(() => checkActualizaciones(), 5000);

    } else {
      console.error(`❌ Backend no respondió en ${BACKEND_PORT} después de 25s`);
      if (mainWindow) {
        const errorHtml = `<!DOCTYPE html>
<html><head><meta charset="UTF-8"><style>
  body { margin:0; height:100vh; display:flex; flex-direction:column;
         align-items:center; justify-content:center; padding:2rem;
         background:#0a1a0e; color:#fff; font-family:system-ui,sans-serif; }
  .icon { font-size:4rem; margin-bottom:1rem; }
  h1 { font-size:1.4rem; font-weight:700; color:#ff6b6b; margin:0 0 0.5rem; }
  p { color:rgba(255,255,255,0.7); font-size:0.95rem; max-width:600px;
      text-align:center; line-height:1.5; }
  code { background:rgba(255,255,255,0.08); padding:0.2rem 0.4rem;
         border-radius:4px; font-size:0.85rem; }
  button { margin-top:2rem; padding:0.7rem 1.5rem; background:#7ed957;
           color:#0a1a0e; border:none; border-radius:8px; font-size:1rem;
           font-weight:600; cursor:pointer; margin-right:0.5rem; }
  .brand { position:absolute; bottom:1.5rem; font-size:0.75rem;
           color:rgba(255,255,255,0.4); }
</style></head><body>
  <div class="icon">⚠️</div>
  <h1>No se pudo iniciar el servidor</h1>
  <p>El backend no respondió en el puerto <code>${BACKEND_PORT}</code> después de 60 segundos.</p>
  <p>Esto puede pasar si la instalación está incompleta o si el puerto está ocupado.</p>
  <p>Revisa los logs en <code>~/Library/Logs/Sistema de Ventas POS/</code></p>
  <div>
    <button onclick="window.location.reload()">🔄 Reintentar</button>
    <button onclick="window.location.reload()">🔧 Reinstalar backend</button>
  </div>
  <div class="brand">✦ Desarrollado por Andrés Cuesta</div>
</body></html>`;
        mainWindow.loadURL('data:text/html;charset=UTF-8,' + encodeURIComponent(errorHtml));
      }
      return;
    }
  } else {
    createWindow();
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  killBackend();
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('before-quit', () => {
  killBackend();
});
