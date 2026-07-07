import { useState } from 'react';

const Login = ({ onLogin }) => {
  const [step, setStep] = useState('email'); // 'email' | 'password'
  const [correo, setCorreo] = useState('');
  const [contrasena, setContrasena] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [flipping, setFlipping] = useState(false);

  const handleEmailNext = (e) => {
    e.preventDefault();
    if (!correo) return setError('Ingresa tu correo electrónico.');
    setError('');
    setFlipping(true);
    setTimeout(() => {
      setStep('password');
      setFlipping(false);
    }, 400);
  };

  const handleLogin = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const res = await fetch('http://localhost:3000/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ correo, contrasena }),
      });
      const data = await res.json();
      if (res.ok) {
        onLogin(data);
      } else {
        setError(data.error || 'Credenciales incorrectas.');
      }
    } catch {
      setError('No se pudo conectar al servidor.');
    } finally {
      setLoading(false);
    }
  };

  const handleBack = () => {
    setFlipping(true);
    setTimeout(() => {
      setStep('email');
      setFlipping(false);
      setError('');
    }, 400);
  };

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&display=swap');

        .login-root {
          min-height: 100vh;
          display: flex;
          align-items: center;
          justify-content: center;
          font-family: 'Inter', sans-serif;
          background: linear-gradient(135deg, #0f1923 0%, #1a2d3d 40%, #0d2137 100%);
          position: relative;
          overflow: hidden;
        }

        /* Animated background orbs */
        .login-root::before {
          content: '';
          position: absolute;
          width: 600px;
          height: 600px;
          border-radius: 50%;
          background: radial-gradient(circle, rgba(42,157,143,0.15) 0%, transparent 70%);
          top: -200px;
          right: -100px;
          animation: floatOrb 8s ease-in-out infinite;
        }
        .login-root::after {
          content: '';
          position: absolute;
          width: 400px;
          height: 400px;
          border-radius: 50%;
          background: radial-gradient(circle, rgba(38,70,83,0.3) 0%, transparent 70%);
          bottom: -100px;
          left: -100px;
          animation: floatOrb 10s ease-in-out infinite reverse;
        }

        @keyframes floatOrb {
          0%, 100% { transform: translateY(0px) scale(1); }
          50% { transform: translateY(-30px) scale(1.05); }
        }

        /* Grid lines background */
        .grid-bg {
          position: absolute;
          inset: 0;
          background-image: 
            linear-gradient(rgba(42,157,143,0.05) 1px, transparent 1px),
            linear-gradient(90deg, rgba(42,157,143,0.05) 1px, transparent 1px);
          background-size: 60px 60px;
        }

        .login-container {
          position: relative;
          z-index: 10;
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 2rem;
          width: 100%;
          padding: 2rem;
        }

        /* Logo & Brand */
        .login-brand {
          text-align: center;
          animation: slideDown 0.6s ease;
        }
        .login-logo {
          width: 64px;
          height: 64px;
          background: linear-gradient(135deg, #2A9D8F, #3dbba9);
          border-radius: 18px;
          display: flex;
          align-items: center;
          justify-content: center;
          margin: 0 auto 1rem auto;
          font-size: 2rem;
          box-shadow: 0 8px 32px rgba(42,157,143,0.4);
        }
        .login-brand h1 {
          color: white;
          font-size: 1.8rem;
          font-weight: 800;
          letter-spacing: -0.5px;
        }
        .login-brand p {
          color: rgba(255,255,255,0.4);
          font-size: 0.9rem;
          margin-top: 0.25rem;
        }

        /* Card 3D */
        .card-scene {
          perspective: 1000px;
          width: 420px;
          max-width: 100%;
        }
        .card-3d {
          width: 100%;
          transition: transform 0.4s cubic-bezier(0.4, 0, 0.2, 1), opacity 0.3s ease;
          transform-style: preserve-3d;
        }
        .card-3d.flipping-out {
          transform: translateX(-60px) rotateY(-15deg);
          opacity: 0;
        }
        .card-3d.flipping-in {
          transform: translateX(60px) rotateY(15deg);
          opacity: 0;
        }

        .login-card {
          background: rgba(255,255,255,0.05);
          backdrop-filter: blur(20px);
          -webkit-backdrop-filter: blur(20px);
          border: 1px solid rgba(255,255,255,0.1);
          border-radius: 24px;
          padding: 2.5rem;
          box-shadow: 0 25px 50px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.1);
          animation: slideUp 0.5s ease;
        }

        @keyframes slideDown {
          from { transform: translateY(-20px); opacity: 0; }
          to { transform: translateY(0); opacity: 1; }
        }
        @keyframes slideUp {
          from { transform: translateY(20px); opacity: 0; }
          to { transform: translateY(0); opacity: 1; }
        }

        /* Step indicator */
        .step-indicator {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          margin-bottom: 2rem;
        }
        .step-dot {
          width: 8px;
          height: 8px;
          border-radius: 50%;
          background: rgba(255,255,255,0.2);
          transition: all 0.3s ease;
        }
        .step-dot.active {
          background: #2A9D8F;
          width: 24px;
          border-radius: 4px;
          box-shadow: 0 0 8px rgba(42,157,143,0.6);
        }

        .login-card h2 {
          color: white;
          font-size: 1.4rem;
          font-weight: 700;
          margin-bottom: 0.5rem;
        }
        .login-card .subtitle {
          color: rgba(255,255,255,0.45);
          font-size: 0.9rem;
          margin-bottom: 2rem;
          line-height: 1.5;
        }

        /* Email preview chip */
        .email-chip {
          display: flex;
          align-items: center;
          gap: 0.75rem;
          background: rgba(42,157,143,0.15);
          border: 1px solid rgba(42,157,143,0.3);
          border-radius: 12px;
          padding: 0.75rem 1rem;
          margin-bottom: 1.5rem;
        }
        .email-chip-avatar {
          width: 36px;
          height: 36px;
          background: linear-gradient(135deg, #2A9D8F, #264653);
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 1rem;
          font-weight: 700;
          color: white;
          flex-shrink: 0;
        }
        .email-chip-text {
          flex: 1;
          overflow: hidden;
        }
        .email-chip-text span {
          display: block;
          color: rgba(255,255,255,0.5);
          font-size: 0.75rem;
        }
        .email-chip-text strong {
          display: block;
          color: white;
          font-size: 0.9rem;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .email-chip-edit {
          background: none;
          border: none;
          color: #2A9D8F;
          font-size: 0.8rem;
          cursor: pointer;
          padding: 0;
          white-space: nowrap;
        }

        /* Input */
        .login-input-group {
          position: relative;
          margin-bottom: 1.25rem;
        }
        .login-input-group label {
          display: block;
          color: rgba(255,255,255,0.6);
          font-size: 0.85rem;
          font-weight: 500;
          margin-bottom: 0.5rem;
        }
        .login-input {
          width: 100%;
          background: rgba(255,255,255,0.07);
          border: 1px solid rgba(255,255,255,0.12);
          border-radius: 12px;
          padding: 0.9rem 1rem;
          color: white;
          font-size: 1rem;
          font-family: 'Inter', sans-serif;
          transition: all 0.2s ease;
          outline: none;
          box-sizing: border-box;
        }
        .login-input::placeholder {
          color: rgba(255,255,255,0.25);
        }
        .login-input:focus {
          border-color: #2A9D8F;
          background: rgba(42,157,143,0.08);
          box-shadow: 0 0 0 3px rgba(42,157,143,0.15);
        }

        /* Error */
        .login-error {
          background: rgba(231,111,81,0.15);
          border: 1px solid rgba(231,111,81,0.3);
          border-radius: 10px;
          padding: 0.75rem 1rem;
          color: #f4a08a;
          font-size: 0.88rem;
          margin-bottom: 1rem;
          display: flex;
          align-items: center;
          gap: 0.5rem;
        }

        /* Button */
        .login-btn {
          width: 100%;
          background: linear-gradient(135deg, #2A9D8F, #228075);
          color: white;
          border: none;
          border-radius: 12px;
          padding: 1rem;
          font-size: 1rem;
          font-weight: 600;
          font-family: 'Inter', sans-serif;
          cursor: pointer;
          transition: all 0.2s ease;
          position: relative;
          overflow: hidden;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 0.5rem;
        }
        .login-btn::before {
          content: '';
          position: absolute;
          inset: 0;
          background: linear-gradient(135deg, rgba(255,255,255,0.15), transparent);
          opacity: 0;
          transition: opacity 0.2s;
        }
        .login-btn:hover::before { opacity: 1; }
        .login-btn:hover { transform: translateY(-1px); box-shadow: 0 8px 20px rgba(42,157,143,0.4); }
        .login-btn:active { transform: translateY(0); }
        .login-btn:disabled { opacity: 0.6; cursor: not-allowed; transform: none; }

        /* Spinner */
        .spinner {
          width: 18px;
          height: 18px;
          border: 2px solid rgba(255,255,255,0.3);
          border-top-color: white;
          border-radius: 50%;
          animation: spin 0.8s linear infinite;
        }
        @keyframes spin { to { transform: rotate(360deg); } }

        /* Divider for link to register */
        .login-footer-links {
          text-align: center;
          margin-top: 1.5rem;
          color: rgba(255,255,255,0.35);
          font-size: 0.85rem;
        }
        .login-footer-links a {
          color: #2A9D8F;
          text-decoration: none;
          font-weight: 500;
        }
        .login-footer-links a:hover { text-decoration: underline; }

        /* Developer credit */
        .dev-credit {
          text-align: center;
          color: rgba(255,255,255,0.2);
          font-size: 0.78rem;
          letter-spacing: 0.5px;
          animation: slideDown 0.8s ease 0.3s both;
          display: flex;
          align-items: center;
          gap: 0.4rem;
        }
        .dev-credit span {
          color: rgba(42,157,143,0.7);
          font-weight: 600;
        }
      `}</style>

      <div className="login-root">
        <div className="grid-bg" />

        <div className="login-container">
          {/* Brand */}
          <div className="login-brand">
            <div className="login-logo">🏪</div>
            <h1>Sistema Integral de Ventas</h1>
            <p>Plataforma SaaS Multi-Local</p>
          </div>

          {/* 3D Card */}
          <div className="card-scene">
            <div className={`card-3d ${flipping ? 'flipping-out' : ''}`}>
              <div className="login-card">
                {/* Step Indicator */}
                <div className="step-indicator">
                  <div className={`step-dot ${step === 'email' ? 'active' : ''}`} />
                  <div className={`step-dot ${step === 'password' ? 'active' : ''}`} />
                </div>

                {step === 'email' ? (
                  <form onSubmit={handleEmailNext}>
                    <h2>¡Bienvenido! 👋</h2>
                    <p className="subtitle">Ingresa tu correo para continuar al sistema.</p>
                    
                    {error && (
                      <div className="login-error">⚠️ {error}</div>
                    )}

                    <div className="login-input-group">
                      <label>Correo Electrónico</label>
                      <input
                        className="login-input"
                        type="email"
                        placeholder="tu@correo.com"
                        value={correo}
                        onChange={e => setCorreo(e.target.value)}
                        autoFocus
                        required
                      />
                    </div>

                    <button type="submit" className="login-btn">
                      Continuar →
                    </button>

                    <div className="login-footer-links">
                      ¿No tienes cuenta? <a href="/registro">Regístrate aquí</a>
                    </div>
                  </form>
                ) : (
                  <form onSubmit={handleLogin}>
                    <h2>Ingresa tu contraseña 🔐</h2>
                    <p className="subtitle">Verifica tu identidad para acceder a tu sede.</p>

                    {/* Email chip */}
                    <div className="email-chip">
                      <div className="email-chip-avatar">
                        {correo[0]?.toUpperCase() || '?'}
                      </div>
                      <div className="email-chip-text">
                        <span>Iniciando sesión como</span>
                        <strong>{correo}</strong>
                      </div>
                      <button type="button" className="email-chip-edit" onClick={handleBack}>
                        Cambiar
                      </button>
                    </div>

                    {error && (
                      <div className="login-error">⚠️ {error}</div>
                    )}

                    <div className="login-input-group">
                      <label>Contraseña</label>
                      <input
                        className="login-input"
                        type="password"
                        placeholder="••••••••••"
                        value={contrasena}
                        onChange={e => setContrasena(e.target.value)}
                        autoFocus
                        required
                      />
                    </div>

                    <button type="submit" className="login-btn" disabled={loading}>
                      {loading ? <><div className="spinner" /> Verificando...</> : 'Entrar al Sistema'}
                    </button>
                  </form>
                )}
              </div>
            </div>
          </div>

          {/* Developer Credit */}
          <div className="dev-credit">
            ✦ Diseñado y desarrollado por <span>Andrés Cuesta</span> ✦
          </div>
        </div>
      </div>
    </>
  );
};

export default Login;
