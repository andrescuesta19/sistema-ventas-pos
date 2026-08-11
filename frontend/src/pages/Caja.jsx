import { Wallet, Plus, ArrowDownLeft, ArrowUpRight } from 'lucide-react';

const Caja = () => {
  return (
    <div style={{ padding: '2rem', maxWidth: 1100, margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.5rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <Wallet size={26} color="var(--green-primary, #1a8a4a)" />
          <div>
            <h1 style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>Caja y Bancos</h1>
            <p style={{ color: 'var(--text-secondary)', margin: '0.25rem 0 0', fontSize: '0.9rem' }}>
              Movimientos de efectivo, ingresos y egresos
            </p>
          </div>
        </div>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <button style={{
            background: 'rgba(126, 217, 87, 0.1)', color: '#7ed957',
            border: '1px solid rgba(126, 217, 87, 0.3)', padding: '0.6rem 1.1rem',
            borderRadius: 10, fontSize: '0.9rem', fontWeight: 600, cursor: 'pointer',
            display: 'flex', alignItems: 'center', gap: '0.4rem', fontFamily: 'inherit',
          }}>
            <ArrowDownLeft size={15} /> Ingreso
          </button>
          <button style={{
            background: 'rgba(231, 76, 60, 0.1)', color: '#ff6b6b',
            border: '1px solid rgba(231, 76, 60, 0.3)', padding: '0.6rem 1.1rem',
            borderRadius: 10, fontSize: '0.9rem', fontWeight: 600, cursor: 'pointer',
            display: 'flex', alignItems: 'center', gap: '0.4rem', fontFamily: 'inherit',
          }}>
            <ArrowUpRight size={15} /> Egreso
          </button>
        </div>
      </div>

      <div style={{
        background: 'var(--bg-card, #fff)', border: '1px solid var(--border-soft, #e2e8f0)',
        borderRadius: 12, padding: '3rem 1.5rem', textAlign: 'center',
        color: 'var(--text-secondary, #64748b)',
      }}>
        <Wallet size={56} style={{ marginBottom: '0.75rem', opacity: 0.4 }} />
        <p style={{ margin: 0, fontSize: '1rem', fontWeight: 600, color: 'var(--text-primary, #1a202c)' }}>
          No hay movimientos registrados
        </p>
        <p style={{ margin: '0.4rem 0 0', fontSize: '0.88rem' }}>
          Los ingresos y egresos de tu caja aparecerán aquí. Usa los botones de arriba para registrar el primero.
        </p>
      </div>
    </div>
  );
};

export default Caja;
