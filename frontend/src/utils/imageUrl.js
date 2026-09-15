import { API_URL } from '../config';

/**
 * Resuelve cualquier URL de imagen (sea relativa /uploads/..., externa https://... o data:URI)
 * devolviendo la URL completa correcta para ser consumida por el frontend.
 */
export function resolverUrlImagen(url) {
  if (!url || typeof url !== 'string') return null;
  const trimmed = url.trim();
  if (!trimmed) return null;

  // Si ya es una URL completa (http, https) o un base64/blob
  if (trimmed.startsWith('http://') || trimmed.startsWith('https://') || trimmed.startsWith('data:') || trimmed.startsWith('blob:')) {
    return trimmed;
  }

  // Si es una ruta relativa que empieza por / o sin /, la concatenamos al API_URL
  const base = (API_URL || '').endsWith('/') ? API_URL.slice(0, -1) : (API_URL || '');
  const path = trimmed.startsWith('/') ? trimmed : '/' + trimmed;
  return base + path;
}
