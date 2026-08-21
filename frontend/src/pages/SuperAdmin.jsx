import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { API_URL } from '../config';
import { Shield, Check, X, LogOut, RefreshCw, Store, Users,
  TrendingUp, CheckCircle2, AlertCircle, Clock, ShieldCheck, Eye, EyeOff,
  Bot, Send, Ticket
} from 'lucide-react';
import Logo from '../components/Logo';

const SuperAdmin = () => {
  const navigate = useNavigate();
  const [loggedIn, setLoggedIn] = useState(false);
  const [superAdmin, setSuperAdmin] = useState(null);
  const [token, setToken] = useState(null);
  const [solicitudes, setSolicitudes] = useState([]);
  const [locales, setLocales] = useState([]);
  const [metricas, setMetricas] = useState(null);
  const [loading, setLoading] = useState(false);
  const [tab, setTab] = useState('solicitudes');
  const [loginForm, setLoginForm] = useState({ correo: '', contrasena: '' });
  const [loginError, setLoginError] = useState('');
  const [loginLoading, setLoginLoading] = useState(false);
  const [feedback, setFeedback] = useState({}); // { idUsuario: 'aprobando' }
  const [showPwd, setShowPwd] = useState(false); // v1.5.5: mostrar/ocultar contraseña
  const [tickets, setTickets] = useState([]); // v1.9.0: tickets de soporte
  const [reporteEnviando, setReporteEnviando] = useState(false); // v1.9.0: bot automatizaciones
  const [reporteMsg, setReporteMsg] = useState(null);

  // Recuperar sesión del super-admin
  useEffect(() => {
    const t = localStorage.getItem('super_admin_token');
    const u = localStorage.getItem('super_admin_user');
    if (t && u) {
      setToken(t);
      setSuperAdmin(JSON.parse(u));
      setLoggedIn(true);
    }
  }, []);

  // Cargar datos cuando está logueado
  useEffect(() => {
    if (loggedIn) cargarDatos();
  }, [loggedIn]);

  const cargarDatos = async () => {
    setLoading(true);
    try {
      const headers = { Authorization: `Bearer ${token}` };
      const [s, l, m, t] = await Promise.all([
        fetch(`${API_URL}/api/super/solicitudes`, { headers }).then(r => r.json()),
        fetch(`${API_URL}/api/super/locales`, { headers }).then(r => r.json()),
        fetch(`${API_URL}/api/super/metricas`, { headers }).then(r => r.json()),
        fetch(`${API_URL}/api/super/tickets`, { headers }).then(r => r.json()),
      ]);
      setSolicitudes(Array.isArray(s) ? s : []);
      setLocales(Array.isArray(l) ? l : []);
      setMetricas(m);
      setTickets(Array.isArray(t) ? t : []);
    } catch (err) {
      console.error('Error cargando datos:', err);
    } finally {
      setLoading(false);
    }
  };

  // v1.9.0: enviar reporte automático (bot de automatizaciones)
  const enviarReporte = async (tipo) => {
    setReporteEnviando(true);
    setReporteMsg(null);
    try {
      const r = await fetch(`${API_URL}/api/super/reporte`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ tipo }),
      });
      const data = await r.json();
      if (r.ok) {
        setReporteMsg({
          ok: true,
          text: data.enviado
            ? `Reporte ${tipo === 'mensual' ? 'mensual' : 'semanal'} enviado a tu correo.`
            : 'Reporte generado, pero el correo no se pudo enviar (revisa la configuración SMTP).',
        });
      } else {
        setReporteMsg({ ok: false, text: data.error || 'Error al generar el reporte.' });
      }
    } catch {
      setReporteMsg({ ok: false, text: 'Error de conexión.' });
    } finally {
      setReporteEnviando(false);
    }
  };

  const handleLogin = async (e) => {
    e.preventDefault();
    setLoginError('');
    setLoginLoading(true);
    try {
      const r = await fetch(`${API_URL}/api/super/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          correo: loginForm.correo.trim(),
          contrasena: loginForm.contrasena,  // NO trim aquí para no romper contraseñas con espacios intencionales
        }),
      });
      const data = await r.json();
      if (!r.ok) {
        // Mostrar info de debug para diagnosticar
        console.log('[SuperAdmin login] Status:', r.status, 'Body:', data);
        throw new Error(data.error || `Error ${r.status}: ${r.statusText}`);
      }
      setToken(data.token);
      setSuperAdmin(data.user);
      localStorage.setItem('super_admin_token', data.token);
      localStorage.setItem('super_admin_user', JSON.stringify(data.user));
      setLoggedIn(true);
    } catch (err) {
      setLoginError(err.message);
    } finally {
      setLoginLoading(false);
    }
  };

  const handleLogout = () => {
    setLoggedIn(false);
    setToken(null);
    setSuperAdmin(null);
    localStorage.removeItem('super_admin_token');
    localStorage.removeItem('super_admin_user');
  };

  const aprobar = async (idUsuario, nombre) => {
    if (!confirm(`¿Aprobar a "${nombre}"?\n\nAhora podrá usar el sistema con su cuenta.`)) return;
    setFeedback({ ...feedback, [idUsuario]: 'aprobando' });
    try {
      const r = await fetch(`${API_URL}/api/super/aprobar-solicitud/${idUsuario}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error);
      alert(`✅ ${data.message}`);
      cargarDatos();
    } catch (err) {
      alert(`Error: ${err.message}`);
    } finally {
      setFeedback({ ...feedback, [idUsuario]: null });
    }
  };

  const rechazar = async (idUsuario, nombre) => {
    const motivo = prompt(`¿Por qué rechazas la solicitud de "${nombre}"?\n\nEste motivo se guarda en la BD:`);
    if (motivo === null) return;
    setFeedback({ ...feedback, [idUsuario]: 'rechazando' });
    try {
      const r = await fetch(`${API_URL}/api/super/rechazar-solicitud/${idUsuario}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ motivo }),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error);
      alert(`❌ ${data.message}`);
      cargarDatos();
    } catch (err) {
      alert(`Error: ${err.message}`);
    } finally {
      setFeedback({ ...feedback, [idUsuario]: null });
    }
  };

  // Pantalla de login
  if (!loggedIn) {
    return (
      <div style={{
        minHeight: '100vh', background: '#0a1a0e', color: '#fff',
        fontFamily: 'Inter, system-ui, sans-serif',
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '2rem',
        backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)', border: '1px solid rgba(255, 255, 255, 0.1)',
      }}>
        <div style={{
          background: 'rgba(20, 40, 25, 0.6)', backdropFilter: 'blur(16px)',
          border: '1px solid rgba(126, 217, 87, 0.2)', borderRadius: '20px',
          padding: '2.5rem', maxWidth: '420px', width: '100%',
          boxShadow: '0 20px 60px rgba(0, 0, 0, 0.4)',
        }}>
          <div style={{ textAlign: 'center', marginBottom: '1.5rem' }}>
            <div style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 72, height: 72, borderRadius: '50%', background: 'rgba(126, 217, 87, 0.15)', border: '2px solid rgba(126, 217, 87, 0.4)', marginBottom: '1rem' }}>
              <Shield size={36} color="#7ed957" />
            </div>
            <h1 style={{ fontSize: '1.5rem', fontWeight: 700, color: '#7ed957', margin: 0 }}>
              Panel del Super-Administrador
            </h1>
            <p style={{ color: 'rgba(255, 255, 255, 0.6)', fontSize: '0.9rem', margin: '0.4rem 0 0' }}>
              Acceso restringido. Solo para el dueño de la plataforma.
            </p>
          </div>

          {loginError && (
            <div style={{ background: 'rgba(231, 76, 60, 0.1)', border: '1px solid rgba(231, 76, 60, 0.3)', borderRadius: 10, padding: '0.7rem 1rem', marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.88rem', color: '#ff8a6b' }}>
              <AlertCircle size={16} /> {loginError}
            </div>
          )}

          <form onSubmit={handleLogin}>
            <div style={{ marginBottom: '0.85rem' }}>
              <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: 'rgba(255, 255, 255, 0.85)', marginBottom: '0.35rem' }}>Correo</label>
              <input
                type="email"
                value={loginForm.correo}
                onChange={e => setLoginForm({ ...loginForm, correo: e.target.value })}
                required
                autoFocus
                placeholder="super@posmaster.com"
                style={{
                  width: '100%', padding: '0.75rem 0.9rem',
                  background: 'rgba(255, 255, 255, 0.05)',
                  border: '1.5px solid rgba(126, 217, 87, 0.15)',
                  borderRadius: '10px', color: '#fff', fontSize: '0.95rem',
                  fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box',
                }}
              />
            </div>
            <div style={{ marginBottom: '1.25rem' }}>
              <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: 'rgba(255, 255, 255, 0.85)', marginBottom: '0.35rem' }}>Contraseña</label>
              <div style={{ position: 'relative' }}>
                <input
                  type={showPwd ? 'text' : 'password'}
                  value={loginForm.contrasena}
                  onChange={e => setLoginForm({ ...loginForm, contrasena: e.target.value })}
                  required
                  placeholder="SuperPOS2024!Admin"
                  style={{
                    width: '100%', padding: '0.75rem 2.6rem 0.75rem 0.9rem',
                    background: 'rgba(255, 255, 255, 0.05)',
                    border: '1.5px solid rgba(126, 217, 87, 0.15)',
                    borderRadius: '10px', color: '#fff', fontSize: '0.95rem',
                    fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box',
                  }}
                />
                <button type="button" onClick={() => setShowPwd(v => !v)}
                  style={{
                    position: 'absolute', right: '0.6rem', top: '50%', transform: 'translateY(-50%)',
                    background: 'none', border: 'none', cursor: 'pointer',
                    color: 'rgba(255,255,255,0.5)', padding: '0.4rem',
                  }}
                  title={showPwd ? 'Ocultar contraseña' : 'Mostrar contraseña'}>
                  {showPwd ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>
            <button
              type="submit"
              disabled={loginLoading}
              style={{
                width: '100%', background: '#1a8a4a', color: 'white',
                border: 'none', padding: '0.85rem', borderRadius: '10px',
                fontSize: '0.95rem', fontWeight: 700, cursor: loginLoading ? 'not-allowed' : 'pointer',
                opacity: loginLoading ? 0.6 : 1, fontFamily: 'inherit',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem',
              }}
            >
              <ShieldCheck size={16} />
              {loginLoading ? 'Verificando...' : 'Acceder al Panel'}
            </button>
          </form>

          <div style={{ marginTop: '1.5rem', paddingTop: '1rem', borderTop: '1px solid rgba(255, 255, 255, 0.08)', textAlign: 'center' }}>
            <button onClick={() => navigate('/login')} style={{ background: 'none', border: 'none', color: 'rgba(255, 255, 255, 0.6)', fontSize: '0.85rem', cursor: 'pointer', fontFamily: 'inherit' }}>
              ← Volver al login de clientes
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Panel logueado
  return (
    <div style={{ minHeight: '100vh', background: '#0a1a0e', color: '#fff', fontFamily: 'Inter, system-ui, sans-serif' }}>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } } .spin { animation: spin 1s linear infinite; }`}</style>

      {/* Header */}
      <div style={{
        background: 'rgba(20, 40, 25, 0.8)', backdropFilter: 'blur(12px)',
        borderBottom: '1px solid rgba(126, 217, 87, 0.15)',
        padding: '1rem 2rem', display: 'flex', alignItems: 'center', gap: '1rem',
      }}>
        <Logo size={40} glow={false} />
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: '0.95rem', fontWeight: 700, color: '#7ed957' }}>
            Panel del Super-Administrador
          </div>
          <div style={{ fontSize: '0.78rem', color: 'rgba(255, 255, 255, 0.6)' }}>
            {superAdmin?.nombre} ({superAdmin?.correo})
          </div>
        </div>
        <button onClick={handleLogout} style={{
          background: 'rgba(231, 76, 60, 0.1)', color: '#ff8a6b',
          border: '1px solid rgba(231, 76, 60, 0.3)', padding: '0.5rem 0.9rem',
          borderRadius: 8, fontSize: '0.85rem', fontWeight: 600, cursor: 'pointer',
          display: 'flex', alignItems: 'center', gap: '0.4rem', fontFamily: 'inherit',
        }}>
          <LogOut size={14} /> Cerrar sesión
        </button>
      </div>

      <div style={{ maxWidth: 1200, margin: '0 auto', padding: '1.5rem 2rem' }}>
        {/* Métricas */}
        {metricas && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '0.75rem', marginBottom: '1.5rem' }}>
            <MetricaCard icon={Store} label="Locales" value={metricas.total_locales} color="#7ed957" />
            <MetricaCard icon={Users} label="Usuarios" value={metricas.total_usuarios} color="#60a5fa" />
            <MetricaCard
              icon={Clock}
              label="Pendientes"
              value={metricas.pendientes_aprobacion}
              color={metricas.pendientes_aprobacion > 0 ? '#ff8a6b' : '#7ed957'}
              destacado={metricas.pendientes_aprobacion > 0}
            />
            <MetricaCard icon={TrendingUp} label="Ventas históricas" value={metricas.total_ventas_historicas} color="#fbbf24" />
          </div>
        )}

        {/* Tabs */}
        <div style={{ display: 'flex', borderBottom: '1px solid rgba(255, 255, 255, 0.08)', marginBottom: '1.5rem', gap: '0.5rem' }}>
          {[
            { id: 'solicitudes', label: 'Solicitudes Pendientes', count: solicitudes.length },
            { id: 'locales', label: 'Todos los Locales', count: locales.length },
            { id: 'automatizaciones', label: 'Automatizaciones', count: tickets.filter(t => t.estado === 'Abierto').length },
          ].map(t => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              style={{
                background: 'transparent', border: 'none',
                color: tab === t.id ? '#7ed957' : 'rgba(255, 255, 255, 0.6)',
                borderBottom: tab === t.id ? '2px solid #7ed957' : '2px solid transparent',
                padding: '0.75rem 1.25rem', fontSize: '0.92rem',
                fontWeight: tab === t.id ? 700 : 500, cursor: 'pointer',
                fontFamily: 'inherit',
              }}
            >
              {t.label} {t.count > 0 && (
                <span style={{
                  background: tab === t.id ? '#7ed957' : 'rgba(126, 217, 87, 0.2)',
                  color: tab === t.id ? '#0a1a0e' : '#7ed957',
                  padding: '0.1rem 0.45rem', borderRadius: 10, fontSize: '0.75rem',
                  marginLeft: '0.4rem', fontWeight: 700,
                }}>{t.count}</span>
              )}
            </button>
          ))}
          <div style={{ flex: 1 }} />
          <button onClick={cargarDatos} style={{
            background: 'rgba(255, 255, 255, 0.05)', border: '1px solid rgba(255, 255, 255, 0.1)',
            color: '#7ed957', padding: '0.4rem 0.8rem', borderRadius: 8,
            fontSize: '0.82rem', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.3rem', fontFamily: 'inherit',
          }}>
            <RefreshCw size={13} className={loading ? 'spin' : ''} /> Refrescar
          </button>
        </div>

        {/* Contenido */}
        {tab === 'solicitudes' && (
          <div>
            {solicitudes.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '3rem 1rem', background: 'rgba(255, 255, 255, 0.03)', borderRadius: 12, color: 'rgba(255, 255, 255, 0.5)' }}>
                <CheckCircle2 size={48} color="#7ed957" style={{ marginBottom: '0.75rem' }} />
                <p style={{ margin: 0, fontSize: '0.95rem' }}>No hay solicitudes pendientes.</p>
                <p style={{ margin: '0.4rem 0 0', fontSize: '0.85rem' }}>Todos los clientes han sido gestionados.</p>
              </div>
            ) : (
              <div style={{ display: 'grid', gap: '0.85rem' }}>
                {solicitudes.map(s => {
                  const fb = feedback[s.id_usuario];
                  return (
                    <div key={s.id_usuario} style={{
                      background: 'rgba(20, 40, 25, 0.5)',
                      border: '1px solid rgba(255, 255, 255, 0.08)',
                      borderRadius: 12, padding: '1.1rem 1.25rem',
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
                        <div style={{ flex: 1, minWidth: 200 }}>
                          <div style={{ fontWeight: 700, fontSize: '0.95rem' }}>{s.nombre}</div>
                          <div style={{ color: 'rgba(255, 255, 255, 0.6)', fontSize: '0.82rem' }}>{s.correo}</div>
                          <div style={{ color: 'rgba(255, 255, 255, 0.5)', fontSize: '0.78rem', marginTop: '0.3rem' }}>
                            📍 {s.nombre_local} {s.ciudad && `· ${s.ciudad}`} · Cédula: {s.documento_identidad} · {new Date(s.fecha_registro).toLocaleString('es-CO')}
                          </div>
                        </div>
                        <div style={{ display: 'flex', gap: '0.5rem' }}>
                          <button
                            onClick={() => aprobar(s.id_usuario, s.nombre)}
                            disabled={!!fb}
                            style={{
                              background: '#1a8a4a', color: 'white', border: 'none',
                              padding: '0.55rem 1rem', borderRadius: 8,
                              fontSize: '0.88rem', fontWeight: 700,
                              cursor: fb ? 'not-allowed' : 'pointer',
                              opacity: fb ? 0.5 : 1,
                              display: 'flex', alignItems: 'center', gap: '0.4rem',
                              fontFamily: 'inherit',
                            }}
                          >
                            <Check size={14} className={fb === 'aprobando' ? 'spin' : ''} />
                            {fb === 'aprobando' ? 'Aprobando...' : 'Aprobar'}
                          </button>
                          <button
                            onClick={() => rechazar(s.id_usuario, s.nombre)}
                            disabled={!!fb}
                            style={{
                              background: 'rgba(231, 76, 60, 0.15)', color: '#ff6b6b',
                              border: '1px solid rgba(231, 76, 60, 0.3)',
                              padding: '0.55rem 1rem', borderRadius: 8,
                              fontSize: '0.88rem', fontWeight: 700,
                              cursor: fb ? 'not-allowed' : 'pointer',
                              opacity: fb ? 0.5 : 1,
                              display: 'flex', alignItems: 'center', gap: '0.4rem',
                              fontFamily: 'inherit',
                            }}
                          >
                            <X size={14} className={fb === 'rechazando' ? 'spin' : ''} />
                            {fb === 'rechazando' ? 'Rechazando...' : 'Rechazar'}
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {tab === 'locales' && (
          <div style={{ display: 'grid', gap: '0.75rem' }}>
            {locales.map(l => (
              <div key={l.id_local} style={{
                background: 'rgba(20, 40, 25, 0.5)',
                border: '1px solid rgba(255, 255, 255, 0.08)',
                borderRadius: 12, padding: '1rem 1.25rem',
                display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap',
              }}>
                <div style={{ flex: 1, minWidth: 200 }}>
                  <div style={{ fontWeight: 700, fontSize: '0.95rem' }}>{l.nombre_local}</div>
                  <div style={{ color: 'rgba(255, 255, 255, 0.55)', fontSize: '0.8rem', marginTop: '0.2rem' }}>
                    {l.direccion || 'Sin dirección'} {l.ciudad && `· ${l.ciudad}`} {l.nit && `· NIT: ${l.nit}`}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: '1rem', fontSize: '0.85rem', color: 'rgba(255, 255, 255, 0.75)' }}>
                  <span><Users size={13} style={{ verticalAlign: 'middle', marginRight: 3 }} />{l.total_usuarios} usuarios</span>
                  {l.pendientes_aprobacion > 0 && (
                    <span style={{ color: '#ff8a6b', fontWeight: 700 }}>
                      <Clock size={13} style={{ verticalAlign: 'middle', marginRight: 3 }} />
                      {l.pendientes_aprobacion} pendiente{parseInt(l.pendientes_aprobacion) > 1 ? 's' : ''}
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {tab === 'automatizaciones' && (
          <div style={{ display: 'grid', gap: '1rem' }}>
            <div style={{
              background: 'rgba(20, 40, 25, 0.5)',
              border: '1px solid rgba(255, 255, 255, 0.08)',
              borderRadius: 12, padding: '1.25rem 1.5rem',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '0.75rem' }}>
                <Bot size={20} color="#7ed957" />
                <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 700 }}>Bot de Automatizaciones</h3>
                <span style={{
                  marginLeft: 'auto', padding: '0.2rem 0.7rem', borderRadius: 999, fontSize: '0.75rem', fontWeight: 700,
                  background: 'rgba(126, 217, 87, 0.15)', color: '#7ed957',
                }}>● Activo</span>
              </div>
              <p style={{ margin: 0, color: 'rgba(255, 255, 255, 0.6)', fontSize: '0.88rem', lineHeight: 1.6 }}>
                El bot genera reportes automáticos con el resumen del sistema (locales, usuarios, ventas y tickets de soporte)
                y los envía a tu correo. Se ejecuta automáticamente:
              </p>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '0.75rem', marginTop: '1rem' }}>
                <div style={{ background: 'rgba(255, 255, 255, 0.04)', borderRadius: 10, padding: '0.9rem 1rem' }}>
                  <div style={{ fontWeight: 700, fontSize: '0.9rem', color: '#7ed957' }}>📅 Reporte semanal</div>
                  <div style={{ color: 'rgba(255, 255, 255, 0.55)', fontSize: '0.82rem', marginTop: '0.25rem' }}>Todos los lunes a las 8:00 am</div>
                </div>
                <div style={{ background: 'rgba(255, 255, 255, 0.04)', borderRadius: 10, padding: '0.9rem 1rem' }}>
                  <div style={{ fontWeight: 700, fontSize: '0.9rem', color: '#7ed957' }}>📊 Reporte mensual</div>
                  <div style={{ color: 'rgba(255, 255, 255, 0.55)', fontSize: '0.82rem', marginTop: '0.25rem' }}>El día 1 de cada mes a las 8:00 am</div>
                </div>
              </div>
              <div style={{ display: 'flex', gap: '0.75rem', marginTop: '1.25rem', flexWrap: 'wrap' }}>
                <button
                  onClick={() => enviarReporte('semanal')}
                  disabled={reporteEnviando}
                  style={{
                    background: '#7ed957', border: 'none', color: '#0a1a0e', fontWeight: 700,
                    padding: '0.6rem 1.2rem', borderRadius: 8, cursor: 'pointer', fontSize: '0.88rem',
                    display: 'flex', alignItems: 'center', gap: '0.4rem', fontFamily: 'inherit',
                  }}
                >
                  <Send size={14} /> {reporteEnviando ? 'Enviando...' : 'Enviar reporte semanal ahora'}
                </button>
                <button
                  onClick={() => enviarReporte('mensual')}
                  disabled={reporteEnviando}
                  style={{
                    background: 'rgba(255, 255, 255, 0.08)', border: '1px solid rgba(255, 255, 255, 0.15)',
                    color: '#fff', fontWeight: 600, padding: '0.6rem 1.2rem', borderRadius: 8,
                    cursor: 'pointer', fontSize: '0.88rem', display: 'flex', alignItems: 'center', gap: '0.4rem', fontFamily: 'inherit',
                  }}
                >
                  <Send size={14} /> Enviar reporte mensual ahora
                </button>
              </div>
              {reporteMsg && (
                <div style={{
                  marginTop: '1rem', padding: '0.75rem 1rem', borderRadius: 8, fontSize: '0.85rem',
                  background: reporteMsg.ok ? 'rgba(126, 217, 87, 0.1)' : 'rgba(255, 138, 107, 0.1)',
                  border: '1px solid ' + (reporteMsg.ok ? 'rgba(126, 217, 87, 0.3)' : 'rgba(255, 138, 107, 0.3)'),
                  color: reporteMsg.ok ? '#7ed957' : '#ff8a6b',
                }}>
                  {reporteMsg.text}
                </div>
              )}
            </div>

            <div style={{
              background: 'rgba(20, 40, 25, 0.5)',
              border: '1px solid rgba(255, 255, 255, 0.08)',
              borderRadius: 12, padding: '1.25rem 1.5rem',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '0.75rem' }}>
                <Ticket size={20} color="#fbbf24" />
                <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 700 }}>Tickets de Soporte</h3>
              </div>
              {tickets.length === 0 ? (
                <p style={{ margin: 0, color: 'rgba(255, 255, 255, 0.5)', fontSize: '0.88rem' }}>
                  No hay tickets de soporte registrados.
                </p>
              ) : (
                <div style={{ display: 'grid', gap: '0.6rem' }}>
                  {tickets.map(t => (
                    <div key={t.id_ticket} style={{
                      background: 'rgba(255, 255, 255, 0.04)', borderRadius: 10, padding: '0.85rem 1rem',
                      display: 'flex', alignItems: 'flex-start', gap: '0.75rem',
                    }}>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontWeight: 700, fontSize: '0.9rem' }}>{t.asunto || 'Consulta'}</div>
                        <div style={{ color: 'rgba(255, 255, 255, 0.55)', fontSize: '0.82rem', marginTop: '0.2rem' }}>
                          {t.nombre} {t.correo && `· ${t.correo}`} · Local {t.id_local}
                        </div>
                        <div style={{ color: 'rgba(255, 255, 255, 0.7)', fontSize: '0.85rem', marginTop: '0.4rem' }}>{t.mensaje}</div>
                      </div>
                      <span style={{
                        padding: '0.15rem 0.6rem', borderRadius: 999, fontSize: '0.72rem', fontWeight: 700, flexShrink: 0,
                        background: t.estado === 'Abierto' ? 'rgba(255, 138, 107, 0.15)' : 'rgba(126, 217, 87, 0.15)',
                        color: t.estado === 'Abierto' ? '#ff8a6b' : '#7ed957',
                      }}>{t.estado}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

const MetricaCard = ({ icon: Icon, label, value, color, destacado }) => (
  <div style={{
    background: destacado ? `${color}15` : 'rgba(20, 40, 25, 0.5)',
    border: `1px solid ${destacado ? color + '60' : 'rgba(255, 255, 255, 0.08)'}`,
    borderRadius: 12, padding: '1rem 1.25rem',
  }}>
    <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '0.4rem' }}>
      <Icon size={18} color={color} />
      <span style={{ fontSize: '0.78rem', color: 'rgba(255, 255, 255, 0.6)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
        {label}
      </span>
    </div>
    <div style={{ fontSize: '1.75rem', fontWeight: 800, color }}>{value}</div>
  </div>
);

export default SuperAdmin;
