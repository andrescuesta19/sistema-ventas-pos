const { app, BrowserWindow, shell, ipcMain, dialog, Menu } = require('electron');
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
const net = require('net');

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
    autoUpdater.autoInstallOnAppQuit = true;
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
      preload: path.join(__dirname, 'preload.cjs')
    },
    autoHideMenuBar: false,
    show: false,
    backgroundColor: '#0a1a0e' // evita flash blanco al cargar
  });

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
  const errorLog = '/tmp/electron-renderer-errors.log';
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
  } else {
    mainWindow.loadFile(path.join(__dirname, 'dist', 'index.html'));
  }

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

ipcMain.handle('app:install-update', () => {
  if (!autoUpdater) return;
  autoUpdater.quitAndInstall();
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
        detail: 'La app se reiniciará para instalar la actualización.',
        buttons: ['Reiniciar ahora', 'Al cerrar la app'],
        defaultId: 0,
        cancelId: 1
      }).then(({ response }) => {
        if (response === 0) {
          autoUpdater.quitAndInstall();
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
// App lifecycle
// ─────────────────────────────────────────────────────────
const isDev = process.env.NODE_ENV === 'development' || process.env.ELECTRON_DEV === 'true';
const BACKEND_PORT = parseInt(process.env.PORT || '3000', 10);

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
      if (mainWindow) {
        mainWindow.webContents.executeJavaScript(
          `document.getElementById('msg').textContent = ${JSON.stringify(msg)};`
        ).catch(() => {});
      }
    }, 1000);

    const ready = await waitForBackend(BACKEND_PORT, 25000);
    clearInterval(splashInterval);
    backendStarting = false;

    if (ready) {
      console.log('✅ Backend listo');
      // Cargamos la app real
      if (mainWindow) {
        mainWindow.loadFile(path.join(__dirname, 'dist', 'index.html'));
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
  <p>El backend no respondió en el puerto <code>${BACKEND_PORT}</code> después de 25 segundos.</p>
  <p>Esto puede pasar si la instalación está incompleta o si el puerto está ocupado.</p>
  <p>Revisa los logs en <code>~/Library/Logs/Sistema de Ventas POS/</code></p>
  <div>
    <button onclick="window.location.reload()">🔄 Reintentar</button>
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
