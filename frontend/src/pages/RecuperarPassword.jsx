import { useState } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  Mail, Lock, ArrowLeft, ArrowRight, CheckCircle2, AlertCircle, Info,
  Shield, KeyRound
} from 'lucide-react';
import Logo from '../components/Logo';
import { API_URL } from '../config';

const RecuperarPassword = () => {
  const [step, setStep] = useState(1); // 1: correo, 2: código, 3: nueva contraseña
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [correo, setCorreo] = useState('');
  const [codigo, setCodigo] = useState(['', '', '', '', '', '']);
  const [nuevaContrasena, setNuevaContrasena] = useState('');
  const [nuevaContrasena2, setNuevaContrasena2] = useState('');

  const handleSolicitar = async () => {
    setError(''); setInfo('');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(correo)) {
      setError('Correo inválido.');
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(`${API_URL}/api/auth/solicitar-reset-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ correo }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Error al solicitar el código');
      setInfo(data.message);
      if (data._dev_codigo) console.log('🔐 Código reset (dev):', data._dev_codigo);
      setStep(2);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleVerificarCodigo = async () => {
    const codigoCompleto = codigo.join('');
    if (codigoCompleto.length !== 6) {
      setError('Ingresa los 6 dígitos del código.');
      return;
    }
    setError('');
    setStep(3);
  };

  const handleCambiarContrasena = async () => {
    setError('');
    if (nuevaContrasena.length < 8) {
      setError('La contraseña debe tener al menos 8 caracteres.');
      return;
    }
    if (!/[A-Z]/.test(nuevaContrasena)) {
      setError('La contraseña debe tener al menos una mayúscula.');
      return;
    }
    if (!/[0-9]/.test(nuevaContrasena)) {
      setError('La contraseña debe tener al menos un número.');
      return;
    }
    if (nuevaContrasena !== nuevaContrasena2) {
      setError('Las contraseñas no coinciden.');
      return;
    }
    setLoading(true);
    try {
      const codigoCompleto = codigo.join('');
      const res = await fetch(`${API_URL}/api/auth/confirmar-reset-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ correo, codigo: codigoCompleto, nueva_contrasena: nuevaContrasena }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Error al cambiar la contraseña');
      setInfo(data.message);
      setStep(4);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleCodigoChange = (index, value) => {
    if (!/^\d?$/.test(value)) return;
    const nuevo = [...codigo];
    nuevo[index] = value;
    setCodigo(nuevo);
    if (value && index < 5) {
      document.getElementById(`reset-cod-${index + 1}`)?.focus();
    }
  };

  const cardStyle = {
    background: 'rgba(20, 40, 25, 0.6)',
    backdropFilter: 'blur(16px)',
    WebkitBackdropFilter: 'blur(16px)',
    borderRadius: '20px',
    padding: '2.5rem',
    border: '1px solid rgba(126, 217, 87, 0.15)',
    boxShadow: '0 10px 40px rgba(0, 0, 0, 0.35)',
    maxWidth: '480px',
    width: '100%',
    margin: '0 auto',
  };

  const inputStyle = {
    width: '100%',
    padding: '0.85rem 1rem 0.85rem 2.8rem',
    fontSize: '0.95rem',
    background: 'rgba(255, 255, 255, 0.05)',
    border: '1.5px solid rgba(126, 217, 87, 0.15)',
    borderRadius: '12px',
    color: '#ffffff',
    outline: 'none',
    fontFamily: 'inherit',
    boxSizing: 'border-box',
  };

  const btnPrimary = {
    background: 'linear-gradient(135deg, #7ed957 0%, #5ab846 100%)',
    color: '#0a1a0e',
    border: 'none',
    padding: '0.95rem 1.5rem',
    borderRadius: '12px',
    fontSize: '1rem',
    fontWeight: 700,
    cursor: 'pointer',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '0.5rem',
    fontFamily: 'inherit',
    boxShadow: '0 4px 16px rgba(126, 217, 87, 0.35)',
    width: '100%',
  };

  return (
    <div style={{ minHeight: '100vh', background: '#0a1a0e', color: '#ffffff', fontFamily: 'Inter, system-ui, sans-serif', display: 'flex', flexDirection: 'column' }}>
      <style>{`
        .rp-input { transition: all 0.2s; }
        .rp-input:focus { border-color: rgba(126, 217, 87, 0.6) !important; background: rgba(255, 255, 255, 0.08) !important; }
        .rp-input::placeholder { color: rgba(255, 255, 255, 0.35); }
      `}</style>

      <div style={{ padding: '1.5rem 2rem', display: 'flex', alignItems: 'center', gap: '1rem' }}>
        <Logo size={50} glow={false} />
        <div>
          <div style={{ fontSize: '1.1rem', fontWeight: 800 }}>Sistema Integral</div>
          <div style={{ fontSize: '0.95rem', fontWeight: 700, color: '#7ed957' }}>de Ventas</div>
        </div>
      </div>

      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '2rem' }}>
        <motion.div style={cardStyle} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}>
          <div style={{ textAlign: 'center', marginBottom: '1.5rem' }}>
            <div style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 64, height: 64, borderRadius: '50%', background: 'rgba(126, 217, 87, 0.15)', border: '1px solid rgba(126, 217, 87, 0.4)', marginBottom: '1rem' }}>
              <KeyRound size={28} color="#7ed957" />
            </div>
            <h1 style={{ fontSize: '1.5rem', fontWeight: 700, color: '#7ed957', margin: '0 0 0.4rem' }}>
              {step === 1 && 'Recuperar Contraseña'}
              {step === 2 && 'Verifica tu Código'}
              {step === 3 && 'Nueva Contraseña'}
              {step === 4 && '¡Listo!'}
            </h1>
            <p style={{ color: 'rgba(255, 255, 255, 0.6)', fontSize: '0.9rem', margin: 0 }}>
              {step === 1 && 'Te enviaremos un código de verificación'}
              {step === 2 && `Ingresa el código que enviamos a ${correo}`}
              {step === 3 && 'Crea una contraseña nueva y segura'}
              {step === 4 && 'Tu contraseña fue actualizada'}
            </p>
          </div>

          {error && (
            <div style={{ background: 'rgba(231, 76, 60, 0.1)', border: '1px solid rgba(231, 76, 60, 0.3)', borderRadius: 10, padding: '0.7rem 1rem', marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.9rem', color: '#ff8a6b' }}>
              <AlertCircle size={16} /> {error}
            </div>
          )}
          {info && (
            <div style={{ background: 'rgba(126, 217, 87, 0.1)', border: '1px solid rgba(126, 217, 87, 0.3)', borderRadius: 10, padding: '0.7rem 1rem', marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.9rem', color: '#7ed957' }}>
              <Info size={16} /> {info}
            </div>
          )}

          {step === 1 && (
            <>
              <div style={{ position: 'relative', marginBottom: '1rem' }}>
                <Mail size={16} style={{ position: 'absolute', left: '1rem', top: '50%', transform: 'translateY(-50%)', color: 'rgba(126, 217, 87, 0.6)', pointerEvents: 'none' }} />
                <input className="rp-input" style={inputStyle} type="email" placeholder="Tu correo electrónico"
                  value={correo} onChange={e => setCorreo(e.target.value)} autoFocus />
              </div>
              <button style={btnPrimary} onClick={handleSolicitar} disabled={loading}>
                {loading ? 'Enviando...' : <>Enviar Código <ArrowRight size={16} /></>}
              </button>
            </>
          )}

          {step === 2 && (
            <>
              <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'center', marginBottom: '1.5rem' }}>
                {codigo.map((digit, i) => (
                  <input
                    key={i}
                    id={`reset-cod-${i}`}
                    type="text"
                    inputMode="numeric"
                    maxLength={1}
                    value={digit}
                    onChange={e => handleCodigoChange(i, e.target.value)}
                    onKeyDown={e => { if (e.key === 'Backspace' && !codigo[i] && i > 0) document.getElementById(`reset-cod-${i - 1}`)?.focus(); }}
                    style={{
                      width: 48, height: 56, fontSize: '1.5rem', fontWeight: 700,
                      textAlign: 'center',
                      background: 'rgba(255, 255, 255, 0.05)',
                      border: '1.5px solid rgba(126, 217, 87, 0.3)',
                      borderRadius: 10, color: '#7ed957', fontFamily: 'inherit', outline: 'none',
                    }}
                    autoFocus={i === 0}
                  />
                ))}
              </div>
              <button style={btnPrimary} onClick={handleVerificarCodigo}>Continuar <ArrowRight size={16} /></button>
            </>
          )}

          {step === 3 && (
            <>
              <div style={{ position: 'relative', marginBottom: '0.85rem' }}>
                <Lock size={16} style={{ position: 'absolute', left: '1rem', top: '50%', transform: 'translateY(-50%)', color: 'rgba(126, 217, 87, 0.6)', pointerEvents: 'none' }} />
                <input className="rp-input" style={inputStyle} type="password" placeholder="Nueva contraseña (8+ chars, mayúscula, número)"
                  value={nuevaContrasena} onChange={e => setNuevaContrasena(e.target.value)} autoFocus />
              </div>
              <div style={{ position: 'relative', marginBottom: '1.5rem' }}>
                <Lock size={16} style={{ position: 'absolute', left: '1rem', top: '50%', transform: 'translateY(-50%)', color: 'rgba(126, 217, 87, 0.6)', pointerEvents: 'none' }} />
                <input className="rp-input" style={inputStyle} type="password" placeholder="Repetir nueva contraseña"
                  value={nuevaContrasena2} onChange={e => setNuevaContrasena2(e.target.value)} />
              </div>
              <button style={btnPrimary} onClick={handleCambiarContrasena} disabled={loading}>
                {loading ? 'Cambiando...' : <>Cambiar Contraseña <CheckCircle2 size={16} /></>}
              </button>
            </>
          )}

          {step === 4 && (
            <div style={{ textAlign: 'center' }}>
              <CheckCircle2 size={64} color="#7ed957" style={{ margin: '0 auto 1rem' }} />
              <Link to="/login" style={{ ...btnPrimary, textDecoration: 'none', display: 'inline-flex' }}>
                <ArrowLeft size={16} /> Ir al Login
              </Link>
            </div>
          )}

          {step < 4 && (
            <div style={{ textAlign: 'center', marginTop: '1.5rem' }}>
              <Link to="/login" style={{ color: 'rgba(255, 255, 255, 0.6)', fontSize: '0.85rem', textDecoration: 'none' }}>
                <ArrowLeft size={14} style={{ display: 'inline', marginRight: 4 }} /> Volver al Login
              </Link>
            </div>
          )}
        </motion.div>
      </div>
    </div>
  );
};

export default RecuperarPassword;
