import { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { API_URL } from '../config';

/* ═══════════════════════════════════════════════════════════════
   GoogleLoginButton — Login con Google (Web + Electron + Móvil)
   
   Web: Usa Google Identity Services (popup)
   Electron: Abre navegador del sistema + pos:// callback
   ═══════════════════════════════════════════════════════════════ */

const GOOGLE_CLIENT_ID = '102211642193-26eg73kc36hean8o3dihmieh34sljfev.apps.googleusercontent.com';

// Detectar Electron
const isElectron = typeof window !== 'undefined' && 
  (window.electronAPI?.isElectron || 
   (typeof window.process !== 'undefined' && window.process?.type));

const GoogleLoginButton = ({
  onSuccess,
  onError,
  // v2.2.7: callback para cuando el usuario es nuevo y esta pendiente de aprobacion.
  // Permite a las pantallas mostrar UI especializada en vez de error generico.
  onPendingApproval,
  text = 'Continuar con Google',
  disabled = false,
  mode = 'signin'
}) => {
  const buttonRef = useRef(null);
  const [loading, setLoading] = useState(false);
  const [scriptLoaded, setScriptLoaded] = useState(false);
  const [gsiReady, setGsiReady] = useState(false);

  // ── Si estamos en Electron, usar navegador del sistema ──
  const handleElectronGoogleLogin = async () => {
    setLoading(true);
    try {
      // Crear una sesión temporal en el backend para el OAuth flow
      const state = Math.random().toString(36).substring(2);
      
      // v2.2.3: redirect_uri SIN parámetros extra (Google lo rechaza)
      const redirectUri = encodeURIComponent(`${API_URL}/api/auth/google/callback`);
      const googleAuthUrl = `https://accounts.google.com/o/oauth2/v2/auth?` +
        `client_id=${GOOGLE_CLIENT_ID}` +
        `&redirect_uri=${redirectUri}` +
        `&response_type=code` +
        `&scope=openid email profile` +
        `&state=${state}` +
        `&prompt=select_account`;

      // Abrir en el navegador del sistema
      if (window.electronAPI?.openExternal) {
        await window.electronAPI.openExternal(googleAuthUrl);
      } else {
        window.open(googleAuthUrl, '_blank');
      }

      // Escuchar el callback via pos:// protocol
      if (window.electronAPI?.onGoogleAuthCallback) {
        window.electronAPI.onGoogleAuthCallback(async (data) => {
          if (data?.token && data?.user) {
            onSuccess?.(data);
          } else if (data?.error) {
            onError?.(data.error);
          }
          setLoading(false);
        });
      }

      // Timeout después de 5 minutos
      setTimeout(() => {
        setLoading(false);
      }, 300000);

    } catch (err) {
      console.error('Electron Google auth error:', err);
      onError?.('Error al abrir navegador para autenticación con Google');
      setLoading(false);
    }
  };

  // ── Web: Usar Google Identity Services (popup) ──
  const handleWebGoogleLogin = () => {
    setLoading(true);
    try {
      if (window.google?.accounts?.id) {
        window.google.accounts.id.prompt();
      }
    } catch (err) {
      console.error('Web Google auth error:', err);
      onError?.('Error al iniciar autenticación con Google');
      setLoading(false);
    }
  };

  // Manejar la respuesta de Google (solo web)
  const handleCredentialResponse = async (response) => {
    if (!response?.credential) {
      onError?.('No se recibió credencial de Google');
      setLoading(false);
      return;
    }

    try {
      const payload = JSON.parse(atob(response.credential.split('.')[1]));
      
      const result = await fetch(`${API_URL}/api/auth/google`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          idToken: response.credential,
          email: payload.email,
          name: payload.name || payload.given_name || payload.email.split('@')[0],
          photoUrl: payload.picture || null,
        }),
      });

      const data = await result.json();

      if (!result.ok) {
        // v2.2.7: distinguir "pendiente de aprobacion" de otros errores.
        // El backend devuelve { pendiente_aprobacion: true, recien_registrado } cuando
        // es usuario nuevo. En ese caso, lanzamos evento especial para que la UI
        // muestre pantalla de espera en lugar de error.
        if (data.pendiente_aprobacion) {
          onPendingApproval?.(data);
          setLoading(false);
          return;
        }
        onError?.(data.error || 'Error al autenticar con Google');
        setLoading(false);
        return;
      }

      onSuccess?.(data);
    } catch (err) {
      console.error('Google auth error:', err);
      onError?.('Error de conexión con el servidor');
      setLoading(false);
    }
  };

  // Cargar script de Google (solo para web)
  useEffect(() => {
    if (isElectron) return; // No cargar script en Electron

    if (window.google?.accounts?.id) {
      setScriptLoaded(true);
      return;
    }

    const script = document.createElement('script');
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.defer = true;
    script.onload = () => setScriptLoaded(true);
    script.onerror = () => console.error('Error loading Google script');
    document.head.appendChild(script);

    return () => {};
  }, []);

  // Inicializar Google (solo web)
  useEffect(() => {
    if (isElectron || !scriptLoaded) return;

    const checkGsi = setInterval(() => {
      if (window.google?.accounts?.id) {
        clearInterval(checkGsi);
        setGsiReady(true);
      }
    }, 100);

    return () => clearInterval(checkGsi);
  }, [scriptLoaded]);

  // Renderizar botón de Google (solo web)
  useEffect(() => {
    if (isElectron || !gsiReady || !buttonRef.current) return;

    try {
      window.google.accounts.id.initialize({
        client_id: GOOGLE_CLIENT_ID,
        callback: handleCredentialResponse,
        auto_select: false,
        cancel_on_tap_outside: true,
      });

      window.google.accounts.id.renderButton(buttonRef.current, {
        type: 'standard',
        theme: 'outline',
        size: 'large',
        text: mode === 'signup' ? 'signup_with' : 'continue_with',
        width: buttonRef.current?.parentElement?.offsetWidth || 300,
        locale: 'es_CO',
      });
    } catch (err) {
      console.error('Error initializing Google button:', err);
    }
  }, [gsiReady, mode]);

  // Handler del click principal
  const handleClick = () => {
    if (disabled || loading) return;
    
    if (isElectron) {
      handleElectronGoogleLogin();
    } else {
      // Para web, el botón de Google se renderiza solo
      // Este click es fallback si el botón de Google no carga
      handleWebGoogleLogin();
    }
  };

  return (
    <div style={{ width: '100%', position: 'relative' }}>
      {isElectron ? (
        // ── Botón personalizado para Electron ──
        <motion.button
          onClick={handleClick}
          disabled={disabled || loading}
          whileHover={!disabled && !loading ? { scale: 1.02 } : {}}
          whileTap={!disabled && !loading ? { scale: 0.98 } : {}}
          style={{
            width: '100%',
            padding: '0.85rem 1.5rem',
            borderRadius: '12px',
            border: '1.5px solid rgba(255, 255, 255, 0.15)',
            background: 'rgba(255, 255, 255, 0.05)',
            color: '#fff',
            fontSize: '0.95rem',
            fontWeight: 600,
            fontFamily: 'inherit',
            cursor: disabled || loading ? 'not-allowed' : 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '0.75rem',
            transition: 'all 0.2s ease',
            opacity: disabled ? 0.5 : 1,
          }}
        >
          {loading ? (
            <div className="google-spinner" />
          ) : (
            <svg width="20" height="20" viewBox="0 0 48 48">
              <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>
              <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>
              <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/>
              <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>
            </svg>
          )}
          {loading ? 'Conectando con Google...' : text}
        </motion.button>
      ) : (
        // ── Botón de Google Identity Services (web) ──
        <div 
          ref={buttonRef}
          style={{ 
            width: '100%',
            opacity: disabled || loading ? 0.6 : 1,
            pointerEvents: disabled || loading ? 'none' : 'auto',
            minHeight: '44px',
          }}
        />
      )}

      {/* Loading overlay */}
      {loading && isElectron && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'rgba(20, 40, 25, 0.95)',
            borderRadius: '12px',
            zIndex: 10,
          }}
        >
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.6rem',
            color: '#fff',
            fontSize: '0.9rem',
            fontWeight: 600,
          }}>
            <div className="google-spinner" />
            Abriendo navegador...
          </div>
        </motion.div>
      )}

      <style>{`
        .google-spinner {
          width: 20px;
          height: 20px;
          border: 2.5px solid rgba(126, 217, 87, 0.2);
          border-top-color: #7ed957;
          border-radius: 50%;
          animation: googleSpin 0.8s linear infinite;
        }
        @keyframes googleSpin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
};

export default GoogleLoginButton;
