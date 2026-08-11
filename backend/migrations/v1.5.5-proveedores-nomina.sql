-- v1.5.5: Tablas para Proveedores, Nómina y avatar de usuario
-- Proveedores: gestión de proveedores y compras a crédito
-- Empleados (Nómina): gestión de empleados del local y pagos

-- v1.5.5: Foto de perfil en tabla usuarios
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS avatar_url TEXT;
ALTER TABLE super_admins ADD COLUMN IF NOT EXISTS avatar_url TEXT;

CREATE TABLE IF NOT EXISTS proveedores (
    id_proveedor SERIAL PRIMARY KEY,
    id_local INTEGER NOT NULL REFERENCES locales(id_local) ON DELETE CASCADE,
    nombre_razon_social VARCHAR(200) NOT NULL,
    nit VARCHAR(50),
    telefono VARCHAR(50),
    correo VARCHAR(150),
    direccion TEXT,
    contacto_nombre VARCHAR(150),
    notas TEXT,
    estado BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_proveedores_local ON proveedores(id_local);
CREATE INDEX IF NOT EXISTS idx_proveedores_nombre ON proveedores(nombre_razon_social);

CREATE TABLE IF NOT EXISTS empleados (
    id_empleado SERIAL PRIMARY KEY,
    id_local INTEGER NOT NULL REFERENCES locales(id_local) ON DELETE CASCADE,
    nombre VARCHAR(200) NOT NULL,
    documento_identidad VARCHAR(50),
    telefono VARCHAR(50),
    correo VARCHAR(150),
    direccion TEXT,
    cargo VARCHAR(100),
    salario_base NUMERIC(12,2) DEFAULT 0,
    tipo_contrato VARCHAR(50) DEFAULT 'Indefinido',  -- Indefinido / Prestación / Temporal
    fecha_ingreso DATE DEFAULT CURRENT_DATE,
    fecha_salida DATE,
    estado BOOLEAN DEFAULT true,
    notas TEXT,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_empleados_local ON empleados(id_local);
CREATE INDEX IF NOT EXISTS idx_empleados_nombre ON empleados(nombre);
