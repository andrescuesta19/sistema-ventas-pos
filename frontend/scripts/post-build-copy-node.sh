#!/bin/bash
# Post-build script: copia el binario de Node.js + TODAS sus librerías
# dinámicas al .app empaquetado.
# v2.2.10: Necesario porque process.execPath en Electron empaquetado
# no funciona correctamente con ELECTRON_RUN_AS_NODE=1 para spawn
# de procesos hijos. Necesitamos un binario de Node real.
#
# Uso: bash frontend/scripts/post-build-copy-node.sh <path-al-.app>
# Llamado automáticamente por electron-builder via afterPack hook.

set -e

APP_PATH="${1:-}"

if [ -z "$APP_PATH" ]; then
  echo "❌ Uso: $0 <path-a-.app>"
  exit 1
fi

if [ ! -d "$APP_PATH" ]; then
  echo "❌ No existe: $APP_PATH"
  exit 1
fi

# Detectar binario de Node del sistema
NODE_SRC=""
if command -v node >/dev/null 2>&1; then
  # Resolver symlinks para obtener el binario real
  NODE_PATH=$(command -v node)
  while [ -L "$NODE_PATH" ]; do
    DIR=$(dirname "$NODE_PATH")
    TARGET=$(readlink "$NODE_PATH")
    if [[ "$TARGET" = /* ]]; then
      NODE_PATH="$TARGET"
    else
      NODE_PATH="$DIR/$TARGET"
    fi
  done
  if [ -f "$NODE_PATH" ]; then
    NODE_SRC="$NODE_PATH"
  fi
fi

if [ -z "$NODE_SRC" ]; then
  echo "❌ No se encontró el binario de Node.js del sistema"
  echo "   Instala Node.js primero: brew install node"
  exit 1
fi

# Destino: backend/node-bin/node (Mac/Linux) o backend/node-bin/node.exe (Windows)
RES_PATH="$APP_PATH/Contents/Resources/backend/node-bin"
mkdir -p "$RES_PATH"

# Determinar extensión según plataforma
if [[ "$OSTYPE" == "msys" || "$OSTYPE" == "win32" ]]; then
  NODE_DEST="$RES_PATH/node.exe"
else
  NODE_DEST="$RES_PATH/node"
fi

# Copiar el binario de Node
cp "$NODE_SRC" "$NODE_DEST"
chmod +x "$NODE_DEST"

# v2.2.10: Copiar TODAS las dylibs que el binario necesita para que
# @rpath las encuentre en el mismo directorio.
# Esto es necesario porque el binario de Homebrew usa @rpath en lugar
# de rutas absolutas, así que las dylibs DEBEN estar en el mismo dir.
if [[ "$OSTYPE" != "msys" && "$OSTYPE" != "win32" ]]; then
  echo "📦 Copiando librerías dinámicas..."

  # 1. Detectar la librería PRINCIPAL (libnode.XXX.dylib). Es la que
  # contiene TODO el código de Node. Aparece como @rpath/libnode.XXX.dylib
  # en otool -L. La encontramos buscando archivos "libnode*.dylib" en
  # los directorios de homebrew.
  echo "  → Buscando libnode principal..."
  for libnode_path in $(find /opt/homebrew -name 'libnode*.dylib' 2>/dev/null); do
    if [ -f "$libnode_path" ]; then
      cp "$libnode_path" "$RES_PATH/" && echo "    ✅ $(basename $libnode_path)"
    fi
  done

  # 2. Copiar las dependencias del sistema listadas por otool -L
  echo "  → Copiando dependencias..."
  otool -L "$NODE_SRC" 2>/dev/null | grep -v '^	/usr/lib\|^	/System\|^	@rpath/libnode' | awk '{print $1}' | while read -r lib_path; do
    if [ -f "$lib_path" ] && [[ "$lib_path" != @rpath:* ]]; then
      lib_name=$(basename "$lib_path")
      cp "$lib_path" "$RES_PATH/$lib_name" 2>/dev/null && echo "    ✅ $lib_name" || echo "    ⚠ Falló: $lib_name"
    fi
  done
fi

# Verificar que funciona
echo ""
echo "🧪 Verificando que Node binario funciona..."
if "$NODE_DEST" --version 2>/dev/null; then
  echo "✅ Binario de Node.js copiado y funcionando correctamente"
  echo "   Versión: $("$NODE_DEST" --version)"
  echo "   Ubicación: $NODE_DEST"
else
  echo "❌ El binario de Node no responde a --version"
  echo "   Esto puede indicar que faltan dylibs o hay un problema de permisos"
  exit 1
fi