import { API_URL } from '../config';
import { apiGet, apiPost, apiDelete } from '../api';
import { useState, useEffect } from 'react';
import { Share2, RefreshCw, CheckCircle2, AlertCircle, Plus, Trash2, ExternalLink, ShieldCheck, Zap } from 'lucide-react';

const Integraciones = ({ user }) => {
  const [integraciones, setIntegraciones] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [plataformaSeleccionada, setPlataformaSeleccionada] = useState(null);
  const [sincronizandoId, setSincronizandoId] = useState(null);
  const [mensajeSync, setMensajeSync] = useState(null);

  const [formData, setFormData] = useState({
    nombre_cuenta: '',
    url_tienda: '',
    api_key: '',
    access_token: '',
    shop_id: ''
  });

  const plataformas = [
    {
      id: 'shopify',
      nombre: 'Shopify',
      logoColor: '#95BF47',
      descripcion: 'Plataforma e-commerce líder global para crear y gestionar tiendas en línea.',
      activo: true,
      popular: true
    },
    {
      id: 'mercadolibre',
      nombre: 'MercadoLibre',
      logoColor: '#FFE600',
      textColor: '#2D3277',
      descripcion: 'Marketplace líder en América Latina con sincronización de inventario y publicaciones.',
      activo: true,
      popular: true
    },
    {
      id: 'amazon',
      nombre: 'Amazon',
      logoColor: '#FF9900',
      descripcion: 'Vende tus productos en Amazon Marketplace con conexión SP-API.',
      activo: false,
      comingSoon: true
    },
    {
      id: 'aliexpress',
      nombre: 'AliExpress',
      logoColor: '#FF4747',
      descripcion: 'Canal internacional de venta directa al consumidor global.',
      activo: false,
      comingSoon: true
    },
    {
      id: 'vtex',
      nombre: 'VTEX',
      logoColor: '#E31C58',
      descripcion: 'Enterprise digital commerce platform con soluciones omnicanal.',
      activo: false,
      comingSoon: true
    },
    {
      id: 'woocommerce',
      nombre: 'WooCommerce',
      logoColor: '#7F54B3',
      descripcion: 'Plugin de WordPress para convertir tu sitio web en una tienda online.',
      activo: false,
      comingSoon: true
    },
    {
      id: 'wix',
      nombre: 'Wix eCommerce',
      logoColor: '#000000',
      descripcion: 'Creador de sitios web con integraciones de comercio electrónico integradas.',
      activo: false,
      comingSoon: true
    }
  ];

  useEffect(() => {
    fetchIntegraciones();
  }, []);

  const fetchIntegraciones = async () => {
    try {
      setCargando(true);
      const data = await apiGet(`${API_URL}/api/integraciones?id_local=${user.id_local}`);
      setIntegraciones(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error('Error cargando integraciones:', err);
    } finally {
      setCargando(false);
    }
  };

  const abrirModalConexion = (plataforma) => {
    if (!plataforma.activo) return;
    setPlataformaSeleccionada(plataforma);
    setFormData({
      nombre_cuenta: `Mi Tienda ${plataforma.nombre}`,
      url_tienda: '',
      api_key: '',
      access_token: '',
      shop_id: ''
    });
    setShowModal(true);
  };

  const handleConectar = async (e) => {
    e.preventDefault();
    try {
      const payload = {
        id_local: user.id_local,
        plataforma: plataformaSeleccionada.id,
        ...formData
      };
      await apiPost(`${API_URL}/api/integraciones/conectar`, payload);
      setShowModal(false);
      fetchIntegraciones();
    } catch (err) {
      alert(`Error al conectar cuenta: ${err.message || 'Intente de nuevo'}`);
    }
  };

  const handleSincronizar = async (idIntegracion) => {
    try {
      setSincronizandoId(idIntegracion);
      const res = await apiPost(`${API_URL}/api/integraciones/${idIntegracion}/sincronizar`);
      setMensajeSync(res.mensaje || 'Sincronización completada exitosamente.');
      fetchIntegraciones();
      setTimeout(() => setMensajeSync(null), 4000);
    } catch (err) {
      alert(`Error en sincronización: ${err.message}`);
    } finally {
      setSincronizandoId(null);
    }
  };

  const handleDesconectar = async (idIntegracion, nombreCuenta) => {
    if (window.confirm(`¿Estás seguro de desconectar la cuenta "${nombreCuenta}"?`)) {
      try {
        await apiDelete(`${API_URL}/api/integraciones/${idIntegracion}`);
        fetchIntegraciones();
      } catch (err) {
        alert('Error al desconectar integración.');
      }
    }
  };

  const formatearFecha = (strFecha) => {
    if (!strFecha) return 'Nunca';
    return new Date(strFecha).toLocaleString('es-CO', { dateStyle: 'short', timeStyle: 'short' });
  };

  return (
    <div className="page-content" style={{ padding: '2rem' }}>
      {/* Header de la sección */}
      <div style={{ marginBottom: '2rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.5rem' }}>
          <div style={{ padding: '0.6rem', borderRadius: '12px', backgroundColor: 'rgba(42, 157, 143, 0.12)', color: 'var(--primary-color)' }}>
            <Share2 size={24} />
          </div>
          <div>
            <h1 style={{ fontSize: '1.6rem', margin: 0, color: '#1e293b' }}>Integraciones E-commerce (Multi-Canal)</h1>
            <p style={{ margin: 0, color: 'var(--text-light)', fontSize: '0.9rem' }}>
              Vincule sus tiendas online con su inventario centralizado del POS. Publique catálogo y sincronice stock automáticamente.
            </p>
          </div>
        </div>
      </div>

      {/* Banner de Sincronización Exitosa */}
      {mensajeSync && (
        <div style={{ marginBottom: '1.5rem', padding: '1rem 1.25rem', backgroundColor: '#ECFDF5', border: '1px solid #10B981', borderRadius: '10px', color: '#065F46', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <CheckCircle2 size={20} />
          <span style={{ fontSize: '0.92rem', fontWeight: 600 }}>{mensajeSync}</span>
        </div>
      )}

      {/* Cuentas Conectadas Activas */}
      {integraciones.length > 0 && (
        <div style={{ marginBottom: '2.5rem' }}>
          <h3 style={{ fontSize: '1.1rem', color: '#1e293b', marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <ShieldCheck size={20} color="var(--primary-color)" /> Cuentas Conectadas ({integraciones.length})
          </h3>
          <div className="grid-2" style={{ gap: '1rem' }}>
            {integraciones.map(item => (
              <div key={item.id_integracion} className="card" style={{ padding: '1.25rem', border: '1px solid #e2e8f0', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
                <div>
                  <div className="flex-between" style={{ marginBottom: '0.75rem', alignItems: 'center' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                      <span style={{ padding: '0.3rem 0.7rem', borderRadius: '8px', fontSize: '0.8rem', fontWeight: 800, backgroundColor: '#1e293b', color: '#fff', textTransform: 'uppercase' }}>
                        {item.plataforma}
                      </span>
                      <h4 style={{ margin: 0, fontSize: '1rem', color: '#1e293b' }}>{item.nombre_cuenta}</h4>
                    </div>
                    <span style={{ fontSize: '0.78rem', padding: '0.2rem 0.6rem', borderRadius: '12px', backgroundColor: '#DCFCE7', color: '#15803D', fontWeight: 600 }}>
                      Conectado
                    </span>
                  </div>

                  {item.url_tienda && (
                    <p style={{ fontSize: '0.82rem', color: 'var(--text-light)', margin: '0 0 0.5rem 0', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                      <ExternalLink size={14} /> {item.url_tienda}
                    </p>
                  )}

                  <p style={{ fontSize: '0.78rem', color: '#64748B', margin: '0 0 1rem 0' }}>
                    Última sincronización: <strong>{formatearFecha(item.ultima_sincronizacion)}</strong>
                  </p>
                </div>

                <div style={{ display: 'flex', gap: '0.75rem', borderTop: '1px solid #f1f5f9', paddingTop: '0.75rem' }}>
                  <button
                    className="btn-secondary"
                    style={{ flex: 1, fontSize: '0.82rem', padding: '0.5rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.4rem' }}
                    onClick={() => handleSincronizar(item.id_integracion)}
                    disabled={sincronizandoId === item.id_integracion}
                  >
                    <RefreshCw size={14} className={sincronizandoId === item.id_integracion ? 'spin' : ''} />
                    {sincronizandoId === item.id_integracion ? 'Sincronizando...' : 'Sincronizar Stock'}
                  </button>
                  <button
                    style={{ padding: '0.5rem', borderRadius: '8px', border: '1px solid #fee2e2', backgroundColor: '#fff5f5', color: '#ef4444', cursor: 'pointer' }}
                    onClick={() => handleDesconectar(item.id_integracion, item.nombre_cuenta)}
                    title="Desconectar cuenta"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Catálogo de Plataformas disponibles (Diseño Karrot) */}
      <h3 style={{ fontSize: '1.1rem', color: '#1e293b', marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
        <Zap size={20} color="var(--primary-color)" /> Plataformas Disponibles
      </h3>

      <div className="grid-3" style={{ gap: '1.25rem' }}>
        {plataformas.map(p => {
          const cuentasConectadas = integraciones.filter(i => i.plataforma === p.id);
          return (
            <div
              key={p.id}
              className="card"
              style={{
                padding: '1.5rem',
                border: '1px solid #e2e8f0',
                display: 'flex',
                flexDirection: 'column',
                justify: 'space-between',
                position: 'relative',
                opacity: p.activo ? 1 : 0.8
              }}
            >
              <div>
                <div className="flex-between" style={{ marginBottom: '1rem', alignItems: 'flex-start' }}>
                  <div
                    style={{
                      fontWeight: 800,
                      fontSize: '1.3rem',
                      color: p.textColor || p.logoColor,
                      padding: '0.4rem 0.8rem',
                      borderRadius: '8px',
                      backgroundColor: p.logoColor === '#000000' ? '#f1f5f9' : `${p.logoColor}15`,
                      border: `1px solid ${p.logoColor}40`
                    }}
                  >
                    {p.nombre}
                  </div>
                  {p.comingSoon && (
                    <span style={{ fontSize: '0.72rem', padding: '0.2rem 0.6rem', borderRadius: '12px', backgroundColor: '#F3E8FF', color: '#7E22CE', fontWeight: 600 }}>
                      Próximamente
                    </span>
                  )}
                  {p.activo && cuentasConectadas.length > 0 && (
                    <span style={{ fontSize: '0.72rem', padding: '0.2rem 0.6rem', borderRadius: '12px', backgroundColor: '#DCFCE7', color: '#15803D', fontWeight: 600 }}>
                      {cuentasConectadas.length} Conectada{cuentasConectadas.length > 1 ? 's' : ''}
                    </span>
                  )}
                </div>

                <p style={{ fontSize: '0.88rem', color: '#64748B', lineHeight: '1.4', marginBottom: '1.5rem' }}>
                  {p.descripcion}
                </p>
              </div>

              <div>
                {p.activo ? (
                  <button
                    className="btn-primary"
                    style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem', padding: '0.65rem' }}
                    onClick={() => abrirModalConexion(p)}
                  >
                    <Plus size={16} /> Conectar Nueva Cuenta
                  </button>
                ) : (
                  <button
                    className="btn-secondary"
                    disabled
                    style={{ width: '100%', opacity: 0.6, cursor: 'not-allowed', padding: '0.65rem' }}
                  >
                    Próximamente
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Modal de Conexión */}
      {showModal && plataformaSeleccionada && (
        <div className="modal-overlay">
          <div className="modal-content" style={{ maxWidth: '550px' }}>
            <div className="modal-header">
              <h2>Conectar cuenta de {plataformaSeleccionada.nombre}</h2>
              <button className="close-btn" onClick={() => setShowModal(false)}>×</button>
            </div>
            <form onSubmit={handleConectar}>
              <div className="form-group">
                <label>Nombre de la tienda / Cuenta</label>
                <input
                  type="text"
                  value={formData.nombre_cuenta}
                  onChange={e => setFormData({ ...formData, nombre_cuenta: e.target.value })}
                  required
                  placeholder="Ej: Mi Tienda Principal"
                />
              </div>

              <div className="form-group">
                <label>URL de la Tienda Online</label>
                <input
                  type="url"
                  value={formData.url_tienda}
                  onChange={e => setFormData({ ...formData, url_tienda: e.target.value })}
                  placeholder={plataformaSeleccionada.id === 'shopify' ? 'https://mitienda.myshopify.com' : 'https://tienda.com'}
                />
              </div>

              {plataformaSeleccionada.id === 'shopify' ? (
                <div className="form-group">
                  <label>Shopify Admin Access Token / API Key</label>
                  <input
                    type="password"
                    value={formData.access_token}
                    onChange={e => setFormData({ ...formData, access_token: e.target.value })}
                    required
                    placeholder="shpat_xxxxxxxxxxxxxxxxxxxxxxxx"
                  />
                  <small style={{ color: 'var(--text-light)', display: 'block', marginTop: '0.25rem' }}>
                    Se utiliza para sincronizar productos y recibir órdenes de compra.
                  </small>
                </div>
              ) : (
                <div className="form-group">
                  <label>API Key / Access Token</label>
                  <input
                    type="password"
                    value={formData.access_token}
                    onChange={e => setFormData({ ...formData, access_token: e.target.value })}
                    required
                    placeholder="Ingrese su Access Token"
                  />
                </div>
              )}

              <div style={{ display: 'flex', gap: '1rem', marginTop: '2rem' }}>
                <button type="button" className="btn-secondary" style={{ flex: 1 }} onClick={() => setShowModal(false)}>Cancelar</button>
                <button type="submit" className="btn-primary" style={{ flex: 1 }}>Vincular Tienda</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default Integraciones;
