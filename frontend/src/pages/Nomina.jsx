import { useState, useEffect } from 'react';
import { API_URL } from '../config';
import { apiGet, apiPost, apiPut, apiDelete } from '../api';
import {
  UserCircle2, Plus, Edit2, Trash2, Search, Phone, Mail, MapPin, Hash,
  X, Save, DollarSign, Briefcase, Calendar
} from 'lucide-react';

const formVacio = {
  nombre: '', documento_identidad: '', telefono: '', correo: '', direccion: '',
  cargo: '', salario_base: 0, tipo_contrato: 'Indefinido',
  fecha_ingreso: new Date().toISOString().slice(0, 10),
  notas: ''
};

const Nomina = ({ user }) => {
  const esAdmin = user?.rol === 'Administrador';
  const [empleados, setEmpleados] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busqueda, setBusqueda] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editId, setEditId] = useState(null);
  const [form, setForm] = useState(formVacio);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => { cargar(); }, []);

  const cargar = async () => {
    setLoading(true);
    try {
      const data = await apiGet(`${API_URL}/api/empleados`);
      setEmpleados(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error('Error cargando empleados:', err);
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

  const abrirEditar = (e) => {
    setForm({
      nombre: e.nombre || '',
      documento_identidad: e.documento_identidad || '',
      telefono: e.telefono || '',
      correo: e.correo || '',
      direccion: e.direccion || '',
      cargo: e.cargo || '',
      salario_base: e.salario_base || 0,
      tipo_contrato: e.tipo_contrato || 'Indefinido',
      fecha_ingreso: e.fecha_ingreso ? e.fecha_ingreso.slice(0, 10) : new Date().toISOString().slice(0, 10),
      notas: e.notas || '',
    });
    setEditId(e.id_empleado);
    setError('');
    setShowModal(true);
  };

  const guardar = async (e) => {
    e.preventDefault();
    setError('');
    if (!form.nombre.trim()) {
      setError('El nombre del empleado es obligatorio.');
      return;
    }
    setGuardando(true);
    try {
      if (editId) {
        await apiPut(`${API_URL}/api/empleados/${editId}`, form);
      } else {
        await apiPost(`${API_URL}/api/empleados`, form);
      }
      setShowModal(false);
      cargar();
    } catch (err) {
      setError(err.message || 'Error guardando empleado');
    } finally {
      setGuardando(false);
    }
  };

  const eliminar = async (e) => {
    if (!confirm(`¿Eliminar al empleado "${e.nombre}"? Esta acción no se puede deshacer.`)) return;
    try {
      await apiDelete(`${API_URL}/api/empleados/${e.id_empleado}`);
      cargar();
    } catch (err) {
      alert(`Error: ${err.message}`);
    }
  };

  const toggleEstado = async (e) => {
    try {
      await apiPut(`${API_URL}/api/empleados/${e.id_empleado}`, { estado: !e.estado });
      cargar();
    } catch (err) {
      alert(`Error: ${err.message}`);
    }
  };

  const filtrados = empleados.filter(e => {
    if (!busqueda.trim()) return true;
    const t = busqueda.toLowerCase();
    return (e.nombre || '').toLowerCase().includes(t) ||
           (e.documento_identidad || '').toLowerCase().includes(t) ||
           (e.cargo || '').toLowerCase().includes(t);
  });

  const fmtCOP = (v) => new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0 }).format(v || 0);

  // Resumen
  const totalNomina = empleados.filter(e => e.estado).reduce((acc, e) => acc + Number(e.salario_base || 0), 0);
  const totalActivos = empleados.filter(e => e.estado).length;
  const totalInactivos = empleados.filter(e => !e.estado).length;

  return (
    <div style={{ padding: '2rem', maxWidth: 1200, margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '1rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <UserCircle2 size={26} color="var(--green-primary)" />
          <div>
            <h1 style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>Nómina</h1>
            <p style={{ color: 'var(--text-secondary)', margin: '0.25rem 0 0', fontSize: '0.9rem' }}>
              Gestión de empleados y pagos de nómina
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
              placeholder="Buscar empleado..."
              style={{ padding: '0.55rem 0.85rem 0.55rem 2.2rem', width: 220 }}
            />
          </div>
          {esAdmin && (
            <button onClick={abrirNuevo} className="btn-primary">
              <Plus size={15} /> Nuevo Empleado
            </button>
          )}
        </div>
      </div>

      {/* Resumen */}
      <div className="grid-3" style={{ marginBottom: '1.5rem' }}>
        <div className="card">
          <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '0.25rem' }}>Empleados activos</div>
          <div style={{ fontSize: '1.75rem', fontWeight: 700, color: 'var(--green-primary)' }}>{totalActivos}</div>
        </div>
        <div className="card">
          <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '0.25rem' }}>Empleados inactivos</div>
          <div style={{ fontSize: '1.75rem', fontWeight: 700, color: 'var(--text-muted)' }}>{totalInactivos}</div>
        </div>
        <div className="card">
          <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '0.25rem' }}>Nómina mensual (activos)</div>
          <div style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--text-primary)' }}>{fmtCOP(totalNomina)}</div>
        </div>
      </div>

      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        {loading ? (
          <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>Cargando...</div>
        ) : filtrados.length === 0 ? (
          <div style={{ padding: '3rem 1.5rem', textAlign: 'center', color: 'var(--text-secondary)' }}>
            <UserCircle2 size={56} style={{ marginBottom: '0.75rem', opacity: 0.4 }} />
            <p style={{ margin: 0, fontSize: '1rem', fontWeight: 600, color: 'var(--text-primary)' }}>
              {busqueda ? 'Sin resultados' : 'No hay empleados registrados'}
            </p>
            <p style={{ margin: '0.4rem 0 0', fontSize: '0.88rem' }}>
              {busqueda ? 'Prueba con otro término.' : 'Registra tu primer empleado con el botón "Nuevo Empleado".'}
            </p>
          </div>
        ) : (
          <table style={{ width: '100%' }}>
            <thead>
              <tr>
                <th>Nombre</th>
                <th>Cédula</th>
                <th>Cargo</th>
                <th>Tipo contrato</th>
                <th>Salario</th>
                <th>Ingreso</th>
                <th>Estado</th>
                {esAdmin && <th style={{ textAlign: 'right' }}>Acciones</th>}
              </tr>
            </thead>
            <tbody>
              {filtrados.map(emp => (
                <tr key={emp.id_empleado}>
                  <td>
                    <div style={{ fontWeight: 600 }}>{emp.nombre}</div>
                    {emp.correo && (
                      <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{emp.correo}</div>
                    )}
                  </td>
                  <td style={{ color: 'var(--text-secondary)' }}>{emp.documento_identidad || '—'}</td>
                  <td style={{ color: 'var(--text-secondary)' }}>{emp.cargo || '—'}</td>
                  <td style={{ color: 'var(--text-secondary)' }}>{emp.tipo_contrato || '—'}</td>
                  <td style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{fmtCOP(emp.salario_base)}</td>
                  <td style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
                    {emp.fecha_ingreso ? new Date(emp.fecha_ingreso).toLocaleDateString('es-CO') : '—'}
                  </td>
                  <td>
                    <button
                      onClick={() => esAdmin && toggleEstado(emp)}
                      disabled={!esAdmin}
                      style={{
                        background: 'transparent', border: 'none', cursor: esAdmin ? 'pointer' : 'default',
                        padding: 0, fontFamily: 'inherit',
                      }}
                    >
                      <span style={{
                        display: 'inline-block', padding: '0.2rem 0.6rem', borderRadius: 999,
                        fontSize: '0.75rem', fontWeight: 700,
                        background: emp.estado ? 'rgba(45, 212, 109, 0.15)' : 'rgba(239, 68, 68, 0.15)',
                        color: emp.estado ? 'var(--green-primary)' : '#ef4444',
                      }}>
                        {emp.estado ? 'Activo' : 'Inactivo'}
                      </span>
                    </button>
                  </td>
                  {esAdmin && (
                    <td style={{ textAlign: 'right' }}>
                      <button onClick={() => abrirEditar(emp)} title="Editar" style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: 4, color: 'var(--text-secondary)' }}>
                        <Edit2 size={16} />
                      </button>
                      <button onClick={() => eliminar(emp)} title="Eliminar" style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: 4, color: '#ef4444', marginLeft: 4 }}>
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
          <div className="modal-content" onClick={e => e.stopPropagation()} style={{ maxWidth: 600 }}>
            <div className="modal-header">
              <h2>{editId ? 'Editar' : 'Nuevo'} Empleado</h2>
              <button className="close-btn" onClick={() => setShowModal(false)}><X /></button>
            </div>
            {error && (
              <div style={{ background: 'rgba(231, 76, 60, 0.1)', border: '1px solid rgba(231, 76, 60, 0.3)', borderRadius: 8, padding: '0.6rem 0.85rem', marginBottom: '1rem', color: '#b91c1c', fontSize: '0.88rem' }}>
                {error}
              </div>
            )}
            <form onSubmit={guardar} style={{ display: 'grid', gap: '0.85rem' }}>
              <div>
                <label>Nombre completo *</label>
                <input value={form.nombre} onChange={e => setForm({ ...form, nombre: e.target.value })} required autoFocus />
              </div>
              <div className="grid-2">
                <div>
                  <label>Cédula</label>
                  <input value={form.documento_identidad} onChange={e => setForm({ ...form, documento_identidad: e.target.value })} />
                </div>
                <div>
                  <label>Teléfono</label>
                  <input value={form.telefono} onChange={e => setForm({ ...form, telefono: e.target.value })} />
                </div>
              </div>
              <div>
                <label>Correo</label>
                <input type="email" value={form.correo} onChange={e => setForm({ ...form, correo: e.target.value })} />
              </div>
              <div>
                <label>Dirección</label>
                <input value={form.direccion} onChange={e => setForm({ ...form, direccion: e.target.value })} />
              </div>
              <div className="grid-2">
                <div>
                  <label>Cargo</label>
                  <input value={form.cargo} onChange={e => setForm({ ...form, cargo: e.target.value })} placeholder="Ej: Cajero, Vendedor..." />
                </div>
                <div>
                  <label>Tipo de contrato</label>
                  <select value={form.tipo_contrato} onChange={e => setForm({ ...form, tipo_contrato: e.target.value })}>
                    <option>Indefinido</option>
                    <option>Prestación de servicios</option>
                    <option>Temporal</option>
                    <option>Aprendizaje</option>
                  </select>
                </div>
              </div>
              <div className="grid-2">
                <div>
                  <label>Salario base mensual</label>
                  <input type="number" min="0" step="1000" value={form.salario_base} onChange={e => setForm({ ...form, salario_base: e.target.value })} />
                </div>
                <div>
                  <label>Fecha de ingreso</label>
                  <input type="date" value={form.fecha_ingreso} onChange={e => setForm({ ...form, fecha_ingreso: e.target.value })} />
                </div>
              </div>
              <div>
                <label>Notas</label>
                <textarea value={form.notas} onChange={e => setForm({ ...form, notas: e.target.value })} rows={2} />
              </div>
              <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem' }}>
                <button type="submit" className="btn-primary" disabled={guardando}>
                  <Save size={15} /> {guardando ? 'Guardando...' : (editId ? 'Guardar cambios' : 'Crear empleado')}
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

export default Nomina;
