import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Store, User, Mail, Lock, MapPin } from 'lucide-react';

const Registro = ({ onRegister }) => {
  const [formData, setFormData] = useState({
    nombre_local: '',
    direccion: '',
    nombre: '',
    correo: '',
    contrasena: ''
  });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const res = await fetch('http://localhost:3000/api/auth/registro', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData)
      });
      const data = await res.json();
      
      if (!res.ok) throw new Error(data.error || 'Error al registrar el negocio');

      // Auto login after registration
      const loginRes = await fetch('http://localhost:3000/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ correo: formData.correo, contrasena: formData.contrasena })
      });
      const loginData = await loginRes.json();
      if (loginRes.ok) {
        onRegister(loginData);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleChange = (e) => setFormData({ ...formData, [e.target.name]: e.target.value });

  return (
    <div className="login-container">
      <div className="login-box" style={{ maxWidth: '500px' }}>
        <div className="login-header">
          <h2>Crea tu Punto de Venta</h2>
          <p>Registra tu negocio y comienza a vender en minutos</p>
        </div>
        
        {error && <div style={{ color: 'var(--accent-color)', marginBottom: '1rem', textAlign: 'center', backgroundColor: 'rgba(231, 111, 81, 0.1)', padding: '0.5rem', borderRadius: '4px' }}>{error}</div>}
        
        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: '1.5rem' }}>
            <h4 style={{ color: 'var(--secondary-color)', marginBottom: '1rem', borderBottom: '1px solid var(--border-color)', paddingBottom: '0.5rem' }}>Datos del Negocio</h4>
            <div className="form-group">
              <div className="input-with-icon">
                <Store size={18} />
                <input type="text" name="nombre_local" placeholder="Nombre del Local / Negocio" value={formData.nombre_local} onChange={handleChange} required />
              </div>
            </div>
            <div className="form-group">
              <div className="input-with-icon">
                <MapPin size={18} />
                <input type="text" name="direccion" placeholder="Dirección del Local" value={formData.direccion} onChange={handleChange} required />
              </div>
            </div>
          </div>

          <div style={{ marginBottom: '1.5rem' }}>
            <h4 style={{ color: 'var(--secondary-color)', marginBottom: '1rem', borderBottom: '1px solid var(--border-color)', paddingBottom: '0.5rem' }}>Datos del Administrador</h4>
            <div className="form-group">
              <div className="input-with-icon">
                <User size={18} />
                <input type="text" name="nombre" placeholder="Tu Nombre Completo" value={formData.nombre} onChange={handleChange} required />
              </div>
            </div>
            <div className="form-group">
              <div className="input-with-icon">
                <Mail size={18} />
                <input type="email" name="correo" placeholder="Correo Electrónico" value={formData.correo} onChange={handleChange} required />
              </div>
            </div>
            <div className="form-group">
              <div className="input-with-icon">
                <Lock size={18} />
                <input type="password" name="contrasena" placeholder="Contraseña" value={formData.contrasena} onChange={handleChange} required minLength="6" />
              </div>
            </div>
          </div>

          <button type="submit" className="btn-primary" style={{ width: '100%', marginBottom: '1rem' }} disabled={loading}>
            {loading ? 'Creando entorno...' : 'Registrar Negocio'}
          </button>
          
          <div style={{ textAlign: 'center', fontSize: '0.9rem' }}>
            ¿Ya tienes una cuenta? <Link to="/login" style={{ color: 'var(--primary-color)', textDecoration: 'none', fontWeight: 600 }}>Inicia Sesión aquí</Link>
          </div>
        </form>
      </div>
    </div>
  );
};

export default Registro;
