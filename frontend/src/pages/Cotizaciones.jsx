import { API_URL } from '../config';
import { apiGet, apiPost, apiPut, apiDelete } from '../api';
import { useState, useEffect, useCallback } from 'react';
import {
  FileText, Plus, Search, X, Trash2, Printer, CheckCircle2,
  Clock, XCircle, Eye, ShoppingCart, Minus, User
} from 'lucide-react';

const ESTADOS = ['Pendiente', 'Aprobada', 'Rechazada', 'Vencida'];

const colorEstado = (estado) => {
  switch (estado) {
    case 'Pendiente': return { bg: '#fef3c7', color: '#92400e' };
    case 'Aprobada': return { bg: '#d1fae5', color: '#065f46' };
    case 'Rechazada': return { bg: '#fee2e2', color: '#991b1b' };
    case 'Vencida': return { bg: '#e5e7eb', color: '#374151' };
    default: return { bg: '#e5e7eb', color: '#374151' };
  }
};

const iconoEstado = (estado) => {
  switch (estado) {
    case 'Pendiente': return <Clock size={14} />;
    case 'Aprobada': return <CheckCircle2 size={14} />;
    case 'Rechazada': return <XCircle size={14} />;
    default: return <Clock size={14} />;
  }
};

const formatearCOP = (valor) =>
  new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0 }).format(valor || 0);

const formatearFecha = (f) => {
  if (!f) return '—';
  const d = new Date(f);
  return d.toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric' });
};

const Cotizaciones = ({ user }) => {
  const [cotizaciones, setCotizaciones] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filtro, setFiltro] = useState('');
  const [error, setError] = useState('');

  // Modal nueva cotización
  const [showNueva, setShowNueva] = useState(false);
  const [busquedaProd, setBusquedaProd] = useState('');
  const [productos, setProductos] = useState([]);
  const [items, setItems] = useState([]);
  const [clienteTexto, setClienteTexto] = useState('');
  const [descuento, setDescuento] = useState('');
  const [validaHasta, setValidaHasta] = useState('');
  const [notas, setNotas] = useState('');
  const [guardando, setGuardando] = useState(false);

  // Detalle
  const [detalle, setDetalle] = useState(null);
  const [showDetalle, setShowDetalle] = useState(false);

  const fetchCotizaciones = useCallback(async () => {
    setLoading(true);
    try {
      const url = filtro
        ? `${API_URL}/api/cotizaciones?estado=${encodeURIComponent(filtro)}`
        : `${API_URL}/api/cotizaciones`;
      const data = await apiGet(url);
      setCotizaciones(Array.isArray(data) ? data : []);
    } catch (err) {
      setError(`Error cargando cotizaciones: ${err.message}`);
    } finally {
      setLoading(false);
    }
  }, [filtro]);

  useEffect(() => { fetchCotizaciones(); }, [fetchCotizaciones]);

  // Buscar productos para agregar a la cotización
  const buscarProductos = useCallback(async () => {
    const term = busquedaProd.trim();
    try {
      const url = term
        ? `${API_URL}/api/productos?id_local=${user?.id_local}&q=${encodeURIComponent(term)}`
        : `${API_URL}/api/productos?id_local=${user?.id_local}`;
      const data = await apiGet(url);
      const lista = Array.isArray(data) ? data : (data.productos || []);
      setProductos(lista.slice(0, 20));
    } catch (err) {
      setError('Error buscando productos: ' + err.message);
    }
  }, [busquedaProd, user?.id_local]);

  useEffect(() => {
    if (showNueva) {
      const t = setTimeout(() => buscarProductos(), 250);
      return () => clearTimeout(t);
    }
  }, [busquedaProd, showNueva, buscarProductos]);

  const agregarItem = (p) => {
    setItems(prev => {
      const existe = prev.find(i => i.id_producto === p.id_producto);
      if (existe) {
        return prev.map(i => i.id_producto === p.id_producto ? { ...i, cantidad: i.cantidad + 1 } : i);
      }
      return [...prev, {
        id_producto: p.id_producto,
        nombre_producto: p.nombre_producto,
        precio_venta: parseFloat(p.precio_venta) || 0,
        cantidad: 1,
        imagen_url: p.imagen_url || null
      }];
    });
  };

  const cambiarCantidad = (id, delta) => {
    setItems(prev => prev.map(i => {
      if (i.id_producto !== id) return i;
      const nueva = Math.max(1, i.cantidad + delta);
      return { ...i, cantidad: nueva };
    }));
  };

  const quitarItem = (id) => {
    setItems(prev => prev.filter(i => i.id_producto !== id));
  };

  const subtotalItems = items.reduce((acc, i) => acc + (i.precio_venta * i.cantidad), 0);
  const descNum = parseFloat(descuento) || 0;
  const totalCot = Math.max(0, subtotalItems - descNum);

  const crearCotizacion = async () => {
    if (items.length === 0) {
      setError('Agrega al menos un producto a la cotización.');
      return;
    }
    setGuardando(true);
    setError('');
    try {
      await apiPost(`${API_URL}/api/cotizaciones`, {
        nombre_cliente: clienteTexto.trim() || null,
        items: items.map(i => ({ id_producto: i.id_producto, cantidad: i.cantidad })),
        descuento: descNum,
        valida_hasta: validaHasta || null,
        notas: notas.trim() || null
      });
      setShowNueva(false);
      setItems([]);
      setClienteTexto('');
      setDescuento('');
      setValidaHasta('');
      setNotas('');
      setBusquedaProd('');
      fetchCotizaciones();
    } catch (err) {
      setError('Error creando cotización: ' + err.message);
    } finally {
      setGuardando(false);
    }
  };

  const verDetalle = async (id) => {
    try {
      const data = await apiGet(`${API_URL}/api/cotizaciones/${id}`);
      setDetalle(data);
      setShowDetalle(true);
    } catch (err) {
      setError('Error cargando detalle: ' + err.message);
    }
  };

  const cambiarEstado = async (id, estado) => {
    try {
      await apiPut(`${API_URL}/api/cotizaciones/${id}`, { estado });
      if (detalle && detalle.id_cotizacion === id) {
        setDetalle({ ...detalle, estado });
      }
      fetchCotizaciones();
    } catch (err) {
      setError('Error actualizando estado: ' + err.message);
    }
  };

  const convertirVenta = async (id) => {
    if (!window.confirm('¿Convertir esta cotización en una venta? Se descontará el inventario y se marcará como Aprobada.')) return;
    try {
      const res = await apiPost(`${API_URL}/api/cotizaciones/${id}/convertir-venta`, { metodo_pago: 'Efectivo' });
      setShowDetalle(false);
      fetchCotizaciones();
      alert(`✅ Venta #${res.id_venta} creada correctamente.`);
    } catch (err) {
      setError('Error convirtiendo en venta: ' + err.message);
    }
  };

  const eliminarCotizacion = async (id) => {
    if (!window.confirm('¿Eliminar esta cotización?')) return;
    try {
      await apiDelete(`${API_URL}/api/cotizaciones/${id}`);
      setShowDetalle(false);
      fetchCotizaciones();
    } catch (err) {
      setError('Error eliminando cotización: ' + err.message);
    }
  };

  return (
    <div className="page-content" style={{ padding: '2rem' }}>
      <div className="flex-between" style={{ marginBottom: '2rem' }}>
        <div>
          <h1 style={{ margin: 0, fontSize: '1.75rem', color: 'var(--text-primary)' }}>
            Cotizaciones
          </h1>
          <p style={{ color: 'var(--text-light)', margin: '0.3rem 0 0' }}>
            Ofrece precios a tus clientes sin afectar el inventario
          </p>
        </div>
        <button
          className="btn-primary"
          onClick={() => setShowNueva(true)}
          style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}
        >
          <Plus size={18} />
          Nueva Cotización
        </button>
      </div>

      {error && (
        <div style={{ background: '#fee2e2', color: '#991b1b', padding: '0.75rem 1rem', borderRadius: 8, marginBottom: '1rem' }}>
          {error}
        </div>
      )}

      {/* Filtro por estado */}
      <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.5rem', flexWrap: 'wrap' }}>
        <button
          onClick={() => setFiltro('')}
          style={{
            padding: '0.45rem 1rem', borderRadius: 20, border: '1px solid var(--border-soft)',
            background: filtro === '' ? 'var(--green-primary)' : 'transparent',
            color: filtro === '' ? '#fff' : 'var(--text-secondary)',
            cursor: 'pointer', fontWeight: 600, fontSize: '0.82rem'
          }}
        >Todas</button>
        {ESTADOS.map(e => (
          <button
            key={e}
            onClick={() => setFiltro(e)}
            style={{
              padding: '0.45rem 1rem', borderRadius: 20, border: '1px solid var(--border-soft)',
              background: filtro === e ? 'var(--green-primary)' : 'transparent',
              color: filtro === e ? '#fff' : 'var(--text-secondary)',
              cursor: 'pointer', fontWeight: 600, fontSize: '0.82rem'
            }}
          >{e}</button>
        ))}
      </div>

      {/* Tabla */}
      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        {loading ? (
          <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-muted)' }}>Cargando...</div>
        ) : cotizaciones.length === 0 ? (
          <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-muted)' }}>
            <FileText size={40} style={{ marginBottom: '0.5rem', opacity: 0.4 }} />
            <p>No hay cotizaciones{filtro ? ` con estado "${filtro}"` : ''}.</p>
          </div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: 'var(--bg-app)', color: 'var(--text-muted)', fontSize: '0.78rem', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                <th style={{ padding: '0.85rem 1rem', textAlign: 'left' }}>#</th>
                <th style={{ padding: '0.85rem 1rem', textAlign: 'left' }}>Cliente</th>
                <th style={{ padding: '0.85rem 1rem', textAlign: 'left' }}>Fecha</th>
                <th style={{ padding: '0.85rem 1rem', textAlign: 'left' }}>Válida hasta</th>
                <th style={{ padding: '0.85rem 1rem', textAlign: 'center' }}>Items</th>
                <th style={{ padding: '0.85rem 1rem', textAlign: 'right' }}>Total</th>
                <th style={{ padding: '0.85rem 1rem', textAlign: 'center' }}>Estado</th>
                <th style={{ padding: '0.85rem 1rem', textAlign: 'right' }}>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {cotizaciones.map(c => {
                const ec = colorEstado(c.estado);
                return (
                  <tr key={c.id_cotizacion} style={{ borderTop: '1px solid var(--border-light)' }}>
                    <td style={{ padding: '0.85rem 1rem', fontWeight: 700 }}>#{c.id_cotizacion}</td>
                    <td style={{ padding: '0.85rem 1rem' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <User size={14} color="var(--text-muted)" />
                        {c.cliente_nombre || 'Cliente general'}
                      </div>
                    </td>
                    <td style={{ padding: '0.85rem 1rem', color: 'var(--text-secondary)' }}>{formatearFecha(c.created_at)}</td>
                    <td style={{ padding: '0.85rem 1rem', color: 'var(--text-secondary)' }}>{formatearFecha(c.valida_hasta)}</td>
                    <td style={{ padding: '0.85rem 1rem', textAlign: 'center' }}>{c.num_items}</td>
                    <td style={{ padding: '0.85rem 1rem', textAlign: 'right', fontWeight: 700 }}>{formatearCOP(c.total)}</td>
                    <td style={{ padding: '0.85rem 1rem', textAlign: 'center' }}>
                      <span style={{
                        display: 'inline-flex', alignItems: 'center', gap: '0.3rem',
                        background: ec.bg, color: ec.color, padding: '0.25rem 0.6rem',
                        borderRadius: 20, fontSize: '0.75rem', fontWeight: 700
                      }}>
                        {iconoEstado(c.estado)} {c.estado}
                      </span>
                    </td>
                    <td style={{ padding: '0.85rem 1rem', textAlign: 'right' }}>
                      <button onClick={() => verDetalle(c.id_cotizacion)} title="Ver detalle"
                        style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)', padding: '0.3rem' }}>
                        <Eye size={17} />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* ── Modal: Nueva cotización ─────────────────────────── */}
      {showNueva && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 2000,
          display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem'
        }}>
          <div className="card" style={{ width: '900px', maxHeight: '90vh', overflowY: 'auto', padding: '1.5rem' }}>
            <div className="flex-between" style={{ marginBottom: '1rem' }}>
              <h2 style={{ margin: 0, fontSize: '1.3rem', color: 'var(--text-primary)' }}>Nueva Cotización</h2>
              <button onClick={() => setShowNueva(false)} style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}>
                <X size={22} />
              </button>
            </div>

            {/* Cliente */}
            <div style={{ marginBottom: '1rem' }}>
              <label style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-secondary)' }}>Cliente (nombre o empresa)</label>
              <input
                type="text"
                value={clienteTexto}
                onChange={e => setClienteTexto(e.target.value)}
                placeholder="Ej: Juan Pérez / Empresa XYZ"
                style={{
                  width: '100%', padding: '0.6rem 0.85rem', marginTop: '0.3rem',
                  border: '1px solid var(--border-soft)', borderRadius: 8, fontSize: '0.88rem',
                  background: 'var(--bg-app)', color: 'var(--text-primary)', fontFamily: 'inherit'
                }}
              />
            </div>

            {/* Buscador de productos */}
            <div style={{ marginBottom: '1rem' }}>
              <label style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-secondary)' }}>Buscar productos</label>
              <div style={{ position: 'relative', marginTop: '0.3rem' }}>
                <Search size={16} style={{ position: 'absolute', left: '0.8rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                <input
                  type="text"
                  value={busquedaProd}
                  onChange={e => setBusquedaProd(e.target.value)}
                  placeholder="Escribe el nombre del producto..."
                  style={{
                    width: '100%', padding: '0.6rem 0.85rem 0.6rem 2.4rem',
                    border: '1px solid var(--border-soft)', borderRadius: 8, fontSize: '0.88rem',
                    background: 'var(--bg-app)', color: 'var(--text-primary)', fontFamily: 'inherit'
                  }}
                />
              </div>
              {/* Resultados de productos */}
              {productos.length > 0 && (
                <div style={{
                  marginTop: '0.5rem', border: '1px solid var(--border-soft)', borderRadius: 8,
                  maxHeight: 180, overflowY: 'auto', background: 'var(--bg-card)'
                }}>
                  {productos.map(p => (
                    <div key={p.id_producto} onClick={() => agregarItem(p)}
                      style={{
                        padding: '0.55rem 0.85rem', cursor: 'pointer', display: 'flex',
                        alignItems: 'center', gap: '0.75rem', borderBottom: '1px solid var(--border-light)'
                      }}
                      onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-app)'}
                      onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                    >
                      <div style={{
                        width: 34, height: 34, borderRadius: 6, background: '#F8FAFC',
                        display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', flexShrink: 0
                      }}>
                        {p.imagen_url ? (
                          <img src={p.imagen_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                        ) : (
                          <span style={{ fontSize: '1rem' }}>📦</span>
                        )}
                      </div>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontWeight: 600, fontSize: '0.85rem', color: 'var(--text-primary)' }}>{p.nombre_producto}</div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                          Stock: {p.stock_actual} · {formatearCOP(p.precio_venta)}
                        </div>
                      </div>
                      <Plus size={16} color="var(--green-primary)" />
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Items seleccionados */}
            {items.length > 0 && (
              <div style={{ marginBottom: '1rem' }}>
                <label style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-secondary)' }}>Productos en la cotización</label>
                <div style={{ marginTop: '0.4rem', border: '1px solid var(--border-soft)', borderRadius: 8, overflow: 'hidden' }}>
                  {items.map(i => (
                    <div key={i.id_producto} style={{
                      display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.6rem 0.85rem',
                      borderBottom: '1px solid var(--border-light)', background: 'var(--bg-card)'
                    }}>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontWeight: 600, fontSize: '0.85rem' }}>{i.nombre_producto}</div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{formatearCOP(i.precio_venta)} c/u</div>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                        <button onClick={() => cambiarCantidad(i.id_producto, -1)} style={btnCant}><Minus size={13} /></button>
                        <span style={{ minWidth: 24, textAlign: 'center', fontWeight: 700 }}>{i.cantidad}</span>
                        <button onClick={() => cambiarCantidad(i.id_producto, 1)} style={btnCant}><Plus size={13} /></button>
                      </div>
                      <div style={{ fontWeight: 700, minWidth: 90, textAlign: 'right' }}>{formatearCOP(i.precio_venta * i.cantidad)}</div>
                      <button onClick={() => quitarItem(i.id_producto)} style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: '#ef4444' }}>
                        <Trash2 size={15} />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Descuento, validez, notas */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1rem' }}>
              <div>
                <label style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-secondary)' }}>Descuento (COP)</label>
                <input
                  type="number"
                  value={descuento}
                  onChange={e => setDescuento(e.target.value)}
                  placeholder="0"
                  style={inputStyle}
                />
              </div>
              <div>
                <label style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-secondary)' }}>Válida hasta</label>
                <input
                  type="date"
                  value={validaHasta}
                  onChange={e => setValidaHasta(e.target.value)}
                  style={inputStyle}
                />
              </div>
            </div>
            <div style={{ marginBottom: '1rem' }}>
              <label style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-secondary)' }}>Notas</label>
              <textarea
                value={notas}
                onChange={e => setNotas(e.target.value)}
                placeholder="Condiciones, observaciones, etc."
                rows={2}
                style={{ ...inputStyle, resize: 'vertical' }}
              />
            </div>

            {/* Totales */}
            <div style={{
              background: 'var(--bg-app)', borderRadius: 8, padding: '1rem',
              display: 'flex', justifyContent: 'flex-end', gap: '2rem', marginBottom: '1rem'
            }}>
              <div>
                <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>Subtotal</div>
                <div style={{ fontWeight: 600 }}>{formatearCOP(subtotalItems)}</div>
              </div>
              <div>
                <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>Descuento</div>
                <div style={{ fontWeight: 600, color: '#ef4444' }}>-{formatearCOP(descNum)}</div>
              </div>
              <div>
                <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>Total</div>
                <div style={{ fontWeight: 800, fontSize: '1.15rem', color: 'var(--green-primary)' }}>{formatearCOP(totalCot)}</div>
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
              <button className="btn-secondary" onClick={() => setShowNueva(false)}>Cancelar</button>
              <button className="btn-primary" onClick={crearCotizacion} disabled={guardando}>
                {guardando ? 'Guardando...' : 'Guardar Cotización'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal: Detalle ─────────────────────────────────── */}
      {showDetalle && detalle && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 2000,
          display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem'
        }}>
          <div className="card" style={{ width: '700px', maxHeight: '90vh', overflowY: 'auto', padding: '1.5rem' }}>
            <div className="flex-between" style={{ marginBottom: '1rem' }}>
              <h2 style={{ margin: 0, fontSize: '1.3rem', color: 'var(--text-primary)' }}>
                Cotización #{detalle.id_cotizacion}
              </h2>
              <button onClick={() => setShowDetalle(false)} style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}>
                <X size={22} />
              </button>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', marginBottom: '1rem', fontSize: '0.88rem' }}>
              <div><strong>Cliente:</strong> {detalle.cliente_nombre || 'Cliente general'}</div>
              <div><strong>Fecha:</strong> {formatearFecha(detalle.created_at)}</div>
              <div><strong>Válida hasta:</strong> {formatearFecha(detalle.valida_hasta)}</div>
              <div>
                <strong>Estado:</strong>{' '}
                <select
                  value={detalle.estado}
                  onChange={e => cambiarEstado(detalle.id_cotizacion, e.target.value)}
                  style={{ padding: '0.3rem 0.5rem', borderRadius: 6, border: '1px solid var(--border-soft)', background: 'var(--bg-app)', color: 'var(--text-primary)', fontFamily: 'inherit' }}
                >
                  {ESTADOS.map(e => <option key={e} value={e}>{e}</option>)}
                </select>
              </div>
            </div>

            {detalle.notas && (
              <div style={{ background: 'var(--bg-app)', borderRadius: 8, padding: '0.75rem 1rem', marginBottom: '1rem', fontSize: '0.85rem' }}>
                <strong>Notas:</strong> {detalle.notas}
              </div>
            )}

            <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '1rem' }}>
              <thead>
                <tr style={{ background: 'var(--bg-app)', color: 'var(--text-muted)', fontSize: '0.75rem', textTransform: 'uppercase' }}>
                  <th style={{ padding: '0.6rem 0.75rem', textAlign: 'left' }}>Producto</th>
                  <th style={{ padding: '0.6rem 0.75rem', textAlign: 'center' }}>Cant.</th>
                  <th style={{ padding: '0.6rem 0.75rem', textAlign: 'right' }}>Precio</th>
                  <th style={{ padding: '0.6rem 0.75rem', textAlign: 'right' }}>Subtotal</th>
                </tr>
              </thead>
              <tbody>
                {detalle.items.map(it => (
                  <tr key={it.id_detalle} style={{ borderTop: '1px solid var(--border-light)' }}>
                    <td style={{ padding: '0.6rem 0.75rem' }}>{it.nombre_producto}</td>
                    <td style={{ padding: '0.6rem 0.75rem', textAlign: 'center' }}>{it.cantidad}</td>
                    <td style={{ padding: '0.6rem 0.75rem', textAlign: 'right' }}>{formatearCOP(it.precio_unitario)}</td>
                    <td style={{ padding: '0.6rem 0.75rem', textAlign: 'right', fontWeight: 600 }}>{formatearCOP(it.subtotal)}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '2rem', marginBottom: '1rem' }}>
              <div>
                <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>Subtotal</div>
                <div style={{ fontWeight: 600 }}>{formatearCOP(detalle.subtotal)}</div>
              </div>
              <div>
                <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>Descuento</div>
                <div style={{ fontWeight: 600, color: '#ef4444' }}>-{formatearCOP(detalle.descuento)}</div>
              </div>
              <div>
                <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>Total</div>
                <div style={{ fontWeight: 800, fontSize: '1.15rem', color: 'var(--green-primary)' }}>{formatearCOP(detalle.total)}</div>
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', flexWrap: 'wrap' }}>
              <button className="btn-secondary" onClick={() => window.print()} style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                <Printer size={16} /> Imprimir
              </button>
              {detalle.estado !== 'Aprobada' && (
                <button className="btn-primary" onClick={() => convertirVenta(detalle.id_cotizacion)} style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                  <ShoppingCart size={16} /> Convertir en Venta
                </button>
              )}
              <button onClick={() => eliminarCotizacion(detalle.id_cotizacion)} style={{
                background: 'transparent', border: '1px solid #ef4444', color: '#ef4444',
                borderRadius: 8, padding: '0.6rem 1.2rem', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.4rem'
              }}>
                <Trash2 size={16} /> Eliminar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

const btnCant = {
  width: 26, height: 26, borderRadius: 6, border: '1px solid var(--border-soft)',
  background: 'var(--bg-app)', cursor: 'pointer', display: 'flex', alignItems: 'center',
  justifyContent: 'center', color: 'var(--text-secondary)'
};

const inputStyle = {
  width: '100%', padding: '0.6rem 0.85rem', marginTop: '0.3rem',
  border: '1px solid var(--border-soft)', borderRadius: 8, fontSize: '0.88rem',
  background: 'var(--bg-app)', color: 'var(--text-primary)', fontFamily: 'inherit'
};

export default Cotizaciones;