import { useState, useEffect } from 'react';
import { FileText, Printer, Mail, CheckCircle, AlertTriangle } from 'lucide-react';

const Facturas = ({ user }) => {
  const [facturas, setFacturas] = useState([]);
  const [filtro, setFiltro] = useState('Todas');

  useEffect(() => {
    fetchFacturas();
  }, []);

  const fetchFacturas = async () => {
    const res = await fetch(`http://localhost:3000/api/ventas/historial?id_local=${user.id_local}`);
    const data = await res.json();
    setFacturas(data);
  };

  const formatearCOP = (valor) => {
    return new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0 }).format(valor);
  };

  const facturasFiltradas = facturas.filter(f => {
    if (filtro === 'DIAN') return f.estado_factura.includes('DIAN');
    if (filtro === 'POS') return f.estado_factura === 'Local';
    return true;
  });

  return (
    <div className="page-content" style={{ padding: '2rem' }}>
      <div className="flex-between" style={{ marginBottom: '2rem' }}>
        <div>
          <h2>Gestión de Facturación Electrónica</h2>
          <span style={{ color: 'var(--text-light)' }}>Centro de control de documentos fiscales DIAN</span>
        </div>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <button className={filtro === 'Todas' ? 'btn-primary' : 'btn-secondary'} onClick={() => setFiltro('Todas')}>Todas</button>
          <button className={filtro === 'DIAN' ? 'btn-primary' : 'btn-secondary'} onClick={() => setFiltro('DIAN')}>Electrónicas (DIAN)</button>
          <button className={filtro === 'POS' ? 'btn-primary' : 'btn-secondary'} onClick={() => setFiltro('POS')}>Recibos POS</button>
        </div>
      </div>

      <div className="card" style={{ padding: '0' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ backgroundColor: '#f9f9f9', borderBottom: '1px solid var(--border-color)', textAlign: 'left' }}>
              <th style={{ padding: '1rem' }}>Documento</th>
              <th style={{ padding: '1rem' }}>Fecha</th>
              <th style={{ padding: '1rem' }}>Cliente</th>
              <th style={{ padding: '1rem' }}>Estado DIAN</th>
              <th style={{ padding: '1rem', textAlign: 'right' }}>Total</th>
              <th style={{ padding: '1rem', textAlign: 'center' }}>Acciones</th>
            </tr>
          </thead>
          <tbody>
            {facturasFiltradas.map(f => (
              <tr key={f.id_venta} style={{ borderBottom: '1px solid var(--border-color)' }}>
                <td style={{ padding: '1rem', fontWeight: 500 }}>
                  {f.estado_factura.includes('DIAN') ? `FE-${f.id_venta.toString().padStart(6, '0')}` : `POS-${f.id_venta.toString().padStart(6, '0')}`}
                </td>
                <td style={{ padding: '1rem' }}>{new Date(f.fecha_venta).toLocaleString()}</td>
                <td style={{ padding: '1rem', color: 'var(--text-light)' }}>{f.cliente}</td>
                <td style={{ padding: '1rem' }}>
                  {f.estado_factura === 'DIAN_Enviado' ? (
                    <span style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--primary-color)', fontSize: '0.9rem', fontWeight: 600 }}>
                      <CheckCircle size={16} /> Aceptada
                    </span>
                  ) : f.estado_factura === 'DIAN_Error' ? (
                    <span style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--accent-color)', fontSize: '0.9rem', fontWeight: 600 }}>
                      <AlertTriangle size={16} /> Rechazada
                    </span>
                  ) : (
                    <span style={{ color: 'var(--text-light)', fontSize: '0.9rem' }}>N/A (Documento Interno)</span>
                  )}
                </td>
                <td style={{ padding: '1rem', textAlign: 'right', fontWeight: 'bold' }}>
                  {formatearCOP(f.total_neto)}
                </td>
                <td style={{ padding: '1rem', textAlign: 'center' }}>
                  <div style={{ display: 'flex', justifyContent: 'center', gap: '0.5rem' }}>
                    <button className="btn-secondary" style={{ padding: '0.4rem' }} title="Imprimir" onClick={() => window.print()}>
                      <Printer size={16} />
                    </button>
                    {f.estado_factura.includes('DIAN') && (
                      <button className="btn-secondary" style={{ padding: '0.4rem', color: 'var(--primary-color)' }} title="Reenviar por Correo" onClick={() => alert('Factura enviada por correo al cliente.')}>
                        <Mail size={16} />
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
            {facturasFiltradas.length === 0 && (
              <tr>
                <td colSpan="6" style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-light)' }}>
                  <FileText size={48} style={{ opacity: 0.2, margin: '0 auto 1rem auto' }} />
                  No se encontraron documentos fiscales.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default Facturas;
