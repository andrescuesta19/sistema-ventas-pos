CREATE TABLE IF NOT EXISTS locales (
    id_local INTEGER PRIMARY KEY AUTOINCREMENT,
    nombre_local VARCHAR(100) NOT NULL,
    direccion VARCHAR(200)
);

CREATE TABLE IF NOT EXISTS usuarios (
    id_usuario INTEGER PRIMARY KEY AUTOINCREMENT,
    id_local INTEGER,
    nombre VARCHAR(100) NOT NULL,
    correo VARCHAR(100) UNIQUE NOT NULL,
    contrasena_hash VARCHAR(255) NOT NULL,
    rol VARCHAR(20) NOT NULL CHECK(rol IN ('Administrador', 'Supervisor', 'Cajero')),
    estado BOOLEAN DEFAULT 1,
    FOREIGN KEY (id_local) REFERENCES locales(id_local)
);

CREATE TABLE IF NOT EXISTS clientes (
    id_cliente INTEGER PRIMARY KEY AUTOINCREMENT,
    documento_identidad VARCHAR(20) UNIQUE NOT NULL,
    nombre_razon_social VARCHAR(150) NOT NULL,
    telefono VARCHAR(20),
    correo VARCHAR(100),
    puntos_acumulados INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS categorias (
    id_categoria INTEGER PRIMARY KEY AUTOINCREMENT,
    nombre_categoria VARCHAR(100) NOT NULL
);

-- PRODUCTOS AHORA PERTENECEN A UN LOCAL (SaaS) E INCLUYEN STOCK E IMAGEN
CREATE TABLE IF NOT EXISTS productos (
    id_producto INTEGER PRIMARY KEY AUTOINCREMENT,
    id_local INTEGER NOT NULL,
    codigo_barras VARCHAR(50) NOT NULL,
    nombre_producto VARCHAR(150) NOT NULL,
    imagen_url VARCHAR(500),
    id_categoria INTEGER,
    precio_compra DECIMAL(10,2) NOT NULL,
    precio_venta DECIMAL(10,2) NOT NULL,
    stock_actual INTEGER NOT NULL DEFAULT 0,
    stock_minimo INTEGER NOT NULL DEFAULT 5,
    aplica_iva BOOLEAN DEFAULT 1,
    porcentaje_iva DECIMAL(4,2) DEFAULT 19.00,
    FOREIGN KEY (id_local) REFERENCES locales(id_local),
    FOREIGN KEY (id_categoria) REFERENCES categorias(id_categoria),
    UNIQUE(id_local, codigo_barras)
);

CREATE TABLE IF NOT EXISTS turnos_caja (
    id_turno INTEGER PRIMARY KEY AUTOINCREMENT,
    id_usuario INTEGER,
    id_local INTEGER,
    fecha_apertura TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    monto_apertura DECIMAL(10,2) NOT NULL,
    fecha_cierre TIMESTAMP NULL,
    monto_cierre_real DECIMAL(10,2) NULL,
    monto_cierre_calculado DECIMAL(10,2) NULL,
    estado_turno VARCHAR(10) DEFAULT 'Abierto' CHECK(estado_turno IN ('Abierto', 'Cerrado')),
    FOREIGN KEY (id_usuario) REFERENCES usuarios(id_usuario),
    FOREIGN KEY (id_local) REFERENCES locales(id_local)
);

CREATE TABLE IF NOT EXISTS ventas (
    id_venta INTEGER PRIMARY KEY AUTOINCREMENT,
    id_usuario INTEGER,
    id_local INTEGER,
    id_cliente INTEGER,
    id_turno INTEGER,
    fecha_venta TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    subtotal DECIMAL(10,2) NOT NULL,
    descuento_total DECIMAL(10,2) DEFAULT 0.00,
    impuestos DECIMAL(10,2) NOT NULL,
    total_neto DECIMAL(10,2) NOT NULL,
    metodo_pago VARCHAR(20) NOT NULL CHECK(metodo_pago IN ('Efectivo', 'Tarjeta', 'Transferencia', 'Credito_Tienda')),
    estado_factura VARCHAR(15) DEFAULT 'Local' CHECK(estado_factura IN ('Local', 'DIAN_Enviado', 'DIAN_Error')),
    FOREIGN KEY (id_usuario) REFERENCES usuarios(id_usuario),
    FOREIGN KEY (id_local) REFERENCES locales(id_local),
    FOREIGN KEY (id_cliente) REFERENCES clientes(id_cliente),
    FOREIGN KEY (id_turno) REFERENCES turnos_caja(id_turno)
);

CREATE TABLE IF NOT EXISTS detalle_ventas (
    id_detalle INTEGER PRIMARY KEY AUTOINCREMENT,
    id_venta INTEGER,
    id_producto INTEGER,
    cantidad INTEGER NOT NULL,
    precio_unitario_cobrado DECIMAL(10,2) NOT NULL,
    descuento_aplicado DECIMAL(10,2) DEFAULT 0.00,
    subtotal DECIMAL(10,2) NOT NULL,
    FOREIGN KEY (id_venta) REFERENCES ventas(id_venta),
    FOREIGN KEY (id_producto) REFERENCES productos(id_producto)
);
