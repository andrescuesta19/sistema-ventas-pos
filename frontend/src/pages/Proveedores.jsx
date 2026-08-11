import { useState, useEffect } from 'react';
import { API_URL } from '../config';
import { apiGet, apiPost, apiPut, apiDelete } from '../api';
import {
  Building2, Plus, Edit2, Trash2, Search, Phone, Mail, MapPin, Hash, X, Save
} from 'lucide-react';

const formVacio = { nombre_razon_social: '', nit: '', telefono: '', correo: '', direccion: '', contacto_nombre: '', notas: '' };

const Proveedores = ({ user }) => {
  const esAdmin = user?.rol === 'Administrador';
  const [proveedores, setProveedores] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busqueda, setBusqueda] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editId, setEditId] = useState(null);
  const [form, setForm] = useState(formVacio);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    cargar();
  }, []);

  const cargar = async () => {
    setLoading(true);
    try {
      const data = await apiGet(`${API_URL}/api/proveedores`);
      setProveedores(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error('Error cargando proveedores:', err);
    } finally {
      setLoading(false);
    }
  };

  const abrirNuevo = () => {
    setForm(formVacio);
    setEditId(null);
    setError('');
    setShowModal(true);
  };

  const abrirEditar = (p) => {
    setForm({
      nombre_razon_social: p.nombre_razon_social || '',
      nit: p.nit || '',
      telefono: p.telefono || '',
      correo: p.correo || '',
      direccion: p.direccion || '',
      contacto_nombre: p.contacto_nombre || '',
      notas: p.notas || '',
    });
    setEditId(p.id_proveedor);
    setError('');
    setShowModal(true);
  };

  const guardar = async (e) => {
    e.preventDefault();
    setError('');
    if (!form.nombre_razon_social.trim()) {
      setError('El nombre del proveedor es obligatorio.');
      return;
    }
    setGuardando(true);
    try {
      if (editId) {
        await apiPut(`${API_URL}/api/proveedores/${editId}`, form);
      } else {
        await apiPost(`${API_URL}/api/proveedores`, form);
      }
      setShowModal(false);
      cargar();
    } catch (err) {
      setError(err.message || 'Error guardando proveedor');
    } finally {
      setGuardando(false);
    }
  };

  const eliminar = async (p) => {
    if (!confirm(`¿Eliminar al proveedor "${p.nombre_razon_social}"?`)) return;
    try {
      await apiDelete(`${API_URL}/api/proveedores/${p.id_proveedor}`);
      cargar();
    } catch (err) {
      alert(`Error: ${err.message}`);
    }
  };

  const toggleEstado = async (p) => {
    try {
      await apiPut(`${API_URL}/api/proveedores/${p.id_proveedor}`, { estado: !p.estado });
      cargar();
    } catch (err) {
      alert(`Error: ${err.message}`);
    }
  };

  const filtrados = proveedores.filter(p => {
    if (!busqueda.trim()) return true;
    const t = busqueda.toLowerCase();
    return (p.nombre_razon_social || '').toLowerCase().includes(t) ||
           (p.nit || '').toLowerCase().includes(t) ||
           (p.contacto_nombre || '').toLowerCase().includes(t);
  });

  return (
    <div style={{ padding: '2rem', maxWidth: 1100, margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '1rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <Building2 size={26} color="var(--green-primary)" />
          <div>
            <h1 style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>Proveedores</h1>
            <p style={{ color: 'var(--text-secondary)', margin: '0.25rem 0 0', fontSize: '0.9rem' }}>
              Gestión de proveedores y compras
            </p>
          </div>
        </div>
        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
          <div style={{ position: 'relative' }}>
            <Search size={15} style={{ position: 'absolute', left: '0.7rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)', pointerEvents: 'none' }} />
            <input
              type="text"
              value={busqueda}
              onChange={e => setBusqueda(e.target.value)}
              placeholder="Buscar proveedor..."
              style={{ padding: '0.55rem 0.85rem 0.55rem 2.2rem', width: 220 }}
            />
          </div>
          {esAdmin && (
            <button onClick={abrirNuevo} className="btn-primary">
              <Plus size={15} /> Nuevo Proveedor
            </button>
          )}
        </div>
      </div>

      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        {loading ? (
          <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>Cargando...</div>
        ) : filtrados.length === 0 ? (
          <div style={{ padding: '3rem 1.5rem', textAlign: 'center', color: 'var(--text-secondary)' }}>
            <Building2 size={56} style={{ marginBottom: '0.75rem', opacity: 0.4 }} />
            <p style={{ margin: 0, fontSize: '1rem', fontWeight: 600, color: 'var(--text-primary)' }}>
              {busqueda ? 'Sin resultados' : 'No hay proveedores registrados'}
            </p>
            <p style={{ margin: '0.4rem 0 0', fontSize: '0.88rem' }}>
              {busqueda ? 'Prueba con otro término.' : 'Usa el botón "Nuevo Proveedor" para empezar.'}
            </p>
          </div>
        ) : (
          <table style={{ width: '100%' }}>
            <thead>
              <tr>
                <th>Nombre</th>
                <th>NIT</th>
                <th>Contacto</th>
                <th>Teléfono</th>
                <th>Correo</th>
                <th>Estado</th>
                {esAdmin && <th style={{ textAlign: 'right' }}>Acciones</th>}
              </tr>
            </thead>
            <tbody>
              {filtrados.map(p => (
                <tr key={p.id_proveedor}>
                  <td>
                    <div style={{ fontWeight: 600 }}>{p.nombre_razon_social}</div>
                    {p.contacto_nombre && (
                      <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{p.contacto_nombre}</div>
                    )}
                  </td>
                  <td style={{ color: 'var(--text-secondary)' }}>{p.nit || '—'}</td>
                  <td style={{ color: 'var(--text-secondary)' }}>{p.contacto_nombre || '—'}</td>
                  <td style={{ color: 'var(--text-secondary)' }}>{p.telefono || '—'}</td>
                  <td style={{ color: 'var(--text-secondary)' }}>{p.correo || '—'}</td>
                  <td>
                    <button
                      onClick={() => esAdmin && toggleEstado(p)}
                      disabled={!esAdmin}
                      style={{
                        background: 'transparent', border: 'none', cursor: esAdmin ? 'pointer' : 'default',
                        padding: 0, fontFamily: 'inherit',
                      }}
                    >
                      <span style={{
                        display: 'inline-block', padding: '0.2rem 0.6rem', borderRadius: 999,
                        fontSize: '0.75rem', fontWeight: 700,
                        background: p.estado ? 'rgba(45, 212, 109, 0.15)' : 'rgba(239, 68, 68, 0.15)',
                        color: p.estado ? 'var(--green-primary)' : '#ef4444',
                      }}>
                        {p.estado ? 'Activo' : 'Inactivo'}
                      </span>
                    </button>
                  </td>
                  {esAdmin && (
                    <td style={{ textAlign: 'right' }}>
                      <button onClick={() => abrirEditar(p)} title="Editar" style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: 4, color: 'var(--text-secondary)' }}>
                        <Edit2 size={16} />
                      </button>
                      <button onClick={() => eliminar(p)} title="Eliminar" style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: 4, color: '#ef4444', marginLeft: 4 }}>
                        <Trash2 size={16} />
                      </button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal-content" onClick={e => e.stopPropagation()} style={{ maxWidth: 540 }}>
            <div className="modal-header">
              <h2>{editId ? 'Editar' : 'Nuevo'} Proveedor</h2>
              <button className="close-btn" onClick={() => setShowModal(false)}><X /></button>
            </div>
            {error && (
              <div style={{ background: 'rgba(231, 76, 60, 0.1)', border: '1px solid rgba(231, 76, 60, 0.3)', borderRadius: 8, padding: '0.6rem 0.85rem', marginBottom: '1rem', color: '#b91c1c', fontSize: '0.88rem' }}>
                {error}
              </div>
            )}
            <form onSubmit={guardar} style={{ display: 'grid', gap: '0.85rem' }}>
              <div>
                <label>Nombre o Razón Social *</label>
                <input value={form.nombre_razon_social} onChange={e => setForm({ ...form, nombre_razon_social: e.target.value })} required autoFocus />
              </div>
              <div className="grid-2">
                <div>
                  <label>NIT</label>
                  <input value={form.nit} onChange={e => setForm({ ...form, nit: e.target.value })} />
                </div>
                <div>
                  <label>Nombre de contacto</label>
                  <input value={form.contacto_nombre} onChange={e => setForm({ ...form, contacto_nombre: e.target.value })} />
                </div>
              </div>
              <div className="grid-2">
                <div>
                  <label>Teléfono</label>
                  <input value={form.telefono} onChange={e => setForm({ ...form, telefono: e.target.value })} />
                </div>
                <div>
                  <label>Correo</label>
                  <input type="email" value={form.correo} onChange={e => setForm({ ...form, correo: e.target.value })} />
                </div>
              </div>
              <div>
                <label>Dirección</label>
                <input value={form.direccion} onChange={e => setForm({ ...form, direccion: e.target.value })} />
              </div>
              <div>
                <label>Notas</label>
                <textarea value={form.notas} onChange={e => setForm({ ...form, notas: e.target.value })} rows={3} />
              </div>
              <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem' }}>
                <button type="submit" className="btn-primary" disabled={guardando}>
                  <Save size={15} /> {guardando ? 'Guardando...' : (editId ? 'Guardar cambios' : 'Crear proveedor')}
                </button>
                <button type="button" className="btn-secondary" onClick={() => setShowModal(false)}>
                  Cancelar
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default Proveedores;
