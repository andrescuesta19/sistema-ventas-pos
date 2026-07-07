import { useState, useEffect } from 'react';
import { AlertTriangle, DollarSign, Wallet } from 'lucide-react';

const Dashboard = ({ user }) => {
  const [turno, setTurno] = useState(null);
  const [alertas, setAlertas] = useState([]);
  const [montoApertura, setMontoApertura] = useState('');
  const [showApertura, setShowApertura] = useState(false);

  useEffect(() => {
    fetchTurno();
    fetchAlertas();
  }, []);

  const fetchTurno = async () => {
    const res = await fetch(`http://localhost:3000/api/turnos/estado?id_local=${user.id_local}`);
    const data = await res.json();
    setTurno(data.turno_abierto ? data.turno : null);
  };

  const fetchAlertas = async () => {
    const res = await fetch(`http://localhost:3000/api/productos/alertas?id_local=${user.id_local}`);
    const data = await res.json();
    setAlertas(data);
  };

  const abrirTurno = async (e) => {
    e.preventDefault();
    const res = await fetch('http://localhost:3000/api/turnos/abrir', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id_usuario: user.id_usuario, id_local: user.id_local, monto_apertura: parseFloat(montoApertura) })
    });
    if (res.ok) {
      setShowApertura(false);
      fetchTurno();
    }
  };

  return (
    <div className="page-content">
      <h1 className="page-title">Dashboard General</h1>
      
      {!turno && (
        <div className="card" style={{ marginBottom: '2rem', borderLeft: '4px solid var(--accent-color)' }}>
          <div className="flex-between">
            <div>
              <h3 style={{ color: 'var(--accent-color)', marginBottom: '0.5rem' }}>No hay un turno de caja abierto</h3>
              <p style={{ color: 'var(--text-light)' }}>Debes abrir un turno para poder registrar ventas.</p>
            </div>
            <button className="btn-primary" onClick={() => setShowApertura(true)}>Abrir Turno de Caja</button>
          </div>
        </div>
      )}

      {showApertura && (
        <div className="modal-overlay">
          <div className="modal-content">
            <div className="modal-header">
              <h2>Apertura de Caja</h2>
              <button className="close-btn" onClick={() => setShowApertura(false)}>×</button>
            </div>
            <form onSubmit={abrirTurno}>
              <div style={{ marginBottom: '1.5rem' }}>
                <label style={{ display: 'block', marginBottom: '0.5rem' }}>Monto base en efectivo ($)</label>
                <input 
                  type="number" 
                  step="0.01" 
                  value={montoApertura} 
                  onChange={e => setMontoApertura(e.target.value)}
                  style={{ width: '100%' }}
                  placeholder="Ej: 150000"
                  required
                />
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '1rem' }}>
                <button type="button" className="btn-secondary" onClick={() => setShowApertura(false)}>Cancelar</button>
                <button type="submit" className="btn-primary">Confirmar Apertura</button>
              </div>
            </form>
          </div>
        </div>
      )}

      <div className="grid-3" style={{ marginBottom: '2rem' }}>
        <div className="card flex-row" style={{ gap: '1.5rem' }}>
          <div style={{ backgroundColor: 'rgba(42, 157, 143, 0.1)', padding: '1rem', borderRadius: '50%', color: 'var(--primary-color)' }}>
            <Wallet size={32} />
          </div>
          <div>
            <p style={{ color: 'var(--text-light)', fontSize: '0.9rem', marginBottom: '0.25rem' }}>Estado de Caja</p>
            <h3 style={{ fontSize: '1.2rem' }}>{turno ? 'Abierta' : 'Cerrada'}</h3>
            {turno && <span style={{ fontSize: '0.8rem', color: 'var(--primary-color)' }}>Base: {new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0 }).format(turno.monto_apertura)}</span>}
          </div>
        </div>

        <div className="card flex-row" style={{ gap: '1.5rem' }}>
          <div style={{ backgroundColor: 'rgba(38, 70, 83, 0.1)', padding: '1rem', borderRadius: '50%', color: 'var(--secondary-color)' }}>
            <DollarSign size={32} />
          </div>
          <div>
            <p style={{ color: 'var(--text-light)', fontSize: '0.9rem', marginBottom: '0.25rem' }}>Ventas del Día</p>
            <h3 style={{ fontSize: '1.2rem' }}>{new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0 }).format(0)}</h3>
            <span style={{ fontSize: '0.8rem', color: 'var(--text-light)' }}>Próximamente dinámico</span>
          </div>
        </div>

        <div className="card flex-row" style={{ gap: '1.5rem' }}>
          <div style={{ backgroundColor: 'rgba(231, 111, 81, 0.1)', padding: '1rem', borderRadius: '50%', color: 'var(--accent-color)' }}>
            <AlertTriangle size={32} />
          </div>
          <div>
            <p style={{ color: 'var(--text-light)', fontSize: '0.9rem', marginBottom: '0.25rem' }}>Alertas de Stock</p>
            <h3 style={{ fontSize: '1.2rem' }}>{alertas.length} Productos</h3>
          </div>
        </div>
      </div>

      <div className="grid-2">
        <div className="card">
          <h3 style={{ marginBottom: '1rem', color: 'var(--secondary-color)' }}>Inventario Crítico</h3>
          {alertas.length === 0 ? (
            <p style={{ color: 'var(--text-light)' }}>No hay productos con stock por debajo del mínimo.</p>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>Producto</th>
                  <th>Stock Actual</th>
                  <th>Mínimo</th>
                </tr>
              </thead>
              <tbody>
                {alertas.map(a => (
                  <tr key={a.id_producto}>
                    <td>{a.nombre_producto}</td>
                    <td style={{ color: 'var(--accent-color)', fontWeight: 'bold' }}>{a.stock_actual}</td>
                    <td>{a.stock_minimo}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
