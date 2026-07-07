import { useState, useEffect } from 'react';
import { Routes, Route, Navigate, Link, useLocation, useNavigate } from 'react-router-dom';
import { ShoppingCart, LayoutDashboard, LogOut, Package, Store, ClipboardList, Users, FileText } from 'lucide-react';
import Login from './pages/Login';
import Registro from './pages/Registro';
import Dashboard from './pages/Dashboard';
import POS from './pages/POS';
import CierreCaja from './pages/CierreCaja';
import Inventario from './pages/Inventario';
import Historial from './pages/Historial';
import Facturas from './pages/Facturas';
import HelpButton from './components/HelpButton';

const AppLayout = ({ children, user, onLogout, onSwitchUser }) => {
  const location = useLocation();
  const [showRelevo, setShowRelevo] = useState(false);
  const [usuariosLocal, setUsuariosLocal] = useState([]);

  const openRelevoModal = async () => {
    try {
      const res = await fetch(`http://localhost:3000/api/usuarios/local?id_local=${user.id_local}`);
      const data = await res.json();
      setUsuariosLocal(data);
      setShowRelevo(true);
    } catch (err) {
      alert("Error cargando usuarios");
    }
  };

  const handleRelevo = (nuevoUsuario) => {
    onSwitchUser(nuevoUsuario);
    setShowRelevo(false);
  };
  return (
    <div className="app-container">
      <div className="sidebar">
        <div className="sidebar-header" style={{ fontSize: '1.2rem', textAlign: 'center' }}>
          Sistema Integral de Ventas
          <div style={{ fontSize: '0.8rem', color: 'var(--text-light)', marginTop: '0.5rem', fontWeight: 400 }}>Edición Negocios</div>
        </div>
        <nav style={{ flex: 1, marginTop: '1rem' }}>
          <Link to="/dashboard" className={`nav-link ${location.pathname === '/dashboard' ? 'active' : ''}`}>
            <LayoutDashboard size={20} /> Dashboard
          </Link>
          <Link to="/pos" className={`nav-link ${location.pathname === '/pos' ? 'active' : ''}`}>
            <ShoppingCart size={20} /> Punto de Venta
          </Link>
          <Link to="/inventario" className={`nav-link ${location.pathname === '/inventario' ? 'active' : ''}`}>
            <Store size={20} /> Gestión de Productos
          </Link>
          <Link to="/historial" className={`nav-link ${location.pathname === '/historial' ? 'active' : ''}`}>
            <ClipboardList size={20} /> Historial de Ventas
          </Link>
          <Link to="/facturas" className={`nav-link ${location.pathname === '/facturas' ? 'active' : ''}`}>
            <FileText size={20} /> Facturas DIAN
          </Link>
          <Link to="/cierre" className={`nav-link ${location.pathname === '/cierre' ? 'active' : ''}`}>
            <Package size={20} /> Cierre de Caja
          </Link>
        </nav>
        <div style={{ padding: '1rem' }}>
          <button className="btn-secondary flex-row" style={{ width: '100%', justifyContent: 'center' }} onClick={onLogout}>
            <LogOut size={18} /> Salir
          </button>
        </div>
      </div>
      <div className="main-content">
        <div className="top-bar">
          <div style={{ fontWeight: 600, color: 'var(--primary-color)' }}>{user?.nombre_local || 'Sede Principal'}</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
            <div style={{ fontWeight: 500 }}>{user?.nombre || 'Usuario'} ({user?.rol})</div>
            <button className="btn-secondary flex-row" style={{ padding: '0.4rem 0.8rem', fontSize: '0.9rem' }} onClick={openRelevoModal}>
              <Users size={16} /> Relevar Turno
            </button>
          </div>
        </div>
        {children}
      </div>
      <HelpButton />

      {showRelevo && (
        <div className="modal-overlay">
          <div className="modal-content" style={{ maxWidth: '400px' }}>
            <div className="modal-header">
              <h2>Cambio de Cajero</h2>
              <button className="close-btn" onClick={() => setShowRelevo(false)}>×</button>
            </div>
            <p style={{ color: 'var(--text-light)', marginBottom: '1.5rem' }}>Selecciona quién tomará el control de esta caja registradora:</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              {usuariosLocal.map(u => (
                <button 
                  key={u.id_usuario}
                  onClick={() => handleRelevo(u)}
                  style={{
                    padding: '1rem',
                    textAlign: 'left',
                    backgroundColor: u.id_usuario === user.id_usuario ? 'var(--primary-color)' : '#f0f0f0',
                    color: u.id_usuario === user.id_usuario ? 'white' : 'inherit',
                    border: 'none',
                    borderRadius: '8px',
                    cursor: 'pointer',
                    fontWeight: 500,
                    fontSize: '1rem'
                  }}
                >
                  {u.nombre} ({u.rol}) {u.id_usuario === user.id_usuario && '(Actual)'}
                </button>
              ))}
            </div>
            <button className="btn-secondary" style={{ width: '100%', marginTop: '1rem' }} onClick={() => setShowRelevo(false)}>Cancelar</button>
          </div>
        </div>
      )}
    </div>
  );
};

function App() {
  const [user, setUser] = useState(null);
  const navigate = useNavigate();

  useEffect(() => {
    const savedUser = localStorage.getItem('pos_user');
    if (savedUser) {
      setUser(JSON.parse(savedUser));
    }
  }, []);

  const handleLogin = (userData) => {
    setUser(userData);
    localStorage.setItem('pos_user', JSON.stringify(userData));
    navigate('/dashboard');
  };

  const handleLogout = () => {
    setUser(null);
    localStorage.removeItem('pos_user');
    navigate('/login');
  };

  return (
    <Routes>
      <Route path="/login" element={!user ? <Login onLogin={handleLogin} /> : <Navigate to="/dashboard" />} />
      <Route path="/registro" element={!user ? <Registro onRegister={handleLogin} /> : <Navigate to="/dashboard" />} />
      <Route path="/dashboard" element={user ? <AppLayout user={user} onLogout={handleLogout} onSwitchUser={handleLogin}><Dashboard user={user} /></AppLayout> : <Navigate to="/login" />} />
      <Route path="/pos" element={user ? <AppLayout user={user} onLogout={handleLogout} onSwitchUser={handleLogin}><POS user={user} /></AppLayout> : <Navigate to="/login" />} />
      <Route path="/inventario" element={user ? <AppLayout user={user} onLogout={handleLogout} onSwitchUser={handleLogin}><Inventario user={user} /></AppLayout> : <Navigate to={user ? "/dashboard" : "/login"} />} />
      <Route path="/historial" element={user ? <AppLayout user={user} onLogout={handleLogout} onSwitchUser={handleLogin}><Historial user={user} /></AppLayout> : <Navigate to="/login" />} />
      <Route path="/facturas" element={user ? <AppLayout user={user} onLogout={handleLogout} onSwitchUser={handleLogin}><Facturas user={user} /></AppLayout> : <Navigate to="/login" />} />
      <Route path="/cierre" element={user ? <AppLayout user={user} onLogout={handleLogout} onSwitchUser={handleLogin}><CierreCaja user={user} onLogout={handleLogout} /></AppLayout> : <Navigate to="/login" />} />
      <Route path="*" element={<Navigate to={user ? "/dashboard" : "/login"} replace />} />
    </Routes>
  );
}

export default App;
