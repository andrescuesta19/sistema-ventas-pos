-- =====================================================
-- Migración v1.9.0: Nómina mejorada + Pagos
-- =====================================================
-- Cambios:
-- 1. Empleados: cuenta bancaria (banco, tipo, número) y periodicidad de pago
-- 2. Tabla configuracion_pago: cuenta bancaria del negocio (para pagar nómina)
-- 3. Tabla pagos_nomina: registro de pagos por periodo (Pendiente/Pagado)
-- =====================================================

-- 1. Empleados: datos bancarios y periodicidad
ALTER TABLE empleados ADD COLUMN IF NOT EXISTS banco VARCHAR(100);
ALTER TABLE empleados ADD COLUMN IF NOT EXISTS tipo_cuenta VARCHAR(20) DEFAULT 'Ahorros';
ALTER TABLE empleados ADD COLUMN IF NOT EXISTS cuenta_bancaria VARCHAR(50);
ALTER TABLE empleados ADD COLUMN IF NOT EXISTS periodicidad_pago VARCHAR(20) DEFAULT 'Mensual';

-- 2. Cuenta bancaria del negocio (para pagar la nómina)
CREATE TABLE IF NOT EXISTS configuracion_pago (
    id_local INTEGER PRIMARY KEY REFERENCES locales(id_local) ON DELETE CASCADE,
    banco VARCHAR(100),
    tipo_cuenta VARCHAR(20) DEFAULT 'Ahorros',
    numero_cuenta VARCHAR(50),
    titular VARCHAR(200),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- 3. Pagos de nómina por periodo
CREATE TABLE IF NOT EXISTS pagos_nomina (
    id_pago SERIAL PRIMARY KEY,
    id_local INTEGER NOT NULL REFERENCES locales(id_local) ON DELETE CASCADE,
    id_empleado INTEGER REFERENCES empleados(id_empleado) ON DELETE SET NULL,
    periodo VARCHAR(20) NOT NULL,
    monto NUMERIC(12,2) NOT NULL,
    metodo_pago VARCHAR(50) DEFAULT 'Transferencia',
    estado VARCHAR(20) DEFAULT 'Pendiente',
    fecha_pago TIMESTAMP,
    notas TEXT,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pagos_nomina_local ON pagos_nomina(id_local);
CREATE INDEX IF NOT EXISTS idx_pagos_nomina_periodo ON pagos_nomina(periodo);