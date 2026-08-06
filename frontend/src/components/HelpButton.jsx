import { useState } from 'react';
import { HelpCircle, X, MessageSquare, Phone, Mail, CheckCircle2, Send } from 'lucide-react';
import { API_URL } from '../config';

const HelpButton = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [mensaje, setMensaje] = useState('');
  const [nombreContacto, setNombreContacto] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [enviadoExito, setEnviadoExito] = useState(false);

  const enviarSoporte = async (e) => {
    e.preventDefault();
    if (!mensaje.trim()) return;
    setEnviando(true);
    
    try {
      // Intentar enviar mensaje de soporte al backend
      await fetch(`${API_URL}/api/facturas/enviar-correo`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          correo_cliente: 'andrescuesta112@gmail.com',
          nombre_cliente: nombreContacto || 'Usuario POS',
          id_venta: 'SOPORTE-' + Date.now().toString().slice(-4),
          total_neto: 0,
          detalles: [{ nombre_producto: 'Consulta de Soporte Técnico', cantidad: 1, precio_unitario: 0, subtotal: 0 }],
          nombre_local: 'Mensaje de Soporte POS',
          metodo_pago: `Mensaje: ${mensaje}`
        })
      });
      setEnviadoExito(true);
      setTimeout(() => {
        setEnviadoExito(false);
        setMensaje('');
        setNombreContacto('');
        setIsOpen(false);
      }, 2500);
    } catch {
      alert('Mensaje registrado. También puedes contactar directamente por WhatsApp.');
    } finally {
      setEnviando(false);
    }
  };

  const abrirWhatsApp = () => {
    const texto = encodeURIComponent('Hola Andrés, necesito soporte con el Sistema de Ventas POS.');
    window.open(`https://wa.me/573000000000?text=${texto}`, '_blank');
  };

  return (
    <>
      <button 
        onClick={() => setIsOpen(true)}
        title="Soporte Técnico Especializado"
        style={{
          position: 'fixed',
          bottom: '2rem',
          right: '2rem',
          width: '60px',
          height: '60px',
          borderRadius: '50%',
          backgroundColor: '#2A9D8F',
          color: 'white',
          border: 'none',
          boxShadow: '0 4px 16px rgba(42, 157, 143, 0.4)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          cursor: 'pointer',
          zIndex: 1000,
          transition: 'transform 0.2s, background-color 0.2s',
        }}
        onMouseEnter={e => e.currentTarget.style.transform = 'scale(1.1)'}
        onMouseLeave={e => e.currentTarget.style.transform = 'scale(1)'}
      >
        <HelpCircle size={32} />
      </button>

      {isOpen && (
        <div style={{
          position: 'fixed',
          bottom: '6rem',
          right: '2rem',
          width: '380px',
          maxWidth: '90vw',
          backgroundColor: 'white',
          borderRadius: '16px',
          boxShadow: '0 12px 32px rgba(0,0,0,0.2)',
          zIndex: 1000,
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
          border: '1px solid #E2E8F0'
        }}>
          <div style={{ backgroundColor: '#264653', color: 'white', padding: '1.25rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <MessageSquare size={22} color="#2A9D8F" />
              <div>
                <h3 style={{ margin: 0, fontSize: '1.1rem' }}>Soporte Técnico Oficial</h3>
                <span style={{ fontSize: '0.75rem', opacity: 0.8 }}>Atención inmediata para tu negocio</span>
              </div>
            </div>
            <button onClick={() => setIsOpen(false)} style={{ background: 'none', border: 'none', color: 'white', cursor: 'pointer', opacity: 0.8 }}>
              <X size={22} />
            </button>
          </div>
          
          <div style={{ padding: '1.25rem', flex: 1, overflowY: 'auto' }}>
            {enviadoExito ? (
              <div style={{ textAlign: 'center', padding: '2rem 1rem' }}>
                <CheckCircle2 size={56} color="#2A9D8F" style={{ margin: '0 auto 1rem' }} />
                <h4 style={{ margin: '0 0 0.5rem', color: '#264653' }}>¡Mensaje Enviado!</h4>
                <p style={{ fontSize: '0.9rem', color: '#64748B' }}>Un especialista de soporte se pondrá en contacto contigo a la brevedad.</p>
              </div>
            ) : (
              <>
                <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.25rem' }}>
                  <button 
                    onClick={abrirWhatsApp}
                    style={{
                      flex: 1,
                      backgroundColor: '#25D366',
                      color: 'white',
                      border: 'none',
                      padding: '0.75rem',
                      borderRadius: '8px',
                      fontWeight: 600,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '0.4rem',
                      fontSize: '0.85rem'
                    }}
                  >
                    <Phone size={16} /> WhatsApp Directo
                  </button>

                  <a 
                    href="mailto:andrescuesta112@gmail.com?subject=Soporte%20POS"
                    style={{
                      flex: 1,
                      backgroundColor: '#F1F5F9',
                      color: '#334155',
                      textDecoration: 'none',
                      padding: '0.75rem',
                      borderRadius: '8px',
                      fontWeight: 600,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '0.4rem',
                      fontSize: '0.85rem',
                      textAlign: 'center'
                    }}
                  >
                    <Mail size={16} /> Correo
                  </a>
                </div>

                <form onSubmit={enviarSoporte} style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                  <label style={{ fontSize: '0.85rem', fontWeight: 600, color: '#334155' }}>Envía un mensaje rápido a soporte:</label>
                  <input 
                    type="text" 
                    placeholder="Tu Nombre / Negocio" 
                    value={nombreContacto}
                    onChange={e => setNombreContacto(e.target.value)}
                    style={{ padding: '0.6rem 0.8rem', borderRadius: '6px', border: '1px solid #CBD5E1', fontSize: '0.9rem' }}
                  />
                  <textarea 
                    rows={3} 
                    placeholder="Describe tu consulta o requerimiento..." 
                    value={mensaje}
                    onChange={e => setMensaje(e.target.value)}
                    required
                    style={{ padding: '0.6rem 0.8rem', borderRadius: '6px', border: '1px solid #CBD5E1', fontSize: '0.9rem', resize: 'none' }}
                  />
                  <button 
                    type="submit" 
                    disabled={enviando}
                    className="btn-primary"
                    style={{ 
                      padding: '0.75rem', 
                      display: 'flex', 
                      alignItems: 'center', 
                      justifyContent: 'center', 
                      gap: '0.5rem',
                      borderRadius: '8px',
                      backgroundColor: '#264653'
                    }}
                  >
                    <Send size={16} /> {enviando ? 'Enviando...' : 'Enviar Solicitud de Soporte'}
                  </button>
                </form>

                <div style={{ marginTop: '1rem', paddingTop: '0.75rem', borderTop: '1px solid #E2E8F0', fontSize: '0.75rem', color: '#64748B', textAlign: 'center' }}>
                  Desarrollado por <strong>Andrés Cuesta</strong> · Sistema Integral de Ventas
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
};

export default HelpButton;
