import { useState, useEffect } from 'react';
import { API_URL } from '../config';
import { apiGet, apiPost } from '../api';
import {
  KeyRound, RefreshCw, Mail, AlertCircle, CheckCircle2, Clock,
  Copy, ArrowLeft, Check, X, ShieldCheck
} from 'lucide-react';
import Logo from '../components/Logo';

const CodigosPendientes = () => {
  const [codigos, setCodigos] = useState([]);
  const [emailStatus, setEmailStatus] = useState(null);
  const [loading, setLoading] = useState(true);
  const [accion, setAccion] = useState({}); // { idUsuario: 'reenviando'|'aprobando'|'rechazando' }
  const [feedback, setFeedback] = useState({});

  const cargar = async () => {
    setLoading(true);
    try {
      const [c, e] = await Promise.all([
        apiGet(`${API_URL}/api/admin/codigos-pendientes`),
        apiGet(`${API_URL}/api/admin/email-status`),
      ]);
      setCodigos(c);
      setEmailStatus(e);
    } catch (err) {
      console.error('Error cargando:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { cargar(); }, []);

  const reenviar = async (idUsuario) => {
    setAccion({ ...accion, [idUsuario]: 'reenviando' });
    setFeedback({ ...feedback, [idUsuario]: null });
    try {
      const data = await apiPost(`${API_URL}/api/admin/reenviar-codigo/${idUsuario}`, {});
      if (data.email_enviado) {
        setFeedback({ ...feedback, [idUsuario]: { type: 'success', text: `✅ Email reenviado. Código: ${data.codigo}` } });
      } else {
        setFeedback({ ...feedback, [idUsuario]: { type: 'warning', text: `⚠️ Email NO enviado. Da este código al cliente: ${data.codigo}` } });
      }
      cargar();
    } catch (err) {
      setFeedback({ ...feedback, [idUsuario]: { type: 'error', text: err.message } });
    } finally {
      setAccion({ ...accion, [idUsuario]: null });
    }
  };

  const aprobar = async (idUsuario, nombre) => {
    if (!confirm(`¿Aprobar el registro de "${nombre}"?\n\nLa cuenta se activará y podrá iniciar sesión.`)) return;
    setAccion({ ...accion, [idUsuario]: 'aprobando' });
    setFeedback({ ...feedback, [idUsuario]: null });
    try {
      await apiPost(`${API_URL}/api/admin/aprobar-registro/${idUsuario}`, {});
      setFeedback({ ...feedback, [idUsuario]: { type: 'success', text: `✅ Usuario "${nombre}" aprobado. Ya puede iniciar sesión.` } });
      cargar();
    } catch (err) {
      setFeedback({ ...feedback, [idUsuario]: { type: 'error', text: err.message } });
    } finally {
      setAccion({ ...accion, [idUsuario]: null });
    }
  };

  const rechazar = async (idUsuario, nombre) => {
    if (!confirm(`¿RECHAZAR el registro de "${nombre}"?\n\nSu cuenta será desactivada. Esta acción se puede revertir después.`)) return;
    setAccion({ ...accion, [idUsuario]: 'rechazando' });
    setFeedback({ ...feedback, [idUsuario]: null });
    try {
      await apiPost(`${API_URL}/api/admin/rechazar-registro/${idUsuario}`, {});
      setFeedback({ ...feedback, [idUsuario]: { type: 'success', text: `❌ Registro de "${nombre}" rechazado.` } });
      cargar();
    } catch (err) {
      setFeedback({ ...feedback, [idUsuario]: { type: 'error', text: err.message } });
    } finally {
      setAccion({ ...accion, [idUsuario]: null });
    }
  };

  const copiar = (texto) => {
    navigator.clipboard?.writeText(texto).then(() => {
      // Feedback visual rápido
      const el = document.getElementById('copy-toast');
      if (el) {
        el.textContent = `Copiado: ${texto}`;
        el.style.opacity = '1';
        setTimeout(() => { el.style.opacity = '0'; }, 1500);
      }
    });
  };

  const formatSegundos = (s) => {
    if (s <= 0) return 'Expirado';
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${m}m ${sec}s`;
  };

  return (
    <div style={{ minHeight: '100vh', background: '#0a1a0e', color: '#fff', fontFamily: 'Inter, system-ui, sans-serif', padding: '2rem' }}>
      <style>{`
        .cp-input { transition: all 0.2s; }
        .cp-input:focus { border-color: rgba(126, 217, 87, 0.6) !important; background: rgba(255, 255, 255, 0.08) !important; }
        @keyframes spin { to { transform: rotate(360deg); } }
        .spin { animation: spin 1s linear infinite; }
        #copy-toast {
          position: fixed; bottom: 2rem; right: 2rem;
          background: rgba(126, 217, 87, 0.95); color: #0a1a0e;
          padding: 0.75rem 1.25rem; border-radius: 10px;
          font-weight: 700; font-size: 0.9rem;
          box-shadow: 0 8px 24px rgba(0, 0, 0, 0.4);
          opacity: 0; transition: opacity 0.2s; pointer-events: none; z-index: 1000;
        }
      `}</style>
      <div id="copy-toast" />

      <div style={{ maxWidth: 1100, margin: '0 auto' }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1.5rem' }}>
          <Logo size={50} glow={false} />
          <div style={{ flex: 1 }}>
            <h1 style={{ fontSize: '1.5rem', fontWeight: 700, margin: 0, color: '#7ed957' }}>
              Solicitudes de Registro Pendientes
            </h1>
            <p style={{ color: 'rgba(255, 255, 255, 0.6)', margin: '0.25rem 0 0', fontSize: '0.9rem' }}>
              Aquí ves los clientes que quieren registrarse. Apruébalos manualmente o dales el código.
            </p>
          </div>
          <button onClick={cargar} style={{
            background: 'rgba(255, 255, 255, 0.08)', color: '#7ed957',
            border: '1px solid rgba(126, 217, 87, 0.3)', padding: '0.55rem 1rem',
            borderRadius: 10, fontSize: '0.85rem', fontWeight: 600, cursor: 'pointer',
            display: 'flex', alignItems: 'center', gap: '0.4rem', fontFamily: 'inherit',
          }}>
            <RefreshCw size={14} /> Recargar
          </button>
        </div>

        {/* Banner de estado del email */}
        {emailStatus && (
          <div style={{
            background: emailStatus.ultimos_7_dias.total_fallos > 0
              ? 'rgba(231, 76, 60, 0.1)'
              : 'rgba(126, 217, 87, 0.1)',
            border: `1px solid ${emailStatus.ultimos_7_dias.total_fallos > 0 ? 'rgba(231, 76, 60, 0.3)' : 'rgba(126, 217, 87, 0.3)'}`,
            borderRadius: 12, padding: '1rem 1.25rem', marginBottom: '1.5rem',
            display: 'flex', alignItems: 'flex-start', gap: '0.85rem',
          }}>
            {emailStatus.ultimos_7_dias.total_fallos > 0
              ? <AlertCircle size={20} color="#ff6b6b" style={{ flexShrink: 0, marginTop: 2 }} />
              : <CheckCircle2 size={20} color="#7ed957" style={{ flexShrink: 0, marginTop: 2 }} />}
            <div style={{ flex: 1 }}>
              <strong style={{ fontSize: '0.95rem', display: 'block', marginBottom: '0.25rem' }}>
                {emailStatus.ultimos_7_dias.total_fallos > 0
                  ? '⚠️ El servidor de email tiene problemas'
                  : '✅ El servidor de email está funcionando bien'}
              </strong>
              <p style={{ fontSize: '0.85rem', color: 'rgba(255, 255, 255, 0.7)', margin: 0, lineHeight: 1.5 }}>
                Últimos 7 días: <strong>{emailStatus.ultimos_7_dias.total_enviados}</strong> emails enviados
                {' • '}
                <strong style={{ color: '#7ed957' }}>{emailStatus.ultimos_7_dias.total_exitos}</strong> exitosos
                {' • '}
                <strong style={{ color: '#ff6b6b' }}>{emailStatus.ultimos_7_dias.total_fallos}</strong> fallidos.
              </p>
              {emailStatus.ultimos_7_dias.total_fallos > 0 && (
                <p style={{ fontSize: '0.82rem', color: 'rgba(255, 255, 255, 0.55)', margin: '0.4rem 0 0', fontStyle: 'italic' }}>
                  💡 Los códigos siguen apareciendo aquí. Usa los botones "Aprobar" o "Copiar código" para gestionar las solicitudes manualmente.
                </p>
              )}
            </div>
          </div>
        )}

        {/* Lista de códigos pendientes */}
        {loading ? (
          <div style={{ textAlign: 'center', padding: '3rem 1rem', color: 'rgba(255, 255, 255, 0.6)' }}>
            <RefreshCw size={32} className="spin" />
            <p style={{ marginTop: '1rem' }}>Cargando...</p>
          </div>
        ) : codigos.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '3rem 1rem', background: 'rgba(255, 255, 255, 0.03)', borderRadius: 12, color: 'rgba(255, 255, 255, 0.5)' }}>
            <CheckCircle2 size={48} color="#7ed957" style={{ marginBottom: '0.75rem' }} />
            <p style={{ margin: 0, fontSize: '0.95rem' }}>No hay solicitudes pendientes.</p>
            <p style={{ margin: '0.4rem 0 0', fontSize: '0.85rem' }}>
              Todos los clientes que se registraron ya fueron gestionados.
            </p>
          </div>
        ) : (
          <div style={{ display: 'grid', gap: '0.75rem' }}>
            {codigos.map(c => {
              const fb = feedback[c.id_usuario];
              const isReenviando = accion[c.id_usuario] === 'reenviando';
              const isAprobando = accion[c.id_usuario] === 'aprobando';
              const isRechazando = accion[c.id_usuario] === 'rechazando';
              const isBusy = isReenviando || isAprobando || isRechazando;
              const segundos = c.segundos_restantes;
              const urgente = segundos < 300;
              return (
                <div key={c.id_usuario} style={{
                  background: 'rgba(20, 40, 25, 0.5)',
                  border: `1px solid ${urgente ? 'rgba(231, 76, 60, 0.4)' : 'rgba(126, 217, 87, 0.2)'}`,
                  borderRadius: 12, padding: '1.1rem 1.25rem',
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
                    <div style={{ flex: 1, minWidth: 200 }}>
                      <div style={{ fontWeight: 700, fontSize: '0.95rem' }}>{c.nombre}</div>
                      <div style={{ color: 'rgba(255, 255, 255, 0.6)', fontSize: '0.82rem' }}>
                        <Mail size={11} style={{ display: 'inline', marginRight: 4, verticalAlign: 'middle' }} />
                        {c.correo}
                      </div>
                      <div style={{ color: 'rgba(255, 255, 255, 0.5)', fontSize: '0.78rem', marginTop: '0.2rem' }}>
                        Local: {c.nombre_local || '—'} • Intentos: {c.intentos_verificacion}
                      </div>
                    </div>

                    <div style={{
                      background: 'rgba(126, 217, 87, 0.08)',
                      border: '1.5px solid rgba(126, 217, 87, 0.3)',
                      borderRadius: 8, padding: '0.5rem 0.85rem',
                      display: 'flex', alignItems: 'center', gap: '0.5rem',
                    }}>
                      <KeyRound size={14} color="#7ed957" />
                      <span style={{
                        fontFamily: 'monospace', fontSize: '1.2rem',
                        fontWeight: 800, color: '#7ed957', letterSpacing: '0.3rem',
                      }}>{c.codigo_verificacion}</span>
                      <button onClick={() => copiar(c.codigo_verificacion)} style={{
                        background: 'none', border: 'none', color: 'rgba(255, 255, 255, 0.6)',
                        cursor: 'pointer', padding: 4,
                      }} title="Copiar">
                        <Copy size={13} />
                      </button>
                    </div>

                    <div style={{
                      color: urgente ? '#ff8a6b' : 'rgba(255, 255, 255, 0.6)',
                      fontSize: '0.82rem', display: 'flex', alignItems: 'center', gap: '0.3rem',
                      minWidth: 80,
                    }}>
                      <Clock size={13} /> {formatSegundos(segundos)}
                    </div>
                  </div>

                  {/* Botones de acción */}
                  <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.85rem', flexWrap: 'wrap' }}>
                    <button
                      onClick={() => aprobar(c.id_usuario, c.nombre)}
                      disabled={isBusy}
                      style={{
                        background: '#1a8a4a', color: 'white',
                        border: 'none', padding: '0.5rem 0.9rem',
                        borderRadius: 8, fontSize: '0.85rem', fontWeight: 600,
                        cursor: isBusy ? 'not-allowed' : 'pointer',
                        opacity: isBusy ? 0.5 : 1,
                        display: 'flex', alignItems: 'center', gap: '0.4rem',
                        fontFamily: 'inherit',
                      }}
                    >
                      <ShieldCheck size={14} className={isAprobando ? 'spin' : ''} />
                      {isAprobando ? 'Aprobando...' : 'Aprobar'}
                    </button>
                    <button
                      onClick={() => reenviar(c.id_usuario)}
                      disabled={isBusy}
                      style={{
                        background: 'rgba(59, 130, 246, 0.15)', color: '#60a5fa',
                        border: '1px solid rgba(59, 130, 246, 0.3)', padding: '0.5rem 0.9rem',
                        borderRadius: 8, fontSize: '0.85rem', fontWeight: 600,
                        cursor: isBusy ? 'not-allowed' : 'pointer',
                        opacity: isBusy ? 0.5 : 1,
                        display: 'flex', alignItems: 'center', gap: '0.4rem',
                        fontFamily: 'inherit',
                      }}
                    >
                      <RefreshCw size={14} className={isReenviando ? 'spin' : ''} />
                      {isReenviando ? 'Reenviando...' : 'Reenviar email'}
                    </button>
                    <button
                      onClick={() => rechazar(c.id_usuario, c.nombre)}
                      disabled={isBusy}
                      style={{
                        background: 'rgba(231, 76, 60, 0.15)', color: '#ff6b6b',
                        border: '1px solid rgba(231, 76, 60, 0.3)', padding: '0.5rem 0.9rem',
                        borderRadius: 8, fontSize: '0.85rem', fontWeight: 600,
                        cursor: isBusy ? 'not-allowed' : 'pointer',
                        opacity: isBusy ? 0.5 : 1,
                        display: 'flex', alignItems: 'center', gap: '0.4rem',
                        fontFamily: 'inherit',
                      }}
                    >
                      <X size={14} className={isRechazando ? 'spin' : ''} />
                      {isRechazando ? 'Rechazando...' : 'Rechazar'}
                    </button>
                  </div>

                  {fb && (
                    <div style={{
                      marginTop: '0.85rem',
                      background: fb.type === 'success' ? 'rgba(126, 217, 87, 0.1)' : fb.type === 'warning' ? 'rgba(245, 158, 11, 0.1)' : 'rgba(231, 76, 60, 0.1)',
                      border: `1px solid ${fb.type === 'success' ? 'rgba(126, 217, 87, 0.3)' : fb.type === 'warning' ? 'rgba(245, 158, 11, 0.3)' : 'rgba(231, 76, 60, 0.3)'}`,
                      borderRadius: 8, padding: '0.6rem 0.85rem',
                      fontSize: '0.85rem', color: fb.type === 'success' ? '#7ed957' : fb.type === 'warning' ? '#fbbf24' : '#ff8a6b',
                    }}>
                      {fb.text}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        <div style={{ marginTop: '2rem', textAlign: 'center' }}>
          <a href="/" style={{
            color: 'rgba(255, 255, 255, 0.6)', fontSize: '0.85rem',
            textDecoration: 'none', display: 'inline-flex',
            alignItems: 'center', gap: '0.3rem',
          }}>
            <ArrowLeft size={14} /> Volver al sistema
          </a>
        </div>
      </div>
    </div>
  );
};

export default CodigosPendientes;
