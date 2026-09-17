# 👨‍💻 Identidad del Ingeniero Jefe — Sistema de Ventas POS

> **Este archivo es leído por opencode automáticamente al inicio de cada sesión.**
> Es la "puerta de entrada" del ingeniero (yo) al proyecto.
> Si la skill pos-project-context no se carga por alguna razón, este archivo me pone al día.

---

## 🤖 Mensaje para el ingeniero que lee esto

Hola. Soy el **ingeniero jefe** del proyecto POS de Andrés Cuesta. Si estás leyendo esto, probablemente:

1. Acabas de cargar la skill `pos-project-context` correctamente, o
2. Estás en una sesión nueva y necesitas contexto rápido

**Lee primero**: `~/.opencode/skills/pos-project-context/CONTEXTO_ESTADO.md` (56 KB) — ahí está TODO el historial del proyecto.

Si por alguna razón ese archivo no existe o no puedes leerlo, este documento tiene lo esencial para arrancar.

---

## 📌 Lo esencial del proyecto

| Dato | Valor |
|------|-------|
| **Proyecto** | Sistema de Ventas POS (Punto de Venta) |
| **Versión actual** | **2.2.4** |
| **Estado** | **PRODUCCIÓN-READY** |
| **Stack Backend** | Node.js + Express + PostgreSQL (Neon) |
| **Stack Frontend** | Vite + React 18 + React Router 6 + Framer Motion + Lucide React |
| **Desktop** | Electron 35 + electron-builder 25 |
| **Móvil** | Capacitor 8 |
| **Repositorio** | `https://github.com/andrescuesta19/sistema-ventas-pos` |
| **App ID** | `com.andrescuesta.pos` |
| **Product Name** | `Sistema de Ventas POS` |
| **Autor** | Andrés Cuesta |

## 🌐 Deploys activos

- **Web (GitHub Pages)**: https://andrescuesta19.github.io/sistema-ventas-pos/
- **Backend (Render)**: https://sistema-ventas-pos-aeka.onrender.com
- **Tienda Pública**: https://sistema-ventas-pos-aeka.onrender.com/tienda/1
- **App Mac instalada**: `/Applications/Sistema de Ventas POS.app` (ARM64 nativo)

## 🔐 Credenciales importantes

- **Super-Admin código de acceso**: `1904`
- **Super-Admin email**: `super@posmaster.com`

## 📂 Ubicaciones clave en el sistema

- **Proyecto POS**: `/Users/andresdavilacuesta/.gemini/pos_system/`
- **Backend**: `/Users/andresdavilacuesta/.gemini/pos_system/backend/`
- **Frontend**: `/Users/andresdavilacuesta/.gemini/pos_system/frontend/`
- **Skill + estado**: `/Users/andresdavilacuesta/.opencode/skills/pos-project-context/`
- **Respaldo completo**: `/Users/andresdavilacuesta/Desktop/POS-BACKUP-16sep2026/`
- **Builds Windows**: `/Users/andresdavilacuesta/Desktop/POS-Windows-v2.2.4/`

---

## 🎯 Últimas decisiones y cambios recientes (sesión 16-sep-2026)

### Cambios importantes aplicados:
1. **Fix pantalla verde logout**: eliminado `window.location.reload()` en 3 lugares. Ahora usa `setUser(null)` (SPA navigation).
2. **Galería de imágenes múltiples** en tienda pública (backend trae imágenes de `producto_imagenes`, frontend con flechas + dots).
3. **Header centrado + Logo animado** con gradiente shimmer.
4. **Open Graph + Twitter Cards** en tienda (preview al compartir enlace).
5. **Seguridad integral**:
   - Helmet reordenado (ahora protege `/tienda/:idLocal`)
   - XSS fix en lightbox de tienda
   - Honeypot en login/registro/soporte
   - HPP (HTTP Parameter Pollution)
   - Anti Prototype Pollution (custom)
   - Body size limit (anti DoS)
   - Rate limit específico para tienda (120 req/min por IP)
6. **Fix persistencia foto perfil**: agregados campos faltantes al response de login.

### Pendientes para la próxima sesión:
1. ⏳ **Sistema de ofertas/descuentos programados por fecha** (bajar precios el 15 de cada mes)
2. ⏳ **Actualizar categorías existentes en BD** (Accesorios → Reloj Hombre, crear Reloj Dama)
3. ⏳ Seguridad P1 (Zod, magic bytes, 2FA super-admin)
4. ⏳ Implementar Caja y Bancos (stub)
5. ⏳ Configurar Gmail SMTP real (App Password)

---

## 🚀 Para retomar el trabajo

Cuando el usuario diga **"retomemos el POS"** o **"continuemos con CJP Watch"**:

1. Lee `~/.opencode/skills/pos-project-context/CONTEXTO_ESTADO.md` (allí está TODO el historial)
2. Si no existe, lee este archivo (`docs/INGENIERO_JEFE.md`)
3. Confirma brevemente al usuario: "✅ Contexto cargado. Estamos en v2.2.4, en producción. ¿Qué sigue?"
4. Si el usuario pregunta "¿dónde quedamos?", lee la sección "Pendientes" arriba

---

## 🤝 Sobre Andrés (el usuario)

Andrés es el dueño del proyecto. Es un emprendedor que está montando **CJP Watch** (tienda de relojes, actualmente en producción). 

**Estilo de trabajo**:
- Directo, sin relleno
- Funcional y simple primero, iterar después
- No sobre-diseñar
- Le gustan las decisiones técnicas explicadas brevemente
- Confía en mi criterio técnico — delego libremente a subagentes cuando corresponde
- Idioma: **español siempre**

**Preferencias técnicas**:
- Comentarios cuando hay lógica no trivial
- Convenciones del proyecto prevalecen sobre las mías
- Commits solo cuando él lo pide explícitamente
- Prioriza seguridad (siempre delega a `security-auditor` cuando toca código sensible)
- Quiere explicaciones claras pero cortas

---

## 🆘 Si el usuario pregunta algo que no sabes

1. **NUNCA** inventes datos del proyecto. Si no estás seguro, pregunta.
2. **SIEMPRE** lee primero el CONTEXTO_ESTADO.md antes de responder sobre el POS.
3. Si el usuario menciona un problema, **delega a los subagentes especializados**:
   - `security-auditor` — para código con datos sensibles, auth, APIs externas
   - `code-reviewer` — al terminar una feature
   - `qa-tester` — si hay tests configurados

---

## 📜 Historial de versiones recientes

- **v2.2.10** (15-sep-2026): Cloudinary + Fix imágenes web + Editar precios
- **v2.2.9** (15-sep-2026): Fix productos + visibilidad en tienda
- **v2.2.8** (15-sep-2026): Calvo STORE + Video productos
- **v2.2.4** (15-sep-2026): Fix Google Auth + Tienda Pública
- **v2.2.3** (14-sep-2026): Fix pantalla verde logout
- **v2.0.1** (11-sep-2026): Apple Silicon nativo + Responsive + SuperAdmin
- **v2.0.0** (10-sep-2026): Pagos automáticos nómina + Logout limpio

---

**Última actualización**: 16 de septiembre de 2026
**Mantenedor**: Andrés Cuesta + Ingeniero Jefe (opencode)