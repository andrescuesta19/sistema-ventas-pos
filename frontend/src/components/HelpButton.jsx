import { useState } from 'react';
import { HelpCircle, X, MessageSquare, BookOpen, AlertTriangle } from 'lucide-react';

const HelpButton = () => {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <>
      <button 
        onClick={() => setIsOpen(true)}
        style={{
          position: 'fixed',
          bottom: '2rem',
          right: '2rem',
          width: '60px',
          height: '60px',
          borderRadius: '50%',
          backgroundColor: 'var(--primary-color)',
          color: 'white',
          border: 'none',
          boxShadow: '0 4px 12px rgba(0,0,0,0.2)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          cursor: 'pointer',
          zIndex: 1000,
          transition: 'transform 0.2s',
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
          width: '350px',
          backgroundColor: 'white',
          borderRadius: '12px',
          boxShadow: '0 8px 24px rgba(0,0,0,0.15)',
          zIndex: 1000,
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column'
        }}>
          <div style={{ backgroundColor: 'var(--secondary-color)', color: 'white', padding: '1rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h3 style={{ margin: 0, fontSize: '1.1rem' }}>Soporte y Ayuda</h3>
            <button onClick={() => setIsOpen(false)} style={{ background: 'none', border: 'none', color: 'white', cursor: 'pointer' }}>
              <X size={20} />
            </button>
          </div>
          
          <div style={{ padding: '1.5rem', flex: 1, overflowY: 'auto' }}>
            <div style={{ marginBottom: '1.5rem', display: 'flex', gap: '1rem', alignItems: 'flex-start' }}>
              <BookOpen size={24} color="var(--primary-color)" style={{ flexShrink: 0 }} />
              <div>
                <h4 style={{ margin: '0 0 0.25rem 0' }}>Guía Rápida</h4>
                <p style={{ margin: 0, fontSize: '0.9rem', color: 'var(--text-light)' }}>
                  Abre la caja en el <strong>Dashboard</strong> antes de vender. Ve al <strong>POS</strong> para hacer ventas tocando los productos. Al terminar el día, usa <strong>Cierre de Caja</strong>.
                </p>
              </div>
            </div>

            <div style={{ marginBottom: '1.5rem', display: 'flex', gap: '1rem', alignItems: 'flex-start' }}>
              <AlertTriangle size={24} color="var(--accent-color)" style={{ flexShrink: 0 }} />
              <div>
                <h4 style={{ margin: '0 0 0.25rem 0' }}>¿Problemas técnicos?</h4>
                <p style={{ margin: 0, fontSize: '0.9rem', color: 'var(--text-light)' }}>
                  Si la pantalla se congela, recarga la página (F5 o Cmd+R). Tu turno seguirá abierto y nada se perderá.
                </p>
              </div>
            </div>

            <button className="btn-secondary" style={{ width: '100%', display: 'flex', justifyContent: 'center', gap: '0.5rem', padding: '0.75rem' }}>
              <MessageSquare size={18} /> Contactar a Soporte (Próximamente)
            </button>
          </div>
        </div>
      )}
    </>
  );
};

export default HelpButton;
