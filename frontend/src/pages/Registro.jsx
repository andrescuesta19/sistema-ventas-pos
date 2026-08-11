import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Store, User, Mail, Lock, Phone, MapPin, FileText, Hash,
  Shield, CheckCircle2, AlertCircle, ChevronLeft, ChevronRight, Building2,
  ArrowRight, Info, XCircle
} from 'lucide-react';
import Logo from '../components/Logo';
import { API_URL } from '../config';
import { setSession } from '../api';

const Registro = ({ onRegister }) => {
  const navigate = useNavigate();
  const [step, setStep] = useState(1); // 1: Local, 2: Administrador, 3: Verificar email
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [registroResultado, setRegistroResultado] = useState(null);
  const [registroHabilitado, setRegistroHabilitado] = useState(null); // null=cargando, true/false
  const [verificandoHabilitacion, setVerificandoHabilitacion] = useState(true);

  // Al montar, verificamos si el registro público está habilitado
  useEffect(() => {
    const check = async () => {
      try {
        const r = await fetch(`${API_URL}/api/auth/registro-habilitado`);
        const data = await r.json();
        setRegistroHabilitado(data.habilitado);
      } catch {
        setRegistroHabilitado(false);
      } finally {
        setVerificandoHabilitacion(false);
      }
    };
    check();
  }, []);

  // Paso 1: Datos del local
  const [local, setLocal] = useState({
    nombre_local: '',
    direccion: '',
    nit: '',
    telefono: '',
    ciudad: '',
  });

  // Paso 2: Datos del administrador
  const [admin, setAdmin] = useState({
    nombre: '',
    correo: '',
    documento_identidad: '',
    telefono: '',
    contrasena: '',
    contrasena2: '',
  });

  // Paso 3: Verificación de email
  const [codigo, setCodigo] = useState(['', '', '', '', '', '']);

  const validarPaso1 = () => {
    if (!local.nombre_local.trim()) return 'El nombre del local es obligatorio.';
    return null;
  };

  const validarPaso2 = async () => {
    if (!admin.nombre.trim()) return 'Tu nombre completo es obligatorio.';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(admin.correo)) return 'Correo inválido.';
    if (!/^\d{6,15}$/.test(admin.documento_identidad)) return 'La cédula debe tener entre 6 y 15 dígitos.';
    if (admin.contrasena.length < 8) return 'La contraseña debe tener al menos 8 caracteres.';
    if (!/[A-Z]/.test(admin.contrasena)) return 'La contraseña debe tener al menos una mayúscula.';
    if (!/[0-9]/.test(admin.contrasena)) return 'La contraseña debe tener al menos un número.';
    if (admin.contrasena !== admin.contrasena2) return 'Las contraseñas no coinciden.';
    return null;
  };

  const handleSubmit = async () => {
    setError('');
    setInfo('');
    setLoading(true);
    try {
      const payload = {
        // Local
        nombre_local: local.nombre_local.trim(),
        direccion: local.direccion.trim() || undefined,
        nit: local.nit.trim() || undefined,
        telefono_local: local.telefono.trim() || undefined,
        ciudad: local.ciudad.trim() || undefined,
        // Admin
        nombre: admin.nombre.trim(),
        correo: admin.correo.trim().toLowerCase(),
        documento_identidad: admin.documento_identidad.trim(),
        telefono: admin.telefono.trim() || undefined,
        contrasena: admin.contrasena,
      };
      const res = await fetch(`${API_URL}/api/auth/registro`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Error al registrar el negocio');

      // v1.5.0: Ya no hay paso 3 de verificación de email.
      // El usuario entra directo pero queda pendiente de aprobación.
      if (data.token && data.user) {
        setSession(data.token, data.user);
        // v1.5.4: usar setInfo (existe), no setSuccess (no existía — ReferenceError
        // que dejaba toda la app en blanco). Mostramos mensaje y redirigimos.
        setInfo('¡Cuenta creada! Tu solicitud está pendiente de aprobación.');
        // v1.5.4: notificar a App para que actualice su estado user, si no
        // la ruta /dashboard detecta user=null y nos manda al login.
        if (onRegister) onRegister(data.user);
        setTimeout(() => navigate('/dashboard'), 600);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // (v1.5.0) Funciones de verificación de email eliminadas — el cliente entra directo.

  // Estilos
  const pageStyle = {
    minHeight: '100vh',
    background: '#0a1a0e',
    color: '#ffffff',
    fontFamily: 'Inter, system-ui, sans-serif',
    display: 'flex',
    flexDirection: 'column',
  };

  const cardStyle = {
    background: 'rgba(20, 40, 25, 0.6)',
    backdropFilter: 'blur(16px)',
    WebkitBackdropFilter: 'blur(16px)',
    borderRadius: '20px',
    padding: '2.5rem',
    border: '1px solid rgba(126, 217, 87, 0.15)',
    boxShadow: '0 10px 40px rgba(0, 0, 0, 0.35)',
    maxWidth: '560px',
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

  const labelStyle = {
    display: 'block',
    fontSize: '0.85rem',
    fontWeight: 600,
    color: 'rgba(255, 255, 255, 0.85)',
    marginBottom: '0.4rem',
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
  };

  const btnSecondary = {
    background: 'transparent',
    color: 'rgba(255, 255, 255, 0.7)',
    border: '1px solid rgba(255, 255, 255, 0.15)',
    padding: '0.95rem 1.5rem',
    borderRadius: '12px',
    fontSize: '1rem',
    fontWeight: 600,
    cursor: 'pointer',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '0.5rem',
    fontFamily: 'inherit',
  };

  return (
    <div style={pageStyle}>
      <style>{`
        .reg-input { transition: all 0.2s; }
        .reg-input:focus { border-color: rgba(126, 217, 87, 0.6) !important; background: rgba(255, 255, 255, 0.08) !important; }
        .reg-input::placeholder { color: rgba(255, 255, 255, 0.35); }
        .step-circle { transition: all 0.3s; }
      `}</style>

      {/* Header con logo */}
      <div style={{ padding: '1.5rem 2rem', display: 'flex', alignItems: 'center', gap: '1rem' }}>
        <Logo size={50} glow={false} />
        <div>
          <div style={{ fontSize: '1.1rem', fontWeight: 800, lineHeight: 1.1 }}>Sistema Integral</div>
          <div style={{ fontSize: '0.95rem', fontWeight: 700, color: '#7ed957', lineHeight: 1.1 }}>de Ventas</div>
        </div>
      </div>

      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '2rem' }}>
        <motion.div
          style={cardStyle}
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
        >
          {/* Estado: Verificando si el registro está habilitado */}
          {verificandoHabilitacion && (
            <div style={{ textAlign: 'center', padding: '2rem 1rem' }}>
              <div style={{ width: 48, height: 48, margin: '0 auto 1rem', border: '4px solid rgba(126, 217, 87, 0.15)', borderTopColor: '#7ed957', borderRadius: '50%', animation: 'spin 0.9s linear infinite' }} />
              <p style={{ color: 'rgba(255, 255, 255, 0.7)' }}>Verificando disponibilidad...</p>
            </div>
          )}

          {/* Estado: Registro deshabilitado */}
          {!verificandoHabilitacion && registroHabilitado === false && (
            <div style={{ textAlign: 'center', padding: '2rem 1rem' }}>
              <div style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 72, height: 72, borderRadius: '50%', background: 'rgba(231, 76, 60, 0.1)', border: '1px solid rgba(231, 76, 60, 0.3)', marginBottom: '1rem' }}>
                <XCircle size={36} color="#ff6b6b" />
              </div>
              <h1 style={{ fontSize: '1.4rem', fontWeight: 700, color: '#ff8a6b', margin: '0 0 0.5rem' }}>
                Registro Deshabilitado
              </h1>
              <p style={{ color: 'rgba(255, 255, 255, 0.7)', fontSize: '0.95rem', margin: '0 0 1.5rem', lineHeight: 1.5 }}>
                El administrador del sistema ha <strong>deshabilitado</strong> temporalmente el registro público de nuevos negocios.
              </p>
              <div style={{ background: 'rgba(126, 217, 87, 0.08)', border: '1px solid rgba(126, 217, 87, 0.25)', borderRadius: 10, padding: '0.85rem 1rem', marginBottom: '1.5rem', textAlign: 'left' }}>
                <p style={{ color: 'rgba(255, 255, 255, 0.85)', fontSize: '0.88rem', margin: '0 0 0.4rem', fontWeight: 600 }}>
                  ¿Qué puedo hacer?
                </p>
                <ul style={{ color: 'rgba(255, 255, 255, 0.7)', fontSize: '0.85rem', margin: 0, paddingLeft: '1.2rem', lineHeight: 1.6 }}>
                  <li>Contactar al administrador del sistema para que habilite el registro.</li>
                  <li>Pedirle que cree tu cuenta desde el panel de usuarios.</li>
                  <li>Volver más tarde cuando esté habilitado.</li>
                </ul>
              </div>
              <Link to="/login" style={{
                background: 'rgba(255, 255, 255, 0.08)',
                color: '#7ed957',
                border: '1px solid rgba(126, 217, 87, 0.3)',
                padding: '0.7rem 1.5rem',
                borderRadius: '10px',
                fontSize: '0.9rem',
                fontWeight: 600,
                textDecoration: 'none',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.4rem',
              }}>
                <ChevronLeft size={16} /> Volver al Login
              </Link>
            </div>
          )}

          {/* Estado: Registro habilitado — mostrar wizard */}
          {!verificandoHabilitacion && registroHabilitado === true && (
            <>

          {/* Indicador de pasos (v1.5.0: 2 pasos en vez de 3) */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem', marginBottom: '2rem' }}>
            {[1, 2].map(n => (
              <div key={n} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <div
                  className="step-circle"
                  style={{
                    width: 32, height: 32, borderRadius: '50%',
                    background: step >= n ? '#7ed957' : 'rgba(255, 255, 255, 0.1)',
                    color: step >= n ? '#0a1a0e' : 'rgba(255, 255, 255, 0.5)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontWeight: 700, fontSize: '0.9rem',
                  }}
                >
                  {step > n ? <CheckCircle2 size={18} /> : n}
                </div>
                {n < 2 && (
                  <div style={{ width: 60, height: 2, background: step > n ? '#7ed957' : 'rgba(255, 255, 255, 0.1)' }} />
                )}
              </div>
            ))}
          </div>

          {/* Título del paso */}
          <div style={{ textAlign: 'center', marginBottom: '1.5rem' }}>
            <h1 style={{ fontSize: '1.5rem', fontWeight: 700, margin: '0 0 0.4rem', color: '#7ed957' }}>
              {step === 1 && 'Datos del Negocio'}
              {step === 2 && 'Datos del Administrador'}
              {step === 3 && 'Verifica tu Correo'}
            </h1>
            <p style={{ color: 'rgba(255, 255, 255, 0.6)', fontSize: '0.9rem', margin: 0 }}>
              {step === 1 && 'Información del local que vas a registrar'}
              {step === 2 && 'Tus datos personales como dueño'}
              {step === 3 && 'Ingresa el código que te enviamos por correo'}
            </p>
          </div>

          {/* Errores / Info banners */}
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

          <AnimatePresence mode="wait">
            {step === 1 && (
              <motion.div key="step1" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} transition={{ duration: 0.25 }}>
                <div style={{ display: 'grid', gap: '0.85rem' }}>
                  <div style={{ position: 'relative' }}>
                    <Building2 size={16} style={{ position: 'absolute', left: '1rem', top: '50%', transform: 'translateY(-50%)', color: 'rgba(126, 217, 87, 0.6)', pointerEvents: 'none' }} />
                    <input className="reg-input" style={inputStyle} type="text" placeholder="Nombre del Local / Negocio *"
                      value={local.nombre_local} onChange={e => setLocal({ ...local, nombre_local: e.target.value })} required />
                  </div>
                  <div style={{ position: 'relative' }}>
                    <MapPin size={16} style={{ position: 'absolute', left: '1rem', top: '50%', transform: 'translateY(-50%)', color: 'rgba(126, 217, 87, 0.6)', pointerEvents: 'none' }} />
                    <input className="reg-input" style={inputStyle} type="text" placeholder="Dirección"
                      value={local.direccion} onChange={e => setLocal({ ...local, direccion: e.target.value })} />
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.85rem' }}>
                    <div style={{ position: 'relative' }}>
                      <Hash size={16} style={{ position: 'absolute', left: '1rem', top: '50%', transform: 'translateY(-50%)', color: 'rgba(126, 217, 87, 0.6)', pointerEvents: 'none' }} />
                      <input className="reg-input" style={inputStyle} type="text" placeholder="NIT"
                        value={local.nit} onChange={e => setLocal({ ...local, nit: e.target.value })} />
                    </div>
                    <div style={{ position: 'relative' }}>
                      <Phone size={16} style={{ position: 'absolute', left: '1rem', top: '50%', transform: 'translateY(-50%)', color: 'rgba(126, 217, 87, 0.6)', pointerEvents: 'none' }} />
                      <input className="reg-input" style={inputStyle} type="tel" placeholder="Teléfono del local"
                        value={local.telefono} onChange={e => setLocal({ ...local, telefono: e.target.value })} />
                    </div>
                  </div>
                  <div style={{ position: 'relative' }}>
                    <MapPin size={16} style={{ position: 'absolute', left: '1rem', top: '50%', transform: 'translateY(-50%)', color: 'rgba(126, 217, 87, 0.6)', pointerEvents: 'none' }} />
                    <input className="reg-input" style={inputStyle} type="text" placeholder="Ciudad"
                      value={local.ciudad} onChange={e => setLocal({ ...local, ciudad: e.target.value })} />
                  </div>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '1.75rem' }}>
                  <Link to="/login" style={{ ...btnSecondary, textDecoration: 'none' }}>
                    <ChevronLeft size={16} /> Volver al Login
                  </Link>
                  <button style={btnPrimary} onClick={() => {
                    const err = validarPaso1();
                    if (err) { setError(err); return; }
                    setError(''); setStep(2);
                  }}>
                    Siguiente <ChevronRight size={16} />
                  </button>
                </div>
              </motion.div>
            )}

            {step === 2 && (
              <motion.div key="step2" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} transition={{ duration: 0.25 }}>
                <div style={{ display: 'grid', gap: '0.85rem' }}>
                  <div style={{ position: 'relative' }}>
                    <User size={16} style={{ position: 'absolute', left: '1rem', top: '50%', transform: 'translateY(-50%)', color: 'rgba(126, 217, 87, 0.6)', pointerEvents: 'none' }} />
                    <input className="reg-input" style={inputStyle} type="text" placeholder="Tu Nombre Completo *"
                      value={admin.nombre} onChange={e => setAdmin({ ...admin, nombre: e.target.value })} required />
                  </div>
                  <div style={{ position: 'relative' }}>
                    <Mail size={16} style={{ position: 'absolute', left: '1rem', top: '50%', transform: 'translateY(-50%)', color: 'rgba(126, 217, 87, 0.6)', pointerEvents: 'none' }} />
                    <input className="reg-input" style={inputStyle} type="email" placeholder="Correo Electrónico *"
                      value={admin.correo} onChange={e => setAdmin({ ...admin, correo: e.target.value })} required />
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.85rem' }}>
                    <div style={{ position: 'relative' }}>
                      <FileText size={16} style={{ position: 'absolute', left: '1rem', top: '50%', transform: 'translateY(-50%)', color: 'rgba(126, 217, 87, 0.6)', pointerEvents: 'none' }} />
                      <input className="reg-input" style={inputStyle} type="text" placeholder="Cédula *"
                        value={admin.documento_identidad} onChange={e => setAdmin({ ...admin, documento_identidad: e.target.value })} required />
                    </div>
                    <div style={{ position: 'relative' }}>
                      <Phone size={16} style={{ position: 'absolute', left: '1rem', top: '50%', transform: 'translateY(-50%)', color: 'rgba(126, 217, 87, 0.6)', pointerEvents: 'none' }} />
                      <input className="reg-input" style={inputStyle} type="tel" placeholder="Tu Teléfono"
                        value={admin.telefono} onChange={e => setAdmin({ ...admin, telefono: e.target.value })} />
                    </div>
                  </div>
                  <div style={{ position: 'relative' }}>
                    <Lock size={16} style={{ position: 'absolute', left: '1rem', top: '50%', transform: 'translateY(-50%)', color: 'rgba(126, 217, 87, 0.6)', pointerEvents: 'none' }} />
                    <input className="reg-input" style={inputStyle} type="password" placeholder="Contraseña (8+ chars, mayúscula y número) *"
                      value={admin.contrasena} onChange={e => setAdmin({ ...admin, contrasena: e.target.value })} required minLength={8} />
                  </div>
                  <div style={{ position: 'relative' }}>
                    <Lock size={16} style={{ position: 'absolute', left: '1rem', top: '50%', transform: 'translateY(-50%)', color: 'rgba(126, 217, 87, 0.6)', pointerEvents: 'none' }} />
                    <input className="reg-input" style={inputStyle} type="password" placeholder="Repetir Contraseña *"
                      value={admin.contrasena2} onChange={e => setAdmin({ ...admin, contrasena2: e.target.value })} required />
                  </div>
                  <div style={{ background: 'rgba(126, 217, 87, 0.08)', border: '1px solid rgba(126, 217, 87, 0.25)', borderRadius: 10, padding: '0.7rem 0.85rem', display: 'flex', gap: '0.5rem', fontSize: '0.8rem', color: 'rgba(255, 255, 255, 0.7)' }}>
                    <Shield size={14} style={{ color: '#7ed957', flexShrink: 0, marginTop: 2 }} />
                    <div>Tu contraseña se almacena encriptada con bcrypt. No podemos recuperarla si la olvidas, pero puedes restablecerla con un código de verificación.</div>
                  </div>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '1.75rem', gap: '0.75rem' }}>
                  <button style={btnSecondary} onClick={() => { setError(''); setStep(1); }}>
                    <ChevronLeft size={16} /> Atrás
                  </button>
                  <button style={btnPrimary} onClick={async () => {
                    const err = await validarPaso2();
                    if (err) { setError(err); return; }
                    handleSubmit();
                  }} disabled={loading}>
                    {loading ? 'Registrando...' : <>Crear Cuenta <ArrowRight size={16} /></>}
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
            </>
          )}
        </motion.div>
      </div>
    </div>
  );
};

export default Registro;

