import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { Bell, Sun, Moon, Search, ChevronDown, LogOut, User, KeyRound, X } from 'lucide-react';
import { API_URL } from '../config';
import { apiGet, clearSession } from '../api';
import { useTheme } from '../ThemeContext';

const Header = ({ user, notifCount: notifCountProp = 0 }) => {
  const navigate = useNavigate();
  const { theme, toggleTheme } = useTheme();
  const [search, setSearch] = useState('');
  const [searchResults, setSearchResults] = useState(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchLoading, setSearchLoading] = useState(false);
  const [notifCount, setNotifCount] = useState(notifCountProp);
  const [showNotifs, setShowNotifs] = useState(false);
  const [showAvatar, setShowAvatar] = useState(false);
  const [alertas, setAlertas] = useState([]);
  // v1.5.5: estado local para que el avatar del header se actualice al instante
  // sin tener que esperar a recargar la página
  const [liveUser, setLiveUser] = useState(user);
  const searchRef = useRef(null);
  const searchInputRef = useRef(null);
  // v1.8.0: posición del dropdown del buscador (portal en body para que flote
  // sobre el contenido, que tiene overflow-y:auto y recortaba el dropdown)
  const [searchPos, setSearchPos] = useState(null);

  useEffect(() => {
    setLiveUser(user);
  }, [user]);

  // v1.5.5: escuchar cambios de avatar emitidos por Configuracion.jsx
  useEffect(() => {
    const handler = (e) => {
      if (e.detail?.user) setLiveUser(e.detail.user);
    };
    window.addEventListener('user:updated', handler);
    return () => window.removeEventListener('user:updated', handler);
  }, []);

  useEffect(() => {
    if (user) cargarAlertas();
  }, [user]);

  // Búsqueda global: filtra al escribir (debounce simple)
  useEffect(() => {
    const term = search.trim();
    if (term.length < 2) {
      setSearchResults(null);
      setSearchOpen(false);
      return;
    }
    const t = setTimeout(async () => {
      setSearchLoading(true);
      // Calculamos la posición del input para el dropdown (portal en body)
      const rect = searchInputRef.current?.getBoundingClientRect();
      if (rect) {
        setSearchPos({ top: rect.bottom + 8, left: rect.left, width: Math.max(rect.width, 320) });
      }
      try {
        const data = await apiGet(`${API_URL}/api/buscar?q=${encodeURIComponent(term)}&id_local=${user?.id_local || ''}`);
        setSearchResults(data);
        setSearchOpen(true);
      } catch {
        setSearchResults({ productos: [], clientes: [], ventas: [] });
        setSearchOpen(true);
      } finally {
        setSearchLoading(false);
      }
    }, 250);
    return () => clearTimeout(t);
  }, [search, user]);

  // Cerrar dropdown al hacer clic fuera
  useEffect(() => {
    const onClick = (e) => {
      if (searchRef.current && !searchRef.current.contains(e.target)) {
        setSearchOpen(false);
      }
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);

  const cargarAlertas = async () => {
    try {
      const r = await apiGet(`${API_URL}/api/productos/alertas?id_local=${user?.id_local}`);
      setAlertas(r || []);
      setNotifCount((r || []).length);
    } catch {}
  };

  const handleLogout = () => {
    window.dispatchEvent(new CustomEvent('auth:logout'));
  };

  // Liquid Glass effect for header/sidebar
  const headerGlassStyle = {
    borderBottom: '1px solid var(--border-soft)',
    background: 'var(--bg-topbar)',
  };

  const irAResultado = (tipo, id) => {
    setSearchOpen(false);
    setSearch('');
    if (tipo === 'producto') navigate(`/inventario?focus=${id}`);
    else if (tipo === 'cliente') navigate(`/clientes?focus=${id}`);
    else if (tipo === 'venta') navigate(`/historial?focus=${id}`);
  };

  // El Header ahora usa variables CSS, así que se ve bien en ambos modos sin ternarios inline.
  const styles = {
    header: {
      height: 64, flexShrink: 0,
      background: 'var(--bg-topbar)',
      borderBottom: '1px solid var(--border-soft)',
      display: 'flex', alignItems: 'center', gap: '1rem',
      padding: '0 1.5rem',
      color: 'var(--text-primary)',
      position: 'relative',
      zIndex: 50,
    },
    searchWrap: { flex: 1, maxWidth: 480, position: 'relative' },
    searchIcon: { position: 'absolute', left: '0.85rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)', pointerEvents: 'none' },
    searchInput: {
      width: '100%', padding: '0.55rem 0.85rem 0.55rem 2.4rem',
      background: 'var(--bg-app)', border: '1px solid var(--border-soft)',
      borderRadius: 10, fontSize: '0.88rem', color: 'var(--text-primary)', outline: 'none', fontFamily: 'inherit',
    },
    iconBtn: {
      background: 'transparent', border: 'none', cursor: 'pointer',
      color: 'var(--text-secondary)', padding: '0.5rem', borderRadius: 8,
      display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative',
    },
    dropdown: {
      position: 'absolute', top: '100%', marginTop: '0.5rem',
      background: 'var(--bg-card)', border: '1px solid var(--border-soft)',
      borderRadius: 12, width: 320, maxHeight: 400, overflowY: 'auto',
      boxShadow: '0 10px 30px rgba(0,0,0,0.15)', zIndex: 100,
    },
    dropdownNarrow: {
      position: 'absolute', top: '100%', right: 0, marginTop: '0.5rem',
      background: 'var(--bg-card)', border: '1px solid var(--border-soft)',
      borderRadius: 10, minWidth: 200, padding: '0.4rem',
      boxShadow: '0 10px 30px rgba(0,0,0,0.15)', zIndex: 100,
    },
    avatarBtn: {
      background: 'transparent', border: 'none', cursor: 'pointer',
      display: 'flex', alignItems: 'center', gap: '0.5rem',
      padding: '0.35rem 0.65rem', borderRadius: 10,
    },
    avatarCircle: (url) => ({
      width: 32, height: 32, borderRadius: '50%',
      background: url ? 'transparent' : 'linear-gradient(135deg, var(--green-primary), var(--green-primary-hover))',
      color: '#0a1a0e', fontWeight: 800, fontSize: '0.85rem',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      overflow: 'hidden', flexShrink: 0,
    }),
  };

  const totalResultados = (searchResults?.productos?.length || 0) +
                          (searchResults?.clientes?.length || 0) +
                          (searchResults?.ventas?.length || 0);

  return (
    <div style={{ ...styles.header, ...headerGlassStyle }}>
      {/* Buscador global */}
      <div style={styles.searchWrap} ref={searchRef}>
        <Search size={16} style={styles.searchIcon} />
        <input
          ref={searchInputRef}
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          onFocus={() => search.trim().length >= 2 && setSearchOpen(true)}
          placeholder="Buscar productos, clientes, ventas..."
          style={styles.searchInput}
        />
        {search && (
          <button onClick={() => { setSearch(''); setSearchOpen(false); }} style={{
            position: 'absolute', right: '0.6rem', top: '50%', transform: 'translateY(-50%)',
            background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: 4,
          }}>
            <X size={14} />
          </button>
        )}

        {searchOpen && searchPos && createPortal(
          <div style={{
            position: 'fixed', top: searchPos.top, left: searchPos.left,
            width: searchPos.width, maxHeight: 400, overflowY: 'auto',
            background: 'var(--bg-card)', border: '1px solid var(--border-soft)',
            borderRadius: 12, boxShadow: '0 10px 30px rgba(0,0,0,0.15)',
            zIndex: 9999,
          }}>
            <div style={{
              padding: '0.75rem 1rem', borderBottom: '1px solid var(--border-light)',
              fontWeight: 700, fontSize: '0.85rem', color: 'var(--text-secondary)',
            }}>
              {searchLoading ? 'Buscando...' :
                totalResultados === 0 ? 'Sin resultados' :
                `${totalResultados} resultado${totalResultados !== 1 ? 's' : ''}`
              }
            </div>
            {!searchLoading && searchResults && (
              <>
                {searchResults.productos?.length > 0 && (
                  <div style={{ padding: '0.5rem 0' }}>
                    <div style={{ padding: '0.4rem 1rem', fontSize: '0.72rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px', fontWeight: 700 }}>
                      Productos
                    </div>
                    {searchResults.productos.slice(0, 5).map(p => (
                      <div key={p.id_producto} onClick={() => irAResultado('producto', p.id_producto)}
                        style={{ padding: '0.65rem 1rem', cursor: 'pointer', fontSize: '0.85rem' }}
                        onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-app)'}
                        onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                        <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{p.nombre_producto}</div>
                        <div style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>
                          Stock: {p.stock_actual} · ${(p.precio_venta || 0).toLocaleString('es-CO')}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
                {searchResults.clientes?.length > 0 && (
                  <div style={{ padding: '0.5rem 0' }}>
                    <div style={{ padding: '0.4rem 1rem', fontSize: '0.72rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px', fontWeight: 700 }}>
                      Clientes
                    </div>
                    {searchResults.clientes.slice(0, 5).map(c => (
                      <div key={c.id_cliente} onClick={() => irAResultado('cliente', c.id_cliente)}
                        style={{ padding: '0.65rem 1rem', cursor: 'pointer', fontSize: '0.85rem' }}
                        onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-app)'}
                        onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                        <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{c.nombre_razon_social}</div>
                        <div style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>{c.documento_identidad}</div>
                      </div>
                    ))}
                  </div>
                )}
                {searchResults.ventas?.length > 0 && (
                  <div style={{ padding: '0.5rem 0' }}>
                    <div style={{ padding: '0.4rem 1rem', fontSize: '0.72rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px', fontWeight: 700 }}>
                      Ventas recientes
                    </div>
                    {searchResults.ventas.slice(0, 5).map(v => (
                      <div key={v.id_venta} onClick={() => irAResultado('venta', v.id_venta)}
                        style={{ padding: '0.65rem 1rem', cursor: 'pointer', fontSize: '0.85rem' }}
                        onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-app)'}
                        onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                        <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>Venta #{v.id_venta} — ${(v.total_neto || 0).toLocaleString('es-CO')}</div>
                        <div style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>{new Date(v.fecha).toLocaleString('es-CO')}</div>
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>,
          document.body
        )}
      </div>

      <div style={{ flex: 1 }} />

      {/* Toggle de tema — v1.5.5: ahora conectado al ThemeContext */}
      <button onClick={toggleTheme} style={styles.iconBtn}
        title={theme === 'light' ? 'Cambiar a modo oscuro' : 'Cambiar a modo claro'}>
        {theme === 'light' ? <Moon size={18} /> : <Sun size={18} />}
      </button>

      {/* Notificaciones */}
      <div style={{ position: 'relative' }}>
        <button
          onClick={() => { setShowNotifs(!showNotifs); setShowAvatar(false); }}
          style={styles.iconBtn}
        >
          <Bell size={18} />
          {notifCount > 0 && (
            <span style={{
              position: 'absolute', top: 4, right: 4,
              background: '#ef4444', color: 'white', fontSize: '0.65rem',
              fontWeight: 700, padding: '1px 5px', borderRadius: 8,
              minWidth: 16, textAlign: 'center',
            }}>{notifCount}</span>
          )}
        </button>
        {showNotifs && (
          <div style={styles.dropdown}>
            <div style={{
              padding: '0.75rem 1rem', borderBottom: '1px solid var(--border-light)',
              fontWeight: 700, fontSize: '0.85rem', color: 'var(--text-primary)',
            }}>
              Notificaciones ({notifCount})
            </div>
            {alertas.length === 0 ? (
              <div style={{ padding: '1.5rem', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                No hay alertas pendientes
              </div>
            ) : (
              alertas.slice(0, 10).map(a => (
                <div key={a.id_producto} style={{
                  padding: '0.75rem 1rem',
                  borderBottom: '1px solid var(--border-light)',
                  fontSize: '0.82rem',
                }}>
                  <div style={{ fontWeight: 600, color: '#ef4444' }}>Stock bajo</div>
                  <div style={{ color: 'var(--text-secondary)' }}>
                    {a.nombre_producto}
                  </div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                    Stock: {a.stock_actual} / Mínimo: {a.stock_minimo}
                  </div>
                </div>
              ))
            )}
          </div>
        )}
      </div>

      {/* Avatar + menú */}
      <div style={{ position: 'relative' }}>
        <button
          onClick={() => { setShowAvatar(!showAvatar); setShowNotifs(false); }}
          style={styles.avatarBtn}
        >
          <div style={styles.avatarCircle(liveUser?.avatar_url)}>
            {liveUser?.avatar_url ? (
              <img src={liveUser.avatar_url} alt={liveUser.nombre} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            ) : (
              (liveUser?.nombre || 'U')[0].toUpperCase()
            )}
          </div>
          <div style={{ textAlign: 'left' }}>
            <div style={{ fontSize: '0.82rem', fontWeight: 600, lineHeight: 1.1, color: 'var(--text-primary)' }}>
              {liveUser?.nombre?.split(' ')[0] || 'Usuario'}
            </div>
            <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', lineHeight: 1.1 }}>
              {liveUser?.rol}
            </div>
          </div>
          <ChevronDown size={14} color="var(--text-muted)" />
        </button>
        {showAvatar && (
          <div style={styles.dropdownNarrow}>
            <button onClick={() => { setShowAvatar(false); navigate('/configuracion'); }} style={{
              width: '100%', textAlign: 'left', background: 'transparent', border: 'none',
              padding: '0.6rem 0.85rem', borderRadius: 6, cursor: 'pointer',
              display: 'flex', alignItems: 'center', gap: '0.6rem', fontSize: '0.85rem',
              color: 'var(--text-primary)', fontFamily: 'inherit',
            }}>
              <User size={14} /> Mi cuenta
            </button>
            <button onClick={handleLogout} style={{
              width: '100%', textAlign: 'left', background: 'transparent', border: 'none',
              padding: '0.6rem 0.85rem', borderRadius: 6, cursor: 'pointer',
              display: 'flex', alignItems: 'center', gap: '0.6rem', fontSize: '0.85rem',
              color: '#ef4444', fontFamily: 'inherit',
            }}>
              <LogOut size={14} /> Cerrar sesión
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default Header;
