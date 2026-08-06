// Detecta automáticamente el entorno de ejecución (iOS Capacitor, Electron de Escritorio o Navegador Web)
const isCapacitor = typeof window !== 'undefined' && window.location.protocol === 'capacitor:';
const isElectron = typeof window !== 'undefined' && (window.electronAPI?.isElectron || window.navigator.userAgent.includes('Electron'));

export const API_URL = isCapacitor 
  ? 'http://192.168.1.58:3000' 
  : 'http://localhost:3000';

console.log('[Config] Entorno detectado:', isCapacitor ? '📱 iOS Nativo' : isElectron ? '💻 Electron Escritorio' : '🌐 Navegador Web');
console.log('[Config] Servidor API:', API_URL);
