# 📁 Carpeta de Logos del Sistema

## ¿Para qué sirve esta carpeta?

Aquí puedes subir tu **logo personalizado** para que se muestre en la aplicación en lugar del logo SVG placeholder que viene por defecto.

## ¿Cómo subir tu logo?

1. **Prepara tu imagen** con estas características recomendadas:
   - Formato: **PNG** (con fondo transparente ideal) o **SVG**
   - Tamaño: **512×512 px** o más (cuadrado, preferiblemente)
   - Fondo transparente para que se vea bien sobre cualquier color

2. **Renombra tu archivo** a `logo.png` (o `logo.svg` si es SVG)

3. **Colócalo en esta carpeta**:
   ```
   /Users/andresdavilacuesta/Downloads/logo.PNG 
   ```

4. **Recarga la aplicación** (Cmd+R o Ctrl+R)

¡Listo! Tu logo aparecerá automáticamente en:
- 🪟 Pantalla de login
- 📊 Dashboard (hero)
- 🎨 Sidebar (header)

## ¿Quieres usar otro nombre o ruta?

Si prefieres usar otro nombre (por ejemplo `mi-logo.png`), edita esta línea en `frontend/src/components/Logo.jsx`:

```jsx
src = '/logos/logo.png'   // ← cambia esto
```

## ¿Quieres volver al logo placeholder?

Simplemente **borra o renombra** el archivo `logo.png` de esta carpeta.
La aplicación volverá automáticamente al logo SVG.

## Formatos soportados

- ✅ PNG (recomendado)
- ✅ SVG (mejor calidad a cualquier tamaño)
- ✅ JPG/JPEG (se ve bien pero no tiene fondo transparente)
- ✅ WebP (moderno, buena compresión)

## Nota importante

Esta carpeta está en `frontend/public/`, lo que significa que Vite copia su contenido tal cual al hacer build. El logo se incluye automáticamente en el instalador de Electron y en el bundle de Capacitor.
