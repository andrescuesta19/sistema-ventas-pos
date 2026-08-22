import { useState, useEffect } from 'react';
import { API_URL } from '../config';
import { apiGet, apiPost, apiPut, apiDelete } from '../api';
import {
  UserCog, Plus, Edit, Trash2, Search, AlertCircle, CheckCircle2,
  X, Mail, Lock, User, Shield, XCircle
} from 'lucide-react';

const ROLES = ['Administrador', 'Cajero', 'Supervisor'];

const PanelUsuarios = ({ user }) => {
  const [usuarios, setUsuarios] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busqueda, setBusqueda] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editando, setEditando] = useState(null); // null = crear, o usuario
  const [formData, setFormData] = useState({
    nombre: '',
    correo: '',
    contrasena: '',
    rol: 'Cajero',
  });
  const [successMsg, setSuccessMsg] = useState('');

  useEffect(() => {
    cargarUsuarios();
  }, []);

  const cargarUsuarios = async () => {
    setLoading(true);
    setError('');
    try {
      const data = await apiGet(`${API_URL}/api/usuarios/local?id_local=${user?.id_local}`);
      setUsuarios(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const abrirCrear = () => {
    setEditando(null);
    setFormData({ nombre: '', correo: '', contrasena: '', rol: 'Cajero' });
    setError('');
    setShowModal(true);
  };

  const abrirEditar = (u) => {
    setEditando(u);
    setFormData({
      nombre: u.nombre,
      correo: u.correo,
      contrasena: '', // vacía = no cambiar
      rol: u.rol,
    });
    setError('');
    setShowModal(true);
  };

  const cerrarModal = () => {
    setShowModal(false);
    setEditando(null);
    setError('');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    // Validaciones
    if (!formData.nombre.trim()) {
      setError('El nombre es obligatorio.');
      return;
    }
    if (!formData.correo.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.correo)) {
      setError('Correo inválido.');
      return;
    }
    if (!editando && formData.contrasena.length < 6) {
      setError('La contraseña debe tener al menos 6 caracteres.');
      return;
    }
    if (editando && formData.contrasena && formData.contrasena.length < 6) {
      setError('La contraseña debe tener al menos 6 caracteres.');
      return;
    }

    try {
      if (editando) {
        // Actualizar
        const body = { nombre: formData.nombre, rol: formData.rol };
        if (formData.contrasena) body.contrasena = formData.contrasena;
        await apiPut(`${API_URL}/api/usuarios/${editando.id_usuario}`, body);
        setSuccessMsg(`Usuario "${formData.nombre}" actualizado.`);
      } else {
        // Crear
        await apiPost(`${API_URL}/api/usuarios`, {
          nombre: formData.nombre,
          correo: formData.correo,
          contrasena: formData.contrasena,
          rol: formData.rol,
        });
        setSuccessMsg(`Usuario "${formData.nombre}" creado. Puede iniciar sesión con ${formData.correo}.`);
      }
      cerrarModal();
      cargarUsuarios();
      setTimeout(() => setSuccessMsg(''), 4000);
    } catch (err) {
      setError(err.message);
    }
  };

  const handleEliminar = async (u) => {
    if (u.id_usuario === user?.id_usuario) {
      alert('No puedes eliminar tu propia cuenta.');
      return;
    }
    if (!confirm(`¿Desactivar al usuario "${u.nombre}"?\n\nPodrás reactivarlo después editándolo.`)) {
      return;
    }
    try {
      await apiDelete(`${API_URL}/api/usuarios/${u.id_usuario}`);
      setSuccessMsg(`Usuario "${u.nombre}" desactivado.`);
      cargarUsuarios();
      setTimeout(() => setSuccessMsg(''), 4000);
    } catch (err) {
      alert(`Error: ${err.message}`);
    }
  };

  const handleReactivar = async (u) => {
    try {
      await apiPut(`${API_URL}/api/usuarios/${u.id_usuario}`, { estado: true });
      setSuccessMsg(`Usuario "${u.nombre}" reactivado.`);
      cargarUsuarios();
      setTimeout(() => setSuccessMsg(''), 4000);
    } catch (err) {
      alert(`Error: ${err.message}`);
    }
  };

  const usuariosFiltrados = usuarios.filter(u => {
    if (!busqueda) return true;
    const q = busqueda.toLowerCase();
    return u.nombre.toLowerCase().includes(q) || u.correo.toLowerCase().includes(q) || u.rol.toLowerCase().includes(q);
  });

  return (
    <div style={{ padding: '2rem', maxWidth: 1200, margin: '0 auto' }}>
      <style>{`
        .users-header {
          display: flex; align-items: center; justify-content: space-between;
          margin-bottom: 1.5rem; gap: 1rem; flex-wrap: wrap;
        }
        .users-title { display: flex; align-items: center; gap: 0.75rem; }
        .users-title h1 { font-size: 1.5rem; font-weight: 700; color: var(--text-primary); margin: 0; }
        .users-title p { color: var(--text-secondary); margin: 0.25rem 0 0; font-size: 0.9rem; }
        .users-search-create { display: flex; gap: 0.75rem; }
        .users-search-box {
          display: flex; align-items: center; gap: 0.5rem;
          background: var(--bg-card); border: 1px solid var(--border-soft);
          border-radius: 10px; padding: 0.5rem 0.85rem; min-width: 240px;
        }
        .users-search-box input { border: none; background: transparent; padding: 0; font-size: 0.9rem; color: var(--text-primary); outline: none; width: 100%; }
        .users-search-box input::placeholder { color: var(--text-muted); }
        .btn-primary {
          background: var(--green-primary); color: white; border: none;
          padding: 0.65rem 1.1rem; border-radius: 10px; font-weight: 600;
          font-size: 0.9rem; display: flex; align-items: center; gap: 0.5rem;
          cursor: pointer; transition: all 0.18s;
          font-family: inherit;
        }
        .btn-primary:hover { background: var(--green-primary-hover); transform: translateY(-1px); box-shadow: 0 4px 12px rgba(26, 138, 74, 0.3); }
        .users-table {
          background: var(--bg-card); border-radius: 12px; border: 1px solid var(--border-soft);
          overflow: hidden;
        }
        .users-row {
          display: grid;
          grid-template-columns: 2fr 2fr 1fr 1fr auto;
          align-items: center;
          padding: 0.85rem 1.25rem;
          border-bottom: 1px solid var(--border-light);
          gap: 1rem;
        }
        .users-row:last-child { border-bottom: none; }
        .users-row.header {
          background: var(--bg-app);
          font-weight: 600; color: var(--text-secondary);
          font-size: 0.78rem; text-transform: uppercase; letter-spacing: 0.5px;
        }
        .users-row .user-cell { display: flex; align-items: center; gap: 0.65rem; min-width: 0; }
        .users-row .user-cell .avatar {
          width: 34px; height: 34px; border-radius: 50%;
          background: var(--green-light); color: var(--green-primary);
          display: flex; align-items: center; justify-content: center;
          font-weight: 700; font-size: 0.85rem; flex-shrink: 0;
        }
        .users-row .user-cell .name { font-weight: 600; color: var(--text-primary); font-size: 0.92rem; }
        .users-row .user-cell .mail { color: var(--text-secondary); font-size: 0.8rem; }
        .rol-badge {
          display: inline-block; padding: 0.2rem 0.65rem; border-radius: 999px;
          font-size: 0.72rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.3px;
        }
        .rol-badge.admin { background: rgba(126, 217, 87, 0.15); color: #1a8a4a; }
        .rol-badge.cajero { background: rgba(99, 102, 241, 0.12); color: #4f46e5; }
        .rol-badge.supervisor { background: rgba(245, 158, 11, 0.12); color: #b45309; }
        .estado-badge {
          display: inline-flex; align-items: center; gap: 0.3rem;
          font-size: 0.78rem; font-weight: 600;
        }
        .estado-badge.active { color: #1a8a4a; }
        .estado-badge.inactive { color: #b91c1c; }
        .row-actions { display: flex; gap: 0.4rem; }
        .icon-btn {
          background: transparent; border: 1px solid var(--border-soft);
          color: var(--text-secondary); width: 32px; height: 32px;
          border-radius: 8px; display: flex; align-items: center;
          justify-content: center; cursor: pointer; transition: all 0.15s;
        }
        .icon-btn:hover { background: var(--green-light); border-color: var(--green-primary); color: var(--green-primary); }
        .icon-btn.danger:hover { background: rgba(231, 76, 60, 0.1); border-color: #b91c1c; color: #b91c1c; }
        .modal-overlay {
          position: fixed; inset: 0; background: rgba(0, 0, 0, 0.6);
          display: flex; align-items: center; justify-content: center;
          z-index: 1000; backdrop-filter: blur(4px);
        }
        .modal-content {
          background: var(--bg-card); border-radius: 16px; padding: 1.75rem;
          width: 100%; max-width: 480px; border: 1px solid var(--border-soft);
          box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
        }
        .modal-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 1.25rem; }
        .modal-header h2 { margin: 0; font-size: 1.2rem; color: var(--text-primary); }
        .close-btn {
          background: transparent; border: none; color: var(--text-secondary);
          font-size: 1.5rem; cursor: pointer; padding: 0; line-height: 1;
        }
        .form-group { margin-bottom: 0.9rem; }
        .form-group label { display: block; font-size: 0.85rem; font-weight: 600; color: var(--text-primary); margin-bottom: 0.35rem; }
        .form-group input, .form-group select {
          width: 100%; padding: 0.7rem 0.85rem; border: 1px solid var(--border-soft);
          border-radius: 8px; font-size: 0.92rem; font-family: inherit;
          background: white; color: var(--text-primary); outline: none;
          transition: all 0.15s; box-sizing: border-box;
        }
        .form-group input:focus, .form-group select:focus {
          border-color: var(--green-primary); box-shadow: 0 0 0 3px rgba(26, 138, 74, 0.08);
        }
        .modal-actions { display: flex; gap: 0.6rem; margin-top: 1.5rem; }
        .btn-secondary {
          flex: 1; background: transparent; color: var(--text-secondary);
          border: 1px solid var(--border-soft); padding: 0.7rem; border-radius: 10px;
          font-weight: 600; font-size: 0.9rem; cursor: pointer; font-family: inherit;
        }
        .btn-secondary:hover { background: var(--bg-app); }
        .btn-primary.flex { flex: 1; justify-content: center; }
        .success-banner, .error-banner {
          padding: 0.7rem 1rem; border-radius: 10px; margin-bottom: 1rem;
          display: flex; align-items: center; gap: 0.5rem; font-size: 0.9rem; font-weight: 500;
        }
        .success-banner { background: rgba(126, 217, 87, 0.1); color: #1a8a4a; border: 1px solid rgba(126, 217, 87, 0.3); }
        .error-banner { background: rgba(231, 76, 60, 0.1); color: #b91c1c; border: 1px solid rgba(231, 76, 60, 0.3); }
        .empty-state { padding: 3rem 1rem; text-align: center; color: var(--text-secondary); }
      `}</style>

      <div className="users-header">
        <div className="users-title">
          <UserCog size={28} color="var(--green-primary)" />
          <div>
            <h1>Gestión de Usuarios</h1>
            <p>Crea y administra los usuarios (administradores y cajeros) de tu local.</p>
          </div>
        </div>
        <div className="users-search-create">
          <div className="users-search-box">
            <Search size={16} color="var(--text-muted)" />
            <input
              type="text"
              placeholder="Buscar por nombre, correo o rol..."
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
            />
          </div>
          <button className="btn-primary" onClick={abrirCrear}>
            <Plus size={16} /> Nuevo Usuario
          </button>
        </div>
      </div>

      {successMsg && (
        <div className="success-banner">
          <CheckCircle2 size={18} /> {successMsg}
        </div>
      )}

      {error && !showModal && (
        <div className="error-banner">
          <AlertCircle size={18} /> {error}
        </div>
      )}

      <div className="users-table">
        <div className="users-row header">
          <div>Usuario</div>
          <div>Correo</div>
          <div>Rol</div>
          <div>Estado</div>
          <div></div>
        </div>
        {loading ? (
          <div className="empty-state">Cargando usuarios...</div>
        ) : usuariosFiltrados.length === 0 ? (
          <div className="empty-state">
            {busqueda ? 'No hay usuarios que coincidan con la búsqueda.' : 'No hay usuarios. Crea el primero con "Nuevo Usuario".'}
          </div>
        ) : (
          usuariosFiltrados.map(u => {
            const esActual = u.id_usuario === user?.id_usuario;
            const rolClass = u.rol === 'Administrador' ? 'admin' : u.rol === 'Cajero' ? 'cajero' : 'supervisor';
            return (
              <div key={u.id_usuario} className="users-row">
                <div className="user-cell">
                  <div className="avatar">{(u.nombre || 'U')[0].toUpperCase()}</div>
                  <div style={{ minWidth: 0 }}>
                    <div className="name">{u.nombre} {esActual && <span style={{ fontSize: '0.7rem', color: 'var(--green-primary)', fontWeight: 700 }}>TÚ</span>}</div>
                    <div className="mail" style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>ID: #{u.id_usuario}</div>
                  </div>
                </div>
                <div style={{ color: 'var(--text-secondary)', fontSize: '0.88rem' }}>{u.correo}</div>
                <div><span className={`rol-badge ${rolClass}`}>{u.rol}</span></div>
                <div>
                  <span className={`estado-badge ${u.estado ? 'active' : 'inactive'}`}>
                    {u.estado ? <><CheckCircle2 size={14} /> Activo</> : <><XCircle size={14} /> Inactivo</>}
                  </span>
                </div>
                <div className="row-actions">
                  <button className="icon-btn" onClick={() => abrirEditar(u)} title="Editar">
                    <Edit size={15} />
                  </button>
                  {u.estado ? (
                    <button
                      className="icon-btn danger"
                      onClick={() => handleEliminar(u)}
                      disabled={esActual}
                      style={esActual ? { opacity: 0.3, cursor: 'not-allowed' } : {}}
                      title={esActual ? 'No puedes eliminarte a ti mismo' : 'Desactivar'}
                    >
                      <Trash2 size={15} />
                    </button>
                  ) : (
                    <button
                      className="icon-btn"
                      onClick={() => handleReactivar(u)}
                      title="Reactivar"
                      style={{ color: 'var(--green-primary)' }}
                    >
                      <CheckCircle2 size={15} />
                    </button>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>

      {showModal && (
        <div className="modal-overlay" onClick={cerrarModal}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2>{editando ? 'Editar Usuario' : 'Nuevo Usuario'}</h2>
              <button className="close-btn" onClick={cerrarModal}>×</button>
            </div>

            {error && (
              <div className="error-banner">
                <AlertCircle size={16} /> {error}
              </div>
            )}

            <form onSubmit={handleSubmit}>
              <div className="form-group">
                <label><User size={14} style={{ display: 'inline', marginRight: 4 }} /> Nombre completo</label>
                <input
                  type="text"
                  value={formData.nombre}
                  onChange={(e) => setFormData({ ...formData, nombre: e.target.value })}
                  placeholder="Ej: Juan Pérez"
                  required
                  autoFocus
                />
              </div>

              <div className="form-group">
                <label><Mail size={14} style={{ display: 'inline', marginRight: 4 }} /> Correo electrónico</label>
                <input
                  type="email"
                  value={formData.correo}
                  onChange={(e) => setFormData({ ...formData, correo: e.target.value })}
                  placeholder="usuario@empresa.com"
                  required
                  disabled={!!editando} // No se puede cambiar el correo
                />
              </div>

              <div className="form-group">
                <label><Lock size={14} style={{ display: 'inline', marginRight: 4 }} /> Contraseña {editando && <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>(dejar vacío para no cambiar)</span>}</label>
                <input
                  type="password"
                  value={formData.contrasena}
                  onChange={(e) => setFormData({ ...formData, contrasena: e.target.value })}
                  placeholder={editando ? 'Sin cambios' : 'Mínimo 6 caracteres'}
                  minLength={editando ? 0 : 6}
                />
              </div>

              <div className="form-group">
                <label><Shield size={14} style={{ display: 'inline', marginRight: 4 }} /> Rol</label>
                <select
                  value={formData.rol}
                  onChange={(e) => setFormData({ ...formData, rol: e.target.value })}
                >
                  {ROLES.map(r => <option key={r} value={r}>{r}</option>)}
                </select>
              </div>

              <div className="modal-actions">
                <button type="button" className="btn-secondary" onClick={cerrarModal}>Cancelar</button>
                <button type="submit" className="btn-primary flex">
                  {editando ? <><Edit size={16} /> Guardar Cambios</> : <><Plus size={16} /> Crear Usuario</>}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default PanelUsuarios;
