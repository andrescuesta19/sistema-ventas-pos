import { useState, useEffect } from 'react';
import { Receipt } from 'lucide-react';

const Historial = ({ user }) => {
  const [ventas, setVentas] = useState([]);

  useEffect(() => {
    fetchHistorial();
  }, []);

  const fetchHistorial = async () => {
    const res = await fetch(`http://localhost:3000/api/ventas/historial?id_local=${user.id_local}`);
    const data = await res.json();
    setVentas(data);
  };

  const formatearCOP = (valor) => {
    return new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0 }).format(valor);
  };

  return (
    <div className="page-content" style={{ padding: '2rem' }}>
      <div className="flex-between" style={{ marginBottom: '2rem' }}>
        <h2>Historial de Ventas</h2>
        <span style={{ color: 'var(--text-light)' }}>Todas las ventas registradas de {user.nombre_local}</span>
      </div>

      <div className="card" style={{ padding: '0' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ backgroundColor: '#f9f9f9', borderBottom: '1px solid var(--border-color)', textAlign: 'left' }}>
              <th style={{ padding: '1rem' }}>ID Factura</th>
              <th style={{ padding: '1rem' }}>Fecha y Hora</th>
              <th style={{ padding: '1rem' }}>Cajero</th>
              <th style={{ padding: '1rem' }}>Método de Pago</th>
              <th style={{ padding: '1rem', textAlign: 'right' }}>Total Cobrado</th>
            </tr>
          </thead>
          <tbody>
            {ventas.map(v => (
              <tr key={v.id_venta} style={{ borderBottom: '1px solid var(--border-color)' }}>
                <td style={{ padding: '1rem', color: 'var(--text-light)', fontWeight: 500 }}>#{v.id_venta.toString().padStart(6, '0')}</td>
                <td style={{ padding: '1rem' }}>{new Date(v.fecha_venta).toLocaleString()}</td>
                <td style={{ padding: '1rem' }}>{v.cajero}</td>
                <td style={{ padding: '1rem' }}>
                  <span style={{ 
                    padding: '0.2rem 0.6rem', 
                    borderRadius: '12px', 
                    backgroundColor: v.metodo_pago === 'Efectivo' ? 'rgba(42,157,143,0.1)' : 'rgba(38,70,83,0.1)',
                    color: v.metodo_pago === 'Efectivo' ? 'var(--primary-color)' : 'var(--secondary-color)',
                    fontSize: '0.8rem', fontWeight: 600
                  }}>
                    {v.metodo_pago}
                  </span>
                </td>
                <td style={{ padding: '1rem', textAlign: 'right', fontWeight: 'bold', color: 'var(--primary-color)' }}>
                  {formatearCOP(v.total_neto)}
                </td>
              </tr>
            ))}
            {ventas.length === 0 && (
              <tr>
                <td colSpan="5" style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-light)' }}>
                  <Receipt size={48} style={{ opacity: 0.2, margin: '0 auto 1rem auto' }} />
                  Aún no hay ventas registradas en este local.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default Historial;
