-- Migración v2.2.8: Segunda línea de WhatsApp por local
-- Agrega columna telefono_whatsapp_2 a la tabla locales para soportar
-- dos líneas de WhatsApp en la tienda pública. El cliente elige con cuál
-- línea escribir si la primera no contesta.
--
-- El campo es OPCIONAL: si está NULL, solo se muestra el botón de la
-- primera línea (comportamiento actual, no rompe nada existente).
--
-- Formato libre (texto): el backend se encarga de normalizar a dígitos
-- con `replace(/\D/g, '')` antes de inyectarlo en la URL de WhatsApp.

ALTER TABLE locales ADD COLUMN IF NOT EXISTS telefono_whatsapp_2 TEXT DEFAULT NULL;

-- Comentario para documentar el propósito
COMMENT ON COLUMN locales.telefono_whatsapp_2 IS 'Segunda línea de WhatsApp del local (opcional). Si está NULL, la tienda pública solo muestra la línea principal.';