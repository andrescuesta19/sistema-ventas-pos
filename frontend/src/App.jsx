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
import TiendaPublica from './pages/TiendaPublica';
import Header from './components/Header';
import Logo from './components/Logo';
import UpdateNotification from './components/UpdateNotification';
import WelcomeModal from './components/WelcomeModal';
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
    this.state = { hasError: false };
  }
  static getDerivedStateFromError() {
    return { hasError: true };
  }
  componentDidCatch(error, info) {
    console.error('[ErrorBoundary] Crash:', error, info);
    try { localStorage.removeItem('pos_token'); localStorage.removeItem('pos_user'); } catch {}
    // Redirect al login — usa hash para HashRouter
    window.location.hash = '#/login';
    window.location.reload();
  }
  render() {
    if (this.state.hasError) {
      // Mostrar nada — el redirect ya está en course
      return null;
    }
    return this.props.children;
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
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // Cerrar sidebar al navegar (móvil)
  useEffect(() => {
    setSidebarOpen(false);
  }, [location.pathname]);

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

  // Link de tienda pública para compartir
  const tiendaUrl = `${window.location.origin}/tienda/${user?.id_local || 1}`;
  const copiarLinkTienda = async () => {
    try {
      await navigator.clipboard.writeText(tiendaUrl);
      alert('✅ Link copiado! Compártelo con tus clientes:\n\n' + tiendaUrl);
    } catch { prompt('Copia este link para compartir con tus clientes:', tiendaUrl); }
  };

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

      {/* Overlay del sidebar en móvil */}
      <div 
        className={`sidebar-overlay ${sidebarOpen ? 'active' : ''}`} 
        onClick={() => setSidebarOpen(false)} 
      />

      <div className={`sidebar ${sidebarOpen ? 'open' : ''}`}>
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

          {/* Separator */}
          <div style={{ height: 1, background: 'var(--border-light)', margin: '0.4rem 0.5rem' }} />

          {/* Botón Mi Tienda — link para compartir con clientes */}
          <button
            onClick={() => { copiarLinkTienda(); setSidebarOpen(false); }}
            className="nav-link"
            style={{ 
              background: 'linear-gradient(135deg, rgba(42,157,143,0.15), rgba(38,70,83,0.15))',
              border: '1px solid rgba(42,157,143,0.3)',
              cursor: 'pointer',
              width: '100%',
              textAlign: 'left',
              borderRadius: '8px',
              margin: '0.25rem 0.5rem',
              padding: '0.55rem 0.75rem',
              display: 'flex',
              alignItems: 'center',
              gap: '0.55rem',
              fontSize: '0.85rem',
              fontWeight: 600,
              color: '#2A9D8F',
              fontFamily: 'inherit',
            }}
            title="Copiar link de tienda para compartir con clientes"
          >
            <Store size={18} />
            <span>Mi Tienda 🔗</span>
          </button>

          {/* User card — al final del nav, antes de Configuración */}
          <Link
            to="/configuracion"
            className="nav-link"
            title="Mi perfil"
            onClick={() => setSidebarOpen(false)}
            style={{ gap: '0.65rem' }}
          >
            <div style={{
              width: 30, height: 30, borderRadius: '50%', flexShrink: 0,
              background: 'var(--green-light)', color: 'var(--green-primary)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontWeight: 700, fontSize: '0.8rem', overflow: 'hidden',
            }}>
              {user?.avatar_url ? (
                <img src={user?.avatar_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              ) : (
                (user?.nombre || 'U')[0].toUpperCase()
              )}
            </div>
            <span style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-primary)' }}>
              {user?.nombre || 'Usuario'}
            </span>
          </Link>
        </nav>
      </div>

      <div className="main-content" style={{ display: 'flex', flexDirection: 'column' }}>
        {/* Botón hamburguesa para móvil */}
        <div className="mobile-menu-btn" onClick={() => setSidebarOpen(true)}>
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="3" y1="12" x2="21" y2="12"></line>
            <line x1="3" y1="6" x2="21" y2="6"></line>
            <line x1="3" y1="18" x2="21" y2="18"></line>
          </svg>
        </div>
        {/* v1.5.3: Header global con buscador, tema, notificaciones, avatar */}
        <Header user={user} notifCount={notifCount} onLogout={onLogout} />
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
    const token = getToken();
    const savedUser = getUser();
    if (token && savedUser) {
      apiGet(`${API_URL}/api/auth/me`).then(fresh => {
        setUser(fresh);
        setLoading(false);
      }).catch(() => {
        try { localStorage.removeItem('pos_token'); localStorage.removeItem('pos_user'); } catch {}
        setLoading(false);
      });
    } else {
      setLoading(false);
    }
  }, []);

  // Escuchar evento de sesión expirada (401 desde api.js)
  useEffect(() => {
    const onLogoutEvent = () => {
      try { localStorage.removeItem('pos_token'); localStorage.removeItem('pos_user'); } catch {}
      window.location.hash = '#/login';
      window.location.reload();
    };
    window.addEventListener('auth:logout', onLogoutEvent);
    return () => window.removeEventListener('auth:logout', onLogoutEvent);
  }, []);

  // v2.1.1: Escuchar actualización remota desde SuperAdmin (solo Electron)
  const [remoteUpdate, setRemoteUpdate] = useState(null);
  useEffect(() => {
    if (!window.electronAPI?.onRemoteUpdateAvailable) return;
    window.electronAPI.onRemoteUpdateAvailable((info) => {
      setRemoteUpdate(info);
    });
  }, []);

  const handleLogin = (userData) => {
    setUser(userData);
    navigate('/dashboard');
  };

  const handleLogout = () => {
    try { localStorage.removeItem('pos_token'); localStorage.removeItem('pos_user'); } catch {}
    window.location.hash = '#/login';
    window.location.reload();
  };

  // Durante loading, no mostrar nada (evita flash de spinner verde)
  if (loading) return null;

  return (
    <ThemeProvider>
      <ErrorBoundary>
        <WelcomeModal />
        {/* v2.1.1: Banner de actualización remota */}
        {remoteUpdate && (
          <div style={{
            position: 'fixed', top: 12, right: 12, zIndex: 9998,
            background: 'linear-gradient(135deg, #0d2412 0%, #0a1a0e 100%)',
            border: '1px solid rgba(126,217,87,0.35)', borderRadius: 14, padding: '1rem 1.25rem',
            maxWidth: 380, boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
            display: 'flex', alignItems: 'flex-start', gap: '0.75rem',
          }}>
            <div style={{ fontSize: '1.4rem' }}>🔄</div>
            <div style={{ flex: 1 }}>
              <div style={{ color: '#7ed957', fontWeight: 700, fontSize: '0.9rem', marginBottom: 2 }}>
                Nueva versión disponible: v{remoteUpdate.version}
              </div>
              <div style={{ color: 'rgba(255,255,255,0.55)', fontSize: '0.78rem', lineHeight: 1.4 }}>
                {remoteUpdate.changelog || 'Actualización disponible. Cierra y vuelve a abrir la app para instalar.'}
              </div>
            </div>
            <button onClick={() => setRemoteUpdate(null)} style={{
              background: 'none', border: 'none', color: 'rgba(255,255,255,0.3)',
              cursor: 'pointer', padding: 4, fontSize: '1rem', lineHeight: 1,
            }}>✕</button>
          </div>
        )}
        <Routes>
          <Route path="/login" element={!user ? <Login onLogin={handleLogin} onSwitchToRegister={() => navigate('/registro')} /> : <Navigate to="/dashboard" />} />
          <Route path="/registro" element={!user ? <Registro onRegister={handleLogin} onSwitchToLogin={() => navigate('/login')} /> : <Navigate to="/dashboard" />} />
          <Route path="/dashboard" element={user ? <AppLayout user={user} onLogout={handleLogout} onSwitchUser={handleLogin}><Dashboard user={user} /></AppLayout> : <Navigate to="/login" />} />
          <Route path="/pos" element={user ? <AppLayout user={user} onLogout={handleLogout} onSwitchUser={handleLogin}><POS user={user} /></AppLayout> : <Navigate to="/login" />} />
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
          <Route path="/super-admin" element={<SuperAdmin />} />
          <Route path="/proveedores" element={user ? <AppLayout user={user} onLogout={handleLogout} onSwitchUser={handleLogin}><Proveedores user={user} /></AppLayout> : <Navigate to="/login" />} />
          <Route path="/caja" element={user ? <AppLayout user={user} onLogout={handleLogout} onSwitchUser={handleLogin}><Caja user={user} /></AppLayout> : <Navigate to="/login" />} />
          <Route path="/nomina" element={user ? <AppLayout user={user} onLogout={handleLogout} onSwitchUser={handleLogin}><Nomina user={user} /></AppLayout> : <Navigate to="/login" />} />
          <Route path="/ecommerce" element={user ? <AppLayout user={user} onLogout={handleLogout} onSwitchUser={handleLogin}><Ecommerce user={user} /></AppLayout> : <Navigate to="/login" />} />
          <Route path="/tienda/:idLocal" element={<TiendaPublica />} />
          <Route path="*" element={<Navigate to={user ? "/dashboard" : "/login"} replace />} />
        </Routes>
      </ErrorBoundary>
    </ThemeProvider>
  );
}

export default App;
