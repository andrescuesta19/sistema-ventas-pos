import { API_URL } from '../config';
import { apiGet, apiPost, apiPut, apiDelete } from '../api';
import { useState, useEffect, useRef } from 'react';
import { Search, Minus, Plus, Trash2, CreditCard, CheckCircle, ShoppingCart, Tag, Percent, DollarSign, User, X, ChevronDown, UserPlus } from 'lucide-react';
import { formatearFechaHoraCO, formatearFechaCO } from '../utils/dateCO';

const POS = ({ user }) => {
  const [turno, setTurno] = useState(null);
  const [productos, setProductos] = useState([]);
  const [todosProductos, setTodosProductos] = useState([]);
  const [query, setQuery] = useState('');
  const [carrito, setCarrito] = useState([]);
  const [showPagoModal, setShowPagoModal] = useState(false);
  const [metodoPago, setMetodoPago] = useState('Efectivo');
  const [efectivoRecibido, setEfectivoRecibido] = useState('');
  const [ventaCompletada, setVentaCompletada] = useState(false);
  const [descuentoGlobalPct, setDescuentoGlobalPct] = useState(0);

  const searchInputRef = useRef(null);

  const [tipoDocumento, setTipoDocumento] = useState('Local'); // 'Local' = POS, 'DIAN_Enviado' = Electrónica
  const [datosCliente, setDatosCliente] = useState({
    documento_identidad: '',
    nombre_razon_social: '',
    correo: ''
  });

  // ── Selección de cliente (independiente del tipo de documento) ──
  const [clienteSeleccionado, setClienteSeleccionado] = useState(null);
  const [showClienteDropdown, setShowClienteDropdown] = useState(false);
  const [busquedaCliente, setBusquedaCliente] = useState('');
  const [clientes, setClientes] = useState([]);
  const [cargandoClientes, setCargandoClientes] = useState(false);
  const [showNuevoCliente, setShowNuevoCliente] = useState(false);
  const [nuevoCliente, setNuevoCliente] = useState({
    documento_identidad: '',
    nombre_razon_social: '',
    telefono: '',
    correo: ''
  });
  const [creandoCliente, setCreandoCliente] = useState(false);
  const clienteDropdownRef = useRef(null);

  const [printFormat, setPrintFormat] = useState(null);
  const [ultimoRecibo, setUltimoRecibo] = useState(null);

  // v1.7.2: galería de imágenes — índice de imagen activa por producto
  const [imagenActiva, setImagenActiva] = useState({});

  useEffect(() => {
    fetchTurno();
    fetchAllProductos();
    searchInputRef.current?.focus();
  }, []);

  // Búsqueda de clientes con debounce de 250ms
  useEffect(() => {
    if (!showClienteDropdown) return;
    const t = setTimeout(async () => {
      try {
        setCargandoClientes(true);
        const data = await apiGet(`${API_URL}/api/clientes?q=${encodeURIComponent(busquedaCliente)}`);
        // Filtrar Consumidor Final (id=1) — es solo el estado por defecto
        setClientes(Array.isArray(data) ? data.filter(c => c.id_cliente !== 1) : []);
      } catch (err) {
        console.error('Error buscando clientes:', err);
        setClientes([]);
      } finally {
        setCargandoClientes(false);
      }
    }, 250);
    return () => clearTimeout(t);
  }, [busquedaCliente, showClienteDropdown]);

  // Cerrar dropdown al hacer click fuera
  useEffect(() => {
    if (!showClienteDropdown) return;
    const handleClickOutside = (e) => {
      if (clienteDropdownRef.current && !clienteDropdownRef.current.contains(e.target)) {
        setShowClienteDropdown(false);
        setShowNuevoCliente(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showClienteDropdown]);

  // Si hay cliente seleccionado y se elige DIAN, autocompletar datosCliente
  useEffect(() => {
    if (clienteSeleccionado && tipoDocumento === 'DIAN_Enviado') {
      setDatosCliente({
        documento_identidad: clienteSeleccionado.documento_identidad || '',
        nombre_razon_social: clienteSeleccionado.nombre_razon_social || '',
        correo: clienteSeleccionado.correo || ''
      });
    }
  }, [clienteSeleccionado, tipoDocumento]);

  const seleccionarCliente = (cliente) => {
    setClienteSeleccionado(cliente);
    setShowClienteDropdown(false);
    setBusquedaCliente('');
    // Si está en DIAN, autocompletar datos
    if (tipoDocumento === 'DIAN_Enviado') {
      setDatosCliente({
        documento_identidad: cliente.documento_identidad || '',
        nombre_razon_social: cliente.nombre_razon_social || '',
        correo: cliente.correo || ''
      });
    }
  };

  const limpiarCliente = () => {
    setClienteSeleccionado(null);
    setDatosCliente({ documento_identidad: '', nombre_razon_social: '', correo: '' });
  };

  const handleCrearCliente = async (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (!nuevoCliente.documento_identidad || !nuevoCliente.nombre_razon_social) {
      return alert('Documento y Nombre son obligatorios para crear un cliente.');
    }
    try {
      setCreandoCliente(true);
      const data = await apiPost(`${API_URL}/api/clientes/crear`, nuevoCliente);
      if (data.success) {
        const clienteNuevo = {
          id_cliente: data.id_cliente,
          documento_identidad: nuevoCliente.documento_identidad,
          nombre_razon_social: nuevoCliente.nombre_razon_social,
          telefono: nuevoCliente.telefono,
          correo: nuevoCliente.correo,
          puntos_acumulados: 0
        };
        seleccionarCliente(clienteNuevo);
        setShowNuevoCliente(false);
        setNuevoCliente({ documento_identidad: '', nombre_razon_social: '', telefono: '', correo: '' });
      } else {
        alert(data.error || 'No se pudo crear el cliente.');
      }
    } catch (err) {
      console.error('Error creando cliente:', err);
      alert('Error de red al crear el cliente.');
    } finally {
      setCreandoCliente(false);
    }
  };

  const getIniciales = (nombre) => {
    if (!nombre) return '?';
    const parts = nombre.trim().split(/\s+/);
    return (parts[0][0] + (parts[1]?.[0] || '')).toUpperCase();
  };

  const fetchTurno = async () => {
    const data = await apiGet(`${API_URL}/api/turnos/estado?id_local=${user.id_local}`);
    setTurno(data.turno_abierto ? data.turno : null);
  };

  const fetchAllProductos = async () => {
    const data = await apiGet(`${API_URL}/api/productos?id_local=${user.id_local}`);
    setTodosProductos(data);
    setProductos(data);
  };

  const handleSearchChange = (e) => {
    const q = e.target.value;
    setQuery(q);
    if (!q) {
      setProductos(todosProductos);
    } else {
      const qLower = q.toLowerCase();
      setProductos(todosProductos.filter(p => 
        p.nombre_producto.toLowerCase().includes(qLower) || p.codigo_barras.toLowerCase().includes(qLower)
      ));
    }
  };

  const agregarAlCarrito = (producto) => {
    // Stock disponible = stock_actual - lo que ya está en el carrito
    const enCarrito = carrito.find(p => p.id_producto === producto.id_producto)?.cantidad || 0;
    const stockDisponible = producto.stock_actual - enCarrito;

    setCarrito(prev => {
      const existe = prev.find(p => p.id_producto === producto.id_producto);
      if (existe) {
        if (stockDisponible <= 0) {
          alert('No hay más stock disponible para agregar.');
          return prev;
        }
        const nuevaCant = existe.cantidad + 1;
        const descMonto = Math.round((nuevaCant * producto.precio_venta) * (existe.porcentajeDescuento || descuentoGlobalPct) / 100);
        return prev.map(p => p.id_producto === producto.id_producto
          ? { ...p, cantidad: nuevaCant, descuento: descMonto, subtotal: (nuevaCant * producto.precio_venta) - descMonto }
          : p);
      }
      if (producto.stock_actual <= 0) {
        alert('Este producto no tiene stock disponible.');
        return prev;
      }
      const descMonto = Math.round(producto.precio_venta * (descuentoGlobalPct / 100));
      return [...prev, { ...producto, cantidad: 1, descuento: descMonto, porcentajeDescuento: descuentoGlobalPct, subtotal: producto.precio_venta - descMonto }];
    });
    setQuery('');
    setProductos(todosProductos);
  };

  const actualizarCantidad = (id, delta) => {
    setCarrito(prev => prev.map(p => {
      if (p.id_producto === id) {
        const nuevaCantidad = Math.max(0, p.cantidad + delta);
        if (nuevaCantidad === 0) return null;
        if (nuevaCantidad > p.stock_actual) {
          alert('No hay más stock físico de este producto.');
          return p;
        }
        const descMonto = Math.round((nuevaCantidad * p.precio_venta) * (p.porcentajeDescuento || 0) / 100);
        return { ...p, cantidad: nuevaCantidad, descuento: descMonto, subtotal: (nuevaCantidad * p.precio_venta) - descMonto };
      }
      return p;
    }).filter(Boolean));
  };

  const aplicarDescuentoGlobal = (pct) => {
    setDescuentoGlobalPct(pct);
    setCarrito(prev => prev.map(p => {
      const bruto = p.cantidad * p.precio_venta;
      const descMonto = Math.round(bruto * (pct / 100));
      return {
        ...p,
        porcentajeDescuento: pct,
        descuento: descMonto,
        subtotal: bruto - descMonto
      };
    }));
  };

  const aplicarDescuentoItem = (id_producto, pct) => {
    setCarrito(prev => prev.map(p => {
      if (p.id_producto === id_producto) {
        const bruto = p.cantidad * p.precio_venta;
        const descMonto = Math.round(bruto * (pct / 100));
        return {
          ...p,
          porcentajeDescuento: pct,
          descuento: descMonto,
          subtotal: bruto - descMonto
        };
      }
      return p;
    }));
  };

  // Precios incluyen IVA:
  // totalItem = cantidad * precio_venta - descuento
  // baseItem = totalItem / (1 + %iva/100)
  // ivaItem = totalItem - baseItem
  const totales = carrito.reduce((acc, item) => {
    const bruto = item.cantidad * item.precio_venta;
    const desc = item.descuento || 0;
    const totalItem = Math.max(0, bruto - desc);

    const pctIva = item.aplica_iva ? (item.porcentaje_iva || 19) : 0;
    const baseItem = pctIva > 0 ? (totalItem / (1 + pctIva / 100)) : totalItem;
    const ivaItem = totalItem - baseItem;

    return {
      subtotal: acc.subtotal + baseItem,
      descuento: acc.descuento + desc,
      impuestos: acc.impuestos + ivaItem,
      total: acc.total + totalItem
    };
  }, { subtotal: 0, descuento: 0, impuestos: 0, total: 0 });

  const rec = parseFloat(efectivoRecibido || 0);
  const cambioCalculado = (metodoPago === 'Efectivo' && rec >= totales.total) ? (rec - totales.total) : 0;

  const procesarVenta = async (e) => {
    e.preventDefault();
    if (!turno) return alert('Debes abrir un turno primero.');

    if (metodoPago === 'Efectivo') {
      if (!efectivoRecibido || rec < totales.total) {
        return alert(`El monto de efectivo recibido ($${formatearCOP(rec)}) debe ser igual o mayor al total a pagar ($${formatearCOP(totales.total)}).`);
      }
    }

    if (tipoDocumento === 'DIAN_Enviado') {
      if (!datosCliente.documento_identidad || !datosCliente.nombre_razon_social || !datosCliente.correo) {
        return alert('Para Factura Electrónica, todos los datos del cliente son obligatorios.');
      }
    }

    // Resolver id_cliente: si hay cliente seleccionado, usar su id.
    // Si no hay, usar 1 (Consumidor Final).
    let id_cliente = clienteSeleccionado?.id_cliente || 1;

    // v1.5.4: envolver todo en try/catch (apiPost lanza Error si !res.ok)
    try {

    // Si es DIAN y el cliente no estaba en la lista, crear/buscar uno nuevo
    // (caso: usuario escribió datos directamente sin seleccionar del dropdown)
    if (tipoDocumento === 'DIAN_Enviado' && id_cliente === 1) {
      // v1.5.4: apiPost ya devuelve el JSON parseado, no un Response.
      // Antes hacía `await resCli.json()` y eso era un TypeError que rompía
      // toda la app al cobrar una factura electrónica con cliente nuevo.
      const dataCli = await apiPost(`${API_URL}/api/clientes/crear`, datosCliente);
      if (dataCli.success) id_cliente = dataCli.id_cliente;
    }

    const payload = {
      id_usuario: user.id_usuario,
      id_local: user.id_local,
      id_cliente: id_cliente,
      id_turno: turno.id_turno,
      subtotal: Math.round(totales.subtotal),
      descuento_total: totales.descuento,
      impuestos: Math.round(totales.impuestos),
      total_neto: totales.total,
      metodo_pago: metodoPago,
      estado_factura: tipoDocumento,
      detalles: carrito.map(c => ({
        id_producto: c.id_producto,
        cantidad: c.cantidad,
        precio_unitario: c.precio_venta,
        descuento: c.descuento,
        subtotal: c.subtotal
      }))
    };

    // v1.5.4: apiPost ya devuelve el JSON parseado. Antes hacía `res.ok` y
    // `res.json()` sobre el JSON, lo cual era un TypeError que rompía la app
    // después de cada venta cobrada.
    const ventaData = await apiPost(`${API_URL}/api/ventas/procesar`, payload);
    const idVentaReal = ventaData.id_venta;

    // ── Actualizar stock local inmediatamente (antes del reload) ──
    setTodosProductos(prev => prev.map(p => {
      const det = payload.detalles.find(d => d.id_producto === p.id_producto);
      if (det) return { ...p, stock_actual: Math.max(0, p.stock_actual - det.cantidad) };
      return p;
    }));
    setProductos(prev => prev.map(p => {
      const det = payload.detalles.find(d => d.id_producto === p.id_producto);
      if (det) return { ...p, stock_actual: Math.max(0, p.stock_actual - det.cantidad) };
      return p;
    }));

    const reciboData = {
      id_venta: idVentaReal,
      fecha: new Date(),
      cliente: clienteSeleccionado
        ? {
            nombre_razon_social: clienteSeleccionado.nombre_razon_social,
            documento_identidad: clienteSeleccionado.documento_identidad,
            correo: clienteSeleccionado.correo || datosCliente.correo || ''
          }
        : (id_cliente === 1
            ? { nombre_razon_social: 'Consumidor Final', documento_identidad: '22222222', correo: '' }
            : datosCliente),
      detalles: carrito,
      totales: totales,
      tipo: tipoDocumento,
      metodoPago: metodoPago,
      efectivoRecibido: metodoPago === 'Efectivo' ? rec : totales.total,
      cambio: cambioCalculado
    };
    setUltimoRecibo(reciboData);

    // Si es Factura Electrónica, enviar correo real
    if (tipoDocumento === 'DIAN_Enviado' && datosCliente.correo) {
      try {
        await apiPost(`${API_URL}/api/facturas/enviar-correo`, {
          correo_cliente: datosCliente.correo,
          nombre_cliente: datosCliente.nombre_razon_social,
          id_venta: idVentaReal,
          total_neto: totales.total,
          detalles: carrito.map(c => ({
            nombre_producto: c.nombre_producto,
            cantidad: c.cantidad,
            precio_unitario: c.precio_venta,
            subtotal: c.subtotal
          })),
          nombre_local: user.nombre_local || 'Sistema Integral de Ventas',
          metodo_pago: metodoPago
        });
      } catch (err) {
        console.warn('No se pudo enviar el correo:', err);
      }
    }

    setVentaCompletada(true);
    // Refrescar desde servidor para sincronizar stock real
    setTimeout(() => fetchAllProductos(), 1500);
    } catch (err) {
      // v1.5.4: apiPost lanza Error con mensaje del backend si !res.ok
      alert(`Error procesando la venta: ${err.message || 'Error desconocido'}`);
    } finally {
      setShowPagoModal(false);
      setProcesandoVenta(false);
    }
  };

  const nuevaVenta = () => {
    setCarrito([]);
    setVentaCompletada(false);
    setShowPagoModal(false);
    setTipoDocumento('Local');
    setDatosCliente({ documento_identidad: '', nombre_razon_social: '', correo: '' });
    setClienteSeleccionado(null);
    setShowClienteDropdown(false);
    setBusquedaCliente('');
    setShowNuevoCliente(false);
    setNuevoCliente({ documento_identidad: '', nombre_razon_social: '', telefono: '', correo: '' });
    setEfectivoRecibido('');
    setDescuentoGlobalPct(0);
  };

  const formatearCOP = (valor) => {
    return new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0 }).format(valor || 0);
  };

  if (!turno) {
    return (
      <div className="page-content">
        <h1>Punto de Venta (POS)</h1>
        <div className="card" style={{ padding: '2rem', textAlign: 'center' }}>
          <h3>No hay un turno de caja abierto actualmente.</h3>
          <p style={{ color: 'var(--text-light)', marginTop: '0.5rem' }}>Abre la caja en el Dashboard para comenzar a vender.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="page-content" style={{ display: 'flex', gap: '1.5rem', height: '100%', padding: '1rem' }}>
      
      {/* Columna Izquierda: Buscador y Grilla de Productos */}
      <div style={{ flex: 2, display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        <div className="card" style={{ padding: '1rem' }}>
          <div style={{ position: 'relative' }}>
            <Search size={20} style={{ position: 'absolute', top: '12px', left: '12px', color: 'var(--text-light)' }} />
            <input 
              ref={searchInputRef}
              type="text" 
              placeholder="Buscar producto por nombre o código de barras..." 
              value={query}
              onChange={handleSearchChange}
              style={{ width: '100%', paddingLeft: '2.8rem', fontSize: '1.1rem', padding: '0.75rem 2.8rem' }}
            />
          </div>
        </div>

        <div style={{ flex: 1, overflowY: 'auto' }}>
          <div className="grid-3" style={{ paddingRight: '0.5rem', gap: '1rem' }}>
            {productos.map(p => (
              <div 
                key={p.id_producto} 
                className="card" 
                style={{ 
                  cursor: 'pointer', 
                  transition: 'transform 0.15s, box-shadow 0.15s', 
                  border: p.stock_actual <= 0 ? '1px solid #EF4444' : '1px solid #E2E8F0',
                  opacity: p.stock_actual <= 0 ? 0.6 : 1,
                  padding: '1rem',
                  display: 'flex',
                  flexDirection: 'column',
                  justify: 'space-between'
                }}
                onClick={() => agregarAlCarrito(p)}
                onMouseEnter={e => e.currentTarget.style.transform = 'translateY(-2px)'}
                onMouseLeave={e => e.currentTarget.style.transform = 'translateY(0)'}
              >
                <div style={{ height: '110px', backgroundColor: '#F8FAFC', borderRadius: '8px', marginBottom: '0.75rem', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
                  {(() => {
                    // v1.7.2: galería de imágenes — usa la lista de imágenes si existe
                    const imgs = (p.imagenes && p.imagenes.length) ? p.imagenes.map(i => i.url) : (p.imagen_url ? [p.imagen_url] : []);
                    const idx = Math.min(imagenActiva[p.id_producto] || 0, Math.max(imgs.length - 1, 0));
                    const imgActual = imgs[idx] || null;
                    return imgActual ? (
                      <img src={imgActual} alt={p.nombre_producto} style={{ width: '100%', height: '100%', objectFit: 'contain', padding: '0.5rem' }} />
                    ) : (
                      <span style={{ fontSize: '2rem' }}>📱</span>
                    );
                  })()}
                </div>
                {/* v1.7.2: miniaturas de la galería (si hay más de una imagen) */}
                {(() => {
                  const imgs = (p.imagenes && p.imagenes.length) ? p.imagenes.map(i => i.url) : (p.imagen_url ? [p.imagen_url] : []);
                  if (imgs.length <= 1) return null;
                  const idx = Math.min(imagenActiva[p.id_producto] || 0, imgs.length - 1);
                  return (
                    <div style={{ display: 'flex', gap: '0.3rem', marginBottom: '0.6rem', flexWrap: 'wrap' }}>
                      {imgs.map((url, i) => (
                        <div
                          key={i}
                          onClick={(e) => { e.stopPropagation(); setImagenActiva(prev => ({ ...prev, [p.id_producto]: i })); }}
                          style={{
                            width: 26, height: 26, borderRadius: 6, overflow: 'hidden', cursor: 'pointer',
                            border: i === idx ? '2px solid #2A9D8F' : '2px solid transparent',
                            opacity: i === idx ? 1 : 0.55,
                            flexShrink: 0
                          }}
                        >
                          <img src={url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                        </div>
                      ))}
                    </div>
                  );
                })()}
                <h4 style={{ marginBottom: '0.4rem', fontSize: '0.95rem', height: '38px', overflow: 'hidden' }}>{p.nombre_producto}</h4>
                <div className="flex-between" style={{ alignItems: 'center' }}>
                  <div>
                    <span style={{ fontWeight: 700, fontSize: '1.1rem', color: '#264653' }}>{formatearCOP(p.precio_venta)}</span>
                    <span style={{ display: 'block', fontSize: '0.7rem', color: '#2A9D8F', fontWeight: 600 }}>IVA Incluido</span>
                  </div>
                  <span style={{ fontSize: '0.8rem', fontWeight: 600, padding: '0.2rem 0.5rem', borderRadius: '12px', backgroundColor: p.stock_actual > p.stock_minimo ? '#E6F4F1' : '#FEE2E2', color: p.stock_actual > p.stock_minimo ? '#2A9D8F' : '#EF4444' }}>
                    Stock: {p.stock_actual}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Columna Derecha: Carrito, Descuentos y Resumen */}
      <div className="card" style={{ flex: 1.2, display: 'flex', flexDirection: 'column', padding: '1.25rem', border: '1px solid #E2E8F0' }}>
        <div className="flex-between" style={{ marginBottom: '0.75rem', borderBottom: '2px solid #E2E8F0', paddingBottom: '0.5rem' }}>
          <h3 style={{ margin: 0, color: '#264653', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <ShoppingCart size={20} color="#2A9D8F" /> Carrito de Compras
          </h3>
          <span style={{ fontSize: '0.85rem', color: '#64748B', fontWeight: 600 }}>{carrito.reduce((a, b) => a + b.cantidad, 0)} ítems</span>
        </div>
        
        {/* Lista de Productos en el Carrito */}
        <div style={{ flex: 1, overflowY: 'auto', marginBottom: '0.75rem', paddingRight: '0.25rem' }}>
          {carrito.length === 0 ? (
            <div style={{ padding: '3rem 1rem', textAlign: 'center', color: '#94A3B8' }}>
              <ShoppingCart size={48} style={{ opacity: 0.3, margin: '0 auto 1rem auto' }} />
              <p style={{ margin: 0 }}>Toca un producto para agregarlo al carrito de venta.</p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              {carrito.map(item => (
                <div key={item.id_producto} style={{ padding: '0.75rem', border: '1px solid #E2E8F0', borderRadius: '8px', backgroundColor: '#FAFAFA' }}>
                  <div className="flex-between" style={{ marginBottom: '0.4rem' }}>
                    <span style={{ fontWeight: 600, fontSize: '0.9rem', color: '#1E293B' }}>{item.nombre_producto}</span>
                    <span style={{ fontWeight: 700, color: '#264653' }}>{formatearCOP(item.subtotal)}</span>
                  </div>

                  <div className="flex-between" style={{ alignItems: 'center' }}>
                    <span style={{ fontSize: '0.8rem', color: '#64748B' }}>{formatearCOP(item.precio_venta)} c/u (c/IVA)</span>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      {/* Control de Cantidad */}
                      <div className="flex-row" style={{ gap: '0.3rem', backgroundColor: 'white', padding: '0.2rem', borderRadius: '6px', border: '1px solid #CBD5E1' }}>
                        <button style={{ padding: '0.25rem', borderRadius: '4px', border: 'none', background: 'none', cursor: 'pointer' }} onClick={() => actualizarCantidad(item.id_producto, -1)}>
                          {item.cantidad === 1 ? <Trash2 size={14} color="#EF4444" /> : <Minus size={14} />}
                        </button>
                        <span style={{ fontWeight: 600, width: '22px', textAlign: 'center', fontSize: '0.9rem' }}>{item.cantidad}</span>
                        <button style={{ padding: '0.25rem', borderRadius: '4px', border: 'none', background: 'none', cursor: 'pointer' }} onClick={() => actualizarCantidad(item.id_producto, 1)}>
                          <Plus size={14} />
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Selector de Descuento por Ítem */}
                  <div style={{ marginTop: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.4rem', paddingTop: '0.4rem', borderTop: '1px dashed #E2E8F0' }}>
                    <Tag size={12} color="#64748B" />
                    <span style={{ fontSize: '0.75rem', color: '#64748B' }}>Desc:</span>
                    {[0, 5, 10, 15].map(pct => (
                      <button 
                        key={pct}
                        type="button" 
                        onClick={() => aplicarDescuentoItem(item.id_producto, pct)}
                        style={{
                          padding: '0.15rem 0.4rem',
                          borderRadius: '4px',
                          border: item.porcentajeDescuento === pct ? '1px solid #2A9D8F' : '1px solid #CBD5E1',
                          backgroundColor: item.porcentajeDescuento === pct ? '#E6F4F1' : 'white',
                          color: item.porcentajeDescuento === pct ? '#2A9D8F' : '#64748B',
                          fontSize: '0.7rem',
                          fontWeight: item.porcentajeDescuento === pct ? 700 : 500,
                          cursor: 'pointer'
                        }}
                      >
                        {pct}%
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Sección de Descuento Global rápido */}
        {carrito.length > 0 && (
          <div style={{ marginBottom: '0.75rem', padding: '0.6rem', backgroundColor: '#F8FAFC', borderRadius: '8px', border: '1px solid #E2E8F0' }}>
            <div className="flex-between" style={{ marginBottom: '0.4rem' }}>
              <span style={{ fontSize: '0.8rem', fontWeight: 600, color: '#475569', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                <Percent size={14} color="#2A9D8F" /> Descuento Global a la Venta:
              </span>
              {descuentoGlobalPct > 0 && <span style={{ fontSize: '0.8rem', fontWeight: 700, color: '#2A9D8F' }}>{descuentoGlobalPct}% OFF</span>}
            </div>
            <div style={{ display: 'flex', gap: '0.3rem' }}>
              {[0, 5, 10, 15, 20].map(pct => (
                <button 
                  key={pct}
                  type="button"
                  onClick={() => aplicarDescuentoGlobal(pct)}
                  style={{
                    flex: 1,
                    padding: '0.3rem',
                    borderRadius: '6px',
                    border: descuentoGlobalPct === pct ? '1px solid #264653' : '1px solid #CBD5E1',
                    backgroundColor: descuentoGlobalPct === pct ? '#264653' : 'white',
                    color: descuentoGlobalPct === pct ? 'white' : '#334155',
                    fontSize: '0.75rem',
                    fontWeight: 600,
                    cursor: 'pointer'
                  }}
                >
                  {pct === 0 ? 'Sin desc.' : `${pct}%`}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Resumen de Totales con Precio IVA Incluido */}
        <div style={{ marginBottom: '1rem', backgroundColor: '#F8FAFC', padding: '0.75rem', borderRadius: '8px', border: '1px solid #E2E8F0' }}>
          <div className="flex-between" style={{ marginBottom: '0.4rem', fontSize: '0.85rem' }}>
            <span style={{ color: '#64748B' }}>Subtotal (sin IVA):</span>
            <span>{formatearCOP(totales.subtotal)}</span>
          </div>
          {totales.descuento > 0 && (
            <div className="flex-between" style={{ marginBottom: '0.4rem', fontSize: '0.85rem', color: '#2A9D8F', fontWeight: 600 }}>
              <span>Descuento aplicado:</span>
              <span>-{formatearCOP(totales.descuento)}</span>
            </div>
          )}
          <div className="flex-between" style={{ marginBottom: '0.4rem', fontSize: '0.85rem' }}>
            <span style={{ color: '#64748B' }}>Impuestos (IVA 19% Incluido):</span>
            <span>{formatearCOP(totales.impuestos)}</span>
          </div>
          <div className="flex-between" style={{ borderTop: '2px dashed #CBD5E1', paddingTop: '0.6rem', marginTop: '0.4rem' }}>
            <span style={{ fontSize: '1.1rem', fontWeight: 700, color: '#264653' }}>Total a Cobrar</span>
            <span style={{ fontSize: '1.4rem', fontWeight: 800, color: '#2A9D8F' }}>{formatearCOP(totales.total)}</span>
          </div>
        </div>

        <button 
          className="btn-primary" 
          style={{ width: '100%', padding: '0.9rem', fontSize: '1.1rem', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '0.5rem', borderRadius: '10px', backgroundColor: '#264653' }}
          disabled={carrito.length === 0}
          onClick={() => {
            setEfectivoRecibido(totales.total.toString());
            setShowPagoModal(true);
          }}
        >
          <CreditCard size={22} /> Cobrar {formatearCOP(totales.total)}
        </button>
      </div>

      {/* Modal de Cobro, Efectivo Recibido y Cambio */}
      {showPagoModal && (
        <div className="modal-overlay">
          <div className="modal-content" style={{ maxWidth: '580px', borderRadius: '16px' }}>
            {!ventaCompletada ? (
              <form onSubmit={procesarVenta}>
                <div className="modal-header">
                  <h2>Procesar Cobro</h2>
                  <button type="button" className="close-btn" onClick={() => setShowPagoModal(false)}>×</button>
                </div>
                
                <div style={{ backgroundColor: '#E6F4F1', borderRadius: '12px', padding: '1.25rem', textAlign: 'center', marginBottom: '1.25rem' }}>
                  <div style={{ fontSize: '0.85rem', color: '#264653', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Total de la Venta (IVA Incluido)</div>
                  <div style={{ fontSize: '2.6rem', fontWeight: 800, color: '#2A9D8F' }}>{formatearCOP(totales.total)}</div>
                </div>

                <div style={{ marginBottom: '1.25rem' }}>
                  <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 600, color: '#1E293B' }}>Método de Pago</label>
                  <div style={{ display: 'flex', gap: '0.5rem' }}>
                    {['Efectivo', 'Tarjeta', 'Transferencia'].map(m => (
                      <button 
                        key={m}
                        type="button"
                        className={metodoPago === m ? 'btn-primary' : 'btn-secondary'}
                        style={{ flex: 1, padding: '0.6rem', borderRadius: '8px', fontSize: '0.9rem', backgroundColor: metodoPago === m ? '#264653' : '' }}
                        onClick={() => setMetodoPago(m)}
                      >
                        {m}
                      </button>
                    ))}
                  </div>

                  {/* Sección de Calculadora de Cambio en Efectivo */}
                  {metodoPago === 'Efectivo' && (
                    <div style={{ marginTop: '1rem', padding: '1rem', backgroundColor: '#F8FAFC', borderRadius: '10px', border: '1px solid #CBD5E1' }}>
                      <label style={{ display: 'block', marginBottom: '0.4rem', fontWeight: 600, color: '#334155', fontSize: '0.9rem' }}>
                        💵 Dinero Recibido del Cliente ($):
                      </label>
                      <input 
                        type="number" 
                        step="100" 
                        value={efectivoRecibido} 
                        onChange={e => setEfectivoRecibido(e.target.value)} 
                        placeholder="Ej. 50000"
                        style={{ width: '100%', padding: '0.75rem', fontSize: '1.2rem', fontWeight: 700, borderRadius: '8px', border: '2px solid #264653' }} 
                        required 
                      />

                      {/* Botones de Monedas y Billetes Rápidos */}
                      <div style={{ display: 'flex', gap: '0.4rem', marginTop: '0.6rem', flexWrap: 'wrap' }}>
                        <button type="button" className="btn-secondary" style={{ padding: '0.35rem 0.6rem', fontSize: '0.8rem', borderRadius: '6px' }} onClick={() => setEfectivoRecibido(totales.total.toString())}>Pago Exacto</button>
                        <button type="button" className="btn-secondary" style={{ padding: '0.35rem 0.6rem', fontSize: '0.8rem', borderRadius: '6px' }} onClick={() => setEfectivoRecibido('20000')}>$20.000</button>
                        <button type="button" className="btn-secondary" style={{ padding: '0.35rem 0.6rem', fontSize: '0.8rem', borderRadius: '6px' }} onClick={() => setEfectivoRecibido('50000')}>$50.000</button>
                        <button type="button" className="btn-secondary" style={{ padding: '0.35rem 0.6rem', fontSize: '0.8rem', borderRadius: '6px' }} onClick={() => setEfectivoRecibido('100000')}>$100.000</button>
                      </div>

                      {/* Cálculo en tiempo real del Cambio a Devolver */}
                      {efectivoRecibido && (
                        <div style={{ marginTop: '0.8rem', padding: '0.75rem', borderRadius: '8px', backgroundColor: rec >= totales.total ? '#E6F4F1' : '#FEE2E2', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <span style={{ fontWeight: 600, color: rec >= totales.total ? '#264653' : '#EF4444' }}>
                            {rec >= totales.total ? '🔄 Cambio a Devolver:' : '⚠️ Falta Dinero:'}
                          </span>
                          <span style={{ fontSize: '1.3rem', fontWeight: 800, color: rec >= totales.total ? '#2A9D8F' : '#EF4444' }}>
                            {formatearCOP(Math.abs(rec - totales.total))}
                          </span>
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* Selector de Cliente — siempre visible */}
                <div ref={clienteDropdownRef} style={{ marginBottom: '1.25rem', position: 'relative' }}>
                  <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 600, color: '#1E293B' }}>Cliente</label>

                  <div
                    role="button"
                    tabIndex={0}
                    aria-label="Seleccionar cliente"
                    onClick={() => setShowClienteDropdown(s => !s)}
                    onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setShowClienteDropdown(s => !s); } }}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.75rem',
                      padding: '0.75rem',
                      borderRadius: '10px',
                      border: showClienteDropdown ? '2px solid #2A9D8F' : '1px solid #CBD5E1',
                      backgroundColor: showClienteDropdown ? '#F0FAF8' : 'white',
                      cursor: 'pointer',
                      transition: 'all 0.15s'
                    }}
                  >
                    {clienteSeleccionado ? (
                      <>
                        <div style={{
                          width: '40px', height: '40px', borderRadius: '50%',
                          backgroundColor: '#2A9D8F', color: 'white',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          fontWeight: 700, fontSize: '0.95rem', flexShrink: 0
                        }}>
                          {getIniciales(clienteSeleccionado.nombre_razon_social)}
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontWeight: 700, color: '#1E293B', fontSize: '0.95rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            {clienteSeleccionado.nombre_razon_social}
                          </div>
                          <div style={{ fontSize: '0.78rem', color: '#64748B' }}>
                            {clienteSeleccionado.documento_identidad}
                          </div>
                        </div>
                        {clienteSeleccionado.puntos_acumulados > 0 && (
                          <span style={{
                            fontSize: '0.75rem', fontWeight: 700,
                            padding: '0.2rem 0.55rem', borderRadius: '12px',
                            backgroundColor: '#DCFCE7', color: '#15803D',
                            whiteSpace: 'nowrap'
                          }}>
                            ⭐ {clienteSeleccionado.puntos_acumulados} pts
                          </span>
                        )}
                        <button
                          type="button"
                          aria-label="Quitar cliente seleccionado"
                          onClick={(e) => { e.stopPropagation(); limpiarCliente(); }}
                          style={{
                            background: 'none', border: 'none', cursor: 'pointer',
                            padding: '0.25rem', borderRadius: '4px',
                            display: 'flex', alignItems: 'center', color: '#EF4444'
                          }}
                        >
                          <X size={18} />
                        </button>
                      </>
                    ) : (
                      <>
                        <div style={{
                          width: '40px', height: '40px', borderRadius: '50%',
                          backgroundColor: '#E2E8F0', color: '#64748B',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          flexShrink: 0
                        }}>
                          <User size={20} />
                        </div>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontWeight: 600, color: '#475569', fontSize: '0.95rem' }}>Consumidor Final</div>
                          <div style={{ fontSize: '0.78rem', color: '#94A3B8' }}>Click para buscar o crear un cliente</div>
                        </div>
                      </>
                    )}
                    <ChevronDown size={18} color="#94A3B8" style={{
                      transform: showClienteDropdown ? 'rotate(180deg)' : 'rotate(0deg)',
                      transition: 'transform 0.2s'
                    }} />
                  </div>

                  {/* Dropdown de búsqueda */}
                  {showClienteDropdown && (
                    <div style={{
                      position: 'absolute', top: '100%', left: 0, right: 0,
                      marginTop: '0.4rem', backgroundColor: 'white',
                      border: '1px solid #E2E8F0', borderRadius: '10px',
                      boxShadow: '0 10px 25px rgba(0,0,0,0.12)', zIndex: 50,
                      overflow: 'hidden'
                    }}>
                      {/* Buscador */}
                      <div style={{ padding: '0.6rem', borderBottom: '1px solid #E2E8F0', position: 'relative' }}>
                        <Search size={16} style={{ position: 'absolute', top: '50%', left: '1.1rem', transform: 'translateY(-50%)', color: '#94A3B8' }} />
                        <input
                          type="text"
                          autoFocus
                          placeholder="Buscar por nombre o documento..."
                          value={busquedaCliente}
                          onChange={(e) => setBusquedaCliente(e.target.value)}
                          onClick={(e) => e.stopPropagation()}
                          style={{
                            width: '100%', padding: '0.5rem 0.6rem 0.5rem 2.2rem',
                            border: '1px solid #CBD5E1', borderRadius: '6px',
                            fontSize: '0.9rem', outline: 'none'
                          }}
                        />
                      </div>

                      {/* Lista de resultados o formulario de nuevo cliente */}
                      {!showNuevoCliente ? (
                        <div style={{ maxHeight: '260px', overflowY: 'auto' }}>
                          {cargandoClientes ? (
                            <div style={{ padding: '1.5rem', textAlign: 'center', color: '#94A3B8', fontSize: '0.85rem' }}>
                              Buscando...
                            </div>
                          ) : clientes.length === 0 ? (
                            <div style={{ padding: '1.25rem', textAlign: 'center', color: '#94A3B8', fontSize: '0.85rem' }}>
                              {busquedaCliente ? 'No se encontraron clientes con ese criterio.' : 'No hay clientes registrados.'}
                            </div>
                          ) : (
                            clientes.map(c => (
                              <div
                                key={c.id_cliente}
                                role="button"
                                tabIndex={0}
                                onClick={() => seleccionarCliente(c)}
                                onKeyDown={(e) => { if (e.key === 'Enter') seleccionarCliente(c); }}
                                style={{
                                  display: 'flex', alignItems: 'center', gap: '0.65rem',
                                  padding: '0.6rem 0.75rem', cursor: 'pointer',
                                  borderBottom: '1px solid #F1F5F9',
                                  transition: 'background 0.1s'
                                }}
                                onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#F8FAFC'}
                                onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'white'}
                              >
                                <div style={{
                                  width: '32px', height: '32px', borderRadius: '50%',
                                  backgroundColor: '#264653', color: 'white',
                                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                                  fontWeight: 700, fontSize: '0.8rem', flexShrink: 0
                                }}>
                                  {getIniciales(c.nombre_razon_social)}
                                </div>
                                <div style={{ flex: 1, minWidth: 0 }}>
                                  <div style={{ fontWeight: 600, color: '#1E293B', fontSize: '0.88rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                    {c.nombre_razon_social}
                                  </div>
                                  <div style={{ fontSize: '0.75rem', color: '#64748B' }}>{c.documento_identidad}</div>
                                </div>
                                {c.puntos_acumulados > 0 && (
                                  <span style={{
                                    fontSize: '0.7rem', fontWeight: 700,
                                    padding: '0.15rem 0.45rem', borderRadius: '10px',
                                    backgroundColor: '#DCFCE7', color: '#15803D',
                                    whiteSpace: 'nowrap'
                                  }}>
                                    {c.puntos_acumulados} pts
                                  </span>
                                )}
                              </div>
                            ))
                          )}

                          {/* Botón Nuevo Cliente */}
                          <div
                            role="button"
                            tabIndex={0}
                            onClick={(e) => { e.stopPropagation(); setShowNuevoCliente(true); }}
                            onKeyDown={(e) => { if (e.key === 'Enter') setShowNuevoCliente(true); }}
                            style={{
                              display: 'flex', alignItems: 'center', gap: '0.5rem',
                              padding: '0.7rem 0.75rem', cursor: 'pointer',
                              border: '2px dashed #2A9D8F', borderRadius: '6px',
                              margin: '0.5rem', color: '#2A9D8F', fontWeight: 600, fontSize: '0.85rem',
                              backgroundColor: '#F0FAF8'
                            }}
                          >
                            <UserPlus size={16} /> + Nuevo cliente
                          </div>
                        </div>
                      ) : (
                        <form onSubmit={handleCrearCliente} onClick={(e) => e.stopPropagation()} style={{ padding: '0.75rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                          <div style={{ fontWeight: 700, color: '#264653', fontSize: '0.9rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                            <UserPlus size={16} /> Crear cliente nuevo
                          </div>
                          <input type="text" placeholder="Documento *" value={nuevoCliente.documento_identidad} onChange={e => setNuevoCliente({...nuevoCliente, documento_identidad: e.target.value})} style={{ padding: '0.5rem', borderRadius: '6px', border: '1px solid #CBD5E1', fontSize: '0.85rem' }} required />
                          <input type="text" placeholder="Nombre / Razón Social *" value={nuevoCliente.nombre_razon_social} onChange={e => setNuevoCliente({...nuevoCliente, nombre_razon_social: e.target.value})} style={{ padding: '0.5rem', borderRadius: '6px', border: '1px solid #CBD5E1', fontSize: '0.85rem' }} required />
                          <input type="text" placeholder="Teléfono (opcional)" value={nuevoCliente.telefono} onChange={e => setNuevoCliente({...nuevoCliente, telefono: e.target.value})} style={{ padding: '0.5rem', borderRadius: '6px', border: '1px solid #CBD5E1', fontSize: '0.85rem' }} />
                          <input type="email" placeholder="Correo (opcional)" value={nuevoCliente.correo} onChange={e => setNuevoCliente({...nuevoCliente, correo: e.target.value})} style={{ padding: '0.5rem', borderRadius: '6px', border: '1px solid #CBD5E1', fontSize: '0.85rem' }} />
                          <div style={{ display: 'flex', gap: '0.4rem', marginTop: '0.25rem' }}>
                            <button type="button" onClick={() => setShowNuevoCliente(false)} style={{ flex: 1, padding: '0.5rem', borderRadius: '6px', border: '1px solid #CBD5E1', background: 'white', cursor: 'pointer', fontSize: '0.85rem' }}>Cancelar</button>
                            <button type="submit" disabled={creandoCliente} style={{ flex: 1, padding: '0.5rem', borderRadius: '6px', border: 'none', background: '#2A9D8F', color: 'white', cursor: creandoCliente ? 'wait' : 'pointer', fontWeight: 600, fontSize: '0.85rem' }}>
                              {creandoCliente ? 'Creando...' : 'Crear y seleccionar'}
                            </button>
                          </div>
                        </form>
                      )}
                    </div>
                  )}
                </div>

                {/* Tipo de Documento: Tirilla POS o Factura Electrónica */}
                <div style={{ marginBottom: '1.25rem', padding: '1rem', border: '1px solid #E2E8F0', borderRadius: '10px', backgroundColor: '#FAFAFA' }}>
                  <h4 style={{ margin: '0 0 0.6rem 0', fontSize: '0.95rem' }}>Tipo de Comprobante</h4>
                  <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.75rem' }}>
                    <button type="button" className={tipoDocumento === 'Local' ? 'btn-primary' : 'btn-secondary'} style={{ flex: 1, padding: '0.5rem', borderRadius: '6px', fontSize: '0.85rem', backgroundColor: tipoDocumento === 'Local' ? '#264653' : '' }} onClick={() => setTipoDocumento('Local')}>Recibo POS (Tirilla)</button>
                    <button type="button" className={tipoDocumento === 'DIAN_Enviado' ? 'btn-primary' : 'btn-secondary'} style={{ flex: 1, padding: '0.5rem', borderRadius: '6px', fontSize: '0.85rem', backgroundColor: tipoDocumento === 'DIAN_Enviado' ? '#264653' : '' }} onClick={() => setTipoDocumento('DIAN_Enviado')}>Factura Electrónica (DIAN)</button>
                  </div>

                  {tipoDocumento === 'DIAN_Enviado' && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                      <input type="text" placeholder="NIT / Cédula del Cliente" value={datosCliente.documento_identidad} onChange={e => setDatosCliente({...datosCliente, documento_identidad: e.target.value})} style={{ padding: '0.6rem', borderRadius: '6px', border: '1px solid #CBD5E1' }} required />
                      <input type="text" placeholder="Razón Social / Nombre" value={datosCliente.nombre_razon_social} onChange={e => setDatosCliente({...datosCliente, nombre_razon_social: e.target.value})} style={{ padding: '0.6rem', borderRadius: '6px', border: '1px solid #CBD5E1' }} required />
                      <input type="email" placeholder="Correo Electrónico (Para envío automático)" value={datosCliente.correo} onChange={e => setDatosCliente({...datosCliente, correo: e.target.value})} style={{ padding: '0.6rem', borderRadius: '6px', border: '1px solid #CBD5E1' }} required />
                      {clienteSeleccionado && (
                        <div style={{ fontSize: '0.75rem', color: '#2A9D8F', backgroundColor: '#E6F4F1', padding: '0.4rem 0.6rem', borderRadius: '6px' }}>
                          ✓ Autocompletado desde cliente seleccionado. Edita si necesitas actualizar algún dato.
                        </div>
                      )}
                    </div>
                  )}
                </div>

                <div style={{ display: 'flex', gap: '0.75rem' }}>
                  <button type="button" className="btn-secondary" style={{ flex: 1, padding: '0.85rem', borderRadius: '8px' }} onClick={() => setShowPagoModal(false)}>Cancelar</button>
                  <button type="submit" className="btn-primary" style={{ flex: 1.5, padding: '0.85rem', borderRadius: '8px', backgroundColor: '#2A9D8F', fontSize: '1rem' }}>
                    Confirmar y {tipoDocumento === 'DIAN_Enviado' ? 'Emitir Factura' : 'Registrar Venta'}
                  </button>
                </div>
              </form>
            ) : (
              <div style={{ textAlign: 'center', padding: '1.5rem 0' }}>
                <CheckCircle size={64} color="#2A9D8F" style={{ margin: '0 auto 1rem auto' }} />
                <h2 style={{ color: '#264653', marginBottom: '0.5rem' }}>
                  {tipoDocumento === 'DIAN_Enviado' ? '¡Factura Electrónica Emitida!' : '¡Venta Registrada con Éxito!'}
                </h2>
                
                {metodoPago === 'Efectivo' && cambioCalculado >= 0 && (
                  <div style={{ margin: '1rem auto', padding: '1rem', backgroundColor: '#E6F4F1', borderRadius: '12px', maxWidth: '380px' }}>
                    <div style={{ fontSize: '0.85rem', color: '#264653' }}>Cambio entregado al cliente:</div>
                    <div style={{ fontSize: '1.8rem', fontWeight: 800, color: '#2A9D8F' }}>{formatearCOP(cambioCalculado)}</div>
                  </div>
                )}

                {tipoDocumento === 'DIAN_Enviado' && (
                  <div style={{ margin: '0 auto 1rem', padding: '0.75rem', background: '#E6F4F1', borderRadius: '8px', maxWidth: '400px' }}>
                    <p style={{ color: '#2A9D8F', fontWeight: 600, margin: 0, fontSize: '0.9rem' }}>✅ Factura enviada al correo: {datosCliente.correo}</p>
                  </div>
                )}
                
                <div style={{ display: 'flex', gap: '0.75rem', marginTop: '1.5rem' }}>
                  {tipoDocumento === 'Local' && (
                    <button className="btn-secondary" style={{ flex: 1, padding: '0.85rem', borderRadius: '8px' }} onClick={() => { setPrintFormat('tirilla'); setTimeout(() => window.print(), 100); }}>Imprimir Tirilla POS</button>
                  )}
                  {tipoDocumento === 'DIAN_Enviado' && (
                    <>
                      <button className="btn-secondary" style={{ flex: 1, padding: '0.85rem', borderRadius: '8px' }} onClick={() => { setPrintFormat('carta'); setTimeout(() => window.print(), 100); }}>Imprimir Carta</button>
                      <button className="btn-secondary" style={{ flex: 1, padding: '0.85rem', borderRadius: '8px' }} onClick={() => { setPrintFormat('tirilla'); setTimeout(() => window.print(), 100); }}>Imprimir Tirilla</button>
                    </>
                  )}
                  <button className="btn-primary" style={{ flex: 1, padding: '0.85rem', borderRadius: '8px', backgroundColor: '#264653' }} onClick={nuevaVenta}>Siguiente Venta</button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Área de Impresión Oculta (para la Tirilla y Factura) */}
      {ultimoRecibo && printFormat && (
        <div className={`print-container print-${printFormat}`}>
          {printFormat === 'tirilla' ? (
            <div style={{ textAlign: 'center', fontFamily: 'monospace' }}>
              <h2 style={{ fontSize: '1.2rem', marginBottom: '5px' }}>{user.nombre_local}</h2>
              <p>NIT: 900.123.456-7</p>
              <p>================================</p>
              <p>FACTURA DE VENTA {ultimoRecibo.tipo === 'DIAN_Enviado' ? 'ELECTRÓNICA' : 'POS'} NO. {ultimoRecibo.id_venta}</p>
              <p>FECHA: {formatearFechaHoraCO(ultimoRecibo.fecha)}</p>
              <p>CLIENTE: {ultimoRecibo.cliente.nombre_razon_social}</p>
              <p>CC/NIT: {ultimoRecibo.cliente.documento_identidad}</p>
              <p>================================</p>
              <table style={{ width: '100%', textAlign: 'left', marginTop: '10px' }}>
                <tbody>
                  {ultimoRecibo.detalles.map(d => (
                    <tr key={d.id_producto}>
                      <td colSpan="3">{d.nombre_producto}</td>
                    </tr>
                  ))}
                  {ultimoRecibo.detalles.map(d => (
                    <tr key={`q-${d.id_producto}`}>
                      <td>{d.cantidad}x</td>
                      <td>{formatearCOP(d.precio_venta)}</td>
                      <td style={{ textAlign: 'right' }}>{formatearCOP(d.subtotal)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p>================================</p>
              <p style={{ textAlign: 'right' }}>SUBTOTAL (sin IVA): {formatearCOP(ultimoRecibo.totales.subtotal)}</p>
              {ultimoRecibo.totales.descuento > 0 && (
                <p style={{ textAlign: 'right' }}>DESCUENTO: -{formatearCOP(ultimoRecibo.totales.descuento)}</p>
              )}
              <p style={{ textAlign: 'right' }}>IVA 19% INCLUIDO: {formatearCOP(ultimoRecibo.totales.impuestos)}</p>
              <p style={{ textAlign: 'right', fontWeight: 'bold', fontSize: '1.2rem' }}>TOTAL: {formatearCOP(ultimoRecibo.totales.total)}</p>
              <p>================================</p>
              <p style={{ textAlign: 'left' }}>MEDIO DE PAGO: {ultimoRecibo.metodoPago}</p>
              {ultimoRecibo.metodoPago === 'Efectivo' && (
                <>
                  <p style={{ textAlign: 'left' }}>EFECTIVO RECIBIDO: {formatearCOP(ultimoRecibo.efectivoRecibido)}</p>
                  <p style={{ textAlign: 'left', fontWeight: 'bold' }}>CAMBIO / DEVOLUCIÓN: {formatearCOP(ultimoRecibo.cambio)}</p>
                </>
              )}
              <p>================================</p>
              <p style={{ marginTop: '15px' }}>¡Gracias por su compra!</p>
            </div>
          ) : (
            <div style={{ padding: '2rem', border: '1px solid #ccc' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '2px solid #000', paddingBottom: '1rem', marginBottom: '2rem' }}>
                <div>
                  <h1 style={{ margin: 0 }}>{user.nombre_local}</h1>
                  <p>NIT: 900.123.456-7</p>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <h2 style={{ color: '#555', margin: 0 }}>FACTURA ELECTRÓNICA DE VENTA</h2>
                  <p style={{ fontSize: '1.2rem', fontWeight: 'bold' }}>No. FE-{ultimoRecibo.id_venta}</p>
                </div>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '2rem' }}>
                <div>
                  <h4>Adquiriente:</h4>
                  <p>{ultimoRecibo.cliente.nombre_razon_social}</p>
                  <p>NIT/CC: {ultimoRecibo.cliente.documento_identidad}</p>
                  <p>Correo: {ultimoRecibo.cliente.correo}</p>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <p>Fecha de Expedición: {formatearFechaCO(ultimoRecibo.fecha)}</p>
                  <p>Medio de Pago: {ultimoRecibo.metodoPago}</p>
                </div>
              </div>
              <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '2rem' }}>
                <thead>
                  <tr style={{ backgroundColor: '#eee' }}>
                    <th style={{ padding: '10px', border: '1px solid #ccc' }}>Cant.</th>
                    <th style={{ padding: '10px', border: '1px solid #ccc' }}>Descripción</th>
                    <th style={{ padding: '10px', border: '1px solid #ccc' }}>Vr. Unitario (c/IVA)</th>
                    <th style={{ padding: '10px', border: '1px solid #ccc' }}>Descuento</th>
                    <th style={{ padding: '10px', border: '1px solid #ccc' }}>Total</th>
                  </tr>
                </thead>
                <tbody>
                  {ultimoRecibo.detalles.map(d => (
                    <tr key={d.id_producto}>
                      <td style={{ padding: '10px', border: '1px solid #ccc', textAlign: 'center' }}>{d.cantidad}</td>
                      <td style={{ padding: '10px', border: '1px solid #ccc' }}>{d.nombre_producto}</td>
                      <td style={{ padding: '10px', border: '1px solid #ccc', textAlign: 'right' }}>{formatearCOP(d.precio_venta)}</td>
                      <td style={{ padding: '10px', border: '1px solid #ccc', textAlign: 'right' }}>{formatearCOP(d.descuento || 0)}</td>
                      <td style={{ padding: '10px', border: '1px solid #ccc', textAlign: 'right' }}>{formatearCOP(d.subtotal)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '2rem' }}>
                <div style={{ width: '320px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '5px' }}>
                    <span>Subtotal (sin IVA):</span><span>{formatearCOP(ultimoRecibo.totales.subtotal)}</span>
                  </div>
                  {ultimoRecibo.totales.descuento > 0 && (
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '5px', color: '#2A9D8F' }}>
                      <span>Descuento Total:</span><span>-{formatearCOP(ultimoRecibo.totales.descuento)}</span>
                    </div>
                  )}
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '5px' }}>
                    <span>IVA 19% Incluido:</span><span>{formatearCOP(ultimoRecibo.totales.impuestos)}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '2px solid #000', paddingTop: '10px', fontSize: '1.2rem', fontWeight: 'bold' }}>
                    <span>TOTAL:</span><span>{formatearCOP(ultimoRecibo.totales.total)}</span>
                  </div>
                  {ultimoRecibo.metodoPago === 'Efectivo' && (
                    <div style={{ marginTop: '0.75rem', paddingTop: '0.5rem', borderTop: '1px dashed #ccc', fontSize: '0.9rem' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span>Recibido:</span><span>{formatearCOP(ultimoRecibo.efectivoRecibido)}</span>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 'bold' }}>
                        <span>Cambio:</span><span>{formatearCOP(ultimoRecibo.cambio)}</span>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default POS;
