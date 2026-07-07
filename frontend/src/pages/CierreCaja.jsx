import { useState, useEffect } from 'react';
import { Package, FileText } from 'lucide-react';

const CierreCaja = ({ user, onLogout }) => {
  const [turno, setTurno] = useState(null);
  const [montoReal, setMontoReal] = useState('');
  const [cierreCompletado, setCierreCompletado] = useState(false);
  const [reporte, setReporte] = useState({ articulos: [], metodos_pago: [] });

  useEffect(() => {
    fetchTurno();
  }, []);

  const fetchTurno = async () => {
    const res = await fetch(`http://localhost:3000/api/turnos/estado?id_local=${user.id_local}`);
    const data = await res.json();
    if (data.turno_abierto) {
      // Fetch report for the open shift
      const resRep = await fetch(`http://localhost:3000/api/turnos/reporte?id_turno=${data.turno.id_turno}`);
      const repData = await resRep.json();
      setReporte(repData);
      
      // Calculate expected cash (base + only cash sales)
      const ventasEfectivo = repData.metodos_pago.find(m => m.metodo_pago === 'Efectivo')?.total || 0;
      
      setTurno({
        ...data.turno,
        ventas_efectivo: ventasEfectivo,
        monto_teorico: data.turno.monto_apertura + ventasEfectivo
      });
    } else {
      setTurno(null);
    }
  };

  const cerrarTurno = async (e) => {
    e.preventDefault();
    if (window.confirm('¿Confirmas el cierre de caja por el valor esperado?')) {
      const payload = {
        id_turno: turno.id_turno,
        monto_cierre_real: turno.monto_teorico, // Cierre rápido
        monto_cierre_calculado: turno.monto_teorico
      };

      const res = await fetch('http://localhost:3000/api/turnos/cerrar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (res.ok) {
        setCierreCompletado(true);
        setMontoReal(turno.monto_teorico); // Para visualización en la pantalla de éxito
      }
    }
  };

  const formatearCOP = (valor) => {
    return new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0 }).format(valor);
  };

  if (cierreCompletado) {
    const diferencia = parseFloat(montoReal) - turno.monto_teorico;
    return (
      <div className="page-content" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%', padding: '2rem' }}>
        <div className="card" style={{ width: '800px', padding: '3rem' }}>
          <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
            <FileText size={48} color="var(--primary-color)" style={{ marginBottom: '1rem' }} />
            <h2 style={{ color: 'var(--secondary-color)' }}>Reporte Final de Turno</h2>
            <p style={{ color: 'var(--text-light)' }}>Turno #{turno.id_turno} - {user.nombre_local}</p>
          </div>

          <div className="grid-2" style={{ gap: '2rem', marginBottom: '2rem' }}>
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
                <span style={{ fontWeight: 700 }}>{formatearCOP(parseFloat(montoReal))}</span>
              </div>
              <div className="flex-between" style={{ borderTop: '2px solid var(--border-color)', paddingTop: '1rem' }}>
                <span style={{ fontWeight: 600 }}>Diferencia:</span>
                <span style={{ 
                  fontWeight: 700, 
                  fontSize: '1.2rem',
                  color: diferencia === 0 ? 'var(--primary-color)' : 'var(--accent-color)'
                }}>
                  {diferencia > 0 ? '+' : ''}{formatearCOP(diferencia)}
                </span>
              </div>
            </div>

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

          <div style={{ backgroundColor: '#f9f9f9', padding: '1.5rem', borderRadius: '8px', marginBottom: '2rem' }}>
            <h4 style={{ marginBottom: '1rem', borderBottom: '1px solid var(--border-color)', paddingBottom: '0.5rem' }}>Artículos Vendidos</h4>
            {reporte.articulos.length === 0 ? (
              <p style={{ color: 'var(--text-light)' }}>No se vendieron artículos.</p>
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
            <button className="btn-secondary" onClick={() => window.print()} style={{ padding: '1rem 2rem' }}>Imprimir Reporte</button>
            <button className="btn-primary" onClick={onLogout} style={{ padding: '1rem 2rem' }}>Cerrar Sesión</button>
          </div>
        </div>
      </div>
    );
  }

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

  return (
    <div className="page-content" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%' }}>
      <div className="card" style={{ width: '500px' }}>
        <h2 style={{ marginBottom: '1rem', color: 'var(--secondary-color)', borderBottom: '1px solid var(--border-color)', paddingBottom: '0.5rem' }}>
          Cierre de Caja
        </h2>
        
        <div style={{ marginBottom: '2rem', padding: '1rem', backgroundColor: 'rgba(42, 157, 143, 0.1)', borderRadius: '8px', color: 'var(--secondary-color)' }}>
          <p style={{ marginBottom: '0.5rem' }}><strong>Turno Abierto:</strong> {new Date(turno.fecha_apertura).toLocaleString()}</p>
          <p style={{ marginBottom: '0.5rem' }}><strong>Base Inicial:</strong> {formatearCOP(turno.monto_apertura)}</p>
          <p><strong>Ventas en Efectivo:</strong> {formatearCOP(turno.ventas_efectivo)}</p>
        </div>

        <form onSubmit={cerrarTurno}>
          <div className="form-group" style={{ marginBottom: '2rem', textAlign: 'center', backgroundColor: '#f9f9f9', padding: '2rem', borderRadius: '8px' }}>
            <label style={{ fontSize: '1.1rem', color: 'var(--text-light)' }}>Monto Esperado en Caja</label>
            <div style={{ fontSize: '2.5rem', fontWeight: 'bold', color: 'var(--primary-color)', margin: '1rem 0' }}>
              {formatearCOP(turno.monto_teorico)}
            </div>
            <p style={{ fontSize: '0.9rem', color: 'var(--text-light)' }}>
              Haz clic en el botón de abajo para confirmar que el dinero en la gaveta coincide con el monto esperado y proceder al cierre automático del turno.
            </p>
          </div>

          <button type="submit" className="btn-primary flex-row" style={{ width: '100%', padding: '1rem', fontSize: '1.1rem', justifyContent: 'center' }}>
            <Package size={20} /> Cerrar Turno Confirmando Saldo
          </button>
        </form>
      </div>
    </div>
  );
};

export default CierreCaja;
