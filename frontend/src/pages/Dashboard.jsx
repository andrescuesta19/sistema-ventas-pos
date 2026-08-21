import { API_URL } from '../config';
import { apiGet, apiPost, apiPut, apiDelete } from '../api';
import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  AlertTriangle,
  DollarSign,
  Wallet,
  TrendingUp,
  ShoppingBag,
  CreditCard,
  Smartphone,
  Package,
  ShoppingCart,
  Store,
  FileText,
  Users,
  ArrowRight,
  ArrowUp,
  ArrowDown,
  Activity
} from 'lucide-react';
import { formatearFechaHoraCO, formatearFechaLargaCO } from '../utils/dateCO';
import Logo from '../components/Logo';

/* ─────────────────────────────────────────────────────────
   Helper: Formatear moneda COP
   ───────────────────────────────────────────────────────── */
const formatearCOP = (valor) =>
  new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0 }).format(valor || 0);

/* ─────────────────────────────────────────────────────────
   Helper: "Hace cuánto" relativo en español
   ───────────────────────────────────────────────────────── */
const haceCuanto = (fecha) => {
  if (!fecha) return '';
  const d = new Date(fecha);
  const diffMs = Date.now() - d.getTime();
  const sec = Math.floor(diffMs / 1000);
  if (sec < 60) return 'Hace un momento';
  const min = Math.floor(sec / 60);
  if (min < 60) return `Hace ${min} min`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `Hace ${hr} hora${hr > 1 ? 's' : ''}`;
  const dias = Math.floor(hr / 24);
  if (dias < 7) return `Hace ${dias} día${dias > 1 ? 's' : ''}`;
  return d.toLocaleDateString('es-CO');
};

/* ─────────────────────────────────────────────────────────
   Componente: Gráfico de líneas SVG (Ventas últimos 7 días)
   ───────────────────────────────────────────────────────── */
const GraficoVentas = ({ data }) => {
  const W = 500;
  const H = 180;
  const PAD = { top: 20, right: 20, bottom: 30, left: 50 };

  if (!data || data.length === 0) {
    return <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>Sin datos</div>;
  }

  const valores = data.map(d => parseFloat(d.total) || 0);
  const maxValor = Math.max(...valores, 1);
  const minValor = 0;

  const innerW = W - PAD.left - PAD.right;
  const innerH = H - PAD.top - PAD.bottom;

  const xStep = data.length > 1 ? innerW / (data.length - 1) : 0;
  const puntos = data.map((d, i) => {
    const x = PAD.left + i * xStep;
    const ratio = (parseFloat(d.total) || 0) / (maxValor - minValor || 1);
    const y = PAD.top + innerH * (1 - ratio);
    return { x, y, valor: parseFloat(d.total) || 0, label: d.label };
  });

  // Construye path de la línea
  const linePath = puntos.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');

  // Construye path del área (línea + base)
  const areaPath =
    puntos.length > 0
      ? `${linePath} L ${puntos[puntos.length - 1].x} ${PAD.top + innerH} L ${puntos[0].x} ${PAD.top + innerH} Z`
      : '';

  // Y axis labels (4 niveles)
  const yLabels = [0, 0.25, 0.5, 0.75, 1].map(t => ({
    y: PAD.top + innerH * (1 - t),
    valor: (maxValor * t)
  }));

  const formatearCorto = (n) => {
    if (n >= 1e6) return `$${(n / 1e6).toFixed(1)}M`;
    if (n >= 1e3) return `$${(n / 1e3).toFixed(0)}K`;
    return `$${n.toFixed(0)}`;
  };

  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: 'auto', display: 'block' }}>
        <defs>
          <linearGradient id="chartGradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--green-primary)" stopOpacity="0.35" />
            <stop offset="100%" stopColor="var(--green-primary)" stopOpacity="0" />
          </linearGradient>
        </defs>

        {/* Y-axis grid lines + labels */}
        {yLabels.map((l, i) => (
          <g key={i}>
            <line
              x1={PAD.left} y1={l.y} x2={W - PAD.right} y2={l.y}
              stroke="#eef2f0" strokeWidth="1" strokeDasharray={i === 0 ? '0' : '3,3'}
            />
            <text
              x={PAD.left - 8} y={l.y + 4}
              textAnchor="end" fontSize="10" fill="var(--text-muted)"
            >
              {formatearCorto(l.valor)}
            </text>
          </g>
        ))}

        {/* X-axis labels */}
        {puntos.map((p, i) => (
          <text
            key={`xl-${i}`}
            x={p.x} y={H - 8}
            textAnchor="middle" fontSize="10" fill="var(--text-muted)"
          >
            {p.label}
          </text>
        ))}

        {/* Área debajo de la línea */}
        <path d={areaPath} fill="url(#chartGradient)" />

        {/* Línea principal */}
        <path
          d={linePath}
          fill="none"
          stroke="var(--green-primary)"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />

        {/* Puntos */}
        {puntos.map((p, i) => (
          <g key={`pt-${i}`}>
            <circle cx={p.x} cy={p.y} r="4" fill="white" stroke="var(--green-primary)" strokeWidth="2.5" />
            <title>{`${p.label}: ${formatearCOP(p.valor)}`}</title>
          </g>
        ))}
      </svg>
    </div>
  );
};


const Dashboard = ({ user }) => {
  const navigate = useNavigate();
  const [turno, setTurno] = useState(null);
  const [alertas, setAlertas] = useState([]);
  const [montoApertura, setMontoApertura] = useState('');
  const [showApertura, setShowApertura] = useState(false);
  const [resumenDia, setResumenDia] = useState(null);
  const [resumenAyer, setResumenAyer] = useState(null);
  const [productosTotal, setProductosTotal] = useState(null);
  const [clientesTotal, setClientesTotal] = useState(null);
  const [loadingResumen, setLoadingResumen] = useState(true);

  const fetchTurno = useCallback(async () => {
    const data = await apiGet(`${API_URL}/api/turnos/estado?id_local=${user?.id_local}`);
    setTurno(data.turno_abierto ? data.turno : null);
  }, [user?.id_local]);

  const fetchAlertas = useCallback(async () => {
    const data = await apiGet(`${API_URL}/api/productos/alertas?id_local=${user?.id_local}`);
    setAlertas(data);
  }, [user?.id_local]);

  const fetchResumenDia = useCallback(async () => {
    setLoadingResumen(true);
    try {
      const data = await apiGet(`${API_URL}/api/ventas/resumen-dia?id_local=${user?.id_local}`);
      setResumenDia(data);
    } catch {
      setResumenDia(null);
    } finally {
      setLoadingResumen(false);
    }
  }, [user?.id_local]);

  const fetchResumenAyer = useCallback(async () => {
    try {
      const data = await apiGet(`${API_URL}/api/ventas/resumen-dia?id_local=${user?.id_local}&ayer=1`);
      setResumenAyer(data);
    } catch {
      setResumenAyer(null);
    }
  }, [user?.id_local]);

  const fetchProductos = useCallback(async () => {
    try {
      const data = await apiGet(`${API_URL}/api/productos?id_local=${user?.id_local}`);
      setProductosTotal(Array.isArray(data) ? data.length : (data.total ?? null));
    } catch {
      setProductosTotal(null);
    }
  }, [user?.id_local]);

  const fetchClientes = useCallback(async () => {
    try {
      const data = await apiGet(`${API_URL}/api/clientes/total`);
      setClientesTotal(typeof data.total === 'number' ? data.total : null);
    } catch {
      setClientesTotal(null);
    }
  }, []);

  // Estado para gráfico y actividad reciente
  const [ventasPorDia, setVentasPorDia] = useState([]);
  const [actividad, setActividad] = useState([]);

  const fetchVentasPorDia = useCallback(async () => {
    try {
      const data = await apiGet(`${API_URL}/api/ventas/por-dia?id_local=${user?.id_local}&dias=7`);
      setVentasPorDia(Array.isArray(data) ? data : []);
    } catch {
      setVentasPorDia([]);
    }
  }, [user?.id_local]);

  const fetchActividad = useCallback(async () => {
    try {
      const data = await apiGet(`${API_URL}/api/actividad-reciente?id_local=${user?.id_local}&limite=8`);
      setActividad(Array.isArray(data) ? data : []);
    } catch {
      setActividad([]);
    }
  }, [user?.id_local]);

  useEffect(() => {
    fetchTurno();
    fetchAlertas();
    fetchResumenDia();
    fetchResumenAyer();
    fetchProductos();
    fetchClientes();
    fetchVentasPorDia();
    fetchActividad();

    // Refrescar cada 30 segundos (antes 10s) para evitar parpadeo visible
    // en los stats y alertas. La información no cambia tan rápido como para
    // necesitar refresco más agresivo.
    const interval = setInterval(() => {
      fetchResumenDia();
      fetchAlertas();
    }, 30000);
    return () => clearInterval(interval);
  }, [fetchTurno, fetchAlertas, fetchResumenDia, fetchResumenAyer, fetchProductos, fetchClientes, fetchVentasPorDia, fetchActividad]);

  useEffect(() => {
    const onVisibility = () => {
      if (document.visibilityState === 'visible') {
        fetchResumenDia();
        fetchTurno();
      }
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, [fetchResumenDia, fetchTurno]);

  const abrirTurno = async (e) => {
    e.preventDefault();
    const monto = montoApertura === '' ? 0 : (parseFloat(montoApertura) || 0);
    const res = await apiPost(`${API_URL}/api/turnos/abrir`, { id_usuario: user?.id_usuario, id_local: user?.id_local, monto_apertura: monto });
    if (res.ok) {
      setShowApertura(false);
      fetchTurno();
    }
  };

  const totalVentas = parseFloat(resumenDia?.total_ventas || 0);
  const totalTx = parseInt(resumenDia?.total_transacciones || 0);
  const ventasEfectivo = parseFloat(resumenDia?.ventas_efectivo || 0);
  const ventasTarjeta = parseFloat(resumenDia?.ventas_tarjeta || 0);
  const ventasTransferencia = parseFloat(resumenDia?.ventas_transferencia || 0);
  const totalAyer = parseFloat(resumenAyer?.total_ventas || 0);

  const calcularDelta = () => {
    if (!resumenAyer || totalAyer === 0) return null;
    const diff = ((totalVentas - totalAyer) / totalAyer) * 100;
    return diff;
  };
  const deltaVentas = calcularDelta();

  const stats = [
    {
      label: turno ? 'Ventas del Turno' : 'Ventas del Día',
      value: loadingResumen ? '—' : formatearCOP(totalVentas),
      sublabel: turno
        ? `Turno #${turno.id_turno} · ${totalTx} transacción${totalTx !== 1 ? 'es' : ''}`
        : (deltaVentas !== null
            ? `${deltaVentas >= 0 ? '+' : ''}${deltaVentas.toFixed(1)}% vs ayer`
            : '— sin turno abierto'),
      sublabelColor: turno ? 'var(--green-primary)' : (deltaVentas === null ? 'var(--text-muted)' : (deltaVentas >= 0 ? 'var(--green-primary)' : '#b34a32')),
      icon: ShoppingCart,
      deltaIcon: deltaVentas === null ? null : (deltaVentas >= 0 ? ArrowUp : ArrowDown),
    },
    {
      label: 'Productos',
      value: productosTotal !== null ? productosTotal : '—',
      sublabel: 'en catálogo',
      sublabelColor: 'var(--text-muted)',
      icon: Package,
    },
    {
      label: 'Clientes',
      value: clientesTotal !== null ? clientesTotal : '—',
      sublabel: 'registrados',
      sublabelColor: 'var(--text-muted)',
      icon: Users,
    },
    {
      label: 'Reportes',
      value: totalTx,
      sublabel: `${totalTx === 1 ? 'transacción' : 'transacciones'} hoy`,
      sublabelColor: 'var(--text-muted)',
      icon: FileText,
    },
  ];

  const quickActions = [
    { label: 'Nueva Venta', sub: 'Ir al POS', icon: ShoppingCart, to: '/pos' },
    { label: 'Agregar Producto', sub: 'Gestionar inventario', icon: Store, to: '/inventario' },
    { label: 'Ver Reportes', sub: 'Historial de ventas', icon: FileText, to: '/historial' },
    { label: 'Gestionar Clientes', sub: 'Ver todos', icon: Users, to: '/clientes' },
  ];

  return (
    <div className="page-content">
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap');

        .page-content {
          padding: 1.75rem 2rem;
          flex: 1;
          color: var(--text-primary);
          font-family: 'Inter', sans-serif;
        }
        h1.page-title {
          font-size: 1.5rem;
          margin-bottom: 1.5rem;
          color: var(--text-primary);
          font-weight: 700;
        }

        .hero {
          position: relative;
          background: linear-gradient(135deg, #ffffff 0%, rgba(214, 245, 225, 0.45) 100%);
          border: 1px solid var(--border-soft);
          border-radius: 14px;
          padding: 2rem 2.5rem;
          margin-bottom: 1.5rem;
          display: flex;
          align-items: center;
          gap: 2rem;
          overflow: hidden;
          box-shadow: var(--shadow-card);
        }
        .hero::before {
          content: '';
          position: absolute;
          inset: 0;
          background-image:
            linear-gradient(rgba(26, 138, 74, 0.03) 1px, transparent 1px),
            linear-gradient(90deg, rgba(26, 138, 74, 0.03) 1px, transparent 1px);
          background-size: 40px 40px;
          mask-image: radial-gradient(ellipse at top right, black 10%, transparent 70%);
          -webkit-mask-image: radial-gradient(ellipse at top right, black 10%, transparent 70%);
          pointer-events: none;
        }
        .hero-content { position: relative; z-index: 2; flex: 1; }
        .hero-logo { position: relative; z-index: 2; display: flex; justify-content: center; align-items: center; flex: 1; }
        .hero-tag {
          display: inline-block;
          background: var(--green-light);
          color: var(--green-primary);
          padding: 0.25rem 0.75rem;
          border-radius: 999px;
          font-size: 0.7rem;
          font-weight: 700;
          letter-spacing: 0.5px;
          margin-bottom: 1rem;
        }
        .hero-title {
          font-size: 2.2rem;
          font-weight: 800;
          line-height: 1.1;
          letter-spacing: -0.8px;
          color: var(--text-primary);
          margin: 0 0 0.5rem 0;
        }
        .hero-title .neon { color: var(--green-primary); }
        .hero-description {
          color: var(--text-secondary);
          font-size: 0.95rem;
          line-height: 1.5;
          max-width: 480px;
          margin: 0.5rem 0 1.25rem 0;
        }
        .hero-btn {
          background: var(--green-primary);
          color: white;
          border: none;
          padding: 0.75rem 1.4rem;
          border-radius: 10px;
          font-weight: 600;
          font-size: 0.9rem;
          font-family: 'Inter', sans-serif;
          cursor: pointer;
          display: inline-flex;
          align-items: center;
          gap: 0.5rem;
          transition: all 0.18s;
        }
        .hero-btn:hover {
          background: var(--green-primary-hover);
          transform: translateY(-1px);
          box-shadow: 0 4px 12px rgba(26, 138, 74, 0.3);
        }
        @media (max-width: 900px) {
          .hero { flex-direction: column; padding: 1.75rem 1.5rem; text-align: center; }
          .hero-title { font-size: 1.7rem; }
          .hero-description { margin-left: auto; margin-right: auto; }
        }

        .stats-grid {
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 1rem;
          margin-bottom: 1.5rem;
        }
        @media (max-width: 1100px) { .stats-grid { grid-template-columns: repeat(2, 1fr); } }
        @media (max-width: 600px) { .stats-grid { grid-template-columns: 1fr; } }
        .stat-card {
          background: var(--bg-card);
          border: 1px solid var(--border-soft);
          border-radius: 14px;
          padding: 1.25rem;
          transition: all 0.18s;
          box-shadow: var(--shadow-card);
        }
        .stat-card:hover {
          border-color: var(--green-light-strong);
          transform: translateY(-2px);
        }
        .stat-top {
          display: flex;
          align-items: center;
          gap: 0.75rem;
          margin-bottom: 0.75rem;
        }
        .stat-icon {
          width: 48px;
          height: 48px;
          border-radius: 12px;
          background: var(--green-light);
          display: flex;
          align-items: center;
          justify-content: center;
          color: var(--green-primary);
          flex-shrink: 0;
        }
        .stat-label {
          color: var(--text-secondary);
          font-size: 0.8rem;
          font-weight: 500;
        }
        .stat-value {
          font-size: 1.5rem;
          font-weight: 800;
          color: var(--text-primary);
          letter-spacing: -0.5px;
          line-height: 1.1;
        }
        .stat-sub {
          margin-top: 0.35rem;
          font-size: 0.75rem;
          font-weight: 500;
          display: inline-flex;
          align-items: center;
          gap: 0.25rem;
        }

        .section-title {
          font-size: 0.95rem;
          font-weight: 600;
          color: var(--text-primary);
          margin: 0 0 0.85rem 0;
        }
        .quick-actions {
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 1rem;
          margin-bottom: 1.5rem;
        }
        @media (max-width: 1100px) { .quick-actions { grid-template-columns: repeat(2, 1fr); } }
        @media (max-width: 600px) { .quick-actions { grid-template-columns: 1fr; } }
        .qa-card {
          background: var(--bg-card);
          border: 1px solid var(--border-soft);
          border-radius: 14px;
          padding: 1.1rem 1.2rem;
          display: flex;
          align-items: center;
          gap: 0.85rem;
          cursor: pointer;
          transition: all 0.18s;
          color: var(--text-primary);
          font-family: 'Inter', sans-serif;
          text-align: left;
          box-shadow: var(--shadow-card);
        }
        .qa-card:hover:not(.disabled) {
          border-color: var(--green-primary);
          transform: translateY(-2px);
          box-shadow: 0 4px 12px rgba(26, 138, 74, 0.1);
        }
        .qa-card.disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }
        .qa-icon {
          width: 40px;
          height: 40px;
          border-radius: 10px;
          background: var(--green-light);
          display: flex;
          align-items: center;
          justify-content: center;
          color: var(--green-primary);
          flex-shrink: 0;
        }
        .qa-text { flex: 1; min-width: 0; }
        .qa-text .qa-label {
          font-size: 0.92rem;
          font-weight: 600;
          color: var(--text-primary);
        }
        .qa-text .qa-sub {
          font-size: 0.75rem;
          color: var(--text-secondary);
        }
        .qa-arrow {
          color: var(--text-muted);
          flex-shrink: 0;
        }
        .qa-card:hover:not(.disabled) .qa-arrow { color: var(--green-primary); }

        .banner-caja {
          display: flex;
          justify-content: space-between;
          align-items: center;
          border-left: 4px solid;
          margin-bottom: 1.5rem;
        }
        .banner-caja.open { border-left-color: var(--green-primary); }
        .banner-caja.closed { border-left-color: #b34a32; }
        .pill {
          font-size: 0.75rem;
          font-weight: 600;
          padding: 0.35rem 0.85rem;
          border-radius: 999px;
        }
        .pill-open {
          background: var(--green-light);
          color: var(--green-primary);
        }
        .pill-closed {
          background: rgba(231, 111, 81, 0.12);
          color: #b34a32;
        }

        .modal-content input {
          background: white;
          border: 1px solid var(--border-soft);
          color: var(--text-primary);
          border-radius: 10px;
          padding: 0.7rem 0.85rem;
          font-family: 'Inter', sans-serif;
          font-size: 0.95rem;
        }
        .modal-content input:focus {
          border-color: var(--green-primary);
          outline: none;
          box-shadow: 0 0 0 3px rgba(26, 138, 74, 0.12);
        }

        .table-wrapper { overflow-x: auto; }
        table {
          width: 100%;
          border-collapse: collapse;
        }
        th {
          padding: 0.75rem 1rem;
          text-align: left;
          font-weight: 600;
          color: var(--text-secondary);
          text-transform: uppercase;
          font-size: 0.75rem;
          letter-spacing: 0.4px;
          border-bottom: 1px solid var(--border-soft);
        }
        td {
          padding: 0.85rem 1rem;
          border-bottom: 1px solid var(--border-light);
          color: var(--text-primary);
          font-size: 0.9rem;
        }
        tr:last-child td { border-bottom: none; }
        .badge {
          display: inline-block;
          padding: 0.2rem 0.7rem;
          border-radius: 999px;
          font-size: 0.75rem;
          font-weight: 600;
        }
        .badge-danger { background: rgba(231, 111, 81, 0.12); color: #b34a32; border: 1px solid rgba(231, 111, 81, 0.3); }
        .badge-warn { background: rgba(234, 179, 8, 0.12); color: #b45309; border: 1px solid rgba(234, 179, 8, 0.3); }

        .metodo-pago-bar-bg {
          height: 4px;
          background: var(--border-light);
          border-radius: 2px;
          margin-top: 0.5rem;
        }
        .metodo-pago-bar-fill {
          height: 100%;
          border-radius: 2px;
          transition: width 0.5s ease;
        }
      `}</style>

      <div className="hero">
        <div className="hero-content">
          <span className="hero-tag">SISTEMA INTEGRAL DE VENTAS</span>
          <h1 className="hero-title">
            Gestiona tu negocio,<br />
            <span className="neon">impulsa tus ventas 🚀</span>
          </h1>
          <p className="hero-description">
            Controla tu inventario, ventas y clientes desde un solo lugar. Simple, rápido y diseñado para crecer contigo.
          </p>
          <button className="hero-btn" onClick={() => navigate('/pos')}>
            Comenzar ahora <ArrowRight size={18} />
          </button>
        </div>
        <div className="hero-logo">
          <Logo size={200} glow />
        </div>
      </div>

      {!turno ? (
        <div className="card banner-caja closed">
          <div>
            <p style={{ color: '#b34a32', marginBottom: '0.3rem', fontWeight: 600 }}>No hay un turno de caja abierto</p>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.88rem' }}>Debes abrir un turno para poder registrar ventas.</p>
          </div>
          <button className="btn-primary" onClick={() => setShowApertura(true)}>Abrir Turno de Caja</button>
        </div>
      ) : (
        <div className="card banner-caja open">
          <div>
            <p style={{ color: 'var(--green-primary)', marginBottom: '0.3rem', fontWeight: 600 }}>Caja abierta</p>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.88rem' }}>
              Desde {formatearFechaHoraCO(turno.fecha_apertura)} — Base: {formatearCOP(turno.monto_apertura)}
            </p>
          </div>
          <span className="pill pill-open">Turno #{turno.id_turno}</span>
        </div>
      )}

      {showApertura && (
        <div className="modal-overlay" onClick={() => setShowApertura(false)}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Apertura de Caja</h2>
              <button className="close-btn" onClick={() => setShowApertura(false)}>×</button>
            </div>
            <form onSubmit={abrirTurno}>
              <div style={{ marginBottom: '0.5rem' }}>
                <label>
                  Monto base en efectivo (opcional)
                </label>
                <input
                  type="number"
                  step="100"
                  min="0"
                  value={montoApertura}
                  onChange={e => setMontoApertura(e.target.value)}
                  style={{ width: '100%', boxSizing: 'border-box' }}
                  placeholder="0 — Sin base inicial"
                />
              </div>
              <p style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', marginBottom: '1.5rem' }}>
                Puedes abrir caja con $0. El monto es solo para cuadre al cierre.
              </p>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
                <button type="button" className="btn-secondary" onClick={() => setShowApertura(false)}>Cancelar</button>
                <button type="submit" className="btn-primary">Abrir Caja</button>
              </div>
            </form>
          </div>
        </div>
      )}

      <div className="stats-grid">
        {stats.map(s => {
          const Icon = s.icon;
          const DeltaIcon = s.deltaIcon;
          return (
            <div className="stat-card" key={s.label}>
              <div className="stat-top">
                <div className="stat-icon"><Icon size={22} /></div>
                <div className="stat-label">{s.label}</div>
              </div>
              <div className="stat-value">{s.value}</div>
              <div className="stat-sub" style={{ color: s.sublabelColor }}>
                {DeltaIcon && <DeltaIcon size={12} />}
                {s.sublabel}
              </div>
            </div>
          );
        })}
      </div>

      <h2 className="section-title">Acciones rápidas</h2>
      <div className="quick-actions">
        {quickActions.map(qa => {
          const Icon = qa.icon;
          const card = (
            <div className={`qa-card ${qa.disabled ? 'disabled' : ''}`}>
              <div className="qa-icon"><Icon size={20} /></div>
              <div className="qa-text">
                <div className="qa-label">{qa.label}</div>
                <div className="qa-sub">{qa.sub}</div>
              </div>
              <ArrowRight size={16} className="qa-arrow" />
            </div>
          );
          if (qa.disabled) return <div key={qa.label} style={{ display: 'contents' }}>{card}</div>;
          return (
            <button
              key={qa.label}
              onClick={() => qa.to && navigate(qa.to)}
              style={{ all: 'unset', cursor: 'pointer', display: 'block' }}
            >
              {card}
            </button>
          );
        })}
      </div>

      {/* GRÁFICO DE VENTAS + ACTIVIDAD RECIENTE */}
      <div className="dashboard-grid-2col" style={{ marginBottom: '1.5rem' }}>
        {/* Gráfico de ventas últimos 7 días */}
        <div className="card">
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem' }}>
            <TrendingUp size={20} color="var(--green-primary)" />
            <p style={{ margin: 0, fontSize: '0.95rem', fontWeight: 600 }}>Ventas de los últimos 7 días</p>
          </div>
          {ventasPorDia.length === 0 ? (
            <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
              Sin datos aún
            </div>
          ) : (
            <GraficoVentas data={ventasPorDia} />
          )}
        </div>

        {/* Actividad reciente */}
        <div className="card">
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem' }}>
            <Activity size={20} color="var(--green-primary)" />
            <p style={{ margin: 0, fontSize: '0.95rem', fontWeight: 600 }}>Actividad reciente</p>
          </div>
          {actividad.length === 0 ? (
            <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
              No hay actividad reciente
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              {actividad.map(a => (
                <div
                  key={`${a.tipo}-${a.id}`}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.75rem',
                    padding: '0.6rem 0.75rem',
                    borderRadius: '8px',
                    background: '#f6f8f7',
                    border: '1px solid #eef2f0'
                  }}
                >
                  <div style={{
                    width: 36, height: 36, borderRadius: '10px',
                    background: 'var(--green-light)', color: 'var(--green-primary)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    flexShrink: 0
                  }}>
                    {a.tipo === 'venta' ? <ShoppingBag size={18} /> : <Users size={18} />}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 600, fontSize: '0.88rem', color: 'var(--text-primary)' }}>
                      {a.titulo}
                    </div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                      {a.subtitulo}
                    </div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    {a.monto && (
                      <div style={{ fontWeight: 700, fontSize: '0.85rem', color: 'var(--green-primary)' }}>
                        {formatearCOP(a.monto)}
                      </div>
                    )}
                    <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                      {haceCuanto(a.fecha)}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {!loadingResumen && totalVentas > 0 && (
        <div className="card" style={{ marginBottom: '1.5rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1.25rem' }}>
            <TrendingUp size={20} color="var(--green-primary)" />
            <p style={{ margin: 0, fontSize: '0.95rem', fontWeight: 600, color: 'var(--text-primary)' }}>Desglose de Ventas — Hoy</p>
            <span style={{ marginLeft: 'auto', fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
              {formatearFechaLargaCO(new Date())}
            </span>
          </div>
          <div className="stats-grid" style={{ marginBottom: 0 }}>
            {[
              { label: 'Efectivo', valor: ventasEfectivo, icon: DollarSign, color: 'var(--green-primary)' },
              { label: 'Tarjeta', valor: ventasTarjeta, icon: CreditCard, color: '#6366f1' },
              { label: 'Transferencia', valor: ventasTransferencia, icon: Smartphone, color: '#8b5cf6' },
              {
                label: 'Estado Caja',
                valor: 0,
                icon: Wallet,
                color: turno ? 'var(--green-primary)' : '#b34a32',
                custom: turno ? `Abierta · base ${formatearCOP(turno.monto_apertura)}` : 'Cerrada',
              },
            ].map(({ label, valor, icon: Icon, color, custom }) => (
              <div key={label} className="stat-card">
                <div className="stat-top">
                  <div className="stat-icon" style={{ background: `${color}15`, color }}>
                    <Icon size={22} />
                  </div>
                  <div className="stat-label">{label}</div>
                </div>
                <div className="stat-value" style={{ fontSize: '1.3rem' }}>
                  {custom || formatearCOP(valor)}
                </div>
                {!custom && totalVentas > 0 && (
                  <>
                    <div className="stat-sub" style={{ color: 'var(--text-secondary)' }}>
                      {((valor / totalVentas) * 100).toFixed(1)}% del total
                    </div>
                    <div className="metodo-pago-bar-bg">
                      <div
                        className="metodo-pago-bar-fill"
                        style={{ backgroundColor: color, width: `${Math.min(100, (valor / totalVentas) * 100)}%` }}
                      />
                    </div>
                  </>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {!loadingResumen && totalVentas === 0 && (
        <div className="card" style={{ marginBottom: '1.5rem', textAlign: 'center', padding: '2rem', color: 'var(--text-secondary)' }}>
          <ShoppingBag size={40} style={{ opacity: 0.4, marginBottom: '0.75rem', color: 'var(--green-primary)' }} />
          <p style={{ margin: 0 }}>No hay ventas registradas hoy.</p>
        </div>
      )}

      <div className="card">
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem' }}>
          <Package size={20} color={alertas.length > 0 ? '#b34a32' : 'var(--text-muted)'} />
          <p style={{ margin: 0, fontSize: '0.95rem', fontWeight: 600, color: 'var(--text-primary)' }}>Inventario con stock crítico</p>
          {alertas.length > 0 && (
            <span className="pill pill-closed" style={{ marginLeft: 'auto' }}>
              {alertas.length} producto{alertas.length > 1 ? 's' : ''} bajo mínimo
            </span>
          )}
        </div>

        {alertas.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '2rem 1rem', color: 'var(--text-secondary)' }}>
            <p style={{ margin: 0 }}>Todos los productos están por encima del stock mínimo.</p>
          </div>
        ) : (
          <div className="table-wrapper">
            <table>
              <thead>
                <tr>
                  <th>Producto</th>
                  <th style={{ textAlign: 'center' }}>Stock actual</th>
                  <th style={{ textAlign: 'center' }}>Stock mínimo</th>
                  <th style={{ textAlign: 'center' }}>Déficit</th>
                  <th style={{ textAlign: 'center' }}>Estado</th>
                </tr>
              </thead>
              <tbody>
                {alertas.map(a => {
                  const deficit = a.stock_minimo - a.stock_actual;
                  const esAgotado = a.stock_actual <= 0;
                  return (
                    <tr key={a.id_producto}>
                      <td>
                        <div style={{ fontWeight: 500 }}>{a.nombre_producto}</div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{a.codigo_barras}</div>
                      </td>
                      <td style={{ textAlign: 'center', color: esAgotado ? '#b34a32' : '#b45309', fontSize: '1rem', fontWeight: 600 }}>
                        {a.stock_actual}
                      </td>
                      <td style={{ textAlign: 'center', color: 'var(--text-secondary)' }}>
                        {a.stock_minimo}
                      </td>
                      <td style={{ textAlign: 'center', color: '#b34a32', fontWeight: 600 }}>
                        -{deficit} ud.
                      </td>
                      <td style={{ textAlign: 'center' }}>
                        <span className={`badge ${esAgotado ? 'badge-danger' : 'badge-warn'}`}>
                          {esAgotado ? 'Agotado' : 'Bajo mínimo'}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
         )}
       </div>
     </div>
   );
};


export default Dashboard;

