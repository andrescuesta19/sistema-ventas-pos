import { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Mail,
  Lock,
  Eye,
  EyeOff,
  ArrowRight,
  Shield,
  Sparkles,
  BarChart3,
  User,
  ShoppingCart,
  DollarSign,
  AlertCircle,
  CheckCircle2,
  ShieldCheck
} from 'lucide-react';
import Logo from '../components/Logo';
import { API_URL } from '../config';
import { setSession } from '../api';

/* ─────────────────────────────────────────────────────────
   Validación
   ───────────────────────────────────────────────────────── */
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const isValidEmail = (e) => EMAIL_RE.test(e.trim());

/* ─────────────────────────────────────────────────────────
   Iconos flotantes alrededor del logo
   ───────────────────────────────────────────────────────── */
const FLOATING_ICONS = [
  { Icon: BarChart3,    top: '6%',  left: '4%',  dur: 3.4, delay: 0   },
  { Icon: User,         top: '6%',  right: '4%', dur: 4.1, delay: 0.3 },
  { Icon: ShoppingCart, top: '52%', left: '1%',  dur: 3.7, delay: 0.6 },
  { Icon: DollarSign,   top: '52%', right: '1%', dur: 4.5, delay: 0.9 }
];

/* ─────────────────────────────────────────────────────────
   Header reusable para cada paso
   ───────────────────────────────────────────────────────── */
const StepHeader = ({ icon, title, subtitle }) => (
  <div style={styles.cardLeft}>
    <div style={styles.shieldWrap}>{icon}</div>
    <div>
      <h2 style={styles.cardTitle}>{title}</h2>
      <p style={styles.cardSubtitle}>{subtitle}</p>
    </div>
  </div>
);

/* ─────────────────────────────────────────────────────────
   Componente principal
   ───────────────────────────────────────────────────────── */
const Login = ({ onLogin, onSwitchToRegister }) => {
  const [step, setStep] = useState('email'); // 'email' | 'password' | 'loading'
  const [correo, setCorreo] = useState('');
  const [contrasena, setContrasena] = useState('');
  const [mostrarPass, setMostrarPass] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  // Últimos correos usados en este Mac (para auto-rellenar)
  // (v1.5.0) Quitamos el dropdown de últimos usuarios — era confuso para clientes.
  // El cliente simplemente escribe su correo.

  const [mouse, setMouse] = useState({ x: 0, y: 0 });
  const pageRef = useRef(null);
  const mouseFrameRef = useRef(null);

  const handleMouseMove = (e) => {
    if (!pageRef.current) return;
    // Throttle con requestAnimationFrame: solo actualizamos el state
    // una vez por frame (60fps) en vez de en cada mousemove (que puede ser 200+ Hz).
    if (mouseFrameRef.current) return;
    mouseFrameRef.current = requestAnimationFrame(() => {
      mouseFrameRef.current = null;
      const rect = pageRef.current.getBoundingClientRect();
      const x = ((e.clientX - rect.left) / rect.width - 0.5) * 2;
      const y = ((e.clientY - rect.top) / rect.height - 0.5) * 2;
      setMouse({ x, y });
    });
  };
  const handleMouseLeave = () => {
    if (mouseFrameRef.current) {
      cancelAnimationFrame(mouseFrameRef.current);
      mouseFrameRef.current = null;
    }
    setMouse({ x: 0, y: 0 });
  };

  // Cleanup del frame pendiente al desmontar
  useEffect(() => {
    return () => {
      if (mouseFrameRef.current) {
        cancelAnimationFrame(mouseFrameRef.current);
      }
    };
  }, []);

  // Auto-focus al input visible según el paso
  useEffect(() => {
    if (step === 'loading') return;
    const t = setTimeout(() => {
      const sel = step === 'email'
        ? '.login-form input[type="email"]'
        : '.login-form input[type="password"], .login-form input[type="text"]';
      const el = document.querySelector(sel);
      el?.focus();
    }, 350);
    return () => clearTimeout(t);
  }, [step]);

  // PASO 1 → 2
  const handleContinuar = (e) => {
    e.preventDefault();
    if (!isValidEmail(correo)) {
      setError('Por favor ingresa un correo válido');
      return;
    }
    setError('');
    setStep('password');
  };

  // PASO 2 → 1 (volver)
  const handleVolver = () => {
    setError('');
    setContrasena('');
    setMostrarPass(false);
    setStep('email');
  };

  // PASO 2 → fetch
  const handleIniciarSesion = async (e) => {
    e.preventDefault();
    if (!contrasena) {
      setError('Ingresa tu contraseña');
      return;
    }
    setError('');
    setStep('loading');

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 8000); // 8s timeout

      const res = await fetch(`${API_URL}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ correo: correo.trim(), contrasena }),
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setStep('password');
        // Si fue rate limited (429), mensaje específico
        if (res.status === 429) {
          setError(data.error || 'Demasiados intentos. Espera 15 minutos.');
        } else {
          setError(data.error || `Error del servidor (HTTP ${res.status})`);
        }
        return;
      }
      // Backend ahora devuelve {token, user}. Guardamos ambos.
      if (data.token && data.user) {
        setSession(data.token, data.user);
        setSuccess(true);
        setTimeout(() => onLogin(data.user), 450);
      } else {
        setStep('password');
        setError('Respuesta inválida del servidor.');
      }
    } catch (err) {
      setStep('password');
      // Mensaje específico según el tipo de error
      if (err.name === 'AbortError') {
        setError(`El servidor no responde (timeout 8s). Verifica que esté corriendo en ${API_URL}.`);
      } else if (err.message && err.message.includes('Failed to fetch')) {
        setError(`No se pudo conectar al servidor en ${API_URL}. ¿Está iniciado el backend?`);
      } else {
        setError(`Error de conexión: ${err.message || 'desconocido'}. ¿Backend corriendo en ${API_URL}?`);
      }
    }
  };

  return (
    <div
      ref={pageRef}
      style={styles.page}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
    >
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap');
        * { box-sizing: border-box; }
        body { margin: 0; }
        @keyframes floatY {
          0%, 100% { transform: translateY(-6px); }
          50%      { transform: translateY(6px); }
        }
        @keyframes floatYSmooth {
          0%, 100% { transform: translateY(0px); }
          50%      { transform: translateY(-10px); }
        }
        @keyframes spin360 {
          0%   { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
        @keyframes checkPop {
          0%   { transform: scale(0.4); opacity: 0; }
          60%  { transform: scale(1.15); opacity: 1; }
          100% { transform: scale(1); opacity: 1; }
        }
        .login-input {
          width: 100%;
          padding: 0.95rem 1.1rem 0.95rem 3rem;
          font-size: 0.98rem;
          font-family: inherit;
          background: rgba(255, 255, 255, 0.05);
          border: 1.5px solid rgba(126, 217, 87, 0.15);
          border-radius: 12px;
          color: #ffffff;
          outline: none;
          transition: all 0.2s cubic-bezier(0.22, 1, 0.36, 1);
        }
        .login-input::placeholder { color: rgba(255, 255, 255, 0.35); }
        .login-input:focus {
          border-color: rgba(126, 217, 87, 0.6);
          background: rgba(255, 255, 255, 0.08);
          box-shadow: 0 0 0 4px rgba(126, 217, 87, 0.12);
        }
        .login-primary-btn {
          width: 100%;
          padding: 1rem 1.1rem;
          font-size: 1rem;
          font-weight: 700;
          font-family: inherit;
          color: #0a1a0e;
          background: linear-gradient(135deg, #7ed957 0%, #5ab846 100%);
          border: none;
          border-radius: 12px;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 0.5rem;
          transition: all 0.2s cubic-bezier(0.22, 1, 0.36, 1);
          box-shadow: 0 4px 16px rgba(126, 217, 87, 0.35);
          position: relative;
          overflow: hidden;
        }
        .login-primary-btn::before {
          content: '';
          position: absolute;
          inset: 0;
          background: linear-gradient(135deg, #5ab846 0%, #7ed957 100%);
          opacity: 0;
          transition: opacity 0.25s ease;
        }
        .login-primary-btn:hover::before { opacity: 1; }
        .login-primary-btn:hover {
          transform: translateY(-2px);
          box-shadow: 0 8px 28px rgba(126, 217, 87, 0.5);
        }
        .login-primary-btn:active { transform: translateY(0); }
        .login-primary-btn:disabled {
          opacity: 0.7;
          cursor: not-allowed;
          transform: none !important;
        }
        .login-primary-btn > * { position: relative; z-index: 1; }
        .icon-input-wrap { position: relative; }
        .icon-input-wrap > svg.field-icon {
          position: absolute;
          left: 1.05rem;
          top: 50%;
          transform: translateY(-50%);
          color: rgba(126, 217, 87, 0.7);
          transition: color 0.2s ease;
          pointer-events: none;
        }
        .icon-input-wrap input:focus ~ svg.field-icon,
        .icon-input-wrap:focus-within > svg.field-icon { color: #7ed957; }
        .toggle-pass {
          position: absolute;
          right: 0.6rem;
          top: 50%;
          transform: translateY(-50%);
          background: none;
          border: none;
          color: rgba(255, 255, 255, 0.5);
          cursor: pointer;
          padding: 0.45rem;
          border-radius: 8px;
          display: flex;
          align-items: center;
          justify-content: center;
          transition: all 0.15s ease;
        }
        .toggle-pass:hover { color: #7ed957; background: rgba(126, 217, 87, 0.1); }
        .tag-pill {
          display: inline-flex;
          align-items: center;
          gap: 0.4rem;
          padding: 0.32rem 0.75rem;
          border-radius: 999px;
          background: rgba(126, 217, 87, 0.12);
          color: #7ed957;
          font-size: 0.7rem;
          font-weight: 700;
          letter-spacing: 0.6px;
          text-transform: uppercase;
          border: 1px solid rgba(126, 217, 87, 0.25);
        }
        .error-banner {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          padding: 0.65rem 0.85rem;
          border-radius: 10px;
          background: rgba(231, 111, 81, 0.1);
          color: #ff8a6b;
          font-size: 0.85rem;
          font-weight: 500;
          border: 1px solid rgba(231, 111, 81, 0.25);
        }
        .register-link {
          background: none;
          border: none;
          color: #7ed957;
          font-weight: 600;
          font-family: inherit;
          font-size: inherit;
          cursor: pointer;
          padding: 0;
          text-decoration: none;
          transition: opacity 0.2s ease;
        }
        .register-link:hover { opacity: 0.8; text-decoration: underline; }
        .floating-icon {
          position: absolute;
          width: 52px;
          height: 52px;
          border-radius: 12px;
          background: rgba(126, 217, 87, 0.15);
          border: 1px solid rgba(126, 217, 87, 0.3);
          backdrop-filter: blur(8px);
          -webkit-backdrop-filter: blur(8px);
          display: flex;
          align-items: center;
          justify-content: center;
          color: #7ed957;
          z-index: 3;
          box-shadow: 0 4px 16px rgba(126, 217, 87, 0.15);
          transition: transform 0.3s ease, box-shadow 0.3s ease;
          animation: floatYSmooth 4s ease-in-out infinite;
        }
        .floating-icon:hover {
          transform: scale(1.1);
          box-shadow: 0 6px 24px rgba(126, 217, 87, 0.45);
        }
        .email-pill {
          display: inline-flex;
          align-items: center;
          gap: 0.5rem;
          padding: 0.4rem 0.45rem 0.4rem 0.85rem;
          border-radius: 999px;
          background: rgba(126, 217, 87, 0.1);
          border: 1px solid rgba(126, 217, 87, 0.25);
          color: #ffffff;
          font-size: 0.85rem;
          max-width: 100%;
          align-self: flex-start;
        }
        .email-pill > span {
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
          max-width: 280px;
        }
        .email-pill > button {
          background: rgba(255, 255, 255, 0.08);
          border: none;
          color: rgba(255, 255, 255, 0.8);
          width: 24px;
          height: 24px;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          font-size: 1.1rem;
          line-height: 1;
          padding: 0;
          transition: all 0.15s ease;
          flex-shrink: 0;
        }
        .email-pill > button:hover {
          background: rgba(126, 217, 87, 0.25);
          color: #7ed957;
        }
        .change-mail-link {
          background: none;
          border: none;
          color: rgba(255, 255, 255, 0.6);
          font-family: inherit;
          font-size: 0.8rem;
          cursor: pointer;
          padding: 0.4rem 0;
          margin-top: 0.25rem;
          transition: color 0.2s ease;
        }
        .change-mail-link:hover { color: #7ed957; }
        .spinner {
          width: 38px;
          height: 38px;
          border: 3.5px solid rgba(126, 217, 87, 0.15);
          border-top-color: #7ed957;
          border-radius: 50%;
          animation: spin360 0.85s linear infinite;
        }
        .check-pop {
          animation: checkPop 0.45s cubic-bezier(0.22, 1, 0.36, 1) both;
        }
      `}</style>

      {/* FONDO oscuro con líneas diagonales, grid y blobs */}
      <div style={styles.bg}>
        <div style={styles.bgBase} />
        <div style={styles.bgRadial} />
        <svg style={styles.bgDiagLeft} viewBox="0 0 200 1000" preserveAspectRatio="none">
          {Array.from({ length: 30 }).map((_, i) => (
            <line
              key={i}
              x1={-100 + i * 12}
              y1="0"
              x2={-100 + i * 12 + 1000}
              y2="1000"
              stroke="rgba(126, 217, 87, 0.1)"
              strokeWidth="1"
            />
          ))}
        </svg>
        <svg style={styles.bgDiagRight} viewBox="0 0 200 1000" preserveAspectRatio="none">
          {Array.from({ length: 30 }).map((_, i) => (
            <line
              key={i}
              x1={100 + i * 12}
              y1="0"
              x2={100 + i * 12 - 1000}
              y2="1000"
              stroke="rgba(126, 217, 87, 0.1)"
              strokeWidth="1"
            />
          ))}
        </svg>
        <svg style={styles.bgGrid} viewBox="0 0 100 100" preserveAspectRatio="none">
          <defs>
            <pattern id="gridDark" width="8" height="8" patternUnits="userSpaceOnUse">
              <path d="M 8 0 L 0 0 0 8" fill="none" stroke="rgba(126, 217, 87, 0.05)" strokeWidth="0.3" />
            </pattern>
          </defs>
          <rect width="100" height="100" fill="url(#gridDark)" />
        </svg>
        <motion.div
          style={{
            ...styles.bgBlob1,
            x: mouse.x * 30,
            y: mouse.y * 30,
            transition: 'transform 0.6s cubic-bezier(0.22, 1, 0.36, 1)'
          }}
        />
        <motion.div
          style={{
            ...styles.bgBlob2,
            x: mouse.x * -40,
            y: mouse.y * -40,
            transition: 'transform 0.6s cubic-bezier(0.22, 1, 0.36, 1)'
          }}
        />
      </div>

      {/* CONTENIDO */}
      <div style={styles.layout}>
        {/* COLUMNA IZQUIERDA — Branding + Logo con iconos flotantes */}
        <div style={styles.topSection}>
          <div style={styles.brandGrid}>
            {/* Branding izquierdo */}
            <motion.div
              style={styles.brandText}
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
            >
              <span className="tag-pill">
                <Sparkles size={12} /> Plataforma SaaS Multi-Local
              </span>
              <h1 style={styles.brandTitle}>
                Sistema Integral
                <br />
                <span style={styles.brandTitleAccent}>de Ventas</span>
              </h1>
              <div style={styles.brandAccent} />
              <p style={styles.brandDesc}>
                La solución completa para administrar tu negocio
                de forma simple, rápida y efectiva.
              </p>

              <div style={styles.featureList}>
                {[
                  { Icon: BarChart3,   t: 'Gestión Inteligente', s: 'Control total de tu negocio' },
                  { Icon: User,        t: 'Multi-Local',         s: 'Administra todas tus sedes' },
                  { Icon: Shield,      t: 'Seguro y Confiable',  s: 'Tus datos siempre protegidos' }
                ].map((f, i) => (
                  <motion.div
                    key={i}
                    style={styles.featureItem}
                    initial={{ opacity: 0, x: -12 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.2 + i * 0.08, duration: 0.4 }}
                    whileHover={{ x: 4, transition: { duration: 0.2 } }}
                  >
                    <div style={styles.featureIcon}>
                      <f.Icon size={18} color="#7ed957" />
                    </div>
                    <div>
                      <div style={styles.featureTitle}>{f.t}</div>
                      <div style={styles.featureSubtitle}>{f.s}</div>
                    </div>
                  </motion.div>
                ))}
              </div>
            </motion.div>

            {/* Logo + iconos flotantes */}
            <motion.div
              style={styles.logoWrap}
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
            >
              <motion.div
                style={{
                  ...styles.logoSpotlight,
                  x: mouse.x * 50,
                  y: mouse.y * 50,
                  transition: 'transform 0.6s cubic-bezier(0.22, 1, 0.36, 1)'
                }}
              />

              {FLOATING_ICONS.map((it, idx) => {
                const { Icon, dur, delay, ...pos } = it;
                return (
                  <motion.div
                    key={idx}
                    className="floating-icon"
                    style={{
                      ...pos,
                      animationDuration: `${dur}s`,
                      animationDelay: `${delay}s`
                    }}
                    initial={{ opacity: 0, scale: 0.6 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ delay: 0.4 + idx * 0.1, type: 'spring', stiffness: 260, damping: 18 }}
                  >
                    <Icon size={26} strokeWidth={2} />
                  </motion.div>
                );
              })}

              <motion.div
                style={{
                  rotateY: mouse.x * -10,
                  rotateX: mouse.y * 8,
                  transformStyle: 'preserve-3d',
                  transition: 'transform 0.4s cubic-bezier(0.22, 1, 0.36, 1)'
                }}
              >
                <Logo size={320} glow={true} />
              </motion.div>
            </motion.div>
          </div>
        </div>

        {/* CARD INFERIOR — Flujo de 2 pasos */}
<motion.div
              style={styles.cardWrap}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.2, ease: [0.22, 1, 0.36, 1] }}
              style={{ ...styles.cardWrap, backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)', border: '1px solid rgba(255, 255, 255, 0.1)', background: 'rgba(255, 255, 255, 0.02)' }}
            >
          <AnimatePresence mode="wait">
            {step === 'email' && (
              <motion.form
                key="step-email"
                className="login-form"
                onSubmit={handleContinuar}
                initial={{ opacity: 0, x: 40, filter: 'blur(8px)', scale: 0.97 }}
                animate={{ opacity: 1, x: 0, filter: 'blur(0px)', scale: 1 }}
                exit={{ opacity: 0, x: -40, filter: 'blur(8px)', scale: 0.97 }}
                transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
                style={styles.card}
              >
                <div style={styles.cardRow}>
                  <StepHeader
                    icon={<Mail size={22} color="#7ed957" strokeWidth={2.2} />}
                    title="Bienvenido de vuelta"
                    subtitle="Ingresa tu correo para continuar"
                  />

                  <div style={styles.cardRight}>
                    <div className="icon-input-wrap" style={styles.fieldGroup}>
                      <input
                        type="email"
                        className="login-input"
                        placeholder="Correo electrónico"
                        value={correo}
                        onChange={(e) => { setCorreo(e.target.value); setError(''); }}
                        autoComplete="email"
                        required
                      />
                      <Mail size={18} className="field-icon" />
                    </div>

                    {error && (
                      <motion.div
                        className="error-banner"
                        initial={{ opacity: 0, y: -6 }}
                        animate={{ opacity: 1, y: 0 }}
                        style={{ marginTop: '0.25rem' }}
                      >
                        <AlertCircle size={16} /> {error}
                      </motion.div>
                    )}

                    <motion.button
                      type="submit"
                      className="login-primary-btn"
                      style={{ marginTop: '0.5rem' }}
                      whileHover={{ y: -2 }}
                      whileTap={{ scale: 0.98 }}
                    >
                      <span>Continuar</span>
                      <ArrowRight size={18} />
                    </motion.button>
                  </div>
                </div>

                <p style={styles.footer}>
                  ¿No tienes cuenta?{' '}
                  <button type="button" className="register-link" onClick={onSwitchToRegister}>
                    Regístrate aquí
                  </button>
                </p>
                <p style={{ ...styles.footer, marginTop: '0.5rem' }}>
                  <Link to="/recuperar-password" style={{ color: 'rgba(126, 217, 87, 0.85)', fontSize: '0.85rem', textDecoration: 'none' }}>
                    ¿Olvidaste tu contraseña?
                  </Link>
                </p>
                <p style={{ ...styles.footer, marginTop: '0.5rem' }}>
                  <Link to="/terminos" style={{ color: 'rgba(126, 217, 87, 0.6)', fontSize: '0.8rem', textDecoration: 'none' }}>
                    Términos y condiciones
                  </Link>
                </p>
                {/* v1.9.1: Acceso visible al super-admin (solo el dueño del sistema lo usa).
                    Antes era ruta secreta /super-admin y el usuario no encontraba cómo entrar. */}
                <p style={{ ...styles.footer, marginTop: '1rem', borderTop: '1px solid rgba(255,255,255,0.08)', paddingTop: '0.75rem' }}>
                  <Link to="/super-admin" style={{ color: 'rgba(126, 217, 87, 0.5)', fontSize: '0.78rem', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}>
                    <ShieldCheck size={13} /> Acceso Super-Admin (dueño del sistema)
                  </Link>
                </p>
              </motion.form>
            )}

            {step === 'password' && (
              <motion.form
                key="step-password"
                className="login-form"
                onSubmit={handleIniciarSesion}
                initial={{ opacity: 0, x: 40, filter: 'blur(8px)', scale: 0.97 }}
                animate={{ opacity: 1, x: 0, filter: 'blur(0px)', scale: 1 }}
                exit={{ opacity: 0, x: -40, filter: 'blur(8px)', scale: 0.97 }}
                transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
                style={styles.card}
              >
                <div style={styles.cardRow}>
                  <StepHeader
                    icon={<Lock size={22} color="#7ed957" strokeWidth={2.2} />}
                    title="Ingresa tu contraseña"
                    subtitle={`Hola, ${correo.split('@')[0]} 👋`}
                  />

                  <div style={styles.cardRight}>
                    <div className="email-pill">
                      <Mail size={14} color="#7ed957" />
                      <span>{correo}</span>
                      <button type="button" onClick={handleVolver} aria-label="Cambiar correo">×</button>
                    </div>

                    <div className="icon-input-wrap" style={styles.fieldGroup}>
                      <input
                        type={mostrarPass ? 'text' : 'password'}
                        className="login-input"
                        placeholder="Contraseña"
                        value={contrasena}
                        onChange={(e) => { setContrasena(e.target.value); setError(''); }}
                        autoComplete="current-password"
                        required
                      />
                      <Lock size={18} className="field-icon" />
                      <button
                        type="button"
                        className="toggle-pass"
                        onClick={() => setMostrarPass(v => !v)}
                        tabIndex={-1}
                        aria-label={mostrarPass ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                      >
                        {mostrarPass ? <EyeOff size={18} /> : <Eye size={18} />}
                      </button>
                    </div>

                    {error && (
                      <motion.div
                        className="error-banner"
                        initial={{ opacity: 0, y: -6 }}
                        animate={{ opacity: 1, y: 0 }}
                        style={{ marginTop: '0.25rem' }}
                      >
                        <AlertCircle size={16} /> {error}
                      </motion.div>
                    )}

                    <motion.button
                      type="submit"
                      className="login-primary-btn"
                      style={{ marginTop: '0.5rem' }}
                      whileHover={{ y: -2 }}
                      whileTap={{ scale: 0.98 }}
                    >
                      <Lock size={18} />
                      <span>Iniciar sesión</span>
                      <ArrowRight size={18} />
                    </motion.button>

                    <button type="button" className="change-mail-link" onClick={handleVolver}>
                      ← Cambiar correo
                    </button>
                  </div>
                </div>
              </motion.form>
            )}

            {step === 'loading' && (
              <motion.div
                key="step-loading"
                className="login-form"
                initial={{ opacity: 0, scale: 0.95, filter: 'blur(6px)' }}
                animate={{ opacity: 1, scale: 1, filter: 'blur(0px)' }}
                exit={{ opacity: 0, scale: 0.95, filter: 'blur(6px)' }}
                transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
                style={{ ...styles.card, ...styles.loadingCard }}
              >
                {success ? (
                  <>
                    <div
                      className="check-pop"
                      style={{
                        ...styles.checkWrap,
                        background: 'rgba(126, 217, 87, 0.15)',
                        borderColor: 'rgba(126, 217, 87, 0.4)'
                      }}
                    >
                      <CheckCircle2 size={36} color="#7ed957" strokeWidth={2.2} />
                    </div>
                    <h3 style={styles.loadingTitle}>¡Bienvenido!</h3>
                    <p style={styles.loadingSubtitle}>Ingresando al sistema…</p>
                  </>
                ) : (
                  <>
                    <div className="spinner" />
                    <h3 style={styles.loadingTitle}>Verificando credenciales</h3>
                    <p style={styles.loadingSubtitle}>Un momento por favor…</p>
                  </>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>
      </div>

      {/* FOOTER — Crédito del autor */}
      <div style={styles.devFooter}>
        <span style={styles.devFooterSep}>✦</span>
        Desarrollado por Andrés Cuesta
        <span style={styles.devFooterSep}>✦</span>
      </div>
    </div>
  );
};

/* ─────────────────────────────────────────────────────────
   Estilos inline
   ───────────────────────────────────────────────────────── */
const styles = {
  page: {
    position: 'relative',
    minHeight: '100vh',
    width: '100%',
    overflow: 'hidden',
    fontFamily: "'Inter', system-ui, -apple-system, sans-serif",
    background: '#0a1a0e',
    color: '#ffffff'
  },

  // Fondo
  bg: {
    position: 'absolute',
    inset: 0,
    zIndex: 0,
    overflow: 'hidden',
    pointerEvents: 'none'
  },
  bgBase: {
    position: 'absolute',
    inset: 0,
    background: 'linear-gradient(180deg, #0a1a0e 0%, #0d2412 50%, #0a1a0e 100%)'
  },
  bgRadial: {
    position: 'absolute',
    inset: 0,
    background: 'radial-gradient(circle at center, rgba(126, 217, 87, 0.08) 0%, transparent 70%)'
  },
  bgDiagLeft: {
    position: 'absolute',
    top: 0,
    left: 0,
    width: '260px',
    height: '100%',
    opacity: 0.4,
    pointerEvents: 'none'
  },
  bgDiagRight: {
    position: 'absolute',
    top: 0,
    right: 0,
    width: '260px',
    height: '100%',
    opacity: 0.4,
    pointerEvents: 'none'
  },
  bgGrid: {
    position: 'absolute',
    inset: 0,
    width: '100%',
    height: '100%',
    opacity: 0.6,
    pointerEvents: 'none'
  },
  bgBlob1: {
    position: 'absolute',
    top: '-10%',
    right: '-10%',
    width: '500px',
    height: '500px',
    borderRadius: '50%',
    background: 'radial-gradient(circle, rgba(126, 217, 87, 0.18) 0%, transparent 70%)',
    filter: 'blur(40px)'
  },
  bgBlob2: {
    position: 'absolute',
    bottom: '-15%',
    left: '-10%',
    width: '450px',
    height: '450px',
    borderRadius: '50%',
    background: 'radial-gradient(circle, rgba(90, 184, 70, 0.14) 0%, transparent 70%)',
    filter: 'blur(40px)'
  },

  // Layout
  layout: {
    position: 'relative',
    zIndex: 1,
    display: 'flex',
    flexDirection: 'column',
    minHeight: '100vh',
    padding: '2.5rem 4rem 5rem',
    gap: '2rem'
  },
  topSection: {
    flex: 1,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center'
  },
  brandGrid: {
    display: 'grid',
    gridTemplateColumns: '1.05fr 1fr',
    alignItems: 'center',
    gap: '3rem',
    width: '100%',
    maxWidth: '1200px'
  },

  // Branding
  brandText: {
    maxWidth: '520px',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'flex-start'
  },
  brandTitle: {
    fontSize: '2.6rem',
    fontWeight: 900,
    color: '#ffffff',
    lineHeight: 1.05,
    margin: '1rem 0 0.6rem',
    letterSpacing: '-1.5px'
  },
  brandTitleAccent: {
    background: 'linear-gradient(135deg, #7ed957 0%, #b6f08a 100%)',
    WebkitBackgroundClip: 'text',
    WebkitTextFillColor: 'transparent',
    backgroundClip: 'text'
  },
  brandAccent: {
    width: '60px',
    height: '3px',
    background: 'linear-gradient(90deg, #7ed957, transparent)',
    borderRadius: '2px',
    margin: '0.4rem 0 1rem'
  },
  brandDesc: {
    fontSize: '1.02rem',
    color: 'rgba(255, 255, 255, 0.65)',
    lineHeight: 1.55,
    margin: 0
  },
  featureList: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.55rem',
    marginTop: '1.5rem',
    width: '100%'
  },
  featureItem: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.85rem',
    padding: '0.6rem 0.85rem',
    borderRadius: '12px',
    background: 'rgba(126, 217, 87, 0.06)',
    border: '1px solid rgba(126, 217, 87, 0.15)',
    backdropFilter: 'blur(8px)',
    WebkitBackdropFilter: 'blur(8px)',
    cursor: 'default'
  },
  featureIcon: {
    width: '34px',
    height: '34px',
    borderRadius: '9px',
    background: 'rgba(126, 217, 87, 0.12)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0
  },
  featureTitle: {
    fontSize: '0.88rem',
    fontWeight: 600,
    color: '#ffffff'
  },
  featureSubtitle: {
    fontSize: '0.75rem',
    color: 'rgba(255, 255, 255, 0.55)',
    marginTop: '0.05rem'
  },

  // Logo + iconos flotantes
  logoWrap: {
    position: 'relative',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: '360px',
    perspective: '1000px'
  },
  logoSpotlight: {
    position: 'absolute',
    top: '50%',
    left: '50%',
    width: '440px',
    height: '440px',
    marginTop: '-220px',
    marginLeft: '-220px',
    borderRadius: '50%',
    background: 'radial-gradient(circle, rgba(126, 217, 87, 0.32) 0%, rgba(126, 217, 87, 0.12) 35%, transparent 70%)',
    filter: 'blur(30px)',
    pointerEvents: 'none',
    zIndex: -1
  },

  // Card de login
  cardWrap: {
    width: '100%',
    maxWidth: '900px',
    margin: '0 auto'
  },
  card: {
    background: 'rgba(20, 40, 25, 0.6)',
    backdropFilter: 'blur(16px)',
    WebkitBackdropFilter: 'blur(16px)',
    borderRadius: '20px',
    padding: '1.75rem 2rem 1.5rem',
    border: '1px solid rgba(126, 217, 87, 0.15)',
    boxShadow: '0 10px 40px rgba(0, 0, 0, 0.35), 0 0 0 1px rgba(126, 217, 87, 0.05) inset',
    margin: 0
  },
  cardRow: {
    display: 'grid',
    gridTemplateColumns: '1fr 1.4fr',
    gap: '1.75rem',
    alignItems: 'center'
  },
  cardLeft: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.9rem'
  },
  shieldWrap: {
    width: '52px',
    height: '52px',
    borderRadius: '14px',
    background: 'rgba(126, 217, 87, 0.12)',
    border: '1px solid rgba(126, 217, 87, 0.3)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    boxShadow: '0 0 20px rgba(126, 217, 87, 0.2)'
  },
  cardTitle: {
    fontSize: '1.3rem',
    fontWeight: 700,
    color: '#ffffff',
    margin: 0,
    letterSpacing: '-0.4px'
  },
  cardSubtitle: {
    fontSize: '0.85rem',
    color: 'rgba(255, 255, 255, 0.55)',
    margin: '0.25rem 0 0'
  },
  cardRight: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.65rem'
  },
  fieldGroup: {
    position: 'relative'
  },
  footer: {
    textAlign: 'center',
    fontSize: '0.88rem',
    color: 'rgba(255, 255, 255, 0.6)',
    marginTop: '1.25rem',
    marginBottom: 0
  },

  // Loading
  loadingCard: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '1rem',
    padding: '3rem 2rem',
    minHeight: '220px'
  },
  checkWrap: {
    width: '72px',
    height: '72px',
    borderRadius: '50%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    border: '1px solid'
  },
  loadingTitle: {
    fontSize: '1.1rem',
    fontWeight: 700,
    color: '#ffffff',
    margin: 0
  },
  loadingSubtitle: {
    fontSize: '0.88rem',
    color: 'rgba(255, 255, 255, 0.6)',
    margin: 0
  },

  // Footer del autor
  devFooter: {
    position: 'absolute',
    bottom: '1.1rem',
    left: 0,
    right: 0,
    textAlign: 'center',
    fontSize: '0.75rem',
    color: 'rgba(255, 255, 255, 0.4)',
    zIndex: 2,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '0.6rem',
    letterSpacing: '0.2px',
    pointerEvents: 'none'
  },
  devFooterSep: {
    color: '#7ed957',
    opacity: 0.7,
    fontSize: '0.65rem'
  }
};

export default Login;
