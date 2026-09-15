-- v2.2.1: Migración de optimización
-- Índices para mejorar performance de consultas frecuentes

-- Ventas: consultas por fecha y local
CREATE INDEX IF NOT EXISTS idx_ventas_fecha_local ON ventas(fecha_venta DESC, id_local);
CREATE INDEX IF NOT EXISTS idx_ventas_metodo_pago ON ventas(metodo_pago);

-- Detalle ventas: joins frecuentes
CREATE INDEX IF NOT EXISTS idx_detalle_ventas_producto ON detalle_ventas(id_producto);
CREATE INDEX IF NOT EXISTS idx_detalle_ventas_venta ON detalle_ventas(id_venta);

-- Productos: búsquedas por local y stock
CREATE INDEX IF NOT EXISTS idx_productos_local_stock ON productos(id_local, stock_actual);
CREATE INDEX IF NOT EXISTS idx_productos_categoria ON productos(id_categoria);

-- Usuarios: búsquedas por local y aprobación
CREATE INDEX IF NOT EXISTS idx_usuarios_local_aprobado ON usuarios(id_local, aprobado_por_admin);

-- Clientes: búsquedas por nombre
CREATE INDEX IF NOT EXISTS idx_clientes_nombre ON clientes(nombre);

-- Turnos caja: historial por local
CREATE INDEX IF NOT EXISTS idx_turnos_fecha ON turnos_caja(fecha_apertura DESC);

-- Tickets: soporte por estado
CREATE INDEX IF NOT EXISTS idx_tickets_estado ON tickets_soporte(estado);
CREATE INDEX IF NOT EXISTS idx_tickets_local ON tickets_soporte(id_local);

-- Cotizaciones: por estado y local
CREATE INDEX IF NOT EXISTS idx_cotizaciones_estado ON cotizaciones(estado);
CREATE INDEX IF NOT EXISTS idx_cotizaciones_local ON cotizaciones(id_local);

-- Actualizaciones: última versión activa
CREATE INDEX IF NOT EXISTS idx_actualizaciones_activa ON actualizaciones(activa, fecha_publicacion DESC);

-- Instalaciones: tracking
CREATE INDEX IF NOT EXISTS idx_instalaciones_version ON instalaciones(version_app);
CREATE INDEX IF NOT EXISTS idx_instalaciones_fecha ON instalaciones(fecha DESC);

-- Notificaciones: sin leer
CREATE INDEX IF NOT EXISTS idx_notificaciones_leida ON notificaciones(leida, created_at DESC);

-- Productos imágenes: por producto
CREATE INDEX IF NOT EXISTS idx_producto_imagenes_producto ON producto_imagenes(id_producto, orden);

-- Configuración pago (Wompi)
CREATE INDEX IF NOT EXISTS idx_config_pago_local ON configuracion_pago(id_local);

-- Nómina
CREATE INDEX IF NOT EXISTS idx_nomina_empleado ON pagos_nomina(id_empleado);
CREATE INDEX IF NOT EXISTS idx_nomina_fecha ON pagos_nomina(fecha_pago DESC);

-- Proveedores
CREATE INDEX IF NOT EXISTS idx_proveedores_local ON proveedores(id_local);

-- ecommerce
CREATE INDEX IF NOT EXISTS idx_ecommerce_local ON integraciones_ecommerce(id_local, estado);
