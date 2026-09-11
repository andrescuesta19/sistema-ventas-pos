import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { API_URL } from '../config';
import { apiGet, apiPost } from '../api';
import { Wallet, Clock, User, DollarSign, AlertCircle, CheckCircle, ArrowRight, History } from 'lucide-react';
import { formatearFechaHoraCO, formatearFechaCO } from '../utils/dateCO';

const Caja = ({ user }) => {
  const navigate = useNavigate();
  const [turno, setTurno] = useState(null);
  const [historial, setHistorial] = useState([]);
  const [showApertura, setShowApertura] = useState(false);
  const [montoApertura, setMontoApertura] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    cargarDatos();
  }, []);

  const cargarDatos = async () => {
    try {
      const [turnoData, histData] = await Promise.all([
        apiGet(`${API_URL}/api/turnos/estado?id_local=${user?.id_local}`),
        apiGet(`${API_URL}/api/turnos/historial?id_local=${user?.id_local}`)
      ]);
      setTurno(turnoData.turno_abierto ? turnoData.turno : null);
      setHistorial(histData || []);
    } catch (err) {
      setError('Error cargando datos: ' + err.message);
    }
  };

  const abrirTurno = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await apiPost(`${API_URL}/api/turnos/abrir`, {
        id_local: user?.id_local,
        monto_apertura: parseFloat(montoApertura) || 0
      });
      setShowApertura(false);
      setMontoApertura('');
      await cargarDatos();
    } catch (err) {
      setError('Error al abrir caja: ' + (err.message || 'Error desconocido'));
    } finally {
      setLoading(false);
    }
  };

  const formatearCOP = (valor) => {
    return new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0 }).format(valor || 0);
  };

  return (
    <div className="page-content" style={{ maxWidth: 900, margin: '0 auto', padding: '1.5rem' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.5rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <Wallet size={26} color="var(--green-primary, #1a8a4a)" />
          <div>
            <h1 style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>Caja y Bancos</h1>
            <p style={{ color: 'var(--text-secondary)', margin: '0.25rem 0 0', fontSize: '0.9rem' }}>
              Apertura, cierre y movimientos de efectivo
            </p>
          </div>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div style={{
          background: 'rgba(231, 76, 60, 0.1)', border: '1px solid rgba(231, 76, 60, 0.3)',
          borderRadius: 10, padding: '0.75rem 1rem', marginBottom: '1rem',
          display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#ff6b6b', fontSize: '0.9rem'
        }}>
          <AlertCircle size={16} /> {error}
        </div>
      )}

      {/* ═══ ESTADO DE CAJA ═══ */}
      {!turno ? (
        /* ── Sin turno abierto ── */
        <div style={{
          background: 'var(--bg-card, #fff)', border: '2px dashed var(--border-soft, #e2e8f0)',
          borderRadius: 16, padding: '2.5rem 2rem', textAlign: 'center', marginBottom: '1.5rem'
        }}>
          <div style={{
            width: 64, height: 64, borderRadius: '50%', background: 'rgba(231, 76, 60, 0.1)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 1rem'
          }}>
            <Wallet size={32} color="#ff6b6b" />
          </div>
          <h3 style={{ color: 'var(--text-primary)', margin: '0 0 0.5rem', fontSize: '1.1rem' }}>
            No hay caja abierta
          </h3>
          <p style={{ color: 'var(--text-secondary)', margin: '0 0 1.5rem', fontSize: '0.9rem', maxWidth: 400, marginInline: 'auto' }}>
            Abre un turno de caja para comenzar a registrar ventas. El sistema rastreará todos los movimientos durante el turno.
          </p>
          <button
            onClick={() => setShowApertura(true)}
            style={{
              background: 'var(--green-primary, #1a8a4a)', color: '#fff', border: 'none',
              padding: '0.85rem 2rem', borderRadius: 12, fontSize: '1rem', fontWeight: 700,
              cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '0.5rem',
              fontFamily: 'inherit', boxShadow: '0 4px 12px rgba(26, 138, 74, 0.3)'
            }}
          >
            <DollarSign size={18} /> Abrir Caja
          </button>
        </div>
      ) : (
        /* ── Turno activo (estilo Karrot) ── */
        <div style={{
          background: 'var(--bg-card, #fff)', border: '1px solid var(--border-soft, #e2e8f0)',
          borderLeft: '4px solid var(--green-primary, #1a8a4a)',
          borderRadius: 16, padding: '1.5rem', marginBottom: '1.5rem'
        }}>
          {/* Badge de estado */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <span style={{
                background: 'rgba(26, 138, 74, 0.12)', color: 'var(--green-primary, #1a8a4a)',
                padding: '0.3rem 0.8rem', borderRadius: 20, fontSize: '0.8rem', fontWeight: 700,
                display: 'inline-flex', alignItems: 'center', gap: '0.3rem'
              }}>
                <CheckCircle size={14} /> Activo
              </span>
              <span style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
                Turno #{turno.id_turno}
              </span>
            </div>
            <button
              onClick={() => navigate('/cierre')}
              style={{
                background: 'rgba(231, 76, 60, 0.1)', color: '#ff6b6b',
                border: '1px solid rgba(231, 76, 60, 0.3)', padding: '0.5rem 1rem',
                borderRadius: 10, fontSize: '0.85rem', fontWeight: 600, cursor: 'pointer',
                display: 'flex', alignItems: 'center', gap: '0.4rem', fontFamily: 'inherit'
              }}
            >
              Cerrar Caja <ArrowRight size={14} />
            </button>
          </div>

          {/* Info del turno */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '1rem' }}>
            {/* Quién abrió */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
              <div style={{
                width: 36, height: 36, borderRadius: '50%', background: 'rgba(96, 165, 250, 0.12)',
                display: 'flex', alignItems: 'center', justifyContent: 'center'
              }}>
                <User size={18} color="#60a5fa" />
              </div>
              <div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', lineHeight: 1.2 }}>Abierto por</div>
                <div style={{ fontSize: '0.9rem', fontWeight: 600, color: 'var(--text-primary)' }}>
                  {turno.nombre_usuario_apertura || 'Usuario #' + turno.id_usuario}
                </div>
              </div>
            </div>

            {/* Hora de apertura */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
              <div style={{
                width: 36, height: 36, borderRadius: '50%', background: 'rgba(168, 85, 247, 0.12)',
                display: 'flex', alignItems: 'center', justifyContent: 'center'
              }}>
                <Clock size={18} color="#a855f7" />
              </div>
              <div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', lineHeight: 1.2 }}>Hora apertura</div>
                <div style={{ fontSize: '0.9rem', fontWeight: 600, color: 'var(--text-primary)' }}>
                  {formatearFechaHoraCO(turno.fecha_apertura)}
                </div>
              </div>
            </div>

            {/* Monto base */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
              <div style={{
                width: 36, height: 36, borderRadius: '50%', background: 'rgba(26, 138, 74, 0.12)',
                display: 'flex', alignItems: 'center', justifyContent: 'center'
              }}>
                <DollarSign size={18} color="var(--green-primary, #1a8a4a)" />
              </div>
              <div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', lineHeight: 1.2 }}>Base inicial</div>
                <div style={{ fontSize: '0.9rem', fontWeight: 600, color: 'var(--text-primary)' }}>
                  {formatearCOP(turno.monto_apertura)}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ═══ MODAL APERTURA ═══ */}
      {showApertura && (
        <div className="modal-overlay" onClick={() => setShowApertura(false)}>
          <div className="modal-content" onClick={e => e.stopPropagation()} style={{ maxWidth: 440 }}>
            <div className="modal-header">
              <h2 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <DollarSign size={20} color="var(--green-primary, #1a8a4a)" />
                Apertura de Caja
              </h2>
              <button className="close-btn" onClick={() => setShowApertura(false)}>×</button>
            </div>

            <form onSubmit={abrirTurno}>
              {/* Info del usuario */}
              <div style={{
                background: 'rgba(96, 165, 250, 0.08)', borderRadius: 10, padding: '0.75rem 1rem',
                marginBottom: '1.25rem', display: 'flex', alignItems: 'center', gap: '0.6rem'
              }}>
                <User size={16} color="#60a5fa" />
                <span style={{ fontSize: '0.88rem', color: 'var(--text-secondary)' }}>
                  Abriendo como: <strong style={{ color: 'var(--text-primary)' }}>{user?.nombre || 'Usuario'}</strong>
                </span>
              </div>

              <div style={{ marginBottom: '1.25rem' }}>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '0.4rem' }}>
                  Monto base en efectivo
                </label>
                <input
                  type="number"
                  step="100"
                  min="0"
                  value={montoApertura}
                  onChange={e => setMontoApertura(e.target.value)}
                  placeholder="$0 — Sin base inicial"
                  autoFocus
                  style={{ width: '100%', boxSizing: 'border-box', fontSize: '1.1rem', padding: '0.75rem' }}
                />
                <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: '0.4rem', margin: '0.4rem 0 0' }}>
                  Puedes abrir con $0. El monto es solo para cuadre al cierre.
                </p>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
                <button type="button" className="btn-secondary" onClick={() => setShowApertura(false)}>
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="btn-primary"
                  style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}
                >
                  <DollarSign size={16} />
                  {loading ? 'Abriendo...' : 'Abrir Caja'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ═══ HISTORIAL DE TURNOS ═══ */}
      <div style={{
        background: 'var(--bg-card, #fff)', border: '1px solid var(--border-soft, #e2e8f0)',
        borderRadius: 16, overflow: 'hidden'
      }}>
        <div style={{
          padding: '1rem 1.25rem', borderBottom: '1px solid var(--border-soft, #e2e8f0)',
          display: 'flex', alignItems: 'center', gap: '0.5rem'
        }}>
          <History size={18} color="var(--text-secondary)" />
          <h3 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 600, color: 'var(--text-primary)' }}>
            Últimos turnos
          </h3>
        </div>

        {historial.length === 0 ? (
          <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
            No hay turnos registrados aún.
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 600 }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border-soft, #e2e8f0)', textAlign: 'left' }}>
                  <th style={{ padding: '0.75rem 1rem', fontSize: '0.8rem', color: 'var(--text-secondary)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.3px' }}>#</th>
                  <th style={{ padding: '0.75rem 1rem', fontSize: '0.8rem', color: 'var(--text-secondary)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.3px' }}>Estado</th>
                  <th style={{ padding: '0.75rem 1rem', fontSize: '0.8rem', color: 'var(--text-secondary)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.3px' }}>Abierto por</th>
                  <th style={{ padding: '0.75rem 1rem', fontSize: '0.8rem', color: 'var(--text-secondary)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.3px' }}>Apertura</th>
                  <th style={{ padding: '0.75rem 1rem', fontSize: '0.8rem', color: 'var(--text-secondary)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.3px' }}>Cierre</th>
                  <th style={{ padding: '0.75rem 1rem', fontSize: '0.8rem', color: 'var(--text-secondary)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.3px', textAlign: 'right' }}>Base</th>
                  <th style={{ padding: '0.75rem 1rem', fontSize: '0.8rem', color: 'var(--text-secondary)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.3px', textAlign: 'right' }}>Real</th>
                  <th style={{ padding: '0.75rem 1rem', fontSize: '0.8rem', color: 'var(--text-secondary)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.3px', textAlign: 'right' }}>Diferencia</th>
                </tr>
              </thead>
              <tbody>
                {historial.map(t => {
                  const diff = (parseFloat(t.monto_cierre_real) || 0) - (parseFloat(t.monto_cierre_calculado) || 0);
                  const isOpen = t.estado_turno === 'Abierto';
                  return (
                    <tr key={t.id_turno} style={{ borderBottom: '1px solid var(--border-soft, #e2e8f0)' }}>
                      <td style={{ padding: '0.75rem 1rem', fontWeight: 600, fontSize: '0.9rem' }}>#{t.id_turno}</td>
                      <td style={{ padding: '0.75rem 1rem' }}>
                        <span style={{
                          background: isOpen ? 'rgba(26, 138, 74, 0.12)' : 'rgba(100, 116, 139, 0.12)',
                          color: isOpen ? 'var(--green-primary, #1a8a4a)' : 'var(--text-secondary)',
                          padding: '0.2rem 0.6rem', borderRadius: 12, fontSize: '0.78rem', fontWeight: 600
                        }}>
                          {isOpen ? 'Abierto' : 'Cerrado'}
                        </span>
                      </td>
                      <td style={{ padding: '0.75rem 1rem', fontSize: '0.88rem' }}>
                        {t.nombre_usuario_apertura || '—'}
                      </td>
                      <td style={{ padding: '0.75rem 1rem', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                        {formatearFechaHoraCO(t.fecha_apertura)}
                      </td>
                      <td style={{ padding: '0.75rem 1rem', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                        {t.fecha_cierre ? formatearFechaHoraCO(t.fecha_cierre) : '—'}
                      </td>
                      <td style={{ padding: '0.75rem 1rem', textAlign: 'right', fontWeight: 500 }}>
                        {formatearCOP(t.monto_apertura)}
                      </td>
                      <td style={{ padding: '0.75rem 1rem', textAlign: 'right', fontWeight: 500 }}>
                        {t.monto_cierre_real != null ? formatearCOP(t.monto_cierre_real) : '—'}
                      </td>
                      <td style={{
                        padding: '0.75rem 1rem', textAlign: 'right', fontWeight: 700,
                        color: isOpen ? 'var(--text-secondary)' : (Math.abs(diff) > 1 ? '#ff6b6b' : 'var(--green-primary, #1a8a4a)')
                      }}>
                        {isOpen ? '—' : (diff > 0 ? '+' : '') + formatearCOP(diff)}
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

export default Caja;
