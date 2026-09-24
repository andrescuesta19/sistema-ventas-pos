-- Migración v2.2.10: Sistema de ofertas en productos
-- Agrega columnas para gestionar descuentos temporales desde el POS.
-- El sistema funciona así:
--   - precio_oferta: precio con descuento (NULL = sin oferta)
--   - oferta_activa: booleano para activar/desactivar sin perder el valor
--   - fecha_inicio_oferta, fecha_fin_oferta: ventana de tiempo (opcional)
--
-- Si precio_oferta es NULL → producto sin oferta
-- Si precio_oferta es NOT NULL y oferta_activa es true → producto en oferta
-- Si oferta_activa es false → precio_oferta se conserva pero no se muestra
-- Si fecha_fin_oferta es NOT NULL y está en el pasado → oferta expirada (mostrar igual pero con badge)
--
-- La tienda web (/api/tienda/:idLocal) mostrará:
--   - Badge "OFERTA" si oferta_activa=true
--   - Precio anterior tachado (precio_venta)
--   - Precio nuevo destacado (precio_oferta)
--   - Descuento calculado automáticamente (%)

ALTER TABLE productos ADD COLUMN IF NOT EXISTS precio_oferta NUMERIC(12,2) DEFAULT NULL;
ALTER TABLE productos ADD COLUMN IF NOT EXISTS oferta_activa BOOLEAN DEFAULT FALSE;
ALTER TABLE productos ADD COLUMN IF NOT EXISTS fecha_inicio_oferta TIMESTAMP DEFAULT NULL;
ALTER TABLE productos ADD COLUMN IF NOT EXISTS fecha_fin_oferta TIMESTAMP DEFAULT NULL;

-- Comentarios para documentar el propósito
COMMENT ON COLUMN productos.precio_oferta IS 'Precio con descuento. NULL = sin oferta. Solo aplica si oferta_activa=true.';
COMMENT ON COLUMN productos.oferta_activa IS 'TRUE si la oferta está activa. Permite desactivar sin perder el valor guardado en precio_oferta.';
COMMENT ON COLUMN productos.fecha_inicio_oferta IS 'Fecha/hora de inicio de la oferta (opcional, para ofertas programadas).';
COMMENT ON COLUMN productos.fecha_fin_oferta IS 'Fecha/hora de fin de la oferta (opcional). NULL = sin caducidad.';

-- Índice para filtrar productos en oferta eficientemente
CREATE INDEX IF NOT EXISTS idx_productos_oferta
    ON productos(id_local, oferta_activa)
    WHERE oferta_activa = TRUE;