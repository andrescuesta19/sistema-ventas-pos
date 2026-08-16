INSERT INTO locales (nombre_local, direccion) VALUES 
('iStore Centro', 'Calle 10 # 20-30'),
('TechShop Norte', 'Avenida 50 # 15-45');

INSERT INTO usuarios (id_local, nombre, correo, contrasena_hash, rol) VALUES 
(1, 'Administrador Centro', 'admin@istore.com', '$2b$10$ua74QqXcbTE9vUByInCASeLdwV2i8ZRxEE501gHq9D9B6yBUTLEI2', 'Administrador'),
(1, 'Cajero Centro', 'cajero@istore.com', '$2b$10$RjrD60yKBImfKgSzYl6I8unKWeRBngxdqqNjwgr6RLnttbBXdXnWi', 'Cajero'),
(2, 'Administrador Norte', 'admin@techshop.com', '$2b$10$ua74QqXcbTE9vUByInCASeLdwV2i8ZRxEE501gHq9D9B6yBUTLEI2', 'Administrador');

INSERT INTO clientes (documento_identidad, nombre_razon_social, telefono, correo, puntos_acumulados) VALUES 
('22222222', 'Consumidor Final', '0000000', 'anonimo@pos.com', 0),
('10203040', 'Juan Perez', '3001234567', 'juan.perez@email.com', 15);

INSERT INTO categorias (nombre_categoria) VALUES 
('Smartphones'), 
('Accesorios'), 
('Ropa'), 
('Calzado'), 
('Bolsos & Maletines');

-- PRODUCTOS PARA EL LOCAL 1 (iStore Centro)
INSERT INTO productos (id_local, codigo_barras, nombre_producto, imagen_url, id_categoria, precio_compra, precio_venta, stock_actual, stock_minimo) VALUES 
(1, 'APL-IP13-128', 'iPhone 13 (128GB)', 'https://store.storeimages.cdn-apple.com/4668/as-images.apple.com/is/iphone-13-finish-unselect-gallery-1-202207_GEO_US?wid=5120&hei=2880&fmt=p-jpg&qlt=80&.v=1654894121404', 1, 2300000.00, 2800000.00, 15, 5),
(1, 'APL-IP14-128', 'iPhone 14 (128GB)', 'https://store.storeimages.cdn-apple.com/4668/as-images.apple.com/is/iphone-14-finish-select-202209-6-1inch-blue?wid=5120&hei=2880&fmt=p-jpg&qlt=80&.v=1661026582322', 1, 2800000.00, 3300000.00, 20, 5),
(1, 'APL-IP15-128', 'iPhone 15 (128GB)', 'https://store.storeimages.cdn-apple.com/4668/as-images.apple.com/is/iphone-15-finish-select-202309-6-1inch-black?wid=5120&hei=2880&fmt=p-jpg&qlt=80&.v=1692923777972', 1, 3300000.00, 3800000.00, 25, 5),
(1, 'APL-IP16-128', 'iPhone 16 (128GB)', 'https://store.storeimages.cdn-apple.com/4668/as-images.apple.com/is/iphone-16-finish-select-202409-6-1inch-ultramarine?wid=5120&hei=2880&fmt=p-jpg&qlt=80&.v=1723145610815', 1, 3800000.00, 4300000.00, 30, 8),
(1, 'ACC-BOL-MAR', 'Bolso Marrón Terracota', 'https://images.unsplash.com/photo-1584917865442-de89df76afd3?auto=format&fit=crop&w=400&q=80', 5, 45000.00, 64990.00, 40, 5),
(1, 'ACC-BUF-BLA', 'Bufanda de Lana Blanca', 'https://images.unsplash.com/photo-1520903920243-00d872a2d1c9?auto=format&fit=crop&w=400&q=80', 2, 20000.00, 35000.00, 18, 3),
(1, 'CAL-ZAP-BLA', 'Zapatillas Urbanas Blancas', 'https://images.unsplash.com/photo-1549298916-b41d501d3772?auto=format&fit=crop&w=400&q=80', 4, 90000.00, 149900.00, 12, 4),
(1, 'ROP-HOO-NEGR', 'Hoodie Oversized Negro', 'https://images.unsplash.com/photo-1556905055-8f358a7a47b2?auto=format&fit=crop&w=400&q=80', 3, 50000.00, 89900.00, 22, 5);

-- PRODUCTOS PARA EL LOCAL 2 (TechShop Norte) - Precios distintos
INSERT INTO productos (id_local, codigo_barras, nombre_producto, imagen_url, id_categoria, precio_compra, precio_venta, stock_actual, stock_minimo) VALUES 
(2, 'APL-IP13-128', 'iPhone 13 (128GB)', 'https://store.storeimages.cdn-apple.com/4668/as-images.apple.com/is/iphone-13-finish-unselect-gallery-1-202207_GEO_US?wid=5120&hei=2880&fmt=p-jpg&qlt=80&.v=1654894121404', 1, 2300000.00, 2750000.00, 5, 5),
(2, 'APL-IP15PM-256', 'iPhone 15 Pro Max (256GB)', 'https://store.storeimages.cdn-apple.com/4668/as-images.apple.com/is/iphone-15-pro-finish-select-202309-6-7inch-naturaltitanium?wid=5120&hei=2880&fmt=p-jpg&qlt=80&.v=1692845702708', 1, 5000000.00, 5500000.00, 8, 4);

