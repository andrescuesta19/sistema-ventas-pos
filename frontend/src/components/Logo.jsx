import { useState } from 'react';

/**
 * Logo del Sistema Integral de Ventas.
 *
 * Muestra SIEMPRE la imagen logo.png desde public/logos/.
 * Sin fallback SVG animado — si el archivo no existe, muestra un placeholder simple.
 */
const Logo = ({
  size = 80,
  showText = false,
  glow = false,
  src = null
}) => {
  // Resuelve la URL del logo de forma compatible con todos los entornos.
  const baseUrl = import.meta.env.BASE_URL || './';
  const logoUrl = src || `${baseUrl}logos/logo.png`.replace(/\/\//g, '/');
  const [imgError, setImgError] = useState(false);

  return (
    <div
      style={{
        display: 'inline-flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: '0.6rem',
        lineHeight: 0
      }}
    >
      <div
        style={{
          width: size,
          height: size,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          filter: glow
            ? `drop-shadow(0 0 12px rgba(45, 212, 109, 0.55)) drop-shadow(0 0 28px rgba(45, 212, 109, 0.25))`
            : 'none',
          overflow: 'hidden',
          borderRadius: size > 60 ? 18 : 12
        }}
      >
        {!imgError ? (
          <img
            src={logoUrl}
            alt="Logo del sistema"
            crossOrigin="anonymous"
            onError={() => setImgError(true)}
            style={{
              width: '100%',
              height: '100%',
              objectFit: 'contain',
              display: 'block'
            }}
          />
        ) : (
          /* Placeholder simple sin SVG animado */
          <div
            style={{
              width: '100%',
              height: '100%',
              borderRadius: size > 60 ? 18 : 12,
              background: 'linear-gradient(135deg, #0a2818, #1a4a2e)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#2dd46d',
              fontFamily: 'Inter, system-ui, -apple-system, sans-serif',
              fontWeight: 800,
              fontSize: size * 0.35
            }}
          >
            SIV
          </div>
        )}
      </div>

      {showText && (
        <div style={{ textAlign: 'center', marginTop: size > 60 ? '0.4rem' : '0.2rem' }}>
          <div
            style={{
              fontFamily: 'Inter, system-ui, -apple-system, sans-serif',
              fontWeight: 800,
              fontSize: size > 60 ? '1.05rem' : '0.85rem',
              color: '#e8f5ed',
              letterSpacing: '-0.3px',
              lineHeight: 1.1
            }}
          >
            Sistema Integral
          </div>
          <div
            style={{
              fontFamily: 'Inter, system-ui, -apple-system, sans-serif',
              fontWeight: 700,
              fontSize: size > 60 ? '0.9rem' : '0.75rem',
              color: '#2dd46d',
              letterSpacing: '0.3px',
              lineHeight: 1.1,
              marginTop: '2px'
            }}
          >
            de Ventas
          </div>
        </div>
      )}
    </div>
  );
};

export default Logo;
