-- Agregar columna de video a productos
ALTER TABLE productos ADD COLUMN IF NOT EXISTS video_url VARCHAR(500);
