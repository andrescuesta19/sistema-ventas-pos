-- Migración v2.2.9: Geolocalización del local
-- Agrega columnas latitud y longitud a la tabla locales para soportar
-- el cálculo de distancia y costo de envío al visitante.
--
-- v2.2.8 introdujo la geolocalización opcional en la tienda pública
-- (botón "📍 Mi ubicación" en el header). El backend lee estas columnas
-- para inyectarlas en el template. Si están NULL, el backend usa como
-- fallback las coordenadas de Turbo, Antioquia (parque principal).
--
-- Valores default (NULL) → backend usa fallback Turbo:
--   latitud = 8.095, longitud = -76.728
--
-- Para configurar coordenadas reales de otro local en el futuro:
--   UPDATE locales SET latitud = X, longitud = Y WHERE id_local = N;

ALTER TABLE locales ADD COLUMN IF NOT EXISTS latitud NUMERIC(9,6) DEFAULT NULL;
ALTER TABLE locales ADD COLUMN IF NOT EXISTS longitud NUMERIC(9,6) DEFAULT NULL;

-- Comentarios para documentar el propósito
COMMENT ON COLUMN locales.latitud IS 'Latitud del local (formato decimal, ej: 8.095). NULL = usa fallback Turbo. Se usa para calcular distancia al visitante que comparte geolocalización.';
COMMENT ON COLUMN locales.longitud IS 'Longitud del local (formato decimal, ej: -76.728). NULL = usa fallback Turbo.';

-- Índice no es necesario porque solo se lee por id_local en el WHERE.