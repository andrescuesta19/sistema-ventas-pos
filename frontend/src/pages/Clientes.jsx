import { API_URL } from '../config';
import { apiGet, apiPost, apiPut, apiDelete } from '../api';
import { useState, useEffect, useCallback } from 'react';
import { Search, UserPlus, Phone, Mail, Award, X, ChevronRight, Edit2, Trash2, Check } from 'lucide-react';

const Clientes = ({ user }) => {
  const [clientes, setClientes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busqueda, setBusqueda] = useState('');
  const [showCrear, setShowCrear] = useState(false);
  const [clienteSeleccionado, setClienteSeleccionado] = useState(null);
  const [error, setError] = useState('');

  const fetchClientes = useCallback(async () => {
    setLoading(true);
    try {
      const url = busqueda.trim()
        ? `${API_URL}/api/clientes?q=${encodeURIComponent(busqueda.trim())}`
        : `${API_URL}/api/clientes`;
      const data = await apiGet(url);
      setClientes(Array.isArray(data) ? data : []);
    } catch (err) {
      setError(`Error cargando clientes: ${err.message}`);
    } finally {
      setLoading(false);
    }
  }, [busqueda]);

  useEffect(() => {
    const t = setTimeout(() => fetchClientes(), 250); // debounce de búsqueda
    return () => clearTimeout(t);
  }, [fetchClientes]);

  const formatearCOP = (valor) =>
    new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0 }).format(valor || 0);

  return (
    <div className="page-content" style={{ padding: '2rem' }}>
      <div className="flex-between" style={{ marginBottom: '2rem' }}>
        <div>
          <h1 style={{ margin: 0, fontSize: '1.75rem', color: 'var(--text-primary)' }}>
            Gestión de Clientes
          </h1>
          <p style={{ color: 'var(--text-light)', margin: '0.3rem 0 0' }}>
            {clientes.length} cliente{clientes.length !== 1 ? 's' : ''} registrado{clientes.length !== 1 ? 's' : ''}
          </p>
        </div>
        <button
          className="btn-primary"
          onClick={() => setShowCrear(true)}
          style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}
        >
          <UserPlus size={18} />
          Nuevo Cliente
        </button>
      </div>

      {/* Buscador */}
      <div className="card" style={{ marginBottom: '1.5rem', padding: '0.85rem 1rem' }}>
        <div style={{ position: 'relative' }}>
          <Search size={18} style={{ position: 'absolute', left: '0.85rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
          <input
            type="text"
            placeholder="Buscar por nombre o documento..."
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            style={{ paddingLeft: '2.6rem' }}
          />
        </div>
      </div>

      {error && (
        <div className="card" style={{ background: 'rgba(231, 111, 81, 0.1)', borderColor: 'var(--accent-color)', color: 'var(--accent-color)', marginBottom: '1rem' }}>
          {error}
        </div>
      )}

      {/* Tabla de clientes */}
      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        {loading ? (
          <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-light)' }}>
            Cargando clientes...
          </div>
        ) : clientes.length === 0 ? (
          <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-light)' }}>
            <UserPlus size={48} style={{ opacity: 0.2, margin: '0 auto 1rem auto' }} />
            <p style={{ margin: 0 }}>
              {busqueda ? 'No se encontraron clientes con esa búsqueda.' : 'No hay clientes aún. ¡Crea el primero!'}
            </p>
          </div>
        ) : (
          <table style={{ width: '100%' }}>
            <thead>
              <tr>
                <th>Cliente</th>
                <th>Documento</th>
                <th>Contacto</th>
                <th style={{ textAlign: 'right' }}>Puntos</th>
                <th style={{ width: '40px' }}></th>
              </tr>
            </thead>
            <tbody>
              {clientes.map(c => (
                <tr
                  key={c.id_cliente}
                  onClick={() => setClienteSeleccionado(c)}
                  style={{ cursor: 'pointer' }}
                >
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                      <div style={{
                        width: 38, height: 38, borderRadius: '50%',
                        background: 'var(--green-light)',
                        color: 'var(--green-primary)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontWeight: 700, fontSize: '0.85rem', flexShrink: 0
                      }}>
                        {c.nombre_razon_social?.charAt(0).toUpperCase()}
                      </div>
                      <div>
                        <div style={{ fontWeight: 600 }}>{c.nombre_razon_social}</div>
                      </div>
                    </div>
                  </td>
                  <td style={{ color: 'var(--text-secondary)' }}>{c.documento_identidad}</td>
                  <td>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.15rem', fontSize: '0.85rem' }}>
                      {c.correo && <span style={{ color: 'var(--text-secondary)' }}>{c.correo}</span>}
                      {c.telefono && <span style={{ color: 'var(--text-muted)' }}>{c.telefono}</span>}
                    </div>
                  </td>
                  <td style={{ textAlign: 'right' }}>
                    <span style={{
                      background: 'var(--green-light)',
                      color: 'var(--green-primary)',
                      padding: '0.25rem 0.65rem',
                      borderRadius: '999px',
                      fontSize: '0.8rem',
                      fontWeight: 700
                    }}>
                      {c.puntos_acumulados || 0} pts
                    </span>
                  </td>
                  <td>
                    <ChevronRight size={16} color="var(--text-muted)" />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Modal: Crear cliente */}
      {showCrear && (
        <CrearClienteModal
          onClose={() => setShowCrear(false)}
          onCreado={() => {
            setShowCrear(false);
            fetchClientes();
          }}
        />
      )}

      {/* Modal: Detalle de cliente */}
      {clienteSeleccionado && (
        <DetalleClienteModal
          cliente={clienteSeleccionado}
          onClose={() => setClienteSeleccionado(null)}
        />
      )}
    </div>
  );
};

/* ─── Modal: Crear cliente ─── */
const CrearClienteModal = ({ onClose, onCreado }) => {
  const [form, setForm] = useState({
    documento_identidad: '',
    nombre_razon_social: '',
    telefono: '',
    correo: ''
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      // v1.5.4: apiPost ya devuelve el JSON parseado (no un Response),
      // así que NO hay `res.ok` aquí. Eso era un ReferenceError que rompía
      // toda la app al crear un cliente.
      const data = await apiPost(`${API_URL}/api/clientes/crear`, form);
      if (data.success) {
        onCreado();
      } else {
        setError(data.error || 'Error creando cliente');
      }
    } catch (err) {
      setError(err.message || 'Error de conexión');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" style={{ maxWidth: '480px' }} onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Nuevo Cliente</h2>
          <button className="close-btn" onClick={onClose}>×</button>
        </div>

        {error && (
          <div style={{
            background: 'rgba(231, 111, 81, 0.1)',
            color: 'var(--accent-color)',
            padding: '0.65rem 0.85rem',
            borderRadius: '8px',
            fontSize: '0.85rem',
            marginBottom: '1rem'
          }}>
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: '1rem' }}>
            <label>Documento de identidad *</label>
            <input
              type="text"
              required
              value={form.documento_identidad}
              onChange={e => setForm({ ...form, documento_identidad: e.target.value })}
              placeholder="Cédula o NIT"
            />
          </div>
          <div style={{ marginBottom: '1rem' }}>
            <label>Nombre o Razón Social *</label>
            <input
              type="text"
              required
              value={form.nombre_razon_social}
              onChange={e => setForm({ ...form, nombre_razon_social: e.target.value })}
              placeholder="Nombre completo"
            />
          </div>
          <div style={{ marginBottom: '1rem' }}>
            <label>Teléfono</label>
            <input
              type="tel"
              value={form.telefono}
              onChange={e => setForm({ ...form, telefono: e.target.value })}
              placeholder="Opcional"
            />
          </div>
          <div style={{ marginBottom: '1.5rem' }}>
            <label>Correo electrónico</label>
            <input
              type="email"
              value={form.correo}
              onChange={e => setForm({ ...form, correo: e.target.value })}
              placeholder="Opcional (para enviar facturas)"
            />
          </div>

          <div style={{ display: 'flex', gap: '0.75rem' }}>
            <button type="button" className="btn-secondary" onClick={onClose} style={{ flex: 1 }}>
              Cancelar
            </button>
            <button type="submit" className="btn-primary" disabled={loading} style={{ flex: 1 }}>
              {loading ? 'Creando...' : 'Crear Cliente'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

/* ─── Modal: Detalle de cliente ─── */
const DetalleClienteModal = ({ cliente, onClose }) => {
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" style={{ maxWidth: '480px' }} onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Detalle del Cliente</h2>
          <button className="close-btn" onClick={onClose}>×</button>
        </div>

        <div style={{ textAlign: 'center', padding: '1rem 0 1.5rem' }}>
          <div style={{
            width: 80, height: 80, borderRadius: '50%',
            background: 'var(--green-light)',
            color: 'var(--green-primary)',
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            fontWeight: 800, fontSize: '2rem', marginBottom: '0.75rem'
          }}>
            {cliente.nombre_razon_social?.charAt(0).toUpperCase()}
          </div>
          <h3 style={{ margin: 0, color: 'var(--text-primary)' }}>{cliente.nombre_razon_social}</h3>
          <p style={{ color: 'var(--text-light)', margin: '0.25rem 0 0' }}>{cliente.documento_identidad}</p>
        </div>

        <div style={{ background: 'var(--green-light)', padding: '1rem', borderRadius: '10px', textAlign: 'center', marginBottom: '1rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.4rem', color: 'var(--green-primary)', marginBottom: '0.3rem' }}>
            <Award size={18} />
            <span style={{ fontSize: '0.85rem', fontWeight: 600 }}>Puntos acumulados</span>
          </div>
          <div style={{ fontSize: '2rem', fontWeight: 800, color: 'var(--green-primary)' }}>
            {cliente.puntos_acumulados || 0}
          </div>
          <div style={{ fontSize: '0.75rem', color: 'var(--green-primary)', marginTop: '0.2rem' }}>
            ≈ {formatearCOPLocal((cliente.puntos_acumulados || 0) * 100)} en descuentos
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem', fontSize: '0.9rem' }}>
          {cliente.correo && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', padding: '0.6rem', background: '#f6f8f7', borderRadius: '8px' }}>
              <Mail size={16} color="var(--text-muted)" />
              <span>{cliente.correo}</span>
            </div>
          )}
          {cliente.telefono && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', padding: '0.6rem', background: '#f6f8f7', borderRadius: '8px' }}>
              <Phone size={16} color="var(--text-muted)" />
              <span>{cliente.telefono}</span>
            </div>
          )}
        </div>

        <button className="btn-secondary" onClick={onClose} style={{ width: '100%', marginTop: '1.25rem' }}>
          Cerrar
        </button>
      </div>
    </div>
  );
};

const formatearCOPLocal = (valor) =>
  new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0 }).format(valor || 0);

export default Clientes;
