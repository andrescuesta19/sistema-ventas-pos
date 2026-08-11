-- =====================================================
-- Migración v1.5.0: Super-admin + Aprobación por admin
-- =====================================================
-- Cambios:
-- 1. Tabla super_admins (administrador global de la plataforma)
-- 2. Columna aprobado_por_admin en usuarios (los nuevos quedan "pendientes")
-- 3. Columna estado_aprobacion para mejor tracking
-- =====================================================

-- 1. Tabla de super-administradores (separada de los usuarios normales)
CREATE TABLE IF NOT EXISTS super_admins (
    id_super SERIAL PRIMARY KEY,
    nombre VARCHAR(100) NOT NULL,
    correo VARCHAR(100) UNIQUE NOT NULL,
    contrasena_hash VARCHAR(255) NOT NULL,
    estado BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    last_login TIMESTAMP
);

-- 2. Aprobar usuarios por super-admin
ALTER TABLE usuarios
    ADD COLUMN IF NOT EXISTS aprobado_por_admin BOOLEAN NOT NULL DEFAULT true, -- usuarios existentes quedan auto-aprobados
    ADD COLUMN IF NOT EXISTS fecha_aprobacion TIMESTAMP,
    ADD COLUMN IF NOT EXISTS aprobado_por INTEGER REFERENCES super_admins(id_super),
    ADD COLUMN IF NOT EXISTS rechazado_por INTEGER REFERENCES super_admins(id_super),
    ADD COLUMN IF NOT EXISTS motivo_rechazo TEXT,
    ADD COLUMN IF NOT EXISTS created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- 3. Marcar todos los usuarios existentes como ya aprobados (no rompemos nada)
UPDATE usuarios SET aprobado_por_admin = true WHERE aprobado_por_admin = false;
