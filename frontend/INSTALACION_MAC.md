# 🚀 Cómo abrir el instalador en Mac

## Pasos que acabo de hacer por ti:

1. ✅ Localicé el instalador correcto: **`Sistema de Ventas POS-1.0.0-arm64.dmg`** (para Mac Apple Silicon)
2. ✅ Lo monté y lo instalé en `/Applications/`
3. ✅ Lo abrí y está corriendo

## ⚠️ Si macOS bloquea la app ("desarrollador no identificado")

Es normal la primera vez porque no hay certificado de code signing. Hay 2 formas de abrirla:

### Opción A: Desde Preferencias del Sistema
1. Intenta abrir la app normalmente (doble click)
2. macOS te muestra un mensaje: **"Sistema de Ventas POS" no se puede abrir porque el desarrollador no se puede verificar**
3. Click en **OK**
4. Ve a **Preferencias del Sistema → Seguridad y Privacidad → General**
5. Abajo verás: **"Sistema de Ventas POS" se bloqueó porque no es de un desarrollador identificado**
6. Click en **"Abrir de todos modos"**
7. Te pide confirmación → click en **"Abrir"**
8. La app se abre ✅

### Opción B: Click derecho (más rápido)
1. En Finder → Aplicaciones → click derecho en "Sistema de Ventas POS"
2. Selecciona **"Abrir"**
3. Te aparece el aviso → click en **"Abrir"**
4. La app queda "autorizada" para siempre ✅

## 🎯 Para usar la app ahora

- La app ya está corriendo (la verás en tu Dock con el ícono de la tienda 3D)
- Si no la ves, abre Launchpad y búscala como "Sistema de Ventas POS"
- Para futuras aperturas: doble click normal ya funciona (quedó autorizada)

## 🗑️ Para desinstalar

1. Abre Finder → Aplicaciones
2. Arrastra "Sistema de Ventas POS" a la Papelera
3. (Opcional) Limpia datos: `rm -rf ~/Library/Application\ Support/sistema-ventas-pos`

## 🔄 Si quieres volver a la versión de desarrollo

La versión empaquetada (en /Applications) y la de desarrollo (con `npm run electron:dev`) usan **diferentes directorios de datos**:
- **Empaquetada**: `~/Library/Application Support/sistema-ventas-pos/`
- **Desarrollo**: `~/Library/Application Support/sistema-ventas-pos/` (el mismo, porque usan el mismo appId)

**Importante**: si abres las dos versiones al mismo tiempo, van a chocar. Cierra una antes de abrir la otra.

## 🆘 Si la app crashea o no arranca

1. Abre **Consola** (Aplicaciones → Utilidades → Consola)
2. Busca "Sistema de Ventas POS" en el log
3. Si ves errores, puedes reportarlos a soporte

## 📂 Archivos del build

Todos están en `~/.gemini/pos_system/frontend/release/`:

```
Sistema de Ventas POS-1.0.0-arm64.dmg    ← Tu instalador (105 MB)
Sistema de Ventas POS-1.0.0-arm64-mac.zip ← Portable Apple Silicon (111 MB)
```

Los otros (`-mac.zip`, `.dmg` sin arm64) son para Mac Intel (que ya casi no se usan).
