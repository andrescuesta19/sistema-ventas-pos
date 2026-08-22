import { useState, useEffect, useRef } from 'react';
import { API_URL } from '../config';
import { apiGet, apiPut } from '../api';
import {
  Settings, User, Store, Save, AlertCircle, CheckCircle2,
  Eye, EyeOff, Lock, Phone, MapPin, Hash, Mail, Building2,
  UserCog, Camera, X as XIcon, FileCheck2, Upload, ShieldCheck
} from 'lucide-react';

const Configuracion = ({ user }) => {
  const esAdmin = user?.rol === 'Administrador';
  const [tab, setTab] = useState('mi-cuenta');

  // Mi cuenta
  const [perfil, setPerfil] = useState({ nombre: '', telefono: '' });
  const [perfilMsg, setPerfilMsg] = useState({ type: '', text: '' });
  const [perfilSaving, setPerfilSaving] = useState(false);

  // Cambiar mi contraseña
  const [pwd, setPwd] = useState({ actual: '', nueva: '', nueva2: '' });
  const [showPwd, setShowPwd] = useState({ actual: false, nueva: false, nueva2: false });
  const [pwdMsg, setPwdMsg] = useState({ type: '', text: '' });
  const [pwdSaving, setPwdSaving] = useState(false);

  // Mi local
  const [local, setLocal] = useState({ nombre_local: '', direccion: '', nit: '', telefono: '', ciudad: '', email: '' });
  const [localMsg, setLocalMsg] = useState({ type: '', text: '' });
  const [localSaving, setLocalSaving] = useState(false);

  // Versión de la app (dinámica, viene del backend)
  const [appVersion, setAppVersion] = useState('…');

  // Facturación DIAN — v1.9.1
  const [dianForm, setDianForm] = useState({
    nit: '', razon_social: '', direccion: '', ciudad: '', departamento: '',
    telefono: '', correo: '', resolucion_numero: '', resolucion_fecha: '',
    resolucion_desde: '', resolucion_hasta: '', prefijo: 'FE',
    certificado_password: '', certificado_path: '', habilitado: false
  });
  const [dianMsg, setDianMsg] = useState(null);

  useEffect(() => {
    cargarDatos();
    cargarVersion();
    cargarDian();
  }, []);

  const cargarDian = async () => {
    try {
      const d = await apiGet(`${API_URL}/api/dian/configuracion`);
      if (d && Object.keys(d).length) {
        setDianForm({
          nit: d.nit || '', razon_social: d.razon_social || '', direccion: d.direccion || '',
          ciudad: d.ciudad || '', departamento: d.departamento || '', telefono: d.telefono || '',
          correo: d.correo || '', resolucion_numero: d.resolucion_numero || '',
          resolucion_fecha: d.resolucion_fecha ? d.resolucion_fecha.slice(0, 10) : '',
          resolucion_desde: d.resolucion_desde || '', resolucion_hasta: d.resolucion_hasta || '',
          prefijo: d.prefijo || 'FE', certificado_password: '', certificado_path: d.certificado_path || '',
          habilitado: !!d.habilitado
        });
      }
    } catch (err) { console.error('Error cargando DIAN:', err); }
  };

  const guardarDian = async () => {
    setDianMsg(null);
    try {
      const body = { ...dianForm };
      if (!body.certificado_password) delete body.certificado_password;
      await apiPut(`${API_URL}/api/dian/configuracion`, body);
      setDianMsg({ ok: true, text: 'Configuración DIAN guardada correctamente.' });
    } catch (err) {
      setDianMsg({ ok: false, text: err.message || 'Error guardando configuración DIAN.' });
    }
  };

  const subirCertificado = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setDianMsg(null);
    try {
      const token = localStorage.getItem('pos_token') || sessionStorage.getItem('pos_token');
      const fd = new FormData();
      fd.append('certificado', file);
      const res = await fetch(`${API_URL}/api/dian/certificado`, {
        method: 'POST',
        headers: { Authorization: 'Bearer ' + token },
        body: fd
      });
      const data = await res.json();
      if (res.ok) {
        setDianMsg({ ok: true, text: 'Certificado subido correctamente.' });
        setDianForm({ ...dianForm, certificado_path: 'subido' });
      } else {
        setDianMsg({ ok: false, text: data.error || 'Error subiendo certificado.' });
      }
    } catch {
      setDianMsg({ ok: false, text: 'Error de conexión al subir el certificado.' });
    }
  };

  const cargarVersion = async () => {
    try {
      const h = await apiGet(`${API_URL}/api/health`);
      if (h?.version) setAppVersion(h.version);
    } catch {
      setAppVersion('—');
    }
  };

  const cargarDatos = async () => {
    try {
      // /me da todos los datos del usuario + local
      const me = await apiGet(`${API_URL}/api/auth/me`);
      setPerfil({ nombre: me.nombre || '', telefono: me.telefono || '' });
      setLocal({
        nombre_local: me.nombre_local || '',
        direccion: me.direccion || '',
        nit: me.nit || '',
        telefono: me.telefono_local || '',
        ciudad: me.ciudad || '',
        email: me.email || '',
      });
    } catch (err) {
      console.error('Error cargando datos:', err);
    }
  };

  const guardarPerfil = async (e) => {
    e.preventDefault();
    setPerfilMsg({ type: '', text: '' });
    setPerfilSaving(true);
    try {
      await apiPut(`${API_URL}/api/auth/mi-perfil`, perfil);
      setPerfilMsg({ type: 'success', text: 'Perfil actualizado correctamente.' });
    } catch (err) {
      setPerfilMsg({ type: 'error', text: err.message });
    } finally {
      setPerfilSaving(false);
    }
  };

  const guardarPassword = async (e) => {
    e.preventDefault();
    setPwdMsg({ type: '', text: '' });
    if (pwd.nueva !== pwd.nueva2) {
      setPwdMsg({ type: 'error', text: 'Las contraseñas nuevas no coinciden.' });
      return;
    }
    setPwdSaving(true);
    try {
      await apiPut(`${API_URL}/api/auth/mi-password`, {
        contrasena_actual: pwd.actual,
        nueva_contrasena: pwd.nueva,
      });
      setPwdMsg({ type: 'success', text: 'Contraseña actualizada. La próxima vez inicia con la nueva.' });
      setPwd({ actual: '', nueva: '', nueva2: '' });
    } catch (err) {
      setPwdMsg({ type: 'error', text: err.message });
    } finally {
      setPwdSaving(false);
    }
  };

  const guardarLocal = async (e) => {
    e.preventDefault();
    setLocalMsg({ type: '', text: '' });
    setLocalSaving(true);
    try {
      await apiPut(`${API_URL}/api/locales/me`, local);
      setLocalMsg({ type: 'success', text: 'Datos del local actualizados.' });
    } catch (err) {
      setLocalMsg({ type: 'error', text: err.message });
    } finally {
      setLocalSaving(false);
    }
  };

  // (v1.5.4) La configuración de seguridad (registro público, política de
  // contraseñas) se movió al panel del super-admin (/super-admin).
  // Aquí solo dejamos Mi Cuenta y Mi Local para el admin de local.

  // Estilos
  const pageStyle = { padding: '2rem', maxWidth: 1000, margin: '0 auto' };
  const tabStyle = (active) => ({
    padding: '0.75rem 1.25rem',
    background: active ? 'rgba(126, 217, 87, 0.12)' : 'transparent',
    color: active ? '#1a8a4a' : 'var(--text-secondary)',
    border: 'none',
    borderBottom: active ? '2px solid #1a8a4a' : '2px solid transparent',
    fontSize: '0.92rem',
    fontWeight: 600,
    cursor: 'pointer',
    fontFamily: 'inherit',
    display: 'flex',
    alignItems: 'center',
    gap: '0.5rem',
  });
  const cardStyle = {
    background: 'var(--bg-card)',
    borderRadius: '12px',
    border: '1px solid var(--border-soft)',
    padding: '1.75rem',
  };
  const inputStyle = {
    width: '100%',
    padding: '0.7rem 0.85rem 0.7rem 2.6rem',
    fontSize: '0.92rem',
    background: 'white',
    border: '1px solid var(--border-soft)',
    borderRadius: '8px',
    color: 'var(--text-primary)',
    outline: 'none',
    fontFamily: 'inherit',
    boxSizing: 'border-box',
  };
  const btnPrimary = {
    background: 'var(--green-primary)',
    color: 'white',
    border: 'none',
    padding: '0.7rem 1.25rem',
    borderRadius: '10px',
    fontSize: '0.9rem',
    fontWeight: 600,
    cursor: 'pointer',
    display: 'inline-flex',
    alignItems: 'center',
    gap: '0.5rem',
    fontFamily: 'inherit',
  };

  const Banner = ({ type, text }) => {
    if (!text) return null;
    const colors = type === 'success'
      ? { bg: 'rgba(126, 217, 87, 0.1)', border: 'rgba(126, 217, 87, 0.3)', color: '#1a8a4a', icon: CheckCircle2 }
      : { bg: 'rgba(231, 76, 60, 0.1)', border: 'rgba(231, 76, 60, 0.3)', color: '#b91c1c', icon: AlertCircle };
    const Icon = colors.icon;
    return (
      <div style={{
        background: colors.bg, border: `1px solid ${colors.border}`,
        borderRadius: 10, padding: '0.65rem 0.85rem', marginBottom: '1rem',
        display: 'flex', alignItems: 'center', gap: '0.5rem',
        fontSize: '0.88rem', color: colors.color,
      }}>
        <Icon size={16} /> {text}
      </div>
    );
  };

  const FieldInput = ({ icon: Icon, ...props }) => (
    <div style={{ position: 'relative' }}>
      <Icon size={15} style={{ position: 'absolute', left: '0.9rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)', pointerEvents: 'none' }} />
      <input className="cfg-input" style={inputStyle} {...props} />
      <style>{`.cfg-input:focus { border-color: var(--green-primary) !important; box-shadow: 0 0 0 3px rgba(26, 138, 74, 0.08); }`}</style>
    </div>
  );

  return (
    <div style={pageStyle}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1.5rem' }}>
        <Settings size={26} color="var(--green-primary)" />
        <div>
          <h1 style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>Configuración</h1>
          <p style={{ color: 'var(--text-secondary)', margin: '0.25rem 0 0', fontSize: '0.9rem' }}>Personaliza tu cuenta y tu local.</p>
        </div>
      </div>

      {/* Tabs — v1.5.4: Sin Seguridad. La config global vive en /super-admin. */}
      <div style={{ display: 'flex', borderBottom: '1px solid var(--border-light)', marginBottom: '1.5rem', overflowX: 'auto' }}>
        <button style={tabStyle(tab === 'mi-cuenta')} onClick={() => setTab('mi-cuenta')}><User size={15} /> Mi Cuenta</button>
        <button style={tabStyle(tab === 'mi-local')} onClick={() => setTab('mi-local')}><Store size={15} /> Mi Local</button>
        <button style={tabStyle(tab === 'sistema')} onClick={() => setTab('sistema')}><Settings size={15} /> Sistema</button>
        <button style={tabStyle(tab === 'dian')} onClick={() => setTab('dian')}><FileCheck2 size={15} /> Facturación DIAN</button>
      </div>

      {/* MI CUENTA */}
      {tab === 'mi-cuenta' && (
        <div style={cardStyle}>
          <h2 style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--text-primary)', margin: '0 0 0.4rem' }}>Datos Personales</h2>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', margin: '0 0 1.25rem' }}>Tu nombre y teléfono. Tu correo no se puede cambiar.</p>

          {/* v1.5.5: Foto de perfil */}
          <AvatarUploader
            user={user}
            onUpdate={(newUser) => {
              // Actualizar el padre: guardamos en localStorage para que el Header lo vea
              try {
                localStorage.setItem('pos_user', JSON.stringify(newUser));
              } catch {}
              // Emitir evento para que el Header se actualice en vivo
              window.dispatchEvent(new CustomEvent('user:updated', { detail: { user: newUser } }));
              if (onUpdateUser) onUpdateUser(newUser);
            }}
          />

          <hr style={{ border: 'none', borderTop: '1px solid var(--border-light)', margin: '2rem 0' }} />

          <Banner type={perfilMsg.type} text={perfilMsg.text} />
          <form onSubmit={guardarPerfil} style={{ display: 'grid', gap: '0.85rem', maxWidth: 500 }}>
            <div>
              <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, marginBottom: '0.3rem', color: 'var(--text-primary)' }}>Nombre completo</label>
              <FieldInput icon={User} type="text" value={perfil.nombre} onChange={e => setPerfil({ ...perfil, nombre: e.target.value })} required />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, marginBottom: '0.3rem', color: 'var(--text-primary)' }}>Teléfono</label>
              <FieldInput icon={Phone} type="tel" value={perfil.telefono} onChange={e => setPerfil({ ...perfil, telefono: e.target.value })} />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, marginBottom: '0.3rem', color: 'var(--text-primary)' }}>Correo (no editable)</label>
              <FieldInput icon={Mail} type="email" value={user?.correo} disabled />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, marginBottom: '0.3rem', color: 'var(--text-primary)' }}>Rol</label>
              <FieldInput icon={UserCog} type="text" value={user?.rol} disabled />
            </div>
            <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem' }}>
              <button type="submit" style={btnPrimary} disabled={perfilSaving}>
                <Save size={15} /> {perfilSaving ? 'Guardando...' : 'Guardar Cambios'}
              </button>
            </div>
          </form>

          <hr style={{ border: 'none', borderTop: '1px solid var(--border-light)', margin: '2rem 0' }} />

          <h2 style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--text-primary)', margin: '0 0 0.4rem' }}>Cambiar mi Contraseña</h2>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', margin: '0 0 1.25rem' }}>Ya estás autenticado, así que no necesitas código de verificación.</p>
          <Banner type={pwdMsg.type} text={pwdMsg.text} />
          <form onSubmit={guardarPassword} style={{ display: 'grid', gap: '0.85rem', maxWidth: 500 }}>
            <div style={{ position: 'relative' }}>
              <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, marginBottom: '0.3rem' }}>Contraseña actual</label>
              <div style={{ position: 'relative' }}>
                <Lock size={15} style={{ position: 'absolute', left: '0.9rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)', pointerEvents: 'none' }} />
                <input className="cfg-input" style={inputStyle} type={showPwd.actual ? 'text' : 'password'} value={pwd.actual} onChange={e => setPwd({ ...pwd, actual: e.target.value })} required />
                <button type="button" onClick={() => setShowPwd({ ...showPwd, actual: !showPwd.actual })}
                  style={{ position: 'absolute', right: '0.6rem', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}>
                  {showPwd.actual ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
              </div>
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, marginBottom: '0.3rem' }}>Nueva contraseña</label>
              <div style={{ position: 'relative' }}>
                <Lock size={15} style={{ position: 'absolute', left: '0.9rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)', pointerEvents: 'none' }} />
                <input className="cfg-input" style={inputStyle} type={showPwd.nueva ? 'text' : 'password'} value={pwd.nueva} onChange={e => setPwd({ ...pwd, nueva: e.target.value })} required minLength={8} />
                <button type="button" onClick={() => setShowPwd({ ...showPwd, nueva: !showPwd.nueva })}
                  style={{ position: 'absolute', right: '0.6rem', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}>
                  {showPwd.nueva ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
              </div>
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, marginBottom: '0.3rem' }}>Repetir nueva contraseña</label>
              <div style={{ position: 'relative' }}>
                <Lock size={15} style={{ position: 'absolute', left: '0.9rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)', pointerEvents: 'none' }} />
                <input className="cfg-input" style={inputStyle} type={showPwd.nueva2 ? 'text' : 'password'} value={pwd.nueva2} onChange={e => setPwd({ ...pwd, nueva2: e.target.value })} required />
                <button type="button" onClick={() => setShowPwd({ ...showPwd, nueva2: !showPwd.nueva2 })}
                  style={{ position: 'absolute', right: '0.6rem', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}>
                  {showPwd.nueva2 ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
              </div>
            </div>
            <div>
              <button type="submit" style={btnPrimary} disabled={pwdSaving}>
                <Save size={15} /> {pwdSaving ? 'Cambiando...' : 'Cambiar Contraseña'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* MI LOCAL */}
      {tab === 'mi-local' && (
        <div style={cardStyle}>
          <h2 style={{ fontSize: '1.1rem', fontWeight: 700, margin: '0 0 0.4rem' }}>Datos del Local</h2>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', margin: '0 0 1.25rem' }}>
            Información de tu negocio. {esAdmin ? 'Puedes editarla.' : 'Solo el administrador puede modificarla.'}
          </p>
          <Banner type={localMsg.type} text={localMsg.text} />
          <form onSubmit={guardarLocal} style={{ display: 'grid', gap: '0.85rem', maxWidth: 500 }}>
            <div>
              <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, marginBottom: '0.3rem' }}>Nombre del Local *</label>
              <FieldInput icon={Building2} type="text" value={local.nombre_local} onChange={e => setLocal({ ...local, nombre_local: e.target.value })} required disabled={!esAdmin} />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, marginBottom: '0.3rem' }}>NIT</label>
              <FieldInput icon={Hash} type="text" value={local.nit} onChange={e => setLocal({ ...local, nit: e.target.value })} disabled={!esAdmin} />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, marginBottom: '0.3rem' }}>Dirección</label>
              <FieldInput icon={MapPin} type="text" value={local.direccion} onChange={e => setLocal({ ...local, direccion: e.target.value })} disabled={!esAdmin} />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.85rem' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, marginBottom: '0.3rem' }}>Teléfono</label>
                <FieldInput icon={Phone} type="tel" value={local.telefono} onChange={e => setLocal({ ...local, telefono: e.target.value })} disabled={!esAdmin} />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, marginBottom: '0.3rem' }}>Ciudad</label>
                <FieldInput icon={MapPin} type="text" value={local.ciudad} onChange={e => setLocal({ ...local, ciudad: e.target.value })} disabled={!esAdmin} />
              </div>
            </div>
            {esAdmin && (
              <div style={{ marginTop: '0.5rem' }}>
                <button type="submit" style={btnPrimary} disabled={localSaving}>
                  <Save size={15} /> {localSaving ? 'Guardando...' : 'Guardar Cambios'}
                </button>
              </div>
            )}
          </form>
        </div>
      )}

      {/* SISTEMA — visible para TODOS los usuarios autenticados (incluido cajero).
          v1.5.4: La pestaña Seguridad se quitó. La config global vive en /super-admin. */}
      {tab === 'sistema' && (
        <div style={cardStyle}>
          <h2 style={{ fontSize: '1.1rem', fontWeight: 700, margin: '0 0 0.4rem' }}>Información del Sistema</h2>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', margin: '0 0 1.25rem' }}>Estado actual y diagnóstico.</p>
          <div style={{ display: 'grid', gap: '0.65rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0.75rem 1rem', background: 'var(--bg-app)', borderRadius: 8 }}>
              <span style={{ color: 'var(--text-secondary)', fontSize: '0.88rem' }}>Versión de la App</span>
              <strong style={{ fontSize: '0.88rem' }}>{appVersion}</strong>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0.75rem 1rem', background: 'var(--bg-app)', borderRadius: 8 }}>
              <span style={{ color: 'var(--text-secondary)', fontSize: '0.88rem' }}>Usuario actual</span>
              <strong style={{ fontSize: '0.88rem' }}>{user?.nombre} ({user?.rol})</strong>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0.75rem 1rem', background: 'var(--bg-app)', borderRadius: 8 }}>
              <span style={{ color: 'var(--text-secondary)', fontSize: '0.88rem' }}>Local</span>
              <strong style={{ fontSize: '0.88rem' }}>{user?.nombre_local}</strong>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0.75rem 1rem', background: 'var(--bg-app)', borderRadius: 8 }}>
              <span style={{ color: 'var(--text-secondary)', fontSize: '0.88rem' }}>Desarrollado por</span>
              <strong style={{ fontSize: '0.88rem' }}>Andrés Cuesta</strong>
            </div>
          </div>
        </div>
      )}

      {/* FACTURACIÓN ELECTRÓNICA DIAN — v1.9.1 */}
      {tab === 'dian' && (
        <div style={cardStyle}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.4rem' }}>
            <FileCheck2 size={20} color="var(--green-primary)" />
            <h2 style={{ fontSize: '1.1rem', fontWeight: 700, margin: 0 }}>Facturación Electrónica DIAN</h2>
          </div>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', margin: '0 0 1.25rem', lineHeight: 1.6 }}>
            Configura tu empresa como facturador electrónico. El sistema genera el XML UBL 2.1, lo firma con tu
            certificado digital y lo deja listo para enviar a la DIAN.
          </p>

          {dianMsg && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.75rem 1rem', borderRadius: 8, marginBottom: '1rem', fontSize: '0.88rem', background: dianMsg.ok ? 'rgba(45, 212, 109, 0.1)' : 'rgba(239, 68, 68, 0.1)', border: '1px solid ' + (dianMsg.ok ? 'rgba(45, 212, 109, 0.3)' : 'rgba(239, 68, 68, 0.3)'), color: dianMsg.ok ? 'var(--green-primary)' : '#dc2626' }}>
              {dianMsg.ok ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />}
              {dianMsg.text}
            </div>
          )}

          <div style={{ display: 'grid', gap: '1.5rem' }}>
            {/* Datos del facturador */}
            <div>
              <h3 style={{ fontSize: '0.95rem', fontWeight: 700, margin: '0 0 0.85rem', color: 'var(--text-primary)' }}>1. Datos del facturador</h3>
              <div style={{ display: 'grid', gap: '0.85rem' }}>
                <div className="grid-2">
                  <div>
                    <label>NIT *</label>
                    <input value={dianForm.nit} onChange={e => setDianForm({ ...dianForm, nit: e.target.value })} placeholder="900000000" />
                  </div>
                  <div>
                    <label>Razón social *</label>
                    <input value={dianForm.razon_social} onChange={e => setDianForm({ ...dianForm, razon_social: e.target.value })} placeholder="Mi Empresa SAS" />
                  </div>
                </div>
                <div className="grid-2">
                  <div>
                    <label>Dirección</label>
                    <input value={dianForm.direccion} onChange={e => setDianForm({ ...dianForm, direccion: e.target.value })} />
                  </div>
                  <div className="grid-2">
                    <div>
                      <label>Ciudad</label>
                      <input value={dianForm.ciudad} onChange={e => setDianForm({ ...dianForm, ciudad: e.target.value })} />
                    </div>
                    <div>
                      <label>Depto.</label>
                      <input value={dianForm.departamento} onChange={e => setDianForm({ ...dianForm, departamento: e.target.value })} />
                    </div>
                  </div>
                </div>
                <div className="grid-2">
                  <div>
                    <label>Teléfono</label>
                    <input value={dianForm.telefono} onChange={e => setDianForm({ ...dianForm, telefono: e.target.value })} />
                  </div>
                  <div>
                    <label>Correo</label>
                    <input type="email" value={dianForm.correo} onChange={e => setDianForm({ ...dianForm, correo: e.target.value })} />
                  </div>
                </div>
              </div>
            </div>

            {/* Resolución */}
            <div>
              <h3 style={{ fontSize: '0.95rem', fontWeight: 700, margin: '0 0 0.85rem', color: 'var(--text-primary)' }}>2. Resolución de numeración</h3>
              <div style={{ display: 'grid', gap: '0.85rem' }}>
                <div className="grid-2">
                  <div>
                    <label>Número de resolución</label>
                    <input value={dianForm.resolucion_numero} onChange={e => setDianForm({ ...dianForm, resolucion_numero: e.target.value })} placeholder="18764000000001" />
                  </div>
                  <div>
                    <label>Fecha de resolución</label>
                    <input type="date" value={dianForm.resolucion_fecha} onChange={e => setDianForm({ ...dianForm, resolucion_fecha: e.target.value })} />
                  </div>
                </div>
                <div className="grid-2">
                  <div>
                    <label>Rango desde</label>
                    <input value={dianForm.resolucion_desde} onChange={e => setDianForm({ ...dianForm, resolucion_desde: e.target.value })} placeholder="1" />
                  </div>
                  <div>
                    <label>Rango hasta</label>
                    <input value={dianForm.resolucion_hasta} onChange={e => setDianForm({ ...dianForm, resolucion_hasta: e.target.value })} placeholder="1000000" />
                  </div>
                </div>
                <div>
                  <label>Prefijo (ej: FE)</label>
                  <input value={dianForm.prefijo} onChange={e => setDianForm({ ...dianForm, prefijo: e.target.value })} placeholder="FE" style={{ maxWidth: 120 }} />
                </div>
              </div>
            </div>

            {/* Certificado digital */}
            <div>
              <h3 style={{ fontSize: '0.95rem', fontWeight: 700, margin: '0 0 0.85rem', color: 'var(--text-primary)' }}>3. Certificado digital (.p12)</h3>
              <p style={{ color: 'var(--text-secondary)', fontSize: '0.82rem', margin: '0 0 0.85rem', lineHeight: 1.5 }}>
                El certificado de firma electrónica lo emiten entidades autorizadas (GSE, Certicámara, Thomas Greg & Sons).
                Debes estar habilitado como facturador electrónico ante la DIAN para obtenerlo.
              </p>
              <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'flex-end', flexWrap: 'wrap' }}>
                <div style={{ flex: 1, minWidth: 200 }}>
                  <label>Contraseña del certificado</label>
                  <input type="password" value={dianForm.certificado_password} onChange={e => setDianForm({ ...dianForm, certificado_password: e.target.value })} placeholder="Contraseña del .p12" />
                </div>
                <div>
                  <label>Archivo .p12</label>
                  <input type="file" accept=".p12,.pfx" onChange={subirCertificado} style={{ fontSize: '0.85rem' }} />
                </div>
              </div>
              {dianForm.certificado_path && (
                <p style={{ fontSize: '0.82rem', color: 'var(--green-primary)', margin: '0.5rem 0 0', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                  <ShieldCheck size={14} /> Certificado subido correctamente.
                </p>
              )}
            </div>

            {/* Habilitar */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.85rem 1rem', background: 'var(--bg-app)', borderRadius: 8 }}>
              <input
                type="checkbox"
                checked={dianForm.habilitado}
                onChange={e => setDianForm({ ...dianForm, habilitado: e.target.checked })}
                style={{ width: 18, height: 18 }}
              />
              <div>
                <div style={{ fontWeight: 600, fontSize: '0.9rem' }}>Habilitar facturación electrónica</div>
                <div style={{ color: 'var(--text-secondary)', fontSize: '0.8rem' }}>Al activarlo, las ventas podrán emitirse como factura electrónica DIAN.</div>
              </div>
            </div>

            <div style={{ display: 'flex', gap: '0.75rem' }}>
              <button onClick={guardarDian} className="btn-primary" style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem' }}>
                <Save size={15} /> Guardar configuración
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// ============================================================
// AvatarUploader — v1.5.5
// Permite al usuario subir una foto de perfil. La imagen se almacena
// como data URI (base64) en la BD. Tamaño máximo: ~600KB.
// ============================================================
const AvatarUploader = ({ user, onUpdate }) => {
  const fileInputRef = useRef(null);
  const [preview, setPreview] = useState(user?.avatar_url || null);
  const [subiendo, setSubiendo] = useState(false);
  const [msg, setMsg] = useState({ type: '', text: '' });

  const MAX_BYTES = 600 * 1024; // 600KB

  const handleFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      setMsg({ type: 'error', text: 'El archivo debe ser una imagen (jpg, png, etc.).' });
      return;
    }
    if (file.size > MAX_BYTES) {
      setMsg({ type: 'error', text: `La imagen es muy grande (${(file.size / 1024).toFixed(0)}KB). Máximo ${MAX_BYTES / 1024}KB.` });
      return;
    }

    // Convertir a base64 con compresión opcional
    const reader = new FileReader();
    reader.onload = async () => {
      const dataUri = reader.result;
      // Si es muy pesado, lo redimensionamos a max 256x256
      const resized = await resizeIfNeeded(dataUri, 256);
      setPreview(resized);
      setMsg({ type: '', text: '' });
      await guardar(resized);
    };
    reader.readAsDataURL(file);
  };

  const resizeIfNeeded = (dataUri, maxDim) => new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      if (img.width <= maxDim && img.height <= maxDim) {
        resolve(dataUri);
        return;
      }
      const ratio = Math.min(maxDim / img.width, maxDim / img.height);
      const w = Math.round(img.width * ratio);
      const h = Math.round(img.height * ratio);
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, w, h);
      resolve(canvas.toDataURL('image/jpeg', 0.85));
    };
    img.onerror = () => resolve(dataUri);
    img.src = dataUri;
  });

  const guardar = async (dataUri) => {
    setSubiendo(true);
    try {
      await apiPut(`${API_URL}/api/auth/mi-perfil`, {
        nombre: user?.nombre,
        telefono: user?.telefono || '',
        avatar_url: dataUri,
      });
      const updated = { ...user, avatar_url: dataUri };
      try {
        localStorage.setItem('pos_user', JSON.stringify(updated));
      } catch {}
      setMsg({ type: 'success', text: 'Foto de perfil actualizada.' });
      if (onUpdate) onUpdate(updated);
    } catch (err) {
      setMsg({ type: 'error', text: err.message || 'Error guardando la foto.' });
    } finally {
      setSubiendo(false);
    }
  };

  const eliminar = async () => {
    if (!confirm('¿Quitar tu foto de perfil?')) return;
    setSubiendo(true);
    try {
      await apiPut(`${API_URL}/api/auth/mi-perfil`, {
        nombre: user?.nombre,
        telefono: user?.telefono || '',
        avatar_url: null,
      });
      const updated = { ...user, avatar_url: null };
      try {
        localStorage.setItem('pos_user', JSON.stringify(updated));
      } catch {}
      setPreview(null);
      setMsg({ type: 'success', text: 'Foto eliminada.' });
      if (onUpdate) onUpdate(updated);
    } catch (err) {
      setMsg({ type: 'error', text: err.message });
    } finally {
      setSubiendo(false);
    }
  };

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '1.25rem', marginBottom: '1.25rem' }}>
      <div style={{
        position: 'relative',
        width: 88, height: 88, borderRadius: '50%',
        background: preview ? 'transparent' : 'linear-gradient(135deg, var(--green-primary), var(--green-primary-hover))',
        color: '#0a1a0e', fontWeight: 800, fontSize: '2rem',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        overflow: 'hidden', flexShrink: 0,
        border: '3px solid var(--bg-card)',
        boxShadow: '0 0 0 2px var(--green-primary)',
      }}>
        {preview ? (
          <img src={preview} alt={user?.nombre} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        ) : (
          (user?.nombre || 'U')[0].toUpperCase()
        )}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <h3 style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--text-primary)', margin: '0 0 0.25rem' }}>
          Foto de perfil
        </h3>
        <p style={{ color: 'var(--text-secondary)', fontSize: '0.82rem', margin: '0 0 0.65rem' }}>
          {preview ? 'Tu foto se muestra en tu avatar del sistema.' : 'Sube una imagen para personalizar tu avatar.'}
        </p>
        <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
          <button type="button" onClick={() => fileInputRef.current?.click()} disabled={subiendo} style={{
            background: 'var(--green-primary)', color: 'white', border: 'none',
            padding: '0.45rem 0.85rem', borderRadius: 8, fontSize: '0.85rem', fontWeight: 600,
            cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '0.4rem',
            fontFamily: 'inherit',
          }}>
            <Camera size={14} /> {subiendo ? 'Subiendo...' : (preview ? 'Cambiar foto' : 'Subir foto')}
          </button>
          {preview && (
            <button type="button" onClick={eliminar} disabled={subiendo} style={{
              background: 'transparent', color: '#ef4444', border: '1px solid #ef4444',
              padding: '0.45rem 0.85rem', borderRadius: 8, fontSize: '0.85rem', fontWeight: 600,
              cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '0.4rem',
              fontFamily: 'inherit',
            }}>
              <XIcon size={14} /> Quitar
            </button>
          )}
        </div>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          onChange={handleFile}
          style={{ display: 'none' }}
        />
        {msg.text && (
          <div style={{
            marginTop: '0.5rem',
            color: msg.type === 'error' ? '#b91c1c' : 'var(--green-primary)',
            fontSize: '0.82rem',
          }}>{msg.text}</div>
        )}
      </div>
    </div>
  );
};

export default Configuracion;
