import { API_URL } from '../config';
import { apiGet, apiPost, apiPut, apiDelete } from '../api';
import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Package, FileText, CheckCircle, AlertCircle } from 'lucide-react';
import { formatearFechaHoraCO } from '../utils/dateCO';

const CierreCaja = ({ user, onLogout }) => {
  const navigate = useNavigate();
  const [turno, setTurno] = useState(null);
  const [montoReal, setMontoReal] = useState('');
  const [cierreCompletado, setCierreCompletado] = useState(false);
  const [reporte, setReporte] = useState({ articulos: [], metodos_pago: [] });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    fetchTurno();
  }, []);

  const fetchTurno = async () => {
    try {
      const data = await apiGet(`${API_URL}/api/turnos/estado?id_local=${user?.id_local}`);
      if (data.turno_abierto) {
        const repData = await apiGet(`${API_URL}/api/turnos/reporte?id_turno=${data.turno.id_turno}`);
        setReporte(repData);

        const ventasEfectivo = repData.metodos_pago.find(m => m.metodo_pago === 'Efectivo')?.total || 0;
        const montoApertura = parseFloat(data.turno.monto_apertura) || 0;

        setTurno({
          ...data.turno,
          monto_apertura: montoApertura,
          ventas_efectivo: parseFloat(ventasEfectivo) || 0,
          monto_teorico: montoApertura + (parseFloat(ventasEfectivo) || 0)
        });
      } else {
        setTurno(null);
      }
    } catch (err) {
      setError('Error cargando estado del turno: ' + err.message);
    }
  };

  const cerrarTurno = async (e) => {
    e.preventDefault();
    setError('');

    // El monto real puede ser 0 o cualquier valor; si está vacío usamos el teórico
    const montoRealFinal = montoReal === '' ? turno.monto_teorico : parseFloat(montoReal) || 0;

    if (!window.confirm(`¿Confirmar cierre de caja con $${new Intl.NumberFormat('es-CO').format(montoRealFinal)} COP en gaveta?`)) {
      return;
    }

    setLoading(true);
    try {
      const payload = {
        id_turno: turno.id_turno,
        monto_cierre_real: montoRealFinal,
        monto_cierre_calculado: turno.monto_teorico
      };

      // v1.5.4: apiPost ya devuelve el JSON parseado, no un Response.
      // Antes hacía `res.ok` y `res.json()` sobre el JSON, lo cual era un
      // TypeError que rompía toda la app al cerrar el turno.
      await apiPost(`${API_URL}/api/turnos/cerrar`, payload);

      setMontoReal(montoRealFinal.toString());
      setCierreCompletado(true);
    } catch (err) {
      setError('Error al cerrar el turno: ' + (err.message || 'Error desconocido'));
    } finally {
      setLoading(false);
    }
  };

  const formatearCOP = (valor) => {
    return new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0 }).format(valor || 0);
  };

  // ── Pantalla de éxito ──────────────────────────────────────────────────
  if (cierreCompletado) {
    const montoRealNum = parseFloat(montoReal) || 0;
    const diferencia = montoRealNum - turno.monto_teorico;
    const hayDiferencia = Math.abs(diferencia) > 1;

    return (
      <div className="page-content" style={{ display: 'flex', justifyContent: 'center', alignItems: 'flex-start', padding: '2rem', overflowY: 'auto' }}>
        <div className="card" style={{ width: '800px', padding: '3rem' }}>
          <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
            <CheckCircle size={56} color="var(--primary-color)" style={{ marginBottom: '1rem' }} />
            <h2 style={{ color: 'var(--secondary-color)' }}>¡Caja Cerrada Exitosamente!</h2>
            <p style={{ color: 'var(--text-light)' }}>Turno #{turno.id_turno} — {user?.nombre_local}</p>
            <p style={{ color: 'var(--text-light)', fontSize: '0.9rem' }}>
              Cerrado el {formatearFechaHoraCO(new Date())}
            </p>
          </div>

          <div className="grid-2" style={{ gap: '2rem', marginBottom: '2rem' }}>
            {/* Cuadre de Efectivo */}
            <div style={{ backgroundColor: '#f9f9f9', padding: '1.5rem', borderRadius: '8px' }}>
              <h4 style={{ marginBottom: '1rem', borderBottom: '1px solid var(--border-color)', paddingBottom: '0.5rem' }}>Cuadre de Efectivo</h4>
              <div className="flex-between" style={{ marginBottom: '0.5rem' }}>
                <span>Base Inicial:</span>
                <span>{formatearCOP(turno.monto_apertura)}</span>
              </div>
              <div className="flex-between" style={{ marginBottom: '0.5rem' }}>
                <span>Ventas en Efectivo:</span>
                <span>{formatearCOP(turno.ventas_efectivo)}</span>
              </div>
              <div className="flex-between" style={{ marginBottom: '1rem', fontWeight: 600 }}>
                <span>Efectivo Esperado:</span>
                <span>{formatearCOP(turno.monto_teorico)}</span>
              </div>
              <div className="flex-between" style={{ marginBottom: '1rem', color: 'var(--primary-color)' }}>
                <span>Efectivo Declarado:</span>
                <span style={{ fontWeight: 700 }}>{formatearCOP(montoRealNum)}</span>
              </div>
              <div className="flex-between" style={{ borderTop: '2px solid var(--border-color)', paddingTop: '1rem' }}>
                <span style={{ fontWeight: 600 }}>Diferencia:</span>
                <span style={{
                  fontWeight: 700,
                  fontSize: '1.2rem',
                  color: hayDiferencia ? 'var(--accent-color)' : 'var(--primary-color)'
                }}>
                  {diferencia > 0 ? '+' : ''}{formatearCOP(diferencia)}
                  {!hayDiferencia && ' ✓'}
                </span>
              </div>
            </div>

            {/* Métodos de Pago */}
            <div style={{ backgroundColor: '#f9f9f9', padding: '1.5rem', borderRadius: '8px' }}>
              <h4 style={{ marginBottom: '1rem', borderBottom: '1px solid var(--border-color)', paddingBottom: '0.5rem' }}>Resumen por Método de Pago</h4>
              {reporte.metodos_pago.length === 0 ? (
                <p style={{ color: 'var(--text-light)' }}>No hubo ventas en este turno.</p>
              ) : (
                reporte.metodos_pago.map(m => (
                  <div key={m.metodo_pago} className="flex-between" style={{ marginBottom: '0.5rem' }}>
                    <span>{m.metodo_pago}</span>
                    <span style={{ fontWeight: 600 }}>{formatearCOP(m.total)}</span>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Artículos Vendidos */}
          <div style={{ backgroundColor: '#f9f9f9', padding: '1.5rem', borderRadius: '8px', marginBottom: '2rem' }}>
            <h4 style={{ marginBottom: '1rem', borderBottom: '1px solid var(--border-color)', paddingBottom: '0.5rem' }}>Artículos Vendidos</h4>
            {reporte.articulos.length === 0 ? (
              <p style={{ color: 'var(--text-light)' }}>No se vendieron artículos en este turno.</p>
            ) : (
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--border-color)', textAlign: 'left', color: 'var(--text-light)' }}>
                    <th style={{ paddingBottom: '0.5rem' }}>Producto</th>
                    <th style={{ paddingBottom: '0.5rem', textAlign: 'center' }}>Cantidad</th>
                    <th style={{ paddingBottom: '0.5rem', textAlign: 'right' }}>Total</th>
                  </tr>
                </thead>
                <tbody>
                  {reporte.articulos.map(a => (
                    <tr key={a.nombre_producto} style={{ borderBottom: '1px solid #eee' }}>
                      <td style={{ paddingTop: '0.5rem', paddingBottom: '0.5rem', fontWeight: 500 }}>{a.nombre_producto}</td>
                      <td style={{ paddingTop: '0.5rem', paddingBottom: '0.5rem', textAlign: 'center' }}>{a.total_cantidad} ud.</td>
                      <td style={{ paddingTop: '0.5rem', paddingBottom: '0.5rem', textAlign: 'right', fontWeight: 600 }}>{formatearCOP(a.total_dinero)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center' }}>
            <button className="btn-secondary" onClick={() => window.print()} style={{ padding: '1rem 2rem' }}>
              🖨️ Imprimir Reporte
            </button>
            {/* v1.8.0: cerrar la caja NO debe cerrar la sesión. El logout solo
                se hace desde el menú lateral o el header. */}
            <button className="btn-primary" onClick={() => navigate('/dashboard')} style={{ padding: '1rem 2rem' }}>
              Volver al Dashboard
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── Sin turno abierto ──────────────────────────────────────────────────
  if (!turno) {
    return (
      <div className="page-content" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%' }}>
        <div className="card" style={{ width: '400px', textAlign: 'center' }}>
          <Package size={48} color="var(--text-light)" style={{ marginBottom: '1rem' }} />
          <h3>No hay turnos abiertos</h3>
          <p style={{ color: 'var(--text-light)', marginTop: '0.5rem' }}>Debes abrir un turno desde el Dashboard.</p>
        </div>
      </div>
    );
  }

  // ── Formulario de cierre ───────────────────────────────────────────────
  const montoRealNum = montoReal === '' ? turno.monto_teorico : (parseFloat(montoReal) || 0);
  const diferencia = montoRealNum - turno.monto_teorico;

  return (
    <div className="page-content" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%' }}>
      <div className="card" style={{ width: '520px' }}>
        <h2 style={{ marginBottom: '1rem', color: 'var(--secondary-color)', borderBottom: '1px solid var(--border-color)', paddingBottom: '0.5rem' }}>
          Cierre de Caja
        </h2>

        {error && (
          <div style={{ backgroundColor: '#fff0ee', border: '1px solid var(--accent-color)', borderRadius: '8px', padding: '1rem', marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--accent-color)' }}>
            <AlertCircle size={18} />
            {error}
          </div>
        )}

        {/* Resumen del Turno */}
        <div style={{ marginBottom: '1.5rem', padding: '1rem', backgroundColor: 'rgba(42, 157, 143, 0.08)', borderRadius: '8px', borderLeft: '3px solid var(--primary-color)' }}>
          <p style={{ marginBottom: '0.4rem', color: 'var(--secondary-color)' }}>
            <strong>Turno Abierto:</strong> {formatearFechaHoraCO(turno.fecha_apertura)}
          </p>
          <p style={{ marginBottom: '0.4rem', color: 'var(--secondary-color)' }}>
            <strong>Base Inicial:</strong> {formatearCOP(turno.monto_apertura)}
          </p>
          <p style={{ color: 'var(--secondary-color)' }}>
            <strong>Ventas en Efectivo:</strong> {formatearCOP(turno.ventas_efectivo)}
          </p>
        </div>

        <form onSubmit={cerrarTurno}>
          {/* Monto esperado */}
          <div style={{ marginBottom: '1.5rem', textAlign: 'center', backgroundColor: '#f9f9f9', padding: '1.5rem', borderRadius: '8px' }}>
            <label style={{ fontSize: '0.95rem', color: 'var(--text-light)', display: 'block', marginBottom: '0.5rem' }}>
              Efectivo Esperado en Gaveta
            </label>
            <div style={{ fontSize: '2.2rem', fontWeight: 'bold', color: 'var(--primary-color)' }}>
              {formatearCOP(turno.monto_teorico)}
            </div>
          </div>

          {/* Campo monto real */}
          <div className="form-group" style={{ marginBottom: '1rem' }}>
            <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 500 }}>
              Efectivo Real en Gaveta (opcional)
            </label>
            <input
              type="number"
              step="100"
              min="0"
              value={montoReal}
              onChange={e => setMontoReal(e.target.value)}
              placeholder={`Por defecto: ${formatearCOP(turno.monto_teorico)}`}
              style={{ width: '100%' }}
            />
            <p style={{ fontSize: '0.82rem', color: 'var(--text-light)', marginTop: '0.4rem' }}>
              Si dejas vacío se usa el monto esperado. Ingresa el valor real si hay diferencia.
            </p>
          </div>

          {/* Indicador de diferencia en tiempo real */}
          <div style={{
            marginBottom: '1.5rem',
            padding: '0.75rem 1rem',
            borderRadius: '8px',
            backgroundColor: Math.abs(diferencia) < 1 ? 'rgba(42, 157, 143, 0.1)' : 'rgba(231, 111, 81, 0.1)',
            borderLeft: `3px solid ${Math.abs(diferencia) < 1 ? 'var(--primary-color)' : 'var(--accent-color)'}`,
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center'
          }}>
            <span style={{ fontWeight: 500 }}>Diferencia:</span>
            <span style={{
              fontWeight: 700,
              fontSize: '1.1rem',
              color: Math.abs(diferencia) < 1 ? 'var(--primary-color)' : 'var(--accent-color)'
            }}>
              {diferencia > 0 ? '+' : ''}{formatearCOP(diferencia)}
              {Math.abs(diferencia) < 1 && ' ✓ Cuadre exacto'}
            </span>
          </div>

          <button
            type="submit"
            className="btn-primary flex-row"
            disabled={loading}
            style={{ width: '100%', padding: '1rem', fontSize: '1.05rem', justifyContent: 'center', opacity: loading ? 0.7 : 1 }}
          >
            <Package size={20} />
            {loading ? 'Cerrando...' : 'Confirmar Cierre de Caja'}
          </button>
        </form>
      </div>
    </div>
  );
};

export default CierreCaja;
