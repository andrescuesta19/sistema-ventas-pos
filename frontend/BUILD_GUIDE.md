# 📦 Guía de Build / Distribución

Esta guía explica cómo generar los instaladores de **Sistema de Ventas POS** para Mac, Windows y Linux.

## 📁 Archivos generados

Después de ejecutar `npm run electron:build:mac`, los archivos quedan en `frontend/release/`:

| Archivo | Plataforma | Tipo | Tamaño |
|---|---|---|---|
| `Sistema de Ventas POS-1.0.0.dmg` | Mac Intel | Instalador | ~108MB |
| `Sistema de Ventas POS-1.0.0-arm64.dmg` | Mac Apple Silicon | Instalador | ~105MB |
| `Sistema de Ventas POS-1.0.0-mac.zip` | Mac Intel | **Portable** | ~115MB |
| `Sistema de Ventas POS-1.0.0-arm64-mac.zip` | Mac Apple Silicon | **Portable** | ~111MB |

## 🍎 Mac (ya generado)

```bash
cd frontend
npm run electron:build:mac
```

Genera:
- **DMG** (instalador gráfico para Mac, doble click → arrastrar a Aplicaciones)
- **ZIP** (versión portable, no requiere instalación, descomprimir y listo)

Compatible con:
- macOS 10.13+ (High Sierra y superior)
- Intel x64
- Apple Silicon (M1, M2, M3, M4) — arm64

## 🪟 Windows

**Limitación técnica**: para generar `.exe` desde Mac se necesita **Wine**. Sin Wine, se debe generar en una PC Windows o Linux con Wine instalado.

### Opción A: Generar en Windows (recomendado)

1. Copia la carpeta del proyecto a una PC Windows
2. Abre PowerShell o CMD
3. Ejecuta:
   ```cmd
   cd frontend
   npm install
   npm run build
   npm run electron:build:win
   ```
4. Los archivos quedan en `frontend/release/`:
   - `Sistema de Ventas POS Setup 1.0.0.exe` (~95MB) — Instalador NSIS
   - `SistemaVentasPOS-Portable-1.0.0.exe` (~95MB) — **Portable** (no requiere instalación)

### Opción B: Generar en Mac con Wine

Si tienes Wine instalado (vía Homebrew: `brew install --cask wine-stable`), puedes intentar:

```bash
cd frontend
npm run electron:build:win
```

Probablemente falle sin Wine. Si funciona, genera los `.exe` igual que en Windows.

### Opción C: Generar en Linux con Docker

```bash
docker run --rm -ti \
  --env-file <(env | grep -iE 'DEBUG|NODE_|ELECTRON_|YARN_|NPM_|CI|CIRCLE|TRAVIS_TAG|TRAVIS|TRAVIS_REPO|ESA_|SC_|LC_|LANG|ALL') \
  --env ELECTRON_CACHE="/root/.cache/electron" \
  --env ELECTRON_BUILDER_CACHE="/root/.cache/electron-builder" \
  -v ${PWD}:/project \
  -v ${PWD}/release:/release \
  -v ~/.cache/electron:/root/.cache/electron \
  -v ~/.cache/electron-builder:/root/.cache/electron-builder \
  electronuserland/builder:wine \
  /bin/bash -c "cd /project/frontend && npm install && npm run build && npm run electron:build:win"
```

## 🐧 Linux

```bash
cd frontend
npm run build
npx electron-builder --linux
```

Genera:
- `.AppImage` (universal, ejecutable)
- `.deb` (Debian/Ubuntu)
- `.rpm` (Fedora/RedHat)

## 💾 Sobre el Portable

El **portable** (`.zip` en Mac, `.exe` portable en Windows) es ideal para:
- Llevarlo en una memoria USB
- Compartirlo sin instalación
- Probarlo sin compromiso
- Equipos donde no se pueden instalar aplicaciones

**Cómo usar el portable en Mac**:
1. Descomprime el `.zip` en cualquier carpeta
2. Click derecho en "Sistema de Ventas POS.app" → Abrir
3. La app corre sin instalarse

**Cómo usar el portable en Windows**:
1. Ejecuta el `.exe` portable
2. La app corre sin instalarse (puede pedir permisos de red la primera vez)

## 🔄 Distribución recomendada

1. **Mac**: Distribuir el `.dmg` (instalador estándar, doble click)
2. **Windows**: Distribuir el `.exe` NSIS (instalador) + el portable para memorias USB
3. **Linux**: Distribuir el `.AppImage`

## ⚠️ Notas importantes

- Los builds son **grandes** (~100MB) porque incluyen todo Chromium
- El instalador **no requiere conexión a internet** para instalar
- La app empaquetada **incluye el logo** del usuario
- **No hay code signing** (porque no tengo certificados) — la primera vez que se abra en Mac, hay que ir a Preferencias → Seguridad → "Abrir de todos modos"
- En Windows, el SmartScreen puede mostrar advertencia la primera vez. Click en "Más información" → "Ejecutar de todos modos"

## 🚀 Próximos pasos para producción

1. **Comprar certificado de code signing** (Apple Developer $99/año, Windows Authenticode ~$200/año)
2. **Configurar auto-update** con electron-updater
3. **Publicar en Mac App Store** y **Microsoft Store**
4. **Crear un sitio web** de descarga con links
5. **Configurar telemetría opcional** (para saber cuántas instalaciones hay)

## 🔧 Build local rápido

Si quieres probar los builds de Mac en tu Mac actual:
```bash
cd ~/.gemini/pos_system/frontend
npm run build
npx electron-builder --mac --x64  # solo Intel
# o
npx electron-builder --mac --arm64  # solo Apple Silicon
```

El build de Mac ya está hecho, los archivos están en `release/`.
