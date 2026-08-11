// Utilidades centralizadas para fechas con zona horaria de Colombia (America/Bogota).
// Esto evita que la app muestre la hora del sistema operativo del usuario
// en lugar de la hora real del negocio.

export const TZ = 'America/Bogota';

export const formatearFechaHoraCO = (fecha) => {
  if (!fecha) return '';
  const d = fecha instanceof Date ? fecha : new Date(fecha);
  return d.toLocaleString('es-CO', { timeZone: TZ });
};

export const formatearFechaCO = (fecha) => {
  if (!fecha) return '';
  const d = fecha instanceof Date ? fecha : new Date(fecha);
  return d.toLocaleDateString('es-CO', { timeZone: TZ });
};

export const formatearFechaLargaCO = (fecha = new Date()) => {
  const d = fecha instanceof Date ? fecha : new Date(fecha);
  return d.toLocaleDateString('es-CO', {
    timeZone: TZ,
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });
};
