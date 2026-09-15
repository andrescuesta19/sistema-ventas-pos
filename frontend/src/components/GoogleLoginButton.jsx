import { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { API_URL } from '../config';

/* ═══════════════════════════════════════════════════════════════
   GoogleLoginButton — Login con Google (Web + Electron + Móvil)
   
   Funciona en:
   - Navegador web (producción Render + desarrollo local)
   - Electron (Mac/Windows/Linux) — abre ventana del navegador
   - Capacitor (iOS/Android) — usa el navegador del sistema
   
   Flujo:
   1. Usuario hace click en "Continuar con Google"
   2. Se abre popup/ventana con cuentas de Google
   3. Google retorna un credential (JWT)
   4. Enviamos el JWT al backend para verificar y crear sesión
   ═══════════════════════════════════════════════════════════════ */

const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID || '';

const GoogleLoginButton = ({ 
  onSuccess, 
  onError, 
  text = 'Continuar con Google', 
  disabled = false,
  mode = 'signin' // 'signin' | 'signup'
}) => {
  const buttonRef = useRef(null);
  const [loading, setLoading] = useState(false);
  const [scriptLoaded, setScriptLoaded] = useState(false);
  const [gsiReady, setGsiReady] = useState(false);

  // Detectar si estamos en Electron
  const isElectron = typeof window !== 'undefined' && window.process && window.process.type;

  // Cargar script de Google Identity Services
  useEffect(() => {
    if (window.google?.accounts?.id) {
      setScriptLoaded(true);
      return;
    }

    const script = document.createElement('script');
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.defer = true;
    script.onload = () => {
      setScriptLoaded(true);
    };
    script.onerror = () => {
      console.error('Error loading Google Identity Services script');
    };
    document.head.appendChild(script);

    return () => {
      // No remover el script — otros componentes lo usan
    };
  }, []);

  // Manejar la respuesta de Google (callback)
  const handleCredentialResponse = async (response) => {
    if (!response?.credential) {
      onError?.('No se recibió credencial de Google');
      return;
    }

    setLoading(true);
    try {
      // Decodificar el JWT de Google para obtener datos del usuario
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
        onError?.(data.error || 'Error al autenticar con Google');
        return;
      }

      onSuccess?.(data);
    } catch (err) {
      console.error('Google auth error:', err);
      onError?.('Error de conexión con el servidor');
    } finally {
      setLoading(false);
    }
  };

  // Inicializar Google cuando el script esté listo
  useEffect(() => {
    if (!scriptLoaded || !GOOGLE_CLIENT_ID) return;

    // Esperar a que google.accounts.id esté disponible
    const checkGsi = setInterval(() => {
      if (window.google?.accounts?.id) {
        clearInterval(checkGsi);
        setGsiReady(true);
      }
    }, 100);

    return () => clearInterval(checkGsi);
  }, [scriptLoaded]);

  // Renderizar el botón de Google cuando GSI esté listo
  useEffect(() => {
    if (!gsiReady || !buttonRef.current) return;

    try {
      // Inicializar
      window.google.accounts.id.initialize({
        client_id: GOOGLE_CLIENT_ID,
        callback: handleCredentialResponse,
        auto_select: false,
        cancel_on_tap_outside: true,
        itp_support: true, // Soporte para ITP en Safari
      });

      // Renderizar botón oficial de Google
      window.google.accounts.id.renderButton(buttonRef.current, {
        type: 'standard',
        theme: 'outline',
        size: 'large',
        text: mode === 'signup' ? 'signup_with' : 'continue_with',
        width: buttonRef.current?.parentElement?.offsetWidth || 300,
        locale: 'es_CO',
        shape: 'rectangular',
      });
    } catch (err) {
      console.error('Error initializing Google button:', err);
    }
  }, [gsiReady, mode]);

  // Si no hay Google Client ID
  if (!GOOGLE_CLIENT_ID) {
    return (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        style={{
          width: '100%',
          padding: '0.85rem',
          borderRadius: '12px',
          border: '1.5px dashed rgba(255, 255, 255, 0.15)',
          textAlign: 'center',
          color: 'rgba(255, 255, 255, 0.3)',
          fontSize: '0.85rem',
        }}
      >
        Google Login no configurado — falta VITE_GOOGLE_CLIENT_ID
      </motion.div>
    );
  }

  return (
    <div style={{ width: '100%', position: 'relative' }}>
      {/* Botón de Google renderizado por GIS */}
      <div 
        ref={buttonRef} 
        id="google-signin-button"
        style={{ 
          width: '100%',
          opacity: disabled || loading ? 0.6 : 1,
          pointerEvents: disabled || loading ? 'none' : 'auto',
          minHeight: '44px',
        }} 
      />
      
      {/* Loading overlay */}
      {loading && (
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
            backdropFilter: 'blur(4px)',
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
            Conectando con Google...
          </div>
        </motion.div>
      )}

      {/* Estilos */}
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
        /* Estilizar el botón de Google para que se vea bien */
        #google-signin-button > div {
          border-radius: 12px !important;
          width: 100% !important;
        }
        #google-signin-button iframe {
          border-radius: 12px !important;
          width: 100% !important;
        }
      `}</style>
    </div>
  );
};

export default GoogleLoginButton;
