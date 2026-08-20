import { useState, useEffect } from 'react';
import { API_URL } from '../config';
import { apiGet, apiPost, apiPut, apiDelete } from '../api';
import {
  UserCircle2, Plus, Edit2, Trash2, Search, Phone, Mail, MapPin, Hash,
  X, Save, DollarSign, Briefcase, Calendar, Landmark, CreditCard, CheckCircle2,
  Wallet, Banknote, FileText
} from 'lucide-react';

const formVacio = {
  nombre: '', documento_identidad: '', telefono: '', correo: '', direccion: '',
  cargo: '', salario_base: 0, tipo_contrato: 'Indefinido',
  fecha_ingreso: new Date().toISOString().slice(0, 10),
  notas: '', banco: '', tipo_cuenta: 'Ahorros', cuenta_bancaria: '', periodicidad_pago: 'Mensual'
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

  // Pagos de nómina
  const [tab, setTab] = useState('empleados');
  const [configPago, setConfigPago] = useState({ banco: '', tipo_cuenta: 'Ahorros', numero_cuenta: '', titular: '' });
  const [pagos, setPagos] = useState([]);
  const [periodo, setPeriodo] = useState(() => new Date().toISOString().slice(0, 7));
  const [showGenerarPago, setShowGenerarPago] = useState(false);
  const [pagoSeleccion, setPagoSeleccion] = useState([]);
  const [metodoPago, setMetodoPago] = useState('Transferencia');
  const [notasPago, setNotasPago] = useState('');

  useEffect(() => { cargar(); cargarConfig(); cargarPagos(); }, []);

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

  const cargarConfig = async () => {
    try {
      const data = await apiGet(`${API_URL}/api/nomina/configuracion`);
      if (data && Object.keys(data).length) setConfigPago(data);
    } catch (err) { console.error('Error cargando configuración:', err); }
  };

  const cargarPagos = async () => {
    try {
      const data = await apiGet(`${API_URL}/api/nomina/pagos`);
      setPagos(Array.isArray(data) ? data : []);
    } catch (err) { console.error('Error cargando pagos:', err); }
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
      banco: e.banco || '',
      tipo_cuenta: e.tipo_cuenta || 'Ahorros',
      cuenta_bancaria: e.cuenta_bancaria || '',
      periodicidad_pago: e.periodicidad_pago || 'Mensual',
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

  const guardarConfig = async (e) => {
    e.preventDefault();
    try {
      await apiPut(`${API_URL}/api/nomina/configuracion`, configPago);
      alert('Cuenta bancaria del negocio guardada.');
    } catch (err) {
      alert(`Error: ${err.message}`);
    }
  };

  const generarPagos = async (e) => {
    e.preventDefault();
    if (pagoSeleccion.length === 0) {
      alert('Selecciona al menos un empleado.');
      return;
    }
    try {
      const body = {
        periodo,
        empleados: pagoSeleccion.map(id => {
          const emp = empleados.find(x => x.id_empleado === id);
          return { id_empleado: id, monto: emp.salario_base };
        }),
        metodo_pago: metodoPago,
        notas: notasPago
      };
      await apiPost(`${API_URL}/api/nomina/pagos`, body);
      setShowGenerarPago(false);
      setPagoSeleccion([]);
      setNotasPago('');
      cargarPagos();
      alert('Pagos generados correctamente.');
    } catch (err) {
      alert(`Error: ${err.message}`);
    }
  };

  const marcarPagado = async (pago) => {
    try {
      await apiPut(`${API_URL}/api/nomina/pagos/${pago.id_pago}`, {
        estado: pago.estado === 'Pagado' ? 'Pendiente' : 'Pagado',
        fecha_pago: pago.estado === 'Pagado' ? null : new Date().toISOString()
      });
      cargarPagos();
    } catch (err) {
      alert(`Error: ${err.message}`);
    }
  };

  const eliminarPago = async (pago) => {
    if (!confirm('¿Eliminar este pago?')) return;
    try {
      await apiDelete(`${API_URL}/api/nomina/pagos/${pago.id_pago}`);
      cargarPagos();
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
  const pagosPendientes = pagos.filter(p => p.estado !== 'Pagado').reduce((acc, p) => acc + Number(p.monto || 0), 0);
  const pagosPagados = pagos.filter(p => p.estado === 'Pagado').reduce((acc, p) => acc + Number(p.monto || 0), 0);

  const inputStyle = { width: '100%' };

  return (
    <div style={{ padding: '2rem', maxWidth: 1200, margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '1rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <UserCircle2 size={26} color="var(--green-primary)" />
          <div>
            <h1 style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>Nómina</h1>
            <p style={{ color: 'var(--text-secondary)', margin: '0.25rem 0 0', fontSize: '0.9rem' }}>
              Gestión de empleados, pagos y cuenta bancaria del negocio
            </p>
          </div>
        </div>
        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
          {tab === 'empleados' && (
            <>
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
            </>
          )}
          {tab === 'pagos' && esAdmin && (
            <button onClick={() => setShowGenerarPago(true)} className="btn-primary">
              <Plus size={15} /> Generar Pagos
            </button>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.5rem', borderBottom: '1px solid var(--border-color)', paddingBottom: '0.75rem' }}>
        <button onClick={() => setTab('empleados')} style={{ padding: '0.5rem 1.1rem', borderRadius: 8, border: 'none', cursor: 'pointer', fontWeight: 600, fontSize: '0.9rem', background: tab === 'empleados' ? 'var(--green-primary)' : 'transparent', color: tab === 'empleados' ? '#fff' : 'var(--text-secondary)' }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}><UserCircle2 size={15} /> Empleados</span>
        </button>
        <button onClick={() => setTab('pagos')} style={{ padding: '0.5rem 1.1rem', borderRadius: 8, border: 'none', cursor: 'pointer', fontWeight: 600, fontSize: '0.9rem', background: tab === 'pagos' ? 'var(--green-primary)' : 'transparent', color: tab === 'pagos' ? '#fff' : 'var(--text-secondary)' }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}><Wallet size={15} /> Pagos</span>
        </button>
        {esAdmin && (
          <button onClick={() => setTab('cuenta')} style={{ padding: '0.5rem 1.1rem', borderRadius: 8, border: 'none', cursor: 'pointer', fontWeight: 600, fontSize: '0.9rem', background: tab === 'cuenta' ? 'var(--green-primary)' : 'transparent', color: tab === 'cuenta' ? '#fff' : 'var(--text-secondary)' }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}><Landmark size={15} /> Cuenta del negocio</span>
          </button>
        )}
      </div>

      {/* Resumen */}
      <div className="grid-3" style={{ marginBottom: '1.5rem' }}>
        <div className="card">
          <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '0.25rem' }}>Empleados activos</div>
          <div style={{ fontSize: '1.75rem', fontWeight: 700, color: 'var(--green-primary)' }}>{totalActivos}</div>
        </div>
        <div className="card">
          <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '0.25rem' }}>Nómina mensual (activos)</div>
          <div style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--text-primary)' }}>{fmtCOP(totalNomina)}</div>
        </div>
        <div className="card">
          <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '0.25rem' }}>Pagos pendientes</div>
          <div style={{ fontSize: '1.5rem', fontWeight: 700, color: pagosPendientes > 0 ? '#f59e0b' : 'var(--text-primary)' }}>{fmtCOP(pagosPendientes)}</div>
        </div>
      </div>

      {tab === 'empleados' && (
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
                  <th>Periodicidad</th>
                  <th>Salario</th>
                  <th>Cuenta bancaria</th>
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
                    <td>
                      <span style={{ display: 'inline-block', padding: '0.2rem 0.6rem', borderRadius: 999, fontSize: '0.75rem', fontWeight: 700, background: 'rgba(126, 217, 87, 0.12)', color: 'var(--green-primary)' }}>
                        {emp.periodicidad_pago || 'Mensual'}
                      </span>
                    </td>
                    <td style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{fmtCOP(emp.salario_base)}</td>
                    <td style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
                      {emp.cuenta_bancaria ? (
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem' }}>
                          <CreditCard size={13} /> {emp.banco || ''} {emp.cuenta_bancaria}
                        </span>
                      ) : '—'}
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
      )}

      {tab === 'pagos' && (
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          {pagos.length === 0 ? (
            <div style={{ padding: '3rem 1.5rem', textAlign: 'center', color: 'var(--text-secondary)' }}>
              <Wallet size={56} style={{ marginBottom: '0.75rem', opacity: 0.4 }} />
              <p style={{ margin: 0, fontSize: '1rem', fontWeight: 600, color: 'var(--text-primary)' }}>No hay pagos registrados</p>
              <p style={{ margin: '0.4rem 0 0', fontSize: '0.88rem' }}>
                Genera los pagos del periodo con el botón "Generar Pagos".
              </p>
            </div>
          ) : (
            <table style={{ width: '100%' }}>
              <thead>
                <tr>
                  <th>Periodo</th>
                  <th>Empleado</th>
                  <th>Monto</th>
                  <th>Método</th>
                  <th>Estado</th>
                  <th>Fecha pago</th>
                  {esAdmin && <th style={{ textAlign: 'right' }}>Acciones</th>}
                </tr>
              </thead>
              <tbody>
                {pagos.map(p => (
                  <tr key={p.id_pago}>
                    <td style={{ fontWeight: 600 }}>{p.periodo}</td>
                    <td>
                      <div style={{ fontWeight: 600 }}>{p.empleado_nombre || '—'}</div>
                      {p.cuenta_bancaria && (
                        <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{p.banco || ''} {p.cuenta_bancaria}</div>
                      )}
                    </td>
                    <td style={{ fontWeight: 600 }}>{fmtCOP(p.monto)}</td>
                    <td style={{ color: 'var(--text-secondary)' }}>{p.metodo_pago}</td>
                    <td>
                      <span style={{
                        display: 'inline-block', padding: '0.2rem 0.6rem', borderRadius: 999,
                        fontSize: '0.75rem', fontWeight: 700,
                        background: p.estado === 'Pagado' ? 'rgba(45, 212, 109, 0.15)' : 'rgba(245, 158, 11, 0.15)',
                        color: p.estado === 'Pagado' ? 'var(--green-primary)' : '#f59e0b',
                      }}>
                        {p.estado === 'Pagado' ? 'Pagado' : 'Pendiente'}
                      </span>
                    </td>
                    <td style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
                      {p.fecha_pago ? new Date(p.fecha_pago).toLocaleDateString('es-CO') : '—'}
                    </td>
                    {esAdmin && (
                      <td style={{ textAlign: 'right' }}>
                        <button onClick={() => marcarPagado(p)} title={p.estado === 'Pagado' ? 'Marcar pendiente' : 'Marcar pagado'} style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: 4, color: p.estado === 'Pagado' ? '#f59e0b' : 'var(--green-primary)' }}>
                          <CheckCircle2 size={16} />
                        </button>
                        <button onClick={() => eliminarPago(p)} title="Eliminar" style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: 4, color: '#ef4444', marginLeft: 4 }}>
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
      )}

      {tab === 'cuenta' && esAdmin && (
        <div className="card" style={{ maxWidth: 560 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem' }}>
            <Landmark size={18} color="var(--green-primary)" />
            <h2 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 600 }}>Cuenta bancaria del negocio</h2>
          </div>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.88rem', margin: '0 0 1rem', lineHeight: 1.5 }}>
            Guarda la cuenta desde la que pagas la nómina. Esto te sirve como referencia para hacer las transferencias
            a tus empleados (el sistema no hace transferencias automáticas, pero te deja todo listo para pagar).
          </p>
          <form onSubmit={guardarConfig} style={{ display: 'grid', gap: '0.85rem' }}>
            <div>
              <label>Banco</label>
              <input value={configPago.banco || ''} onChange={e => setConfigPago({ ...configPago, banco: e.target.value })} placeholder="Ej: Bancolombia, Davivienda..." style={inputStyle} />
            </div>
            <div className="grid-2">
              <div>
                <label>Tipo de cuenta</label>
                <select value={configPago.tipo_cuenta || 'Ahorros'} onChange={e => setConfigPago({ ...configPago, tipo_cuenta: e.target.value })} style={inputStyle}>
                  <option>Ahorros</option>
                  <option>Corriente</option>
                </select>
              </div>
              <div>
                <label>Número de cuenta</label>
                <input value={configPago.numero_cuenta || ''} onChange={e => setConfigPago({ ...configPago, numero_cuenta: e.target.value })} placeholder="000-000000-00" style={inputStyle} />
              </div>
            </div>
            <div>
              <label>Titular</label>
              <input value={configPago.titular || ''} onChange={e => setConfigPago({ ...configPago, titular: e.target.value })} placeholder="Nombre del titular" style={inputStyle} />
            </div>
            <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem' }}>
              <button type="submit" className="btn-primary"><Save size={15} /> Guardar cuenta</button>
            </div>
          </form>
        </div>
      )}

      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal-content" onClick={e => e.stopPropagation()} style={{ maxWidth: 640 }}>
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
                  <label>Salario base</label>
                  <input type="number" min="0" step="1000" value={form.salario_base} onChange={e => setForm({ ...form, salario_base: e.target.value })} />
                </div>
                <div>
                  <label>Periodicidad de pago</label>
                  <select value={form.periodicidad_pago} onChange={e => setForm({ ...form, periodicidad_pago: e.target.value })}>
                    <option>Mensual</option>
                    <option>Quincenal</option>
                    <option>Semanal</option>
                  </select>
                </div>
              </div>
              <div className="grid-2">
                <div>
                  <label>Fecha de ingreso</label>
                  <input type="date" value={form.fecha_ingreso} onChange={e => setForm({ ...form, fecha_ingreso: e.target.value })} />
                </div>
                <div>
                  <label>Banco</label>
                  <input value={form.banco} onChange={e => setForm({ ...form, banco: e.target.value })} placeholder="Ej: Bancolombia" />
                </div>
              </div>
              <div className="grid-2">
                <div>
                  <label>Tipo de cuenta</label>
                  <select value={form.tipo_cuenta} onChange={e => setForm({ ...form, tipo_cuenta: e.target.value })}>
                    <option>Ahorros</option>
                    <option>Corriente</option>
                  </select>
                </div>
                <div>
                  <label>Número de cuenta</label>
                  <input value={form.cuenta_bancaria} onChange={e => setForm({ ...form, cuenta_bancaria: e.target.value })} placeholder="000-000000-00" />
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

      {showGenerarPago && (
        <div className="modal-overlay" onClick={() => setShowGenerarPago(false)}>
          <div className="modal-content" onClick={e => e.stopPropagation()} style={{ maxWidth: 560 }}>
            <div className="modal-header">
              <h2>Generar Pagos de Nómina</h2>
              <button className="close-btn" onClick={() => setShowGenerarPago(false)}><X /></button>
            </div>
            <form onSubmit={generarPagos} style={{ display: 'grid', gap: '0.85rem' }}>
              <div className="grid-2">
                <div>
                  <label>Periodo</label>
                  <input type="month" value={periodo} onChange={e => setPeriodo(e.target.value)} required />
                </div>
                <div>
                  <label>Método de pago</label>
                  <select value={metodoPago} onChange={e => setMetodoPago(e.target.value)}>
                    <option>Transferencia</option>
                    <option>Efectivo</option>
                    <option>Cheque</option>
                  </select>
                </div>
              </div>
              <div>
                <label>Empleados a pagar (usa el salario base)</label>
                <div style={{ maxHeight: 220, overflowY: 'auto', border: '1px solid var(--border-color)', borderRadius: 8, padding: '0.5rem' }}>
                  {empleados.filter(e => e.estado).map(emp => (
                    <label key={emp.id_empleado} style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', padding: '0.4rem 0.5rem', borderRadius: 6, cursor: 'pointer', fontSize: '0.9rem' }}>
                      <input
                        type="checkbox"
                        checked={pagoSeleccion.includes(emp.id_empleado)}
                        onChange={e => {
                          if (e.target.checked) setPagoSeleccion([...pagoSeleccion, emp.id_empleado]);
                          else setPagoSeleccion(pagoSeleccion.filter(id => id !== emp.id_empleado));
                        }}
                      />
                      <span style={{ flex: 1 }}>{emp.nombre}</span>
                      <span style={{ color: 'var(--text-secondary)', fontSize: '0.82rem' }}>{fmtCOP(emp.salario_base)}</span>
                    </label>
                  ))}
                  {empleados.filter(e => e.estado).length === 0 && (
                    <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', padding: '0.5rem' }}>No hay empleados activos.</p>
                  )}
                </div>
              </div>
              <div>
                <label>Notas</label>
                <textarea value={notasPago} onChange={e => setNotasPago(e.target.value)} rows={2} placeholder="Ej: Pago quincena 1 de agosto" />
              </div>
              <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem' }}>
                <button type="submit" className="btn-primary"><Save size={15} /> Generar pagos</button>
                <button type="button" className="btn-secondary" onClick={() => setShowGenerarPago(false)}>Cancelar</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default Nomina;