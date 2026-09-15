-- v2.2.10: Agregar categoría 'General' por defecto (id=3)
-- El frontend y backend usan id=3 como categoría por defecto, pero no existía en la BD
-- causando error de foreign key al crear productos sin seleccionar categoría explícitamente

INSERT INTO categorias (id_categoria, nombre_categoria) 
VALUES (3, 'General')
ON CONFLICT (id_categoria) DO NOTHING;

-- Asegurar que la secuencia de categorias esté sincronizada
SELECT setval('categorias_id_categoria_seq', COALESCE((SELECT MAX(id_categoria) FROM categorias), 0) + 1, false);