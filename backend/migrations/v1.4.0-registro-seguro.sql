-- =====================================================
-- Migración v1.4.0: Registro seguro + Configuración
-- =====================================================
-- Esta migración es ADITIVA (no destructiva).
-- Agrega columnas a tablas existentes y crea 2 tablas nuevas.
-- Se puede aplicar sobre una BD que ya tenga datos.

-- 1. Ampliar tabla locales con datos del negocio
ALTER TABLE locales
    ADD COLUMN IF NOT EXISTS nit VARCHAR(20),
    ADD COLUMN IF NOT EXISTS telefono VARCHAR(20),
    ADD COLUMN IF NOT EXISTS ciudad VARCHAR(100),
    ADD COLUMN IF NOT EXISTS email VARCHAR(100);

-- 2. Ampliar tabla usuarios con datos personales del dueño
ALTER TABLE usuarios
    ADD COLUMN IF NOT EXISTS documento_identidad VARCHAR(20),
    ADD COLUMN IF NOT EXISTS telefono VARCHAR(20),
    ADD COLUMN IF NOT EXISTS verificado BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS codigo_verificacion VARCHAR(10),
    ADD COLUMN IF NOT EXISTS codigo_expiracion TIMESTAMP,
    ADD COLUMN IF NOT EXISTS intentos_verificacion INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS codigo_reset_password VARCHAR(10),
    ADD COLUMN IF NOT EXISTS codigo_reset_expiracion TIMESTAMP;

-- 3. Hacer la cédula única cuando existe
CREATE UNIQUE INDEX IF NOT EXISTS usuarios_documento_unique
    ON usuarios(documento_identidad)
    WHERE documento_identidad IS NOT NULL;

-- 4. Tabla de configuración global del sistema
-- Guarda settings que aplican a todo el sistema (no por local)
CREATE TABLE IF NOT EXISTS configuracion_sistema (
    clave VARCHAR(50) PRIMARY KEY,
    valor TEXT NOT NULL,
    descripcion TEXT,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_by INTEGER REFERENCES usuarios(id_usuario)
);

-- 5. Insertar settings por defecto
INSERT INTO configuracion_sistema (clave, valor, descripcion) VALUES
    ('registro_publico_habilitado', 'false', 'Permite que cualquier persona se registre como nuevo local desde la pantalla de login. Requiere verificación de email.'),
    ('politica_password_min_longitud', '8', 'Longitud mínima de contraseña'),
    ('politica_password_requiere_mayuscula', 'true', 'Requiere al menos una mayúscula'),
    ('politica_password_requiere_numero', 'true', 'Requiere al menos un número'),
    ('politica_password_requiere_especial', 'false', 'Requiere al menos un carácter especial (!@#$%^&*)'),
    ('bcrypt_cost_factor', '12', 'Costo de bcrypt (más alto = más seguro pero más lento)'),
    ('codigo_verificacion_expiracion_minutos', '15', 'Minutos antes de que expire un código de verificación'),
    ('max_intentos_verificacion', '5', 'Máximo de intentos fallidos de código antes de bloquear')
ON CONFLICT (clave) DO NOTHING;

-- 6. Marcar los usuarios existentes (del seed) como ya verificados
-- para que puedan seguir entrando sin tener que verificar email
UPDATE usuarios SET verificado = true WHERE verificado = false AND codigo_verificacion IS NULL;
