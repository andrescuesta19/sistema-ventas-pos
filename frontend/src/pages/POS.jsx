import { useState, useEffect, useRef } from 'react';
import { Search, UserPlus, Minus, Plus, Trash2, CreditCard, CheckCircle, ShoppingCart } from 'lucide-react';

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
  
  const searchInputRef = useRef(null);

  const [tipoDocumento, setTipoDocumento] = useState('Local'); // 'Local' = POS, 'DIAN_Enviado' = Electrónica
  const [datosCliente, setDatosCliente] = useState({
    documento_identidad: '',
    nombre_razon_social: '',
    correo: ''
  });
  
  const [printFormat, setPrintFormat] = useState(null);
  const [ultimoRecibo, setUltimoRecibo] = useState(null);

  useEffect(() => {
    fetchTurno();
    fetchAllProductos();
    searchInputRef.current?.focus();
  }, []);

  const fetchTurno = async () => {
    const res = await fetch(`http://localhost:3000/api/turnos/estado?id_local=${user.id_local}`);
    const data = await res.json();
    setTurno(data.turno_abierto ? data.turno : null);
  };

  const fetchAllProductos = async () => {
    const res = await fetch(`http://localhost:3000/api/productos?id_local=${user.id_local}`);
    const data = await res.json();
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
    setCarrito(prev => {
      const existe = prev.find(p => p.id_producto === producto.id_producto);
      if (existe) {
        if (existe.cantidad >= producto.stock_actual) {
            alert('No hay suficiente stock físico para agregar más unidades.');
            return prev;
        }
        return prev.map(p => p.id_producto === producto.id_producto 
          ? { ...p, cantidad: p.cantidad + 1, subtotal: (p.cantidad + 1) * p.precio_venta } 
          : p);
      }
      if (producto.stock_actual <= 0) {
        alert('Este producto no tiene stock disponible.');
        return prev;
      }
      return [...prev, { ...producto, cantidad: 1, descuento: 0, subtotal: producto.precio_venta }];
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
        return { ...p, cantidad: nuevaCantidad, subtotal: (nuevaCantidad * p.precio_venta) - p.descuento };
      }
      return p;
    }).filter(Boolean));
  };

  const procesarVenta = async (e) => {
    e.preventDefault();
    if (!turno) return alert('Debes abrir un turno primero.');

    if (tipoDocumento === 'DIAN_Enviado') {
      if (!datosCliente.documento_identidad || !datosCliente.nombre_razon_social || !datosCliente.correo) {
        return alert('Para Factura Electrónica, todos los datos del cliente son obligatorios.');
      }
    }

    let id_cliente = 1; // Consumidor final

    if (tipoDocumento === 'DIAN_Enviado') {
      const resCli = await fetch('http://localhost:3000/api/clientes/crear', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(datosCliente)
      });
      const dataCli = await resCli.json();
      if (dataCli.success) id_cliente = dataCli.id_cliente;
    }

    const payload = {
      id_usuario: user.id_usuario,
      id_local: user.id_local,
      id_cliente: id_cliente,
      id_turno: turno.id_turno,
      subtotal: totales.subtotal,
      descuento_total: totales.descuento,
      impuestos: totales.impuestos,
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

    const res = await fetch('http://localhost:3000/api/ventas/procesar', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    if (res.ok) {
      const ventaData = await res.json();
      const idVentaReal = ventaData.id_venta;

      const reciboData = {
        id_venta: idVentaReal,
        fecha: new Date(),
        cliente: id_cliente === 1 ? { nombre_razon_social: 'Consumidor Final', documento_identidad: '22222222' } : datosCliente,
        detalles: carrito,
        totales: totales,
        tipo: tipoDocumento
      };
      setUltimoRecibo(reciboData);

      // Si es Factura Electronica, enviar correo real
      if (tipoDocumento === 'DIAN_Enviado' && datosCliente.correo) {
        try {
          const emailRes = await fetch('http://localhost:3000/api/facturas/enviar-correo', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
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
            })
          });
          const emailData = await emailRes.json();
          if (emailData.preview_url) {
            // Guardamos la URL de vista previa para mostrarla al cajero
            reciboData.preview_url = emailData.preview_url;
            setUltimoRecibo({...reciboData});
          }
        } catch (err) {
          console.warn('No se pudo enviar el correo:', err);
        }
      }

      setVentaCompletada(true);
      fetchAllProductos();
    } else {
      alert('Error procesando la venta');
    }
  };

  const nuevaVenta = () => {
    setCarrito([]);
    setVentaCompletada(false);
    setShowPagoModal(false);
    setTipoDocumento('Local');
    setDatosCliente({ documento_identidad: '', nombre_razon_social: '', correo: '' });
    setEfectivoRecibido('');
  };

  const formatearCOP = (valor) => {
    return new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0 }).format(valor);
  };

  const totales = carrito.reduce((acc, item) => {
    const iva = item.aplica_iva ? (item.subtotal * (item.porcentaje_iva / 100)) : 0;
    return {
      subtotal: acc.subtotal + item.subtotal,
      descuento: acc.descuento + item.descuento,
      impuestos: acc.impuestos + iva,
      total: acc.total + item.subtotal + iva
    };
  }, { subtotal: 0, descuento: 0, impuestos: 0, total: 0 });

  if (!turno) {
    return <div className="page-content"><h1>Punto de Venta</h1><div className="card"><h3>No hay turno abierto. Ve al Dashboard para abrir caja.</h3></div></div>;
  }

  return (
    <div className="page-content" style={{ display: 'flex', gap: '2rem', height: '100%', padding: '1rem' }}>
      
      {/* Columna Izquierda: Buscador y Grilla */}
      <div style={{ flex: 2, display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        <div className="card" style={{ padding: '1rem' }}>
          <div style={{ position: 'relative' }}>
            <Search size={20} style={{ position: 'absolute', top: '10px', left: '10px', color: 'var(--text-light)' }} />
            <input 
              ref={searchInputRef}
              type="text" 
              placeholder="Buscar producto..." 
              value={query}
              onChange={handleSearchChange}
              style={{ width: '100%', paddingLeft: '2.5rem', fontSize: '1.1rem' }}
            />
          </div>
        </div>

        <div style={{ flex: 1, overflowY: 'auto' }}>
          <div className="grid-3" style={{ paddingRight: '0.5rem' }}>
            {productos.map(p => (
              <div 
                key={p.id_producto} 
                className="card" 
                style={{ 
                  cursor: 'pointer', 
                  transition: 'transform 0.1s', 
                  border: p.stock_actual <= 0 ? '1px solid var(--accent-color)' : '1px solid transparent',
                  opacity: p.stock_actual <= 0 ? 0.6 : 1
                }}
                onClick={() => agregarAlCarrito(p)}
                onMouseEnter={e => e.currentTarget.style.transform = 'scale(1.02)'}
                onMouseLeave={e => e.currentTarget.style.transform = 'scale(1)'}
              >
                <div style={{ height: '120px', backgroundColor: '#f0f0f0', borderRadius: '8px', marginBottom: '1rem', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
                  {p.imagen_url ? (
                    <img src={p.imagen_url} alt={p.nombre_producto} style={{ width: '100%', height: '100%', objectFit: 'contain', padding: '0.5rem' }} />
                  ) : (
                    <span style={{ fontSize: '2rem' }}>📱</span>
                  )}
                </div>
                <h4 style={{ marginBottom: '0.5rem', height: '40px', overflow: 'hidden' }}>{p.nombre_producto}</h4>
                <div className="flex-between">
                  <span style={{ fontWeight: 600, color: 'var(--primary-color)' }}>{formatearCOP(p.precio_venta)}</span>
                  <span style={{ fontSize: '0.8rem', color: p.stock_actual > p.stock_minimo ? 'var(--text-light)' : 'var(--accent-color)' }}>
                    Stock: {p.stock_actual}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Columna Derecha: Carrito y Resumen */}
      <div className="card" style={{ flex: 1.2, display: 'flex', flexDirection: 'column', padding: '1.5rem' }}>
        <h3 style={{ marginBottom: '1rem', color: 'var(--secondary-color)', borderBottom: '1px solid var(--border-color)', paddingBottom: '0.5rem' }}>
          Carrito de Compras
        </h3>
        
        <div style={{ flex: 1, overflowY: 'auto', marginBottom: '1rem' }}>
          {carrito.length === 0 ? (
            <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-light)' }}>
              <ShoppingCart size={48} style={{ opacity: 0.2, margin: '0 auto 1rem auto' }} />
              <p>Toca un producto para agregarlo al carrito.</p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              {carrito.map(item => (
                <div key={item.id_producto} style={{ padding: '0.75rem', border: '1px solid var(--border-color)', borderRadius: '8px' }}>
                  <div className="flex-between" style={{ marginBottom: '0.5rem' }}>
                    <span style={{ fontWeight: 600 }}>{item.nombre_producto}</span>
                    <span style={{ fontWeight: 600, color: 'var(--primary-color)' }}>{formatearCOP(item.subtotal)}</span>
                  </div>
                  <div className="flex-between">
                    <span style={{ fontSize: '0.8rem', color: 'var(--text-light)' }}>{formatearCOP(item.precio_venta)} c/u</span>
                    <div className="flex-row" style={{ gap: '0.5rem' }}>
                      <button style={{ padding: '0.3rem', borderRadius: '4px', backgroundColor: '#f0f0f0' }} onClick={() => actualizarCantidad(item.id_producto, -1)}>
                        {item.cantidad === 1 ? <Trash2 size={14} color="var(--accent-color)" /> : <Minus size={14} />}
                      </button>
                      <span style={{ fontWeight: 600, width: '20px', textAlign: 'center' }}>{item.cantidad}</span>
                      <button style={{ padding: '0.3rem', borderRadius: '4px', backgroundColor: '#f0f0f0' }} onClick={() => actualizarCantidad(item.id_producto, 1)}>
                        <Plus size={14} />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div style={{ marginBottom: '1rem' }}>
          <div className="flex-between" style={{ marginBottom: '0.5rem', fontSize: '0.9rem' }}>
            <span style={{ color: 'var(--text-light)' }}>Subtotal</span>
            <span>{formatearCOP(totales.subtotal)}</span>
          </div>
          <div className="flex-between" style={{ marginBottom: '0.5rem', fontSize: '0.9rem' }}>
            <span style={{ color: 'var(--text-light)' }}>Impuestos (IVA)</span>
            <span>{formatearCOP(totales.impuestos)}</span>
          </div>
          <div className="flex-between" style={{ borderTop: '2px dashed var(--border-color)', paddingTop: '1rem' }}>
            <span style={{ fontSize: '1.2rem', fontWeight: 600, color: 'var(--secondary-color)' }}>Total a Pagar</span>
            <span style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--primary-color)' }}>{formatearCOP(totales.total)}</span>
          </div>
        </div>

        <button 
          className="btn-primary" 
          style={{ width: '100%', padding: '1rem', fontSize: '1.1rem', display: 'flex', justifyContent: 'center', gap: '0.5rem' }}
          disabled={carrito.length === 0}
          onClick={() => setShowPagoModal(true)}
        >
          <CreditCard size={24} /> Cobrar
        </button>
      </div>

      {/* Modal de Pago / Tique */}
      {showPagoModal && (
        <div className="modal-overlay">
          <div className="modal-content" style={{ maxWidth: '600px' }}>
            {!ventaCompletada ? (
              <form onSubmit={procesarVenta}>
                <div className="modal-header">
                  <h2>Opciones de Facturación</h2>
                  <button type="button" className="close-btn" onClick={() => setShowPagoModal(false)}>×</button>
                </div>
                
                <div className="grid-2" style={{ gap: '1rem', marginBottom: '1.5rem' }}>
                  <div style={{ textAlign: 'center', padding: '1.5rem', backgroundColor: '#f9f9f9', borderRadius: '8px' }}>
                    <div style={{ fontSize: '1rem', color: 'var(--text-light)' }}>Total a cobrar</div>
                    <div style={{ fontSize: '2.5rem', fontWeight: 700, color: 'var(--primary-color)' }}>{formatearCOP(totales.total)}</div>
                  </div>
                  <div>
                    <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 500 }}>Método de Pago</label>
                    <select value={metodoPago} onChange={e => setMetodoPago(e.target.value)} style={{ width: '100%', padding: '0.75rem' }}>
                      <option value="Efectivo">Efectivo</option>
                      <option value="Tarjeta">Tarjeta (Datafono)</option>
                      <option value="Transferencia">Transferencia Bancaria</option>
                    </select>
                    {metodoPago === 'Efectivo' && (
                      <div style={{ marginTop: '1rem' }}>
                        <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 500 }}>Efectivo Recibido</label>
                        <input type="number" step="1" value={efectivoRecibido} onChange={e => setEfectivoRecibido(e.target.value)} style={{ width: '100%', padding: '0.75rem' }} required />
                        {efectivoRecibido && parseFloat(efectivoRecibido) >= totales.total && (
                          <div style={{ marginTop: '0.5rem', color: 'var(--primary-color)', fontWeight: 600 }}>Cambio: {formatearCOP(parseFloat(efectivoRecibido) - totales.total)}</div>
                        )}
                      </div>
                    )}
                  </div>
                </div>

                <div style={{ marginBottom: '1.5rem', padding: '1rem', border: '1px solid var(--border-color)', borderRadius: '8px' }}>
                  <h4 style={{ marginBottom: '1rem' }}>Tipo de Documento</h4>
                  <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem' }}>
                    <button type="button" className={tipoDocumento === 'Local' ? 'btn-primary' : 'btn-secondary'} style={{ flex: 1, padding: '0.5rem' }} onClick={() => setTipoDocumento('Local')}>Recibo POS (Tirilla)</button>
                    <button type="button" className={tipoDocumento === 'DIAN_Enviado' ? 'btn-primary' : 'btn-secondary'} style={{ flex: 1, padding: '0.5rem' }} onClick={() => setTipoDocumento('DIAN_Enviado')}>Factura Electrónica (DIAN)</button>
                  </div>

                  {tipoDocumento === 'DIAN_Enviado' && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                      <input type="text" placeholder="NIT / Cédula" value={datosCliente.documento_identidad} onChange={e => setDatosCliente({...datosCliente, documento_identidad: e.target.value})} style={{ padding: '0.75rem' }} required />
                      <input type="text" placeholder="Razón Social / Nombre" value={datosCliente.nombre_razon_social} onChange={e => setDatosCliente({...datosCliente, nombre_razon_social: e.target.value})} style={{ padding: '0.75rem' }} required />
                      <input type="email" placeholder="Correo Electrónico (Para enviar factura)" value={datosCliente.correo} onChange={e => setDatosCliente({...datosCliente, correo: e.target.value})} style={{ padding: '0.75rem' }} required />
                    </div>
                  )}
                </div>

                <div style={{ display: 'flex', gap: '1rem' }}>
                  <button type="button" className="btn-secondary" style={{ flex: 1, padding: '1rem' }} onClick={() => setShowPagoModal(false)}>Cancelar</button>
                  <button type="submit" className="btn-primary" style={{ flex: 1, padding: '1rem' }}>Confirmar y {tipoDocumento === 'DIAN_Enviado' ? 'Emitir Factura' : 'Cobrar'}</button>
                </div>
              </form>
            ) : (
              <div style={{ textAlign: 'center', padding: '2rem 0' }}>
                <CheckCircle size={64} color="var(--primary-color)" style={{ margin: '0 auto 1rem auto' }} />
                <h2 style={{ color: 'var(--secondary-color)', marginBottom: '0.5rem' }}>
                  {tipoDocumento === 'DIAN_Enviado' ? '¡Factura Electrónica Emitida!' : '¡Venta Exitosa!'}
                </h2>
                {tipoDocumento === 'DIAN_Enviado' && (
                  <div style={{ margin: '0 auto 1rem', padding: '1rem', background: '#e8f8f7', borderRadius: '10px', maxWidth: '400px' }}>
                    <p style={{ color: '#2A9D8F', fontWeight: 600, marginBottom: '0.3rem' }}>✅ Factura enviada al correo: {datosCliente.correo}</p>
                    {ultimoRecibo?.preview_url && (
                      <a 
                        href={ultimoRecibo.preview_url} 
                        target="_blank" 
                        rel="noreferrer"
                        style={{ color: '#264653', fontSize: '0.85rem', textDecoration: 'underline' }}
                      >
                        👁️ Ver cómo le llegó la factura al cliente →
                      </a>
                    )}
                  </div>
                )}
                
                <div style={{ display: 'flex', gap: '1rem', marginTop: '2rem' }}>
                  {tipoDocumento === 'Local' && (
                    <button className="btn-secondary" style={{ flex: 1, padding: '1rem' }} onClick={() => { setPrintFormat('tirilla'); setTimeout(() => window.print(), 100); }}>Imprimir Tirilla POS</button>
                  )}
                  {tipoDocumento === 'DIAN_Enviado' && (
                    <>
                      <button className="btn-secondary" style={{ flex: 1, padding: '1rem' }} onClick={() => { setPrintFormat('carta'); setTimeout(() => window.print(), 100); }}>Imprimir Formato Carta</button>
                      <button className="btn-secondary" style={{ flex: 1, padding: '1rem' }} onClick={() => { setPrintFormat('tirilla'); setTimeout(() => window.print(), 100); }}>Imprimir Tirilla DIAN</button>
                    </>
                  )}
                  <button className="btn-primary" style={{ flex: 1, padding: '1rem' }} onClick={nuevaVenta}>Siguiente Venta</button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Área de Impresión Oculta (solo visible en modo @media print) */}
      {ultimoRecibo && printFormat && (
        <div className={`print-container print-${printFormat}`}>
          {printFormat === 'tirilla' ? (
            <div style={{ textAlign: 'center' }}>
              <h2 style={{ fontSize: '1.2rem', marginBottom: '5px' }}>{user.nombre_local}</h2>
              <p>NIT: 900.123.456-7</p>
              <p>================================</p>
              <p>FACTURA DE VENTA {ultimoRecibo.tipo === 'DIAN_Enviado' ? 'ELECTRÓNICA' : 'POS'} NO. {ultimoRecibo.id_venta}</p>
              <p>FECHA: {ultimoRecibo.fecha.toLocaleString()}</p>
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
              <p style={{ textAlign: 'right' }}>SUBTOTAL: {formatearCOP(ultimoRecibo.totales.subtotal)}</p>
              <p style={{ textAlign: 'right' }}>IVA: {formatearCOP(ultimoRecibo.totales.impuestos)}</p>
              <p style={{ textAlign: 'right', fontWeight: 'bold', fontSize: '1.2rem' }}>TOTAL: {formatearCOP(ultimoRecibo.totales.total)}</p>
              <p>================================</p>
              {ultimoRecibo.tipo === 'DIAN_Enviado' && (
                <>
                  <p style={{ fontSize: '10px', wordBreak: 'break-all', marginTop: '10px' }}>
                    CUFE: 8f3d...9a21 (Simulado DIAN)
                  </p>
                  <div style={{ border: '1px solid black', width: '80px', height: '80px', margin: '10px auto', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    [QR DIAN]
                  </div>
                </>
              )}
              <p style={{ marginTop: '20px' }}>¡Gracias por su compra!</p>
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
                  <p>Fecha de Expedición: {ultimoRecibo.fecha.toLocaleDateString()}</p>
                  <p>Medio de Pago: {metodoPago}</p>
                </div>
              </div>
              <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '2rem' }}>
                <thead>
                  <tr style={{ backgroundColor: '#eee' }}>
                    <th style={{ padding: '10px', border: '1px solid #ccc' }}>Cant.</th>
                    <th style={{ padding: '10px', border: '1px solid #ccc' }}>Descripción</th>
                    <th style={{ padding: '10px', border: '1px solid #ccc' }}>Vr. Unitario</th>
                    <th style={{ padding: '10px', border: '1px solid #ccc' }}>IVA</th>
                    <th style={{ padding: '10px', border: '1px solid #ccc' }}>Total</th>
                  </tr>
                </thead>
                <tbody>
                  {ultimoRecibo.detalles.map(d => {
                    const iva = d.aplica_iva ? (d.subtotal * (d.porcentaje_iva / 100)) : 0;
                    return (
                      <tr key={d.id_producto}>
                        <td style={{ padding: '10px', border: '1px solid #ccc', textAlign: 'center' }}>{d.cantidad}</td>
                        <td style={{ padding: '10px', border: '1px solid #ccc' }}>{d.nombre_producto}</td>
                        <td style={{ padding: '10px', border: '1px solid #ccc', textAlign: 'right' }}>{formatearCOP(d.precio_venta)}</td>
                        <td style={{ padding: '10px', border: '1px solid #ccc', textAlign: 'right' }}>{formatearCOP(iva)}</td>
                        <td style={{ padding: '10px', border: '1px solid #ccc', textAlign: 'right' }}>{formatearCOP(d.subtotal + iva)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '2rem' }}>
                <div style={{ width: '300px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '5px' }}>
                    <span>Subtotal:</span><span>{formatearCOP(ultimoRecibo.totales.subtotal)}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '5px' }}>
                    <span>Impuestos (IVA):</span><span>{formatearCOP(ultimoRecibo.totales.impuestos)}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '2px solid #000', paddingTop: '10px', fontSize: '1.2rem', fontWeight: 'bold' }}>
                    <span>TOTAL:</span><span>{formatearCOP(ultimoRecibo.totales.total)}</span>
                  </div>
                </div>
              </div>
              <div style={{ marginTop: '4rem', display: 'flex', gap: '2rem' }}>
                <div style={{ border: '1px solid black', width: '120px', height: '120px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  [QR DIAN]
                </div>
                <div style={{ fontSize: '0.8rem', color: '#555' }}>
                  <p><strong>CUFE:</strong> 8f3d1b33989c3b7a5a8e0f6c2d1b8c9a3d4e5f6g7h8i9j0</p>
                  <p>Documento Oficial Autorizado por la DIAN.</p>
                  <p>Software POS / Sistema Integral de Ventas.</p>
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
