import { useId, useState } from 'react';

/**
 * Logo del Sistema Integral de Ventas.
 *
 * - Si existe `/logos/logo.png` (o la extensión que se pase en `src`) lo muestra.
 * - Si no, renderiza un SVG placeholder con la tienda 3D + "24".
 *
 * Esto permite que el usuario suba su propio logo sin tocar código:
 * solo tiene que colocar el archivo en `frontend/public/logos/logo.png`
 * y se mostrará automáticamente.
 *
 * IMPORTANTE: usa `import.meta.env.BASE_URL` para que funcione tanto en
 * - Web (http://localhost:5173)
 * - Electron file:// (file:///path/to/dist/index.html)
 * - Capacitor (https://app.domain.com/)
 * - Build estático
 */
const Logo = ({
  size = 80,
  showText = false,
  glow = false,
  src = null
}) => {
  // Resuelve la URL del logo de forma compatible con todos los entornos.
  // BASE_URL es './' (definido en vite.config.js), así que la URL queda relativa.
  const baseUrl = import.meta.env.BASE_URL || './';
  const logoUrl = src || `${baseUrl}logos/logo.png`.replace(/\/\//g, '/');
  const [imgError, setImgError] = useState(false);
  const uid = useId().replace(/:/g, '');
  const gradId = `logo-grad-${uid}`;
  const stripesId = `logo-stripes-${uid}`;
  const glowId = `logo-glow-${uid}`;
  const ringId = `logo-ring-${uid}`;
  const innerGradId = `logo-inner-grad-${uid}`;

  const useImage = logoUrl && !imgError;

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
        {useImage ? (
          <img
            src={logoUrl}
            alt="Logo del sistema"
            onError={() => setImgError(true)}
            style={{
              width: '100%',
              height: '100%',
              objectFit: 'contain',
              display: 'block'
            }}
          />
        ) : (
          <svg
            width={size}
            height={size}
            viewBox="0 0 120 120"
            xmlns="http://www.w3.org/2000/svg"
            style={{ display: 'block' }}
          >
            <defs>
              <linearGradient id={gradId} x1="0" y1="0" x2="1" y2="1">
                <stop offset="0%" stopColor="#0a2818" />
                <stop offset="100%" stopColor="#1a4a2e" />
              </linearGradient>
              <pattern id={stripesId} x="0" y="0" width="14" height="14" patternUnits="userSpaceOnUse">
                <rect x="0" y="0" width="14" height="14" fill="#f5f9f3" />
                <rect x="0" y="0" width="7" height="14" fill="#2dd46d" />
              </pattern>
              <filter id={glowId} x="-30%" y="-30%" width="160%" height="160%">
                <feGaussianBlur stdDeviation="2.5" result="blur" />
                <feMerge>
                  <feMergeNode in="blur" />
                  <feMergeNode in="SourceGraphic" />
                </feMerge>
              </filter>
              <linearGradient id={ringId} x1="0" y1="0" x2="1" y2="1">
                <stop offset="0%" stopColor="#2dd46d" stopOpacity="1" />
                <stop offset="100%" stopColor="#1a8a4a" stopOpacity="1" />
              </linearGradient>
              <radialGradient id={innerGradId} cx="0.5" cy="0.3" r="0.7">
                <stop offset="0%" stopColor="#2dd46d" stopOpacity="0.5" />
                <stop offset="100%" stopColor="#2dd46d" stopOpacity="0" />
              </radialGradient>
            </defs>

            <rect
              x="3" y="3" width="114" height="114" rx="26" ry="26"
              fill="none" stroke={`url(#${ringId})`} strokeWidth="2.5"
              filter={`url(#${glowId})`}
            />
            <rect x="8" y="8" width="104" height="104" rx="22" ry="22" fill={`url(#${gradId})`} />
            <rect x="8" y="8" width="104" height="50" rx="22" ry="22" fill="white" opacity="0.04" />

            {/* Tienda 3D */}
            <rect x="26" y="72" width="68" height="26" rx="2" fill="#0a1f12" />
            <rect x="28" y="55" width="64" height="42" fill="#f0f5ec" />
            <polygon points="92,55 99,49 99,91 92,97" fill="#cfd8c9" />
            <polygon points="28,55 21,49 21,91 28,97" fill="#dde4d8" />
            <path d="M 24 58 L 96 58 L 92 50 L 28 50 Z" fill={`url(#${stripesId})`} />
            <rect x="24" y="58" width="72" height="3" fill="#1a8a4a" />
            <rect x="52" y="68" width="16" height="29" rx="1" fill="#0a1f12" />
            <rect x="53.5" y="69" width="3" height="26" fill="#2dd46d" opacity="0.35" />
            <circle cx="64" cy="83" r="0.8" fill="#2dd46d" />
            <rect x="32" y="68" width="16" height="14" rx="1" fill="#1a4a2e" />
            <rect x="33" y="69" width="6" height="5" fill="#2dd46d" opacity="0.45" />
            <line x1="40" y1="68" x2="40" y2="82" stroke="#0a2818" strokeWidth="0.6" />
            <line x1="32" y1="75" x2="48" y2="75" stroke="#0a2818" strokeWidth="0.6" />
            <rect x="72" y="68" width="16" height="14" rx="1" fill="#1a4a2e" />
            <rect x="73" y="69" width="6" height="5" fill="#2dd46d" opacity="0.45" />
            <line x1="80" y1="68" x2="80" y2="82" stroke="#0a2818" strokeWidth="0.6" />
            <line x1="72" y1="75" x2="88" y2="75" stroke="#0a2818" strokeWidth="0.6" />

            {/* Círculo "24" */}
            <g>
              <circle cx="60" cy="32" r="20" fill="#0a1f12" opacity="0.5" />
              <circle cx="60" cy="31" r="20" fill="#0d2a1a" stroke="#2dd46d" strokeWidth="1.5" />
              <circle cx="60" cy="31" r="18" fill={`url(#${innerGradId})`} opacity="0.4" />
              <text
                x="60" y="37" textAnchor="middle"
                fontFamily="Inter, system-ui, -apple-system, sans-serif"
                fontSize="16" fontWeight="800" fill="#ffffff" letterSpacing="-0.5"
              >
                24
              </text>
              <path
                d="M 60 14 A 17 17 0 1 1 47 18"
                fill="none" stroke="#2dd46d" strokeWidth="1.8"
                strokeLinecap="round" strokeDasharray="60 50"
              />
              <polygon points="47,18 50,14 44,15" fill="#2dd46d" />
            </g>
          </svg>
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
