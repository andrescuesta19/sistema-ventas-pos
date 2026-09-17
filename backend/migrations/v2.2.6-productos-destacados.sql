-- Migración v2.2.6: Sistema híbrido de productos destacados
-- Agrega columnas para que el admin pueda fijar productos al inicio del catálogo.

ALTER TABLE productos ADD COLUMN IF NOT EXISTS destacado BOOLEAN DEFAULT FALSE;
ALTER TABLE productos ADD COLUMN IF NOT EXISTS posicion_destacado INTEGER DEFAULT NULL;

-- Índice para que el ORDER BY sea eficiente incluso con miles de productos
CREATE INDEX IF NOT EXISTS idx_productos_destacado
    ON productos(id_local, destacado, posicion_destacado)
    WHERE destacado = TRUE;

-- Comentario de documento
COMMENT ON COLUMN productos.destacado IS 'TRUE si el admin quiere que este producto aparezca al inicio del catálogo público (por encima del orden cronológico).';
COMMENT ON COLUMN productos.posicion_destacado IS 'Orden manual entre productos destacados del mismo local (1 = primero, 2 = segundo...). NULL = sin asignar, se asigna automáticamente.';
