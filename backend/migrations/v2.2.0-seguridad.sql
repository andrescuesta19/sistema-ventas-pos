-- v2.2.0: Migración de seguridad
-- 2FA TOTP para super-admin
ALTER TABLE super_admins ADD COLUMN IF NOT EXISTS totp_secret VARCHAR(64);
ALTER TABLE super_admins ADD COLUMN IF NOT EXISTS totp_enabled BOOLEAN DEFAULT false;

-- Índices para performance
CREATE INDEX IF NOT EXISTS idx_usuarios_correo ON usuarios(correo);
CREATE INDEX IF NOT EXISTS idx_super_admins_codigo ON super_admins(codigo_acceso);
CREATE INDEX IF NOT EXISTS idx_ventas_fecha ON ventas(fecha_venta);
CREATE INDEX IF NOT EXISTS idx_ventas_local ON ventas(id_local);

-- Comentario de versión
COMMENT ON TABLE super_admins IS 'Super-admins con 2FA TOTP (v2.2.0)';
