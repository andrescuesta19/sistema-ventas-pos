-- v2.2.9: Fix productos - columnas opcionales + visibilidad en tienda
-- Hacer codigo_barras y precio_compra opcionales
ALTER TABLE productos ALTER COLUMN codigo_barras DROP NOT NULL;
ALTER TABLE productos ALTER COLUMN precio_compra DROP NOT NULL;
-- Agregar columna de video si no existe
ALTER TABLE productos ADD COLUMN IF NOT EXISTS video_url VARCHAR(500);
-- Agregar columna de visibilidad en tienda
ALTER TABLE productos ADD COLUMN IF NOT EXISTS visible_en_tienda BOOLEAN DEFAULT true;
