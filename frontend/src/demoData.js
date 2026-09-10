// Datos de demo para previsualización web sin backend
// Estos datos se usan cuando VITE_DEMO_MODE=true

export const DEMO_USER = {
  id_usuario: 1,
  nombre: 'Andrés Cuesta',
  rol: 'Administrador',
  id_local: 1,
  nombre_local: 'Mi Negocio POS'
};

export const DEMO_TOKEN = 'demo_token_no_real';

export const DEMO_PRODUCTOS = [
  { id_producto: 1, codigo_barras: '7701234567890', nombre_producto: 'Audífonos Bluetooth', precio_venta: 89900, stock_actual: 25, stock_minimo: 5, imagen_url: null, aplica_iva: true, porcentaje_iva: 19 },
  { id_producto: 2, codigo_barras: '7709876543210', nombre_producto: 'Cable USB-C 2m', precio_venta: 25000, stock_actual: 50, stock_minimo: 10, imagen_url: null, aplica_iva: true, porcentaje_iva: 19 },
  { id_producto: 3, codigo_barras: '7705551234567', nombre_producto: 'Funda iPhone 15', precio_venta: 45000, stock_actual: 3, stock_minimo: 8, imagen_url: null, aplica_iva: true, porcentaje_iva: 19 },
  { id_producto: 4, codigo_barras: '7701112223334', nombre_producto: 'Cargador Inalámbrico', precio_venta: 65000, stock_actual: 15, stock_minimo: 5, imagen_url: null, aplica_iva: true, porcentaje_iva: 19 },
  { id_producto: 5, codigo_barras: '7709998887776', nombre_producto: 'Mouse Ergonómico', precio_venta: 120000, stock_actual: 0, stock_minimo: 3, imagen_url: null, aplica_iva: true, porcentaje_iva: 19 },
  { id_producto: 6, codigo_barras: '7704445556667', nombre_producto: 'Teclado Mecánico RGB', precio_venta: 185000, stock_actual: 8, stock_minimo: 2, imagen_url: null, aplica_iva: true, porcentaje_iva: 19 },
];

export const DEMO_TURNOS = {
  turno_abierto: true,
  turno: {
    id_turno: 1,
    id_usuario: 1,
    id_local: 1,
    monto_apertura: 200000,
    fecha_apertura: new Date().toISOString(),
    estado_turno: 'Abierto'
  }
};

export const DEMO_VENTAS = [
  { id_venta: 1, fecha_venta: new Date(Date.now() - 3600000).toISOString(), cajero: 'Andrés Cuesta', metodo_pago: 'Efectivo', total_neto: 89900, estado_factura: 'Local', cliente: 'Consumidor Final' },
  { id_venta: 2, fecha_venta: new Date(Date.now() - 7200000).toISOString(), cajero: 'Andrés Cuesta', metodo_pago: 'Tarjeta', total_neto: 110000, estado_factura: 'Local', cliente: 'Consumidor Final' },
  { id_venta: 3, fecha_venta: new Date(Date.now() - 10800000).toISOString(), cajero: 'María López', metodo_pago: 'Nequi', total_neto: 250000, estado_factura: 'DIAN_Enviado', cliente: 'Empresa XYZ S.A.S' },
];

// Simula fetch con delay para modo demo
export function demoFetch(data, delay = 300) {
  return new Promise((resolve) => {
    setTimeout(() => {
      resolve({ ok: true, json: () => Promise.resolve(data) });
    }, delay);
  });
}
