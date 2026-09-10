// Helper para hacer fetch con JWT automáticamente
// Si el token expira (401), limpia la sesión para forzar re-login.

import { DEMO_MODE } from './config';
import { DEMO_USER, DEMO_TOKEN, DEMO_PRODUCTOS, DEMO_TURNOS, DEMO_VENTAS, demoFetch } from './demoData';

const TOKEN_KEY = 'pos_token';
const USER_KEY = 'pos_user';

export function getToken() {
  return localStorage.getItem(TOKEN_KEY);
}

export function getUser() {
  try {
    const u = localStorage.getItem(USER_KEY);
    return u ? JSON.parse(u) : null;
  } catch {
    return null;
  }
}

export function setSession(token, user) {
  localStorage.setItem(TOKEN_KEY, token);
  localStorage.setItem(USER_KEY, JSON.stringify(user));
}

export function clearSession() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
}

/**
 * fetchAuth: wrapper de fetch que añade Authorization automáticamente.
 * Si recibe 401, limpia la sesión y dispara un evento global para que
 * la app redirija al login.
 * En modo demo, retorna datos mock sin hacer llamadas reales.
 */
export async function fetchAuth(url, options = {}) {
  // Modo demo: interceptar llamadas y retornar datos mock
  if (DEMO_MODE) {
    return demoFetch(getMockData(url));
  }

  const token = getToken();
  const headers = {
    'Content-Type': 'application/json',
    ...(options.headers || {}),
  };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const res = await fetch(url, { ...options, headers });

  // Si la sesión expiró o el token es inválido
  if (res.status === 401) {
    clearSession();
    // Notificamos a la app para que redirija al login
    window.dispatchEvent(new CustomEvent('auth:logout', { detail: { reason: 'expired' } }));
    let body = {};
    try { body = await res.json(); } catch {}
    throw new Error(body.error || 'Sesión expirada. Inicia sesión de nuevo.');
  }

  return res;
}

/**
 * Datos mock para cada endpoint en modo demo
 */
function getMockData(url) {
  if (url.includes('/api/auth/login')) return { token: DEMO_TOKEN, ...DEMO_USER };
  if (url.includes('/api/productos')) return DEMO_PRODUCTOS;
  if (url.includes('/api/turnos/estado')) return DEMO_TURNOS;
  if (url.includes('/api/turnos/reporte')) return { articulos: [], metodos_pago: [] };
  if (url.includes('/api/ventas/historial')) return DEMO_VENTAS;
  if (url.includes('/api/ventas/procesar')) return { success: true, id_venta: 999 };
  if (url.includes('/api/productos/alertas')) return DEMO_PRODUCTOS.filter(p => p.stock_actual <= p.stock_minimo);
  if (url.includes('/api/dashboard/resumen')) return { ventas_hoy: { total_ventas: 3, ingresos: 449900 }, productos_bajo_stock: 2, turno_actual: DEMO_TURNOS.turno };
  return {};
}

/**
 * apiGet, apiPost, apiPut, apiDelete: atajos que devuelven JSON parseado
 * y lanzan error con el mensaje del backend si !res.ok.
 */
export async function apiGet(url) {
  const res = await fetchAuth(url);
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `Error ${res.status}`);
  }
  return res.json();
}

export async function apiPost(url, body) {
  const res = await fetchAuth(url, {
    method: 'POST',
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const errBody = await res.json().catch(() => ({}));
    throw new Error(errBody.error || `Error ${res.status}`);
  }
  return res.json();
}

export async function apiPut(url, body) {
  const res = await fetchAuth(url, {
    method: 'PUT',
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const errBody = await res.json().catch(() => ({}));
    throw new Error(errBody.error || `Error ${res.status}`);
  }
  return res.json();
}

export async function apiDelete(url) {
  const res = await fetchAuth(url, { method: 'DELETE' });
  if (!res.ok) {
    const errBody = await res.json().catch(() => ({}));
    throw new Error(errBody.error || `Error ${res.status}`);
  }
  return res.json();
}
