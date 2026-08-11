import { createContext, useContext, useEffect, useState } from 'react';

/**
 * ThemeContext — v1.5.5
 * Maneja el modo claro/oscuro de toda la app.
 * - Lee la preferencia guardada en localStorage al iniciar.
 * - Si no hay nada guardado, usa 'light'.
 * - Aplica data-theme al <html> para que las variables CSS de index.css tomen efecto.
 * - Persiste cada cambio en localStorage.
 */
const ThemeContext = createContext({ theme: 'light', toggleTheme: () => {} });

export const useTheme = () => useContext(ThemeContext);

export const ThemeProvider = ({ children }) => {
  const [theme, setTheme] = useState(() => {
    try {
      return localStorage.getItem('theme') || 'light';
    } catch {
      return 'light';
    }
  });

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    try {
      localStorage.setItem('theme', theme);
    } catch {}
  }, [theme]);

  const toggleTheme = () => setTheme(t => (t === 'light' ? 'dark' : 'light'));

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
};
