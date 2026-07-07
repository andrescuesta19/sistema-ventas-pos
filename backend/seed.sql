INSERT INTO locales (nombre_local, direccion) VALUES 
('iStore Centro', 'Calle 10 # 20-30'),
('TechShop Norte', 'Avenida 50 # 15-45');

INSERT INTO usuarios (id_local, nombre, correo, contrasena_hash, rol) VALUES 
(1, 'Administrador Centro', 'admin@istore.com', 'hash_seguro_123', 'Administrador'),
(1, 'Cajero Centro', 'cajero@istore.com', 'hash_seguro_456', 'Cajero'),
(2, 'Administrador Norte', 'admin@techshop.com', 'hash_seguro_789', 'Administrador');

INSERT INTO clientes (documento_identidad, nombre_razon_social, telefono, correo, puntos_acumulados) VALUES 
('22222222', 'Consumidor Final', '0000000', 'anonimo@pos.com', 0),
('10203040', 'Juan Perez', '3001234567', 'juan.perez@email.com', 15);

INSERT INTO categorias (nombre_categoria) VALUES ('Smartphones'), ('Accesorios');

-- PRODUCTOS PARA EL LOCAL 1 (iStore Centro)
INSERT INTO productos (id_local, codigo_barras, nombre_producto, imagen_url, id_categoria, precio_compra, precio_venta, stock_actual, stock_minimo) VALUES 
(1, 'APL-IP13-128', 'iPhone 13 (128GB)', 'https://store.storeimages.cdn-apple.com/4668/as-images.apple.com/is/iphone-13-finish-unselect-gallery-1-202207_GEO_US?wid=5120&hei=2880&fmt=p-jpg&qlt=80&.v=1654894121404', 1, 2300000.00, 2800000.00, 15, 5),
(1, 'APL-IP14-128', 'iPhone 14 (128GB)', 'https://store.storeimages.cdn-apple.com/4668/as-images.apple.com/is/iphone-14-finish-select-202209-6-1inch-blue?wid=5120&hei=2880&fmt=p-jpg&qlt=80&.v=1661026582322', 1, 2800000.00, 3300000.00, 20, 5),
(1, 'APL-IP15-128', 'iPhone 15 (128GB)', 'https://store.storeimages.cdn-apple.com/4668/as-images.apple.com/is/iphone-15-finish-select-202309-6-1inch-black?wid=5120&hei=2880&fmt=p-jpg&qlt=80&.v=1692923777972', 1, 3300000.00, 3800000.00, 25, 5),
(1, 'APL-IP16-128', 'iPhone 16 (128GB)', 'https://store.storeimages.cdn-apple.com/4668/as-images.apple.com/is/iphone-16-finish-select-202409-6-1inch-ultramarine?wid=5120&hei=2880&fmt=p-jpg&qlt=80&.v=1723145610815', 1, 3800000.00, 4300000.00, 30, 8);

-- PRODUCTOS PARA EL LOCAL 2 (TechShop Norte) - Precios distintos
INSERT INTO productos (id_local, codigo_barras, nombre_producto, imagen_url, id_categoria, precio_compra, precio_venta, stock_actual, stock_minimo) VALUES 
(2, 'APL-IP13-128', 'iPhone 13 (128GB)', 'https://store.storeimages.cdn-apple.com/4668/as-images.apple.com/is/iphone-13-finish-unselect-gallery-1-202207_GEO_US?wid=5120&hei=2880&fmt=p-jpg&qlt=80&.v=1654894121404', 1, 2300000.00, 2750000.00, 5, 5),
(2, 'APL-IP15PM-256', 'iPhone 15 Pro Max (256GB)', 'https://store.storeimages.cdn-apple.com/4668/as-images.apple.com/is/iphone-15-pro-finish-select-202309-6-7inch-naturaltitanium?wid=5120&hei=2880&fmt=p-jpg&qlt=80&.v=1692845702708', 1, 5000000.00, 5500000.00, 8, 4);
