import { useState } from 'react';
import { API_URL } from '../config';
import { Headset, Send, Mail, Phone, Clock, CheckCircle2, AlertCircle, MessageSquare } from 'lucide-react';

const AtencionCliente = ({ user }) => {
  const token = localStorage.getItem('pos_token') || sessionStorage.getItem('pos_token');
  const [form, setForm] = useState({ nombre: user?.nombre || '', correo: user?.correo || '', asunto: '', mensaje: '' });
  const [enviando, setEnviando] = useState(false);
  const [resultado, setResultado] = useState(null);

  const enviar = async (e) => {
    e.preventDefault();
    setEnviando(true);
    setResultado(null);
    try {
      const res = await fetch(API_URL + '/api/soporte/contacto', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
        body: JSON.stringify(form)
      });
      const data = await res.json();
      if (res.ok) {
        setResultado({ ok: true, msg: 'Tu mensaje fue enviado. El equipo de soporte te responderá pronto.' });
        setForm({ ...form, asunto: '', mensaje: '' });
      } else {
        setResultado({ ok: false, msg: data.error || 'Error al enviar el mensaje.' });
      }
    } catch {
      setResultado({ ok: false, msg: 'Error de conexión. Intenta de nuevo.' });
    } finally {
      setEnviando(false);
    }
  };

  return (
    <div style={{ padding: '2rem', maxWidth: 900, margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1.5rem' }}>
        <Headset size={26} color="var(--green-primary)" />
        <div>
          <h1 style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>Atención al Cliente</h1>
          <p style={{ color: 'var(--text-secondary)', margin: '0.25rem 0 0', fontSize: '0.9rem' }}>
            ¿Tienes un problema o una duda con el sistema? Escríbenos y te ayudamos.
          </p>
        </div>
      </div>

      <div className="grid-3" style={{ marginBottom: '1.5rem' }}>
        <div className="card" style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <Mail size={20} color="var(--green-primary)" />
          <div>
            <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Correo de soporte</div>
            <div style={{ fontWeight: 600, fontSize: '0.9rem' }}>soporte@sistemapos.com</div>
          </div>
        </div>
        <div className="card" style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <Phone size={20} color="var(--green-primary)" />
          <div>
            <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>WhatsApp</div>
            <div style={{ fontWeight: 600, fontSize: '0.9rem' }}>+57 300 000 0000</div>
          </div>
        </div>
        <div className="card" style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <Clock size={20} color="var(--green-primary)" />
          <div>
            <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Horario</div>
            <div style={{ fontWeight: 600, fontSize: '0.9rem' }}>Lun a Vie · 8am - 6pm</div>
          </div>
        </div>
      </div>

      <div className="card" style={{ maxWidth: 640 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem' }}>
          <MessageSquare size={18} color="var(--green-primary)" />
          <h2 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 600 }}>Enviar mensaje de soporte</h2>
        </div>

        {resultado && (
          <div style={{
            display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.75rem 1rem', borderRadius: 8,
            marginBottom: '1rem', fontSize: '0.88rem',
            background: resultado.ok ? 'rgba(45, 212, 109, 0.1)' : 'rgba(239, 68, 68, 0.1)',
            border: '1px solid ' + (resultado.ok ? 'rgba(45, 212, 109, 0.3)' : 'rgba(239, 68, 68, 0.3)'),
            color: resultado.ok ? 'var(--green-primary)' : '#dc2626'
          }}>
            {resultado.ok ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />}
            {resultado.msg}
          </div>
        )}

        <form onSubmit={enviar} style={{ display: 'grid', gap: '0.85rem' }}>
          <div className="grid-2">
            <div>
              <label>Tu nombre *</label>
              <input value={form.nombre} onChange={e => setForm({ ...form, nombre: e.target.value })} required />
            </div>
            <div>
              <label>Tu correo</label>
              <input type="email" value={form.correo} onChange={e => setForm({ ...form, correo: e.target.value })} />
            </div>
          </div>
          <div>
            <label>Asunto</label>
            <select value={form.asunto} onChange={e => setForm({ ...form, asunto: e.target.value })}>
              <option value="">Selecciona un tema...</option>
              <option>Problema con el sistema</option>
              <option>Error en una venta o factura</option>
              <option>Duda sobre un módulo</option>
              <option>Solicitud de nueva función</option>
              <option>Otro</option>
            </select>
          </div>
          <div>
            <label>Mensaje *</label>
            <textarea
              value={form.mensaje}
              onChange={e => setForm({ ...form, mensaje: e.target.value })}
              rows={5}
              required
              placeholder="Describe tu problema o duda con el mayor detalle posible..."
            />
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <button type="submit" className="btn-primary" disabled={enviando} style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem' }}>
              <Send size={15} /> {enviando ? 'Enviando...' : 'Enviar mensaje'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default AtencionCliente;