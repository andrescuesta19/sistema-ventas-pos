import React from 'react';
import { API_URL } from './config';
import { getToken, getUser, clearSession, apiGet } from './api';
import { useState, useEffect } from 'react';
import { ThemeProvider } from './ThemeContext';
import { Routes, Route, Navigate, Link, useLocation, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard,
  ShoppingCart,
  FileText,
  Package,
  Calculator,
  Users,
  ChevronDown,
  Receipt,
  Settings,
  Building2,
  Wallet,
  UserCircle2,
  Store,
  FileSpreadsheet,
  Headphones
} from 'lucide-react';
import Login from './pages/Login';
import Registro from './pages/Registro';
import Dashboard from './pages/Dashboard';
import POS from './pages/POS';
import CierreCaja from './pages/CierreCaja';
import Inventario from './pages/Inventario';
import Historial from './pages/Historial';
import Facturas from './pages/Facturas';
import Clientes from './pages/Clientes';
import PanelUsuarios from './pages/PanelUsuarios';
import Configuracion from './pages/Configuracion';
import RecuperarPassword from './pages/RecuperarPassword';
import SuperAdmin from './pages/SuperAdmin';
import Proveedores from './pages/Proveedores';
import Caja from './pages/Caja';
import Nomina from './pages/Nomina';
import Ecommerce from './pages/Ecommerce';
import Cotizaciones from './pages/Cotizaciones';
import Terminos from './pages/Terminos';
import AtencionCliente from './pages/AtencionCliente';
import Header from './components/Header';
import Logo from './components/Logo';
import UpdateNotification from './components/UpdateNotification';
import { formatearFechaHoraCO, formatearFechaLargaCO } from './utils/dateCO';

/* ─────────────────────────────────────────────────────────
   Liquid Glass — efecto Apple "frosted glass"
   ───────────────────────────────────────────────────────── */
  const glassStyle = {
    border: '1px solid var(--border-soft)',
    background: 'var(--bg-card)',
  };
class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null, info: null };
  }
  static getDerivedStateFromError(error) {
    return { error };
  }
  componentDidCatch(error, info) {
    // v1.5.4: el detalle técnico (stack, rutas) solo va a consola —
    // no se muestra al usuario. Evita info disclosure (rutas internas).
    console.error('[ErrorBoundary] Crash capturado:', error, info);
    this.setState({ error });
  }
  render() {
    if (!this.state.error) return this.props.children;
    // v1.5.4: mensaje genérico al usuario. El admin puede ver los detalles
    // en la consola del navegador (DevTools). En producción iría a Sentry/etc.
    const devMode = typeof process !== 'undefined' && process.env && process.env.NODE_ENV === 'development';
    return (
      <div style={{
        minHeight: '100vh',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: '#0a1a0e', color: '#f8fafc',
        fontFamily: 'Inter, system-ui, sans-serif',
        padding: '2rem',
      }}>
        <div style={{ maxWidth: 600, width: '100%', textAlign: 'center' }}>
          <div style={{
            fontSize: '3rem', marginBottom: '1rem',
          }}>⚠️</div>
          <h1 style={{ fontSize: '1.4rem', fontWeight: 700, color: '#7ed957', margin: '0 0 0.5rem' }}>
            Algo se rompió en la app
          </h1>
          <p style={{ color: 'rgba(255,255,255,0.7)', fontSize: '0.9rem', marginBottom: '1.5rem' }}>
            No te preocupes: tus datos están guardados. Recarga la página y sigue trabajando.
            Si el problema persiste, contacta al soporte.
          </p>
          {devMode && (
            <pre style={{
              background: 'rgba(255,255,255,0.05)',
              border: '1px solid rgba(255,255,255,0.1)',
              borderRadius: 8,
              padding: '1rem',
              textAlign: 'left',
              fontSize: '0.78rem',
              color: '#fca5a5',
              overflow: 'auto',
              maxHeight: 200,
              marginBottom: '1.5rem',
            }}>
              {String(this.state.error?.message || this.state.error)}
            </pre>
          )}
          <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'center', flexWrap: 'wrap' }}>
            <button
              onClick={() => window.location.reload()}
              style={{
                background: '#7ed957', color: '#0a1a0e',
                border: 'none', padding: '0.75rem 1.5rem',
                borderRadius: 10, fontSize: '0.95rem',
                fontWeight: 700, cursor: 'pointer',
                fontFamily: 'inherit',
              }}
            >
              Recargar la app
            </button>
            <button
              onClick={() => { try { localStorage.clear(); } catch {} window.location.href = '/login'; }}
              style={{
                background: 'transparent', color: '#7ed957',
                border: '1px solid #7ed957', padding: '0.75rem 1.5rem',
                borderRadius: 10, fontSize: '0.95rem',
                fontWeight: 600, cursor: 'pointer',
                fontFamily: 'inherit',
              }}
            >
              Volver al inicio
            </button>
          </div>
        </div>
      </div>
    );
  }
}
const Reloj = () => {
  const [fechaHora, setFechaHora] = useState(() => {
    const f = formatearFechaHoraCO(new Date());
    const fl = formatearFechaLargaCO(new Date());
    return { hora: f, fecha: fl };
  });

  useEffect(() => {
    // Actualizar cada 30s (suficiente para el header, evita parpadeo)
    const tick = setInterval(() => {
      const f = formatearFechaHoraCO(new Date());
      const fl = formatearFechaLargaCO(new Date());
      setFechaHora({ hora: f, fecha: fl });
    }, 30000);
    return () => clearInterval(tick);
  }, []);

  return (
    <div
      data-testid="topbar-clock"
      title="Hora de Colombia (America/Bogota)"
    >
      <span style={{ fontWeight: 600 }}>{fechaHora.fecha}</span>
      <span style={{ margin: '0 0.5rem', opacity: 0.5 }}>·</span>
      <span style={{ fontVariantNumeric: 'tabular-nums' }}>{fechaHora.hora}</span>
    </div>
  );
};

const AppLayout = ({ children, user, onLogout, onSwitchUser, notifCount = 0 }) => {
  const location = useLocation();

  // v1.5.4: código muerto del modal de relevo eliminado (logout ahora está en
  // el header global). Si en el futuro se quiere restaurar, buscar en git
  // el commit previo a este fix.

  const navItems = [
    { to: '/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
    { to: '/pos', icon: ShoppingCart, label: 'Ventas' },
    { to: '/inventario', icon: Package, label: 'Productos' },
    { to: '/clientes', icon: Users, label: 'Clientes' },
    { to: '/proveedores', icon: Building2, label: 'Proveedores' },
    { to: '/historial', icon: FileText, label: 'Reportes' },
    { to: '/cotizaciones', icon: FileSpreadsheet, label: 'Cotizaciones' },
    { to: '/atencion-cliente', icon: Headphones, label: 'Atención al Cliente' },
    { to: '/facturas', icon: Receipt, label: 'Facturas DIAN' },
    { to: '/nomina', icon: UserCircle2, label: 'Nómina' },
    { to: '/caja', icon: Wallet, label: 'Caja y Bancos' },
    { to: '/cierre', icon: Calculator, label: 'Cierre de Caja' },
    { to: '/ecommerce', icon: Store, label: 'E-commerce' },
  ];
  // v1.5.3: El cliente SÍ ve Configuración (perfil, cambiar contraseña, modo oscuro).
  // Gestión de Usuarios sigue siendo solo del super-admin.
  navItems.push({ to: '/configuracion', icon: Settings, label: 'Configuración' });

  return (
    <div className="app-container">
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap');

        .app-container {
          font-family: 'Inter', system-ui, -apple-system, sans-serif;
        }

        .sidebar {
          width: 240px;
          background: var(--bg-sidebar);
          color: var(--text-primary);
          display: flex;
          flex-direction: column;
          border-right: 1px solid var(--border-soft);
          flex-shrink: 0;
        }

        .sidebar-logo-area {
          padding: 1.5rem 1rem 1.25rem;
          display: flex;
          flex-direction: column;
          align-items: center;
          border-bottom: 1px solid var(--border-light);
        }
        .sidebar-logo-text {
          text-align: center;
          margin-top: 0.65rem;
        }
        .sidebar-logo-text .t1 {
          font-size: 0.95rem;
          font-weight: 800;
          color: var(--text-primary);
          letter-spacing: -0.3px;
          line-height: 1.1;
        }
        .sidebar-logo-text .t2 {
          font-size: 0.85rem;
          font-weight: 700;
          color: var(--green-primary);
          letter-spacing: 0.2px;
          line-height: 1.1;
          margin-top: 2px;
        }
        .sidebar-logo-divider {
          width: 40px;
          height: 3px;
          background: var(--green-primary);
          border-radius: 2px;
          margin-top: 0.85rem;
        }

        .sidebar-nav {
          flex: 1;
          padding: 1rem 0.65rem;
          display: flex;
          flex-direction: column;
          gap: 4px;
          overflow-y: auto;
        }
        .nav-link {
          display: flex;
          align-items: center;
          gap: 0.75rem;
          padding: 0.75rem 0.9rem;
          color: var(--text-secondary);
          text-decoration: none;
          border-radius: 10px;
          font-size: 0.92rem;
          font-weight: 500;
          border-left: 3px solid transparent;
          transition: all 0.18s ease;
        }
        .nav-link:hover {
          background: var(--green-light);
          color: var(--green-primary);
        }
        .nav-link.active {
          background: var(--green-light);
          color: var(--green-primary);
          border-left: 3px solid var(--green-primary);
          font-weight: 600;
        }

        .sidebar-user-card {
          margin: 0.75rem;
          padding: 0.75rem;
          background: var(--green-light);
          border: 1px solid var(--border-soft);
          border-radius: 12px;
          display: flex;
          align-items: center;
          gap: 0.65rem;
          cursor: pointer;
          transition: background 0.2s;
        }
        .sidebar-user-card:hover { background: var(--green-light-strong); }
        .user-avatar {
          width: 36px;
          height: 36px;
          border-radius: 50%;
          background: var(--green-light);
          color: var(--green-primary);
          display: flex;
          align-items: center;
          justify-content: center;
          font-weight: 800;
          font-size: 0.95rem;
          flex-shrink: 0;
          border: 1px solid var(--green-light-strong);
        }
        .user-info { flex: 1; min-width: 0; }
        .user-info .greeting {
          font-size: 0.85rem;
          font-weight: 600;
          color: var(--text-primary);
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .user-info .role {
          font-size: 0.72rem;
          color: var(--green-primary);
          font-weight: 500;
          text-transform: capitalize;
        }

        .main-content {
          flex: 1;
          display: flex;
          flex-direction: column;
          overflow-y: auto;
          background: var(--bg-app);
          min-width: 0;
        }

        .top-bar {
          background: var(--bg-topbar);
          border-bottom: 1px solid var(--border-light);
          padding: 0.85rem 2rem;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 1rem;
          min-height: 64px;
        }
        .top-bar-welcome {
          display: flex;
          flex-direction: column;
          gap: 2px;
          min-width: 0;
        }
        .top-bar-welcome span.greet {
          font-size: 1rem;
          font-weight: 600;
          color: var(--text-primary);
          white-space: nowrap;
        }
        .top-bar-welcome .date-line {
          font-size: 0.78rem;
          color: var(--text-secondary);
          font-weight: 500;
        }

        .top-bar-right {
          display: flex;
          align-items: center;
          gap: 0.75rem;
        }
        .search-box {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          background: var(--bg-app);
          border: 1px solid var(--border-soft);
          border-radius: 10px;
          padding: 0.5rem 0.85rem;
          min-width: 220px;
          transition: all 0.18s ease;
        }
        .search-box:focus-within {
          border-color: var(--green-primary);
          background: white;
          box-shadow: 0 0 0 3px rgba(26, 138, 74, 0.08);
        }
        .search-box input {
          border: none;
          background: transparent;
          padding: 0;
          font-size: 0.85rem;
          color: var(--text-primary);
          outline: none;
          width: 100%;
        }
        .search-box input::placeholder { color: var(--text-muted); }
        .notif-btn {
          position: relative;
          background: var(--bg-card);
          border: 1px solid var(--border-soft);
          color: var(--text-primary);
          width: 40px;
          height: 40px;
          border-radius: 10px;
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          transition: all 0.18s;
        }
        .notif-btn:hover { border-color: var(--green-primary); background: var(--green-light); color: var(--green-primary); }
        .notif-badge {
          position: absolute;
          top: -4px;
          right: -4px;
          background: var(--green-primary);
          color: white;
          font-size: 0.65rem;
          font-weight: 800;
          padding: 2px 6px;
          border-radius: 10px;
          min-width: 18px;
          text-align: center;
          line-height: 1.2;
        }
        .relevo-btn {
          background: var(--bg-card);
          color: var(--green-primary);
          border: 1px solid var(--green-primary);
          padding: 0.55rem 1rem;
          border-radius: 10px;
          font-size: 0.85rem;
          font-weight: 600;
          display: flex;
          align-items: center;
          gap: 0.45rem;
          cursor: pointer;
          transition: all 0.18s;
        }
        .relevo-btn:hover {
          background: var(--green-light);
          box-shadow: 0 2px 8px rgba(26, 138, 74, 0.15);
        }
        .relevo-btn-ghost {
          background: transparent;
          color: var(--text-secondary);
          border: 1px solid var(--border-soft);
        }
        .relevo-btn-ghost:hover {
          background: var(--bg-app);
          color: var(--text-primary);
          border-color: var(--text-muted);
          box-shadow: none;
        }
      `}</style>

      <div className="sidebar">
        <div className="sidebar-logo-area">
          <Logo size={60} glow={false} />
          <div className="sidebar-logo-text">
            <div className="t1">Sistema Integral</div>
            <div className="t2">de Ventas</div>
          </div>
          <div className="sidebar-logo-divider" />
        </div>

        <nav className="sidebar-nav">
          {navItems.map(item => {
            const Icon = item.icon;
            const isActive = location.pathname === item.to;
            return (
              <Link
                key={item.label}
                to={item.to}
                className={`nav-link ${isActive ? 'active' : ''}`}
              >
                <Icon size={18} />
                <span>{item.label}</span>
              </Link>
            );
          })}
        </nav>

        <div className="sidebar-user-card" onClick={onLogout} title="Cerrar sesión">
          <div className="user-avatar" style={{ overflow: 'hidden' }}>
            {user?.avatar_url ? (
              <img src={user?.avatar_url} alt={user?.nombre} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            ) : (
              (user?.nombre || 'U')[0].toUpperCase()
            )}
          </div>
          <div className="user-info">
            <div className="greeting">¡Hola, {user?.nombre?.split(' ')[0] || 'Usuario'}!</div>
            <div className="role">{user?.rol || 'usuario'}</div>
          </div>
          <ChevronDown size={16} color="var(--text-muted)" />
        </div>
      </div>

      <div className="main-content" style={{ display: 'flex', flexDirection: 'column' }}>
        {/* v1.5.3: Header global con buscador, tema, notificaciones, avatar */}
        <Header user={user} notifCount={notifCount} />
        {children}
      </div>

      {/* v1.5.5: HelpButton removido — confundía a usuarios (parecía un botón
          de "super admin"). El contacto está en el menú Acerca de del header. */}
      <UpdateNotification />

      {/* v1.5.4: modal de relevo eliminado (código muerto). Logout ahora vive en el header. */}
    </div>
  );
};

function App() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  // Al iniciar la app, verificamos si hay sesión guardada y la validamos
  useEffect(() => {
    const init = async () => {
      const token = getToken();
      const savedUser = getUser();
      if (token && savedUser) {
        // Verificamos que el token siga siendo válido pidiendo /me
        try {
          const fresh = await apiGet(`${API_URL}/api/auth/me`);
          setUser(fresh);
        } catch (err) {
          // Token inválido o expirado — limpiamos y mandamos al login
          clearSession();
          setUser(null);
        }
      }
      setLoading(false);
    };
    init();

    // Si la sesión expira mientras la app está abierta, redirigir al login
    const onLogout = () => {
      clearSession();
      // setTimeout: diferir navigate hasta que el event handler actual termine.
      // Así React desmonta los componentes antes de navegar, evitando crashes.
      setTimeout(() => navigate('/login', { replace: true }), 0);
    };
    window.addEventListener('auth:logout', onLogout);
    return () => window.removeEventListener('auth:logout', onLogout);
  }, [navigate]);

  const handleLogin = (userData) => {
    setUser(userData);
    navigate('/dashboard');
  };

  const handleLogout = () => {
    clearSession();
    setTimeout(() => navigate('/login', { replace: true }), 0);
  };

  if (loading) {
    return (
      <div style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: '#0a1a0e',
        color: '#7ed957',
        fontFamily: 'Inter, system-ui, sans-serif',
        fontSize: '1.1rem',
        fontWeight: 600,
      }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{
            width: 56, height: 56, margin: '0 auto 1.25rem',
            border: '4px solid rgba(126, 217, 87, 0.15)',
            borderTopColor: '#7ed957',
            borderRadius: '50%',
            animation: 'spin 0.9s linear infinite'
          }} />
          <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
          Cargando sesión...
        </div>
      </div>
    );
  }

  return (
    <ThemeProvider>
      <ErrorBoundary>
        <Routes>
          <Route path="/login" element={!user ? <Login onLogin={handleLogin} onSwitchToRegister={() => navigate('/registro')} /> : <Navigate to="/dashboard" />} />
          <Route path="/registro" element={!user ? <Registro onRegister={handleLogin} onSwitchToLogin={() => navigate('/login')} /> : <Navigate to="/dashboard" />} />
          <Route path="/dashboard" element={user ? <AppLayout user={user} onLogout={handleLogout} onSwitchUser={handleLogin}><Dashboard user={user} /></AppLayout> : <Navigate to="/login" />} />
          <Route path="/pos" element={user ? <AppLayout user={user} onLogout={handleLogout} onSwitchUser={handleLogin}><POS user={user} /></AppLayout> : <Navigate to="/login" />} />
          {/* v1.5.4: ternario redundante simplificado */}
          <Route path="/inventario" element={user ? <AppLayout user={user} onLogout={handleLogout} onSwitchUser={handleLogin}><Inventario user={user} /></AppLayout> : <Navigate to="/login" />} />
          <Route path="/historial" element={user ? <AppLayout user={user} onLogout={handleLogout} onSwitchUser={handleLogin}><Historial user={user} /></AppLayout> : <Navigate to="/login" />} />
          <Route path="/cotizaciones" element={user ? <AppLayout user={user} onLogout={handleLogout} onSwitchUser={handleLogin}><Cotizaciones user={user} /></AppLayout> : <Navigate to="/login" />} />
          <Route path="/atencion-cliente" element={user ? <AppLayout user={user} onLogout={handleLogout} onSwitchUser={handleLogin}><AtencionCliente user={user} /></AppLayout> : <Navigate to="/login" />} />
          <Route path="/clientes" element={user ? <AppLayout user={user} onLogout={handleLogout} onSwitchUser={handleLogin}><Clientes user={user} /></AppLayout> : <Navigate to="/login" />} />
          <Route path="/facturas" element={user ? <AppLayout user={user} onLogout={handleLogout} onSwitchUser={handleLogin}><Facturas user={user} /></AppLayout> : <Navigate to="/login" />} />
          <Route path="/cierre" element={user ? <AppLayout user={user} onLogout={handleLogout} onSwitchUser={handleLogin}><CierreCaja user={user} onLogout={handleLogout} /></AppLayout> : <Navigate to="/login" />} />
          <Route path="/usuarios" element={user ? (user.rol === 'Administrador' ? <AppLayout user={user} onLogout={handleLogout} onSwitchUser={handleLogin}><PanelUsuarios user={user} /></AppLayout> : <Navigate to="/dashboard" />) : <Navigate to="/login" />} />
          <Route path="/configuracion" element={user ? <AppLayout user={user} onLogout={handleLogout} onSwitchUser={handleLogin}><Configuracion user={user} /></AppLayout> : <Navigate to="/login" />} />
          <Route path="/recuperar-password" element={!user ? <RecuperarPassword /> : <Navigate to="/dashboard" />} />
          <Route path="/terminos" element={<Terminos />} />
          {/* v1.5.5: /super-admin fuera del layout para que no se monte el Header del cliente */}
          <Route path="/super-admin" element={<SuperAdmin />} />
          {/* v1.5.5: Proveedores y Nómina ahora son funcionales */}
          <Route path="/proveedores" element={user ? <AppLayout user={user} onLogout={handleLogout} onSwitchUser={handleLogin}><Proveedores user={user} /></AppLayout> : <Navigate to="/login" />} />
          <Route path="/caja" element={user ? <AppLayout user={user} onLogout={handleLogout} onSwitchUser={handleLogin}><Caja /></AppLayout> : <Navigate to="/login" />} />
          <Route path="/nomina" element={user ? <AppLayout user={user} onLogout={handleLogout} onSwitchUser={handleLogin}><Nomina user={user} /></AppLayout> : <Navigate to="/login" />} />
          {/* v1.7.2: E-commerce restaurado (existía Ecommerce.jsx pero no estaba registrado) */}
          <Route path="/ecommerce" element={user ? <AppLayout user={user} onLogout={handleLogout} onSwitchUser={handleLogin}><Ecommerce user={user} /></AppLayout> : <Navigate to="/login" />} />
          <Route path="*" element={<Navigate to={user ? "/dashboard" : "/login"} replace />} />
        </Routes>
      </ErrorBoundary>
    </ThemeProvider>
  );
}

export default App;
