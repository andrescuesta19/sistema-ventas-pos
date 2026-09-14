import { useState, useEffect } from 'react';
import { Sparkles, ArrowRight, ShoppingCart, BarChart3, Users, Shield } from 'lucide-react';
import Logo from './Logo';

const WelcomeModal = () => {
  const [show, setShow] = useState(false);

  useEffect(() => {
    const firstInstall = localStorage.getItem('pos_first_install');
    if (!firstInstall) {
      setShow(true);
    }
  }, []);

  const handleContinue = () => {
    localStorage.setItem('pos_first_install', 'true');
    setShow(false);
  };

  if (!show) return null;

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 9999,
      background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(8px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: '1rem',
    }}>
      <div style={{
        background: 'linear-gradient(135deg, #0a1a0e 0%, #0d2412 50%, #0a1a0e 100%)',
        border: '1px solid rgba(126,217,87,0.2)',
        borderRadius: 20, padding: '2.5rem 2rem', maxWidth: 480, width: '100%',
        textAlign: 'center', position: 'relative', overflow: 'hidden',
        boxShadow: '0 20px 60px rgba(0,0,0,0.5)',
      }}>
        {/* Blobs decorativos */}
        <div style={{ position: 'absolute', top: '-20%', right: '-20%', width: 200, height: 200, borderRadius: '50%', background: 'radial-gradient(circle, rgba(126,217,87,0.15) 0%, transparent 70%)', filter: 'blur(30px)' }} />
        <div style={{ position: 'absolute', bottom: '-20%', left: '-20%', width: 180, height: 180, borderRadius: '50%', background: 'radial-gradient(circle, rgba(90,184,70,0.12) 0%, transparent 70%)', filter: 'blur(30px)' }} />

        <div style={{ position: 'relative', zIndex: 1 }}>
          <Logo size={80} glow={true} />

          <div style={{
            display: 'inline-flex', alignItems: 'center', gap: '0.4rem',
            background: 'rgba(126,217,87,0.12)', border: '1px solid rgba(126,217,87,0.25)',
            borderRadius: 999, padding: '0.3rem 0.85rem', marginTop: '1.25rem',
            color: '#7ed957', fontSize: '0.7rem', fontWeight: 700, letterSpacing: '0.6px', textTransform: 'uppercase',
          }}>
            <Sparkles size={12} /> ¡Bienvenido!
          </div>

          <h1 style={{ color: '#fff', fontSize: '1.6rem', fontWeight: 800, margin: '1rem 0 0.5rem', letterSpacing: '-0.5px' }}>
            Sistema Integral<br />de Ventas
          </h1>

          <p style={{ color: 'rgba(255,255,255,0.55)', fontSize: '0.9rem', lineHeight: 1.6, margin: '0 0 1.5rem' }}>
            Tu solución completa para administrar tu negocio de forma simple, rápida y efectiva.
          </p>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.6rem', marginBottom: '1.5rem', textAlign: 'left' }}>
            {[
              { Icon: ShoppingCart, t: 'Punto de Venta', s: 'Ventas rápidas y ágiles' },
              { Icon: BarChart3, t: 'Dashboard', s: 'Métricas en tiempo real' },
              { Icon: Users, t: 'Clientes', s: 'Gestión de cartera' },
              { Icon: Shield, t: 'Seguro', s: 'Tus datos protegidos' },
            ].map((f, i) => (
              <div key={i} style={{
                display: 'flex', alignItems: 'center', gap: '0.6rem',
                padding: '0.55rem 0.75rem', borderRadius: 10,
                background: 'rgba(126,217,87,0.06)', border: '1px solid rgba(126,217,87,0.12)',
              }}>
                <f.Icon size={16} color="#7ed957" />
                <div>
                  <div style={{ color: '#fff', fontSize: '0.78rem', fontWeight: 600 }}>{f.t}</div>
                  <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: '0.68rem' }}>{f.s}</div>
                </div>
              </div>
            ))}
          </div>

          <button onClick={handleContinue} style={{
            width: '100%', padding: '0.85rem', background: 'linear-gradient(135deg, #7ed957 0%, #5ab846 100%)',
            color: '#0a1a0e', border: 'none', borderRadius: 12, fontWeight: 700, fontSize: '0.95rem',
            cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem',
            fontFamily: 'inherit', boxShadow: '0 4px 16px rgba(126,217,87,0.35)',
          }}>
            Comenzar <ArrowRight size={18} />
          </button>

          <p style={{ color: 'rgba(255,255,255,0.3)', fontSize: '0.72rem', margin: '1rem 0 0' }}>
            Desarrollado por Andrés Cuesta · v2.1.1
          </p>
        </div>
      </div>
    </div>
  );
};

export default WelcomeModal;
