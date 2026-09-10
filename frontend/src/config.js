// Detecta automáticamente el entorno de ejecución
const isCapacitor = typeof window !== 'undefined' && window.location.protocol === 'capacitor:';
const isElectron = typeof window !== 'undefined' && (window.electronAPI?.isElectron || window.navigator.userAgent.includes('Electron'));

// URL del backend API:
// - Variable de entorno VITE_API_URL (para deploy web / producción)
// - Capacitor: IP local del desarrollador
// - Electron / Browser: localhost
export const API_URL = import.meta.env.VITE_API_URL
  || (isCapacitor ? 'http://192.168.1.58:3000' : 'http://localhost:3000');

console.log('[Config] Entorno:', isCapacitor ? '📱 iOS' : isElectron ? '💻 Electron' : '🌐 Web');
console.log('[Config] API:', API_URL);
