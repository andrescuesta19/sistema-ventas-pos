-- =====================================================
-- Migración v1.4.2: Sistema de email con logging
-- =====================================================

CREATE TABLE IF NOT EXISTS email_logs (
    id_log SERIAL PRIMARY KEY,
    tipo VARCHAR(30) NOT NULL,            -- 'verificacion_registro', 'reset_password', 'factura', etc.
    destinatario VARCHAR(255) NOT NULL,
    asunto VARCHAR(500),
    exito BOOLEAN NOT NULL,
    error_mensaje TEXT,
    codigo_asociado VARCHAR(10),          -- el código de verificación que se intentó enviar
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Índices para consultas rápidas
CREATE INDEX IF NOT EXISTS email_logs_destinatario_idx ON email_logs(destinatario);
CREATE INDEX IF NOT EXISTS email_logs_created_at_idx ON email_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS email_logs_exito_idx ON email_logs(exito);

-- Vista: últimos códigos pendientes de verificación (para que el admin los consulte)
-- Solo muestra códigos que aún no se han usado y no han expirado
CREATE OR REPLACE VIEW codigos_pendientes AS
SELECT
    u.id_usuario,
    u.nombre,
    u.correo,
    u.codigo_verificacion,
    u.codigo_expiracion,
    u.intentos_verificacion,
    l.nombre_local,
    EXTRACT(EPOCH FROM (u.codigo_expiracion - NOW()))::int as segundos_restantes
FROM usuarios u
LEFT JOIN locales l ON u.id_local = l.id_local
WHERE u.verificado = false
  AND u.codigo_verificacion IS NOT NULL
  AND u.codigo_expiracion > NOW()
ORDER BY u.codigo_expiracion DESC;
