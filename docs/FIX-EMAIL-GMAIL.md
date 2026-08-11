# 🔧 Cómo arreglar el email del sistema

## El problema

La contraseña de aplicación de Gmail que está en `backend/.env` ya no es válida. Google la rechazó con:

```
Invalid login: 535-5.7.8 Username and Password not accepted
```

Esto pasa porque Google puede **revocar contraseñas de aplicación** automáticamente si:
- La cuenta no se usa por mucho tiempo
- Google detecta actividad sospechosa
- Cambiaste la contraseña principal de Gmail
- Desactivaste la verificación en 2 pasos
- Google actualizó sus políticas de seguridad

## Solución: crear nueva contraseña de aplicación

### Paso 1 — Verificar que la verificación en 2 pasos esté activa

1. Abre https://myaccount.google.com/security
2. Busca "Verificación en 2 pasos"
3. Si está **desactivada**, actívala primero (es requisito para crear contraseñas de aplicación)

### Paso 2 — Crear nueva contraseña de aplicación

1. Abre https://myaccount.google.com/apppasswords
2. Si te pide seleccionar app y dispositivo:
   - App: **"Correo"**
   - Dispositivo: **"Otro (nombre personalizado)"** → escribe "Sistema POS"
3. Click **"Generar"**
4. Google te mostrará una contraseña de **16 caracteres** (ej: `abcd efgh ijkl mnop`)
5. **Copia esa contraseña** (con o sin espacios, da igual)

### Paso 3 — Actualizar el `.env`

Edita `backend/.env` y reemplaza el valor de `EMAIL_PASS`:

```bash
EMAIL_USER=andrescuesta112@gmail.com
EMAIL_PASS=abcd efgh ijkl mnop    ← pega aquí la nueva
```

### Paso 4 — Reiniciar el backend

Si la app está corriendo como DMG (doble-click), ciérrala y vuélvela a abrir.

Si la estás corriendo con `npm start` desde terminal, mátala (Ctrl+C) y vuelve a correrla.

### Paso 5 — Verificar

Al arrancar, el backend debe mostrar:
```
📧 Servidor de correo LISTO (Gmail)
   Cuenta: andrescuesta112@gmail.com
```

Si muestra:
```
❌ Gmail rechazó las credenciales: Invalid login...
```
Significa que la contraseña está mal copiada. Repite desde el paso 2.

## Solución alternativa (RECOMENDADA para producción)

Gmail es malo para enviar emails transaccionales desde apps (es para uso personal). Para producción, **cambia a un servicio profesional**:

| Servicio | Gratis hasta | Costo después | Setup |
|---|---|---|---|
| **Resend** | 3,000/mes | $20/mes por 50k | 5 minutos |
| **SendGrid** | 100/día | $20/mes | 15 minutos |
| **Mailgun** | 5,000/mes | $35/mes | 15 minutos |
| **Amazon SES** | 3,000 (si estás en AWS) | $0.10 por 1k | 30 minutos |

**Resend** es el más fácil. Solo:
1. Crear cuenta en resend.com
2. Verificar tu dominio (o usar el dominio de ellos)
3. Te dan una API key
4. Reemplazar el transporter en `server.js` por la API de Resend

Avísame cuando quieras migrar a un servicio profesional.

## Si nada de esto funciona

Verifica que:
- ✅ Tu cuenta de Gmail no esté bloqueada
- ✅ Tengas acceso a https://myaccount.google.com/apppasswords (si no, tu cuenta no permite)
- ✅ La contraseña principal de Gmail sea correcta haciendo login en gmail.com
- ✅ No tengas activado "Acceso de apps menos seguras" en https://myaccount.google.com/lesssecureapps (eso ya no funciona desde 2022)
