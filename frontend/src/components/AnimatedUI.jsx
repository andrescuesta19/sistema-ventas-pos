import { motion, AnimatePresence } from 'framer-motion';
import { CheckCircle, ShoppingCart } from 'lucide-react';
import { useState, useCallback } from 'react';

/* ═══════════════════════════════════════════════════════════════
   AnimatedButton — Botón con animaciones de hover, tap y loading
   Usa Framer Motion para micro-interacciones suaves
   ═══════════════════════════════════════════════════════════════ */
export const AnimatedButton = ({
  children,
  onClick,
  variant = 'primary', // 'primary' | 'secondary' | 'danger' | 'ghost'
  size = 'md',         // 'sm' | 'md' | 'lg'
  disabled = false,
  loading = false,
  icon: Icon,
  className = '',
  style = {},
  ...props
}) => {
  const variants = {
    primary: {
      bg: 'linear-gradient(135deg, #2A9D8F 0%, #264653 100%)',
      color: '#fff',
      shadow: '0 4px 14px rgba(42, 157, 143, 0.35)',
      hoverShadow: '0 8px 25px rgba(42, 157, 143, 0.5)',
    },
    secondary: {
      bg: 'rgba(42, 157, 143, 0.1)',
      color: '#2A9D8F',
      shadow: 'none',
      hoverShadow: '0 4px 12px rgba(42, 157, 143, 0.15)',
    },
    danger: {
      bg: 'linear-gradient(135deg, #EF4444 0%, #DC2626 100%)',
      color: '#fff',
      shadow: '0 4px 14px rgba(239, 68, 68, 0.35)',
      hoverShadow: '0 8px 25px rgba(239, 68, 68, 0.5)',
    },
    ghost: {
      bg: 'transparent',
      color: '#64748B',
      shadow: 'none',
      hoverShadow: 'none',
    },
  };

  const sizes = {
    sm: { padding: '0.4rem 0.8rem', fontSize: '0.8rem', borderRadius: '8px', gap: '0.35rem' },
    md: { padding: '0.65rem 1.2rem', fontSize: '0.9rem', borderRadius: '10px', gap: '0.5rem' },
    lg: { padding: '0.85rem 1.6rem', fontSize: '1rem', borderRadius: '12px', gap: '0.6rem' },
  };

  const v = variants[variant];
  const s = sizes[size];

  return (
    <motion.button
      className={`animated-btn ${className}`}
      disabled={disabled || loading}
      onClick={onClick}
      whileHover={!disabled && !loading ? { y: -2, scale: 1.02 } : {}}
      whileTap={!disabled && !loading ? { scale: 0.97 } : {}}
      transition={{ type: 'spring', stiffness: 400, damping: 17 }}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: s.gap,
        padding: s.padding,
        fontSize: s.fontSize,
        fontWeight: 600,
        fontFamily: 'inherit',
        borderRadius: s.borderRadius,
        border: 'none',
        cursor: disabled || loading ? 'not-allowed' : 'pointer',
        background: v.bg,
        color: v.color,
        boxShadow: v.shadow,
        opacity: disabled ? 0.6 : 1,
        position: 'relative',
        overflow: 'hidden',
        transition: 'box-shadow 0.2s ease',
        ...style,
      }}
      onMouseEnter={(e) => {
        if (!disabled && !loading) e.currentTarget.style.boxShadow = v.hoverShadow;
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.boxShadow = v.shadow;
      }}
      {...props}
    >
      {loading && (
        <motion.span
          style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'inherit',
            borderRadius: 'inherit',
          }}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
        >
          <span className="btn-spinner" />
        </motion.span>
      )}
      <span style={{ display: 'flex', alignItems: 'center', gap: s.gap, opacity: loading ? 0 : 1 }}>
        {Icon && <Icon size={size === 'sm' ? 14 : size === 'lg' ? 20 : 16} />}
        {children}
      </span>
    </motion.button>
  );
};

/* ═══════════════════════════════════════════════════════════════
   AddToCartButton — Botón de agregar con animación de éxito
   Muestra check + "Agregado" por 1.2s al hacer click
   ═══════════════════════════════════════════════════════════════ */
export const AddToCartButton = ({ onAdd, disabled = false, product }) => {
  const [added, setAdded] = useState(false);

  const handleClick = useCallback((e) => {
    e.stopPropagation();
    if (disabled || added) return;
    onAdd?.(product);
    setAdded(true);
    setTimeout(() => setAdded(false), 1200);
  }, [disabled, added, onAdd, product]);

  return (
    <motion.button
      onClick={handleClick}
      disabled={disabled}
      whileHover={!disabled && !added ? { scale: 1.08 } : {}}
      whileTap={!disabled && !added ? { scale: 0.92 } : {}}
      transition={{ type: 'spring', stiffness: 500, damping: 15 }}
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '0.35rem',
        padding: '0.5rem 0.9rem',
        fontSize: '0.8rem',
        fontWeight: 700,
        fontFamily: 'inherit',
        borderRadius: '10px',
        border: 'none',
        cursor: disabled ? 'not-allowed' : 'pointer',
        background: added
          ? 'linear-gradient(135deg, #10B981 0%, #059669 100%)'
          : 'linear-gradient(135deg, #2A9D8F 0%, #264653 100%)',
        color: '#fff',
        boxShadow: added
          ? '0 4px 14px rgba(16, 185, 129, 0.4)'
          : '0 4px 14px rgba(42, 157, 143, 0.35)',
        opacity: disabled ? 0.5 : 1,
        transition: 'background 0.3s ease, box-shadow 0.3s ease',
        whiteSpace: 'nowrap',
      }}
    >
      <AnimatePresence mode="wait">
        {added ? (
          <motion.span
            key="added"
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 500, damping: 15 }}
            style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}
          >
            <CheckCircle size={15} />
            ¡Agregado!
          </motion.span>
        ) : (
          <motion.span
            key="add"
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.8, opacity: 0 }}
            style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}
          >
            <ShoppingCart size={15} />
            Agregar
          </motion.span>
        )}
      </AnimatePresence>
    </motion.button>
  );
};

/* ═══════════════════════════════════════════════════════════════
   AnimatedCard — Card con animación de entrada y hover
   ═══════════════════════════════════════════════════════════════ */
export const AnimatedCard = ({ children, delay = 0, style = {}, className = '', ...props }) => (
  <motion.div
    className={`animated-card ${className}`}
    initial={{ opacity: 0, y: 20 }}
    animate={{ opacity: 1, y: 0 }}
    transition={{ delay, duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
    whileHover={{ y: -4, transition: { duration: 0.2 } }}
    style={{
      background: '#fff',
      borderRadius: '14px',
      border: '1px solid #E2E8F0',
      overflow: 'hidden',
      cursor: 'pointer',
      transition: 'box-shadow 0.2s ease',
      ...style,
    }}
    {...props}
  >
    {children}
  </motion.div>
);

/* ═══════════════════════════════════════════════════════════════
   CartBadge — Badge animado del carrito que "salta" al actualizar
   ═══════════════════════════════════════════════════════════════ */
export const CartBadge = ({ count }) => (
  <AnimatePresence>
    {count > 0 && (
      <motion.span
        key={count}
        initial={{ scale: 0, y: 10 }}
        animate={{ scale: 1, y: 0 }}
        exit={{ scale: 0 }}
        transition={{ type: 'spring', stiffness: 500, damping: 15 }}
        style={{
          position: 'absolute',
          top: '-6px',
          right: '-6px',
          minWidth: '20px',
          height: '20px',
          borderRadius: '10px',
          background: 'linear-gradient(135deg, #EF4444 0%, #DC2626 100%)',
          color: '#fff',
          fontSize: '0.7rem',
          fontWeight: 700,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '0 5px',
          boxShadow: '0 2px 8px rgba(239, 68, 68, 0.4)',
        }}
      >
        {count}
      </motion.span>
    )}
  </AnimatePresence>
);

/* ═══════════════════════════════════════════════════════════════
   Toast — Notificación flotante animada
   ═══════════════════════════════════════════════════════════════ */
export const Toast = ({ message, type = 'success', visible, onDone }) => (
  <AnimatePresence>
    {visible && (
      <motion.div
        initial={{ opacity: 0, y: 50, x: '-50%' }}
        animate={{ opacity: 1, y: 0, x: '-50%' }}
        exit={{ opacity: 0, y: 20, x: '-50%' }}
        transition={{ type: 'spring', stiffness: 400, damping: 20 }}
        onAnimationComplete={() => {
          if (onDone) setTimeout(onDone, 2000);
        }}
        style={{
          position: 'fixed',
          bottom: '2rem',
          left: '50%',
          zIndex: 9999,
          display: 'flex',
          alignItems: 'center',
          gap: '0.6rem',
          padding: '0.75rem 1.25rem',
          borderRadius: '12px',
          background: type === 'success'
            ? 'linear-gradient(135deg, #10B981 0%, #059669 100%)'
            : type === 'error'
              ? 'linear-gradient(135deg, #EF4444 0%, #DC2626 100%)'
              : 'linear-gradient(135deg, #2A9D8F 0%, #264653 100%)',
          color: '#fff',
          fontWeight: 600,
          fontSize: '0.9rem',
          boxShadow: '0 10px 30px rgba(0,0,0,0.25)',
          whiteSpace: 'nowrap',
        }}
      >
        {type === 'success' && <CheckCircle size={18} />}
        {message}
      </motion.div>
    )}
  </AnimatePresence>
);
