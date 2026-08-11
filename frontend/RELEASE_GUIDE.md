# 🚀 Guía de Release / Actualizaciones

Esta guía explica el flujo completo para generar nuevas versiones de **Sistema de Ventas POS** y distribuirlas con auto-update.

## 📋 Flujo de trabajo

```
1. Hacer cambios en el código
2. Subir versión en package.json (ej: 1.1.0 → 1.2.0)
3. git tag v1.x.0 (si usas git)
4. npm run build
5. npm run electron:build:mac
6. Subir archivos a un servidor/CDN
7. Los usuarios reciben la actualización automáticamente
```

## 🔢 Versionado (Semantic Versioning)

| Cambio | Versión | Ejemplo |
|---|---|---|
| Bugfix, pequeño cambio | PATCH | 1.0.0 → 1.0.1 |
| Nueva feature, compatible | MINOR | 1.0.0 → 1.1.0 |
| Breaking change | MAJOR | 1.0.0 → 2.0.0 |

## 🛠️ Comandos

### Generar build de Mac
```bash
cd frontend
npm run build              # Build de Vite
npx electron-builder --mac  # Genera DMG + ZIP
```

### Generar build de Windows (en PC con Windows)
```cmd
cd frontend
npm install
npm run build
npm run electron:build:win
```

### Generar todo (Mac + Windows + Linux)
```bash
npm run electron:build:all
```

## 📦 Archivos generados

Después del build, los archivos quedan en `frontend/release/`:

```
Sistema de Ventas POS-1.1.0-arm64.dmg       # Mac Apple Silicon (instalador)
Sistema de Ventas POS-1.1.0-arm64-mac.zip   # Mac Apple Silicon (portable)
Sistema de Ventas POS-1.1.0.dmg             # Mac Intel (instalador)
Sistema de Ventas POS-1.1.0-mac.zip         # Mac Intel (portable)
Sistema de Ventas POS Setup 1.1.0.exe       # Windows (instalador)
SistemaVentasPOS-Portable-1.1.0.exe         # Windows (portable)
```

## 🔄 Auto-Update (Electron Updater)

### Configuración actual
- **Provider**: `generic` (alojas los archivos en cualquier servidor/CDN)
- **URL del feed**: `https://releases.tu-dominio.com/sistema-ventas-pos`
- **Channel**: `latest`

### Cómo funciona

1. **Al abrir la app** → busca actualizaciones después de 3s
2. **Si encuentra v1.2.0** → muestra diálogo "¡Actualización disponible!"
3. **Click "Descargar"** → descarga en background con barra de progreso
4. **Al terminar** → diálogo "Reiniciar para instalar"
5. **Click "Reiniciar"** → la app se reinicia con la nueva versión

### Dónde alojar el feed de updates

Opciones (de más fácil a más difícil):

#### Opción 1: GitHub Releases (GRATIS)
```json
// package.json → build.publish
{
  "provider": "github",
  "owner": "tu-usuario",
  "repo": "sistema-ventas-pos"
}
```
- Crea un Release en GitHub con tag `v1.1.0`
- Sube los archivos del build
- La app los descarga automáticamente

#### Opción 2: Cloudflare R2 / S3 / Netlify
- Sube los archivos a un bucket público
- Actualiza la URL en `package.json`

#### Opción 3: Servidor propio
- Si tienes un servidor web, sube los archivos a `/var/www/releases/`
- URL: `https://tu-dominio.com/releases/`

## 📝 Checklist para un Release

- [ ] Cambios probados localmente
- [ ] Versión incrementada en `package.json`
- [ ] Changelog actualizado
- [ ] Build sin errores
- [ ] Probado el build localmente
- [ ] Archivos subidos al feed de updates
- [ ] Tag de Git creado (si aplica)
- [ ] Anuncio enviado a usuarios

## 🔧 Instalación manual del usuario

### Mac
1. Descargar el `.dmg`
2. Doble click → arrastrar a Aplicaciones
3. Click derecho → "Abrir" (primera vez)
4. La app verifica updates automáticamente

### Windows
1. Descargar `Setup 1.1.0.exe`
2. Ejecutar como administrador (primera vez)
3. La app verifica updates automáticamente

## 🆘 Troubleshooting

### La app no detecta updates
- Verificar que la URL en `build.publish.url` sea accesible
- El archivo debe llamarse `latest.yml` o `latest-mac.yml` (lo genera electron-builder)
- Verificar que la versión en `package.json` sea mayor

### Error de code signing en Mac
- Comprar certificado de Apple Developer ($99/año)
- Configurar `CSC_LINK` y `CSC_KEY_PASSWORD` en variables de entorno
- O seguir usando "Abrir de todos modos" cada vez

### Error de SmartScreen en Windows
- Comprar certificado de Authenticode (~$200/año)
- Sin certificado, los usuarios deben hacer click "Más información" → "Ejecutar de todos modos"

## 📊 Scripts útiles

```bash
# Ver qué versión está corriendo
defaults read "/Applications/Sistema de Ventas POS.app/Contents/Info.plist" CFBundleShortVersionString

# Limpiar builds viejos
rm -rf frontend/release/*

# Ver tamaño de builds
du -sh frontend/release/*
```
