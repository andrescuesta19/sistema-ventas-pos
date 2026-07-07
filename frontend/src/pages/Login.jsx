import { useState } from 'react';
import { useNavigate } from 'react-router-dom';

const Login = ({ onLogin }) => {
  const [correo, setCorreo] = useState('');
  const [contrasena, setContrasena] = useState('');
  const [error, setError] = useState('');
  const navigate = useNavigate();

  const handleLogin = async (e) => {
    e.preventDefault();
    setError('');
    try {
      const res = await fetch('http://localhost:3000/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ correo, contrasena })
      });
      const data = await res.json();
      if (res.ok) {
        onLogin(data);
        navigate('/dashboard');
      } else {
        setError(data.error || 'Error al iniciar sesión');
      }
    } catch (err) {
      setError('Error de conexión con el servidor');
    }
  };

  return (
    <div style={{ height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: 'var(--bg-color)' }}>
      <div className="card" style={{ width: '400px' }}>
        <h2 style={{ textAlign: 'center', color: 'var(--secondary-color)', marginBottom: '2rem' }}>Sistema Integral de Ventas</h2>
        {error && <div style={{ backgroundColor: '#ffebee', color: 'var(--accent-color)', padding: '0.75rem', borderRadius: '4px', marginBottom: '1rem' }}>{error}</div>}
        <form onSubmit={handleLogin} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div>
            <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 500 }}>Correo Electrónico</label>
            <input 
              type="email" 
              value={correo} 
              onChange={e => setCorreo(e.target.value)} 
              style={{ width: '100%' }} 
              placeholder="admin@pos.com"
              required 
            />
          </div>
          <div>
            <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 500 }}>Contraseña</label>
            <input 
              type="password" 
              value={contrasena} 
              onChange={e => setContrasena(e.target.value)} 
              style={{ width: '100%' }} 
              placeholder="hash_seguro_123"
              required 
            />
          </div>
          <button type="submit" className="btn-primary" style={{ marginTop: '1rem', padding: '0.75rem' }}>
            Ingresar al Sistema
          </button>
        </form>
      </div>
    </div>
  );
};

export default Login;
