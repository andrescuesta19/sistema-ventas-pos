import { API_URL } from '../config';
import { apiGet, apiPost, apiPut, apiDelete } from '../api';
import { useState, useEffect } from 'react';
import { FileText, Printer, Mail, CheckCircle, AlertTriangle, Send, Loader2 } from 'lucide-react';
import { formatearFechaHoraCO } from '../utils/dateCO';

const Facturas = ({ user }) => {
  const [facturas, setFacturas] = useState([]);
  const [filtro, setFiltro] = useState('Todas');
  const [emitiendo, setEmitiendo] = useState(null);
  const [msg, setMsg] = useState(null);

  useEffect(() => {
    fetchFacturas();
  }, []);

  const fetchFacturas = async () => {
    const data = await apiGet(`${API_URL}/api/ventas/historial?id_local=${user.id_local}`);
    setFacturas(data);
  };

  const formatearCOP = (valor) => {
    return new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0 }).format(valor);
  };

  // v1.9.1: emitir factura electrónica DIAN
  const emitirDian = async (f) => {
    setEmitiendo(f.id_venta);
    setMsg(null);
    try {
      const data = await apiPost(`${API_URL}/api/dian/emitir/${f.id_venta}`, {});
      setMsg({ ok: true, text: `Factura ${data.consecutivo} emitida y firmada. CUFE: ${data.cufe.slice(0, 20)}...` });
      fetchFacturas();
    } catch (err) {
      setMsg({ ok: false, text: err.message || 'Error emitiendo factura electrónica.' });
    } finally {
      setEmitiendo(null);
    }
  };

  const facturasFiltradas = facturas.filter(f => {
    // Normalizamos por si llegan ventas legacy sin estado_factura (NULL en DB)
    const estado = f.estado_factura || 'Local';
    if (filtro === 'DIAN') return estado.includes('DIAN');
    if (filtro === 'POS') return estado === 'Local';
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

      {msg && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.75rem 1rem', borderRadius: 8,
          marginBottom: '1rem', fontSize: '0.88rem',
          background: msg.ok ? 'rgba(45, 212, 109, 0.1)' : 'rgba(239, 68, 68, 0.1)',
          border: '1px solid ' + (msg.ok ? 'rgba(45, 212, 109, 0.3)' : 'rgba(239, 68, 68, 0.3)'),
          color: msg.ok ? 'var(--green-primary)' : '#dc2626'
        }}>
          {msg.ok ? <CheckCircle size={16} /> : <AlertTriangle size={16} />}
          {msg.text}
        </div>
      )}

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
            {facturasFiltradas.map(f => {
              // Normalizamos por si llegan ventas legacy con estado_factura NULL
              const estadoFactura = f.estado_factura || 'Local';
              return (
              <tr key={f.id_venta} style={{ borderBottom: '1px solid var(--border-color)' }}>
                <td style={{ padding: '1rem', fontWeight: 500 }}>
                  {estadoFactura.includes('DIAN') ? `FE-${f.id_venta.toString().padStart(6, '0')}` : `POS-${f.id_venta.toString().padStart(6, '0')}`}
                </td>
                <td style={{ padding: '1rem' }}>{formatearFechaHoraCO(f.fecha_venta)}</td>
                <td style={{ padding: '1rem', color: 'var(--text-light)' }}>{f.cliente}</td>
                <td style={{ padding: '1rem' }}>
                  {estadoFactura === 'DIAN_Enviado' ? (
                    <span style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--primary-color)', fontSize: '0.9rem', fontWeight: 600 }}>
                      <CheckCircle size={16} /> Aceptada
                    </span>
                  ) : estadoFactura === 'DIAN_Error' ? (
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
                    {estadoFactura.includes('DIAN') && (
                      <button className="btn-secondary" style={{ padding: '0.4rem', color: 'var(--primary-color)' }} title="Reenviar por Correo" onClick={() => alert('Factura enviada por correo al cliente.')}>
                        <Mail size={16} />
                      </button>
                    )}
                    {estadoFactura === 'Local' && (
                      <button
                        className="btn-primary"
                        style={{ padding: '0.4rem 0.7rem', fontSize: '0.8rem', display: 'inline-flex', alignItems: 'center', gap: '0.3rem' }}
                        title="Emitir factura electrónica DIAN"
                        onClick={() => emitirDian(f)}
                        disabled={emitiendo === f.id_venta}
                      >
                        {emitiendo === f.id_venta ? <Loader2 size={14} className="spin" /> : <Send size={14} />}
                        Emitir DIAN
                      </button>
                    )}
                  </div>
                </td>
              </tr>
              );
            })}
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
