# 📐 Carpeta de Referencias de Diseño

Esta carpeta es para que puedas **subir imágenes de referencia** (mockups, capturas, bocetos) que quieras que la IA use como guía para implementar UI.

## 📁 Estructura

```
design-references/
├── screenshots/    # Capturas de pantallas reales que te gustan
├── mockups/        # Mockups o bocetos generados con IA o hechos a mano
└── README.md       # Este archivo
```

## 🚀 ¿Cómo usar?

1. **Sube tu imagen** a la carpeta correspondiente:
   - `screenshots/` → si es una captura de una app real
   - `mockups/` → si es un mockup/boceto generado o hecho a mano

2. **Nombra el archivo** de forma descriptiva:
   ```
   login-pantalla-inicio.png
   dashboard-despues-login.png
   pantalla-pos-caja.png
   ```

3. **Dime en el chat**:
   - Qué archivo es
   - Qué quieres que cambie/se parezca a esa imagen
   - Qué partes mantener o ajustar

## 💡 Ejemplo de uso

```
Tú: "mira design-references/mockups/login-pantalla-inicio.png, 
     quiero que la pantalla de login se vea así, 
     pero con mi logo (frontend/public/logos/logo.png) 
     en lugar de la tienda 3D"
```

## ⚠️ Importante

- Las imágenes aquí son **solo para referencia visual** — no se incluyen en el build de la app
- Se pueden borrar en cualquier momento
- Si el archivo es muy pesado (>5MB), considera comprimirlo antes de subirlo

## 🔄 Flujo de trabajo recomendado

1. Diseña o captura tu mockup preferido
2. Súbelo a esta carpeta
3. Describe en el chat qué quieres cambiar/mantener
4. La IA implementa los cambios basándose en la imagen + tu descripción
5. Pruebas en la app, das feedback
6. Se itera hasta que quede como quieres

## 🎨 Herramientas útiles para crear mockups

- **v0.dev** (Vercel) — Genera UI con IA
- **Galileo AI** — Genera mockups con prompts
- **Figma** — Diseño manual
- **Screenshot de sitios web** que te gusten como referencia de estilo
