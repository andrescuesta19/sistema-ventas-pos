// Detecta automáticamente el entorno de ejecución (iOS Capacitor, Electron de Escritorio o Navegador Web)
const isCapacitor = typeof window !== 'undefined' && window.location.protocol === 'capacitor:';
const isElectron = typeof window !== 'undefined' && (window.electronAPI?.isElectron || window.navigator.userAgent.includes('Electron'));

// v2.0.1: En web (GitHub Pages), usar el backend de Render
const isWeb = !isCapacitor && !isElectron;

export const API_URL = isCapacitor 
  ? 'http://192.168.1.58:3000'
  : isWeb
    ? 'https://sistema-ventas-pos-aeka.onrender.com'
    : 'http://localhost:3000';

export const DEMO_MODE = false;

console.log('[Config] Entorno detectado:', isCapacitor ? '📱 iOS Nativo' : isElectron ? '💻 Electron Escritorio' : '🌐 Navegador Web (Render)');
console.log('[Config] Servidor API:', API_URL);
