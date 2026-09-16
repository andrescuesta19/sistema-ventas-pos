import { useState, useEffect, useMemo, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Search, ShoppingCart, Star, Package, Store, Phone, MapPin, ChevronLeft, ChevronRight, X, Plus, Minus, Eye, Filter } from 'lucide-react';
import { API_URL } from '../config';

/* ═══════════════════════════════════════════════════════════════
   TiendaPublica — Página pública de tienda para clientes
   
   Los dueños comparten este link con sus clientes:
   https://tudominio.com/tienda/:idLocal
   
   Los clientes pueden:
   - Ver productos con imágenes ampliadas (galería múltiple)
   - Buscar y filtrar por categoría
   - Ver precios y stock
   - Contactar al vendedor por WhatsApp
   ═══════════════════════════════════════════════════════════════ */

const fmtCOP = (v) => new Intl.NumberFormat('es-CO', { 
  style: 'currency', currency: 'COP', maximumFractionDigits: 0 
}).format(Number(v) || 0);

const TiendaPublica = () => {
  const { idLocal } = useParams();
  const [local, setLocal] = useState(null);
  const [productos, setProductos] = useState([]);
  const [categorias, setCategorias] = useState([]);
  const [busqueda, setBusqueda] = useState('');
  const [categoriaActiva, setCategoriaActiva] = useState('Todos');
  const [orden, setOrden] = useState('destacado');
  const [pagina, setPagina] = useState(1);
  const [paginacion, setPaginacion] = useState({ total: 0, totalPaginas: 0 });
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');
  const [productoModal, setProductoModal] = useState(null);
  const [imagenModal, setImagenModal] = useState(null);
  const [carrito, setCarrito] = useState([]);
  const [imgIndex, setImgIndex] = useState({}); // { [id_producto]: indiceActual }

  // Cargar productos
  useEffect(() => {
    const cargar = async () => {
      try {
        setCargando(true);
        const params = new URLSearchParams({ pagina, orden });
        if (busqueda) params.set('buscar', busqueda);
        if (categoriaActiva !== 'Todos') params.set('categoria', categoriaActiva);
        
        const res = await fetch(`${API_URL}/api/tienda/${idLocal}?${params}`);
        if (!res.ok) throw new Error('Tienda no encontrada');
        
        const data = await res.json();
        setLocal(data.local);
        setProductos(data.productos);
        setCategorias(data.categorias);
        setPaginacion(data.paginacion);
      } catch (err) {
        setError(err.message);
      } finally {
        setCargando(false);
      }
    };
    cargar();
  }, [idLocal, busqueda, categoriaActiva, orden, pagina]);

  // Obtener todas las imágenes de un producto (imagen principal + galería)
  const getTodasLasImagenes = useCallback((producto) => {
    const imgs = [];
    if (producto.imagenes && producto.imagenes.length > 0) {
      producto.imagenes.forEach(img => {
        if (!imgs.includes(img.url)) imgs.push(img.url);
      });
    }
    if (producto.imagen_url && !imgs.includes(producto.imagen_url)) {
      imgs.unshift(producto.imagen_url);
    }
    return imgs.length > 0 ? imgs : [];
  }, []);

  // Navegar imágenes en tarjeta
  const navImg = (id_producto, dir, total) => {
    setImgIndex(prev => {
      const actual = prev[id_producto] || 0;
      let next = actual + dir;
      if (next < 0) next = total - 1;
      if (next >= total) next = 0;
      return { ...prev, [id_producto]: next };
    });
  };

  // Calcular total del carrito
  const totalCarrito = useMemo(() => 
    carrito.reduce((sum, item) => sum + (item.precio_venta * item.cantidad), 0),
    [carrito]
  );

  const agregarAlCarrito = (producto) => {
    setCarrito(prev => {
      const existe = prev.find(p => p.id_producto === producto.id_producto);
      if (existe) {
        return prev.map(p => p.id_producto === producto.id_producto 
          ? { ...p, cantidad: p.cantidad + 1 } 
          : p);
      }
      return [...prev, { ...producto, cantidad: 1 }];
    });
  };

  const quitarDelCarrito = (id_producto) => {
    setCarrito(prev => prev.filter(p => p.id_producto !== id_producto));
  };

  const irAWhatsApp = () => {
    if (!local?.telefono) return;
    const mensaje = `Hola! Me interesa comprar:\n\n${carrito.map(item => 
      `• ${item.nombre_producto} x${item.cantidad} = ${fmtCOP(item.precio_venta * item.cantidad)}`
    ).join('\n')}\n\n*Total: ${fmtCOP(totalCarrito)}*`;
    
    const url = `https://wa.me/${local.telefono.replace(/\D/g, '')}?text=${encodeURIComponent(mensaje)}`;
    window.open(url, '_blank');
  };

  if (cargando) {
    return (
      <div style={styles.loadingPage}>
        <div className="spinner" />
        <p style={{ color: 'rgba(255,255,255,0.7)', marginTop: '1rem' }}>Cargando tienda...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div style={styles.loadingPage}>
        <Package size={64} color="#EF4444" style={{ opacity: 0.5 }} />
        <h2 style={{ color: '#fff', marginTop: '1rem' }}>Tienda no encontrada</h2>
        <p style={{ color: 'rgba(255,255,255,0.6)' }}>{error}</p>
      </div>
    );
  }

  return (
    <div style={styles.page}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { font-family: 'Inter', system-ui, sans-serif; }
        .spinner { width: 40px; height: 40px; border: 3px solid rgba(42,157,143,0.2); border-top-color: #2A9D8F; border-radius: 50%; animation: spin 0.8s linear infinite; }
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes logoFloat { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-6px); } }
        @keyframes logoPulse { 0%, 100% { filter: drop-shadow(0 0 8px rgba(42,157,143,0.4)); } 50% { filter: drop-shadow(0 0 20px rgba(42,157,143,0.8)); } }
        @keyframes shimmer { 0% { background-position: -200% 0; } 100% { background-position: 200% 0; } }
        .product-card:hover { transform: translateY(-4px); box-shadow: 0 12px 30px rgba(0,0,0,0.12); }
        .product-card { transition: all 0.25s ease; }
        .cat-btn:hover { background: rgba(42,157,143,0.15) !important; }
        .cat-btn.active { background: #2A9D8F !important; color: #fff !important; }
        .img-nav-btn { opacity: 0; transition: opacity 0.2s; }
        .product-image:hover .img-nav-btn { opacity: 1; }
        .img-dot { width: 6px; height: 6px; border-radius: 50%; background: rgba(255,255,255,0.4); transition: all 0.2s; }
        .img-dot.active { background: #2A9D8F; width: 18px; border-radius: 3px; }
        ::-webkit-scrollbar { width: 6px; height: 6px; }
        ::-webkit-scrollbar-thumb { background: rgba(0,0,0,0.15); border-radius: 3px; }
      `}</style>

      {/* Header centrado con logo mejorado */}
      <header style={styles.header}>
        <div style={styles.headerContent}>
          <div style={styles.headerCenter}>
            {/* Logo animado */}
            <div style={styles.logoContainer}>
              <div style={styles.logoIcon}>
                <Store size={32} color="#fff" strokeWidth={2.5} />
              </div>
              <div>
                <h1 style={styles.headerTitle}>{local?.nombre_local || 'Mi Tienda'}</h1>
                <p style={styles.headerSubtitle}>
                  {local?.direccion && <><MapPin size={12} /> {local.direccion}</>}
                  {local?.telefono && <> • <Phone size={12} /> {local.telefono}</>}
                </p>
              </div>
            </div>
          </div>
          {carrito.length > 0 && (
            <motion.div 
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              style={styles.cartBadge}
              onClick={irAWhatsApp}
            >
              <ShoppingCart size={20} color="#fff" />
              <span style={styles.cartCount}>{carrito.reduce((a, b) => a + b.cantidad, 0)}</span>
              <span style={styles.cartTotal}>{fmtCOP(totalCarrito)}</span>
            </motion.div>
          )}
        </div>
      </header>

      {/* Barra de búsqueda y filtros */}
      <div style={styles.searchBar}>
        <div style={styles.searchContainer}>
          <Search size={18} color="#94A3B8" style={{ position: 'absolute', left: '1rem', top: '50%', transform: 'translateY(-50%)' }} />
          <input
            type="text"
            placeholder="Buscar por nombre, marca o modelo..."
            value={busqueda}
            onChange={(e) => { setBusqueda(e.target.value); setPagina(1); }}
            style={styles.searchInput}
          />
          {busqueda && (
            <button onClick={() => setBusqueda('')} style={styles.clearBtn}>
              <X size={16} />
            </button>
          )}
        </div>
        <select 
          value={orden} 
          onChange={(e) => { setOrden(e.target.value); setPagina(1); }}
          style={styles.selectOrder}
        >
          <option value="destacado">Destacados</option>
          <option value="precio-asc">Menor precio</option>
          <option value="precio-desc">Mayor precio</option>
          <option value="nombre">A-Z</option>
          <option value="reciente">Recientes</option>
        </select>
      </div>

      {/* Categorías */}
      {categorias.length > 0 && (
        <div style={styles.categoriesBar}>
          <button 
            className={`cat-btn ${categoriaActiva === 'Todos' ? 'active' : ''}`}
            onClick={() => { setCategoriaActiva('Todos'); setPagina(1); }}
            style={styles.catBtn}
          >
            Todos ({paginacion.total})
          </button>
          {categorias.map(cat => (
            <button
              key={cat.nombre_categoria}
              className={`cat-btn ${categoriaActiva === cat.nombre_categoria ? 'active' : ''}`}
              onClick={() => { setCategoriaActiva(cat.nombre_categoria); setPagina(1); }}
              style={styles.catBtn}
            >
              {cat.nombre_categoria} ({cat.cantidad})
            </button>
          ))}
        </div>
      )}

      {/* Grid de productos */}
      <div style={styles.productGrid}>
        {productos.length === 0 ? (
          <div style={styles.emptyState}>
            <Package size={64} color="#CBD5E1" />
            <h3 style={{ color: '#64748B', marginTop: '1rem' }}>No se encontraron productos</h3>
            <p style={{ color: '#94A3B8' }}>Intenta con otra búsqueda o categoría</p>
          </div>
        ) : (
          productos.map((p, idx) => {
            const todasLasImgs = getTodasLasImagenes(p);
            const tieneMult = todasLasImgs.length > 1;
            const idxActual = imgIndex[p.id_producto] || 0;
            
            return (
              <motion.div
                key={p.id_producto}
                className="product-card"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: idx * 0.05, duration: 0.3 }}
                style={styles.productCard}
              >
                {/* Imagen con galería */}
                <div 
                  className="product-image"
                  style={styles.productImage}
                  onClick={() => setProductoModal(p)}
                >
                  {todasLasImgs.length > 0 ? (
                    <>
                      <img 
                        src={todasLasImgs[idxActual]} 
                        alt={p.nombre_producto}
                        style={styles.productImg}
                      />
                      {/* Navegación de imágenes */}
                      {tieneMult && (
                        <>
                          <button 
                            className="img-nav-btn"
                            style={{ ...styles.imgNavBtn, left: '6px' }}
                            onClick={(e) => { e.stopPropagation(); navImg(p.id_producto, -1, todasLasImgs.length); }}
                          >
                            <ChevronLeft size={16} color="#fff" />
                          </button>
                          <button 
                            className="img-nav-btn"
                            style={{ ...styles.imgNavBtn, right: '6px' }}
                            onClick={(e) => { e.stopPropagation(); navImg(p.id_producto, 1, todasLasImgs.length); }}
                          >
                            <ChevronRight size={16} color="#fff" />
                          </button>
                          {/* Dots indicadores */}
                          <div style={styles.imgDots}>
                            {todasLasImgs.map((_, i) => (
                              <div 
                                key={i} 
                                className={`img-dot ${i === idxActual ? 'active' : ''}`}
                              />
                            ))}
                          </div>
                          {/* Badge de imágenes */}
                          <span style={styles.imgCountBadge}>
                            <Eye size={10} /> {todasLasImgs.length}
                          </span>
                        </>
                      )}
                    </>
                  ) : (
                    <Package size={48} color="#CBD5E1" />
                  )}
                  {p.stock_actual <= 5 && p.stock_actual > 0 && (
                    <span style={styles.lowStock}>Ultimas {p.stock_actual}!</span>
                  )}
                </div>

                {/* Info */}
                <div style={styles.productInfo}>
                  {p.nombre_categoria && (
                    <span style={styles.productCategory}>{p.nombre_categoria}</span>
                  )}
                  <h3 style={styles.productName}>{p.nombre_producto}</h3>
                  {p.marca && (
                    <span style={styles.productBrand}>{p.marca}</span>
                  )}
                  <div style={styles.priceRow}>
                    <div>
                      <span style={styles.productPrice}>{fmtCOP(p.precio_venta)}</span>
                      {p.precio_anterior && p.precio_anterior > p.precio_venta && (
                        <span style={styles.oldPrice}>{fmtCOP(p.precio_anterior)}</span>
                      )}
                    </div>
                    <motion.button
                      whileHover={{ scale: 1.1 }}
                      whileTap={{ scale: 0.9 }}
                      onClick={() => agregarAlCarrito(p)}
                      style={styles.addBtn}
                    >
                      <Plus size={18} />
                    </motion.button>
                  </div>
                </div>
              </motion.div>
            );
          })
        )}
      </div>

      {/* Paginación */}
      {paginacion.totalPaginas > 1 && (
        <div style={styles.pagination}>
          <button 
            disabled={pagina <= 1}
            onClick={() => setPagina(p => p - 1)}
            style={{ ...styles.pageBtn, opacity: pagina <= 1 ? 0.4 : 1 }}
          >
            <ChevronLeft size={18} /> Anterior
          </button>
          <span style={{ color: '#64748B', fontSize: '0.9rem' }}>
            Pagina {pagina} de {paginacion.totalPaginas}
          </span>
          <button 
            disabled={pagina >= paginacion.totalPaginas}
            onClick={() => setPagina(p => p + 1)}
            style={{ ...styles.pageBtn, opacity: pagina >= paginacion.totalPaginas ? 0.4 : 1 }}
          >
            Siguiente <ChevronRight size={18} />
          </button>
        </div>
      )}

      {/* Modal de producto con galería completa */}
      <AnimatePresence>
        {productoModal && (
          <ModalProducto 
            producto={productoModal} 
            onClose={() => setProductoModal(null)}
            onAdd={agregarAlCarrito}
            getImagenes={getTodasLasImagenes}
          />
        )}
      </AnimatePresence>

      {/* Footer */}
      <footer style={styles.footer}>
        <p>Desarrollado por Andres Cuesta - Sistema Integral de Ventas</p>
      </footer>
    </div>
  );
};

/* ═══════════════════════════════════════════════════════════════
   Modal de producto con galería de imágenes
   ═══════════════════════════════════════════════════════════════ */
const ModalProducto = ({ producto, onClose, onAdd, getImagenes }) => {
  const [idxImg, setIdxImg] = useState(0);
  const imagenes = useMemo(() => getImagenes(producto), [producto, getImagenes]);
  const tieneMult = imagenes.length > 1;

  // Teclado para navegar
  useEffect(() => {
    const handleKey = (e) => {
      if (e.key === 'ArrowLeft') setIdxImg(prev => prev > 0 ? prev - 1 : imagenes.length - 1);
      if (e.key === 'ArrowRight') setIdxImg(prev => prev < imagenes.length - 1 ? prev + 1 : 0);
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [imagenes.length, onClose]);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      style={styles.modalOverlay}
      onClick={onClose}
    >
      <motion.div
        initial={{ scale: 0.9, y: 30 }}
        animate={{ scale: 1, y: 0 }}
        exit={{ scale: 0.9, y: 30 }}
        onClick={(e) => e.stopPropagation()}
        style={styles.modalContent}
      >
        <button onClick={onClose} style={styles.modalClose}>
          <X size={20} />
        </button>
        
        {/* Galería de imágenes */}
        <div style={styles.modalImageContainer}>
          <img 
            src={imagenes[idxImg]} 
            alt={producto.nombre_producto}
            style={styles.modalImage}
          />
          {tieneMult && (
            <>
              <button 
                style={{ ...styles.modalNavBtn, left: '10px' }}
                onClick={() => setIdxImg(prev => prev > 0 ? prev - 1 : imagenes.length - 1)}
              >
                <ChevronLeft size={24} color="#fff" />
              </button>
              <button 
                style={{ ...styles.modalNavBtn, right: '10px' }}
                onClick={() => setIdxImg(prev => prev < imagenes.length - 1 ? prev + 1 : 0)}
              >
                <ChevronRight size={24} color="#fff" />
              </button>
              {/* Dots */}
              <div style={styles.modalDots}>
                {imagenes.map((_, i) => (
                  <div 
                    key={i}
                    onClick={() => setIdxImg(i)}
                    style={{
                      ...styles.modalDot,
                      background: i === idxImg ? '#2A9D8F' : 'rgba(255,255,255,0.5)',
                      width: i === idxImg ? '20px' : '8px',
                    }}
                  />
                ))}
              </div>
              {/* Contador */}
              <span style={styles.modalImgCounter}>
                {idxImg + 1} / {imagenes.length}
              </span>
            </>
          )}
        </div>
        
        <div style={styles.modalInfo}>
          {producto.nombre_categoria && (
            <span style={styles.modalCategory}>{producto.nombre_categoria}</span>
          )}
          <h2 style={styles.modalTitle}>{producto.nombre_producto}</h2>
          {producto.marca && (
            <p style={styles.modalBrand}>Marca: {producto.marca}</p>
          )}
          <div style={styles.modalPriceRow}>
            <span style={styles.modalPrice}>{fmtCOP(producto.precio_venta)}</span>
            {producto.precio_anterior && producto.precio_anterior > producto.precio_venta && (
              <span style={styles.modalOldPrice}>{fmtCOP(producto.precio_anterior)}</span>
            )}
          </div>
          <p style={styles.modalStock}>
            {producto.stock_actual > 0 
              ? `Disponible (${producto.stock_actual} en stock)` 
              : 'Agotado'}
          </p>
          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={() => { onAdd(producto); onClose(); }}
            disabled={producto.stock_actual <= 0}
            style={styles.modalAddBtn}
          >
            <ShoppingCart size={18} />
            Agregar al carrito
          </motion.button>
        </div>
      </motion.div>
    </motion.div>
  );
};

// ── Estilos ──
const styles = {
  page: {
    minHeight: '100vh',
    background: '#F8FAFC',
    fontFamily: "'Inter', system-ui, sans-serif",
  },
  loadingPage: {
    minHeight: '100vh',
    background: '#0a1a0e',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    fontFamily: "'Inter', system-ui, sans-serif",
  },
  // Header centrado con logo grande
  header: {
    background: 'linear-gradient(135deg, #1a3a2a 0%, #264653 100%)',
    padding: '1.25rem 1.5rem',
    boxShadow: '0 4px 20px rgba(0,0,0,0.15)',
    position: 'sticky',
    top: 0,
    zIndex: 100,
  },
  headerContent: {
    maxWidth: '1200px',
    margin: '0 auto',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  headerCenter: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    textAlign: 'center',
  },
  logoContainer: {
    display: 'flex',
    alignItems: 'center',
    gap: '1rem',
  },
  logoIcon: {
    width: '56px',
    height: '56px',
    background: 'linear-gradient(135deg, #2A9D8F, #21867a)',
    borderRadius: '16px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    boxShadow: '0 4px 15px rgba(42,157,143,0.4)',
    animation: 'logoFloat 3s ease-in-out infinite',
    flexShrink: 0,
  },
  headerTitle: {
    color: '#fff',
    fontSize: '1.4rem',
    fontWeight: 800,
    margin: 0,
    letterSpacing: '-0.02em',
    background: 'linear-gradient(90deg, #fff, #2A9D8F)',
    backgroundClip: 'text',
    WebkitBackgroundClip: 'text',
    WebkitTextFillColor: 'transparent',
    backgroundSize: '200% 100%',
    animation: 'shimmer 3s linear infinite',
  },
  headerSubtitle: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: '0.8rem',
    margin: '0.2rem 0 0',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '0.3rem',
  },
  cartBadge: {
    position: 'absolute',
    right: 0,
    display: 'flex',
    alignItems: 'center',
    gap: '0.5rem',
    background: '#2A9D8F',
    padding: '0.6rem 1rem',
    borderRadius: '12px',
    cursor: 'pointer',
    boxShadow: '0 4px 15px rgba(42,157,143,0.4)',
  },
  cartCount: {
    color: '#fff',
    fontWeight: 700,
    fontSize: '0.9rem',
  },
  cartTotal: {
    color: '#fff',
    fontWeight: 800,
    fontSize: '0.95rem',
  },
  // Search
  searchBar: {
    maxWidth: '1200px',
    margin: '1rem auto',
    padding: '0 1.5rem',
    display: 'flex',
    gap: '0.75rem',
    flexWrap: 'wrap',
  },
  searchContainer: {
    flex: 1,
    minWidth: '250px',
    position: 'relative',
  },
  searchInput: {
    width: '100%',
    padding: '0.75rem 2.5rem 0.75rem 2.75rem',
    borderRadius: '12px',
    border: '1.5px solid #E2E8F0',
    fontSize: '0.95rem',
    fontFamily: 'inherit',
    background: '#fff',
    outline: 'none',
    transition: 'border-color 0.2s',
  },
  clearBtn: {
    position: 'absolute',
    right: '0.75rem',
    top: '50%',
    transform: 'translateY(-50%)',
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    color: '#94A3B8',
    padding: '0.25rem',
  },
  selectOrder: {
    padding: '0.75rem 1rem',
    borderRadius: '12px',
    border: '1.5px solid #E2E8F0',
    fontSize: '0.9rem',
    fontFamily: 'inherit',
    background: '#fff',
    cursor: 'pointer',
    outline: 'none',
    minWidth: '160px',
  },
  // Categories
  categoriesBar: {
    maxWidth: '1200px',
    margin: '0 auto 1rem',
    padding: '0 1.5rem',
    display: 'flex',
    gap: '0.5rem',
    overflowX: 'auto',
    paddingBottom: '0.5rem',
  },
  catBtn: {
    padding: '0.5rem 1rem',
    borderRadius: '20px',
    border: '1.5px solid #E2E8F0',
    background: '#fff',
    fontSize: '0.85rem',
    fontWeight: 600,
    fontFamily: 'inherit',
    cursor: 'pointer',
    whiteSpace: 'nowrap',
    transition: 'all 0.2s',
    color: '#64748B',
  },
  // Products
  productGrid: {
    maxWidth: '1200px',
    margin: '0 auto',
    padding: '0 1.5rem 2rem',
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))',
    gap: '1.25rem',
  },
  productCard: {
    background: '#fff',
    borderRadius: '16px',
    overflow: 'hidden',
    border: '1px solid #E2E8F0',
    cursor: 'pointer',
  },
  productImage: {
    position: 'relative',
    height: '220px',
    background: '#F1F5F9',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  productImg: {
    width: '100%',
    height: '100%',
    objectFit: 'contain',
    padding: '0.75rem',
    transition: 'transform 0.3s ease',
  },
  // Navegación de imágenes en tarjeta
  imgNavBtn: {
    position: 'absolute',
    top: '50%',
    transform: 'translateY(-50%)',
    width: '28px',
    height: '28px',
    borderRadius: '50%',
    background: 'rgba(0,0,0,0.5)',
    border: 'none',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 5,
    backdropFilter: 'blur(4px)',
  },
  imgDots: {
    position: 'absolute',
    bottom: '8px',
    left: '50%',
    transform: 'translateX(-50%)',
    display: 'flex',
    gap: '4px',
    alignItems: 'center',
  },
  imgCountBadge: {
    position: 'absolute',
    top: '8px',
    right: '8px',
    background: 'rgba(0,0,0,0.6)',
    color: '#fff',
    padding: '0.2rem 0.5rem',
    borderRadius: '8px',
    fontSize: '0.65rem',
    fontWeight: 600,
    display: 'flex',
    alignItems: 'center',
    gap: '3px',
    backdropFilter: 'blur(4px)',
  },
  lowStock: {
    position: 'absolute',
    top: '8px',
    left: '8px',
    background: '#FEF3C7',
    color: '#D97706',
    padding: '0.2rem 0.5rem',
    borderRadius: '6px',
    fontSize: '0.7rem',
    fontWeight: 700,
  },
  productInfo: {
    padding: '1rem',
  },
  productCategory: {
    display: 'inline-block',
    background: 'rgba(42,157,143,0.1)',
    color: '#2A9D8F',
    padding: '0.15rem 0.5rem',
    borderRadius: '6px',
    fontSize: '0.7rem',
    fontWeight: 600,
    marginBottom: '0.4rem',
  },
  productName: {
    fontSize: '1rem',
    fontWeight: 700,
    color: '#1E293B',
    margin: '0 0 0.2rem',
    lineHeight: 1.3,
  },
  productBrand: {
    display: 'inline-block',
    background: 'rgba(38,70,83,0.08)',
    color: '#264653',
    padding: '0.1rem 0.4rem',
    borderRadius: '4px',
    fontSize: '0.65rem',
    fontWeight: 600,
    marginBottom: '0.4rem',
    marginLeft: '0.3rem',
  },
  priceRow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  productPrice: {
    fontSize: '1.15rem',
    fontWeight: 800,
    color: '#264653',
  },
  oldPrice: {
    fontSize: '0.8rem',
    color: '#94A3B8',
    textDecoration: 'line-through',
    marginLeft: '0.4rem',
  },
  addBtn: {
    width: '36px',
    height: '36px',
    borderRadius: '10px',
    border: 'none',
    background: 'linear-gradient(135deg, #2A9D8F, #264653)',
    color: '#fff',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    boxShadow: '0 2px 8px rgba(42,157,143,0.3)',
  },
  // Pagination
  pagination: {
    maxWidth: '1200px',
    margin: '0 auto 2rem',
    padding: '0 1.5rem',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '1rem',
  },
  pageBtn: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.3rem',
    padding: '0.6rem 1rem',
    borderRadius: '10px',
    border: '1.5px solid #E2E8F0',
    background: '#fff',
    fontSize: '0.9rem',
    fontWeight: 600,
    fontFamily: 'inherit',
    cursor: 'pointer',
    color: '#264653',
  },
  // Modal
  modalOverlay: {
    position: 'fixed',
    inset: 0,
    background: 'rgba(0,0,0,0.7)',
    backdropFilter: 'blur(8px)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1000,
    padding: '1rem',
  },
  modalContent: {
    background: '#fff',
    borderRadius: '20px',
    maxWidth: '500px',
    width: '100%',
    maxHeight: '90vh',
    overflow: 'auto',
    position: 'relative',
  },
  modalClose: {
    position: 'absolute',
    top: '12px',
    right: '12px',
    width: '32px',
    height: '32px',
    borderRadius: '8px',
    border: 'none',
    background: 'rgba(0,0,0,0.1)',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10,
  },
  modalImageContainer: {
    width: '100%',
    height: '320px',
    background: '#F1F5F9',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
    overflow: 'hidden',
  },
  modalImage: {
    maxWidth: '100%',
    maxHeight: '100%',
    objectFit: 'contain',
    padding: '1rem',
  },
  modalNavBtn: {
    position: 'absolute',
    top: '50%',
    transform: 'translateY(-50%)',
    width: '40px',
    height: '40px',
    borderRadius: '50%',
    background: 'rgba(0,0,0,0.5)',
    border: 'none',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 5,
    backdropFilter: 'blur(4px)',
  },
  modalDots: {
    position: 'absolute',
    bottom: '12px',
    left: '50%',
    transform: 'translateX(-50%)',
    display: 'flex',
    gap: '6px',
    alignItems: 'center',
    background: 'rgba(0,0,0,0.3)',
    padding: '6px 12px',
    borderRadius: '20px',
    backdropFilter: 'blur(4px)',
  },
  modalDot: {
    height: '8px',
    borderRadius: '4px',
    cursor: 'pointer',
    transition: 'all 0.2s',
  },
  modalImgCounter: {
    position: 'absolute',
    top: '12px',
    left: '12px',
    background: 'rgba(0,0,0,0.5)',
    color: '#fff',
    padding: '0.2rem 0.6rem',
    borderRadius: '8px',
    fontSize: '0.75rem',
    fontWeight: 600,
    backdropFilter: 'blur(4px)',
  },
  modalInfo: {
    padding: '1.5rem',
  },
  modalCategory: {
    display: 'inline-block',
    background: 'rgba(42,157,143,0.1)',
    color: '#2A9D8F',
    padding: '0.2rem 0.6rem',
    borderRadius: '6px',
    fontSize: '0.75rem',
    fontWeight: 600,
    marginBottom: '0.5rem',
  },
  modalTitle: {
    fontSize: '1.4rem',
    fontWeight: 800,
    color: '#1E293B',
    margin: '0 0 0.3rem',
  },
  modalBrand: {
    fontSize: '0.85rem',
    color: '#64748B',
    margin: '0 0 0.5rem',
  },
  modalPriceRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.75rem',
    marginBottom: '0.75rem',
  },
  modalPrice: {
    fontSize: '1.8rem',
    fontWeight: 800,
    color: '#264653',
  },
  modalOldPrice: {
    fontSize: '1rem',
    color: '#94A3B8',
    textDecoration: 'line-through',
  },
  modalStock: {
    fontSize: '0.9rem',
    color: '#64748B',
    marginBottom: '1rem',
  },
  modalAddBtn: {
    width: '100%',
    padding: '0.9rem',
    borderRadius: '12px',
    border: 'none',
    background: 'linear-gradient(135deg, #2A9D8F, #264653)',
    color: '#fff',
    fontSize: '1rem',
    fontWeight: 700,
    fontFamily: 'inherit',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '0.5rem',
    boxShadow: '0 4px 15px rgba(42,157,143,0.3)',
  },
  // Footer
  footer: {
    textAlign: 'center',
    padding: '1.5rem',
    color: '#94A3B8',
    fontSize: '0.8rem',
    borderTop: '1px solid #E2E8F0',
  },
  emptyState: {
    gridColumn: '1 / -1',
    textAlign: 'center',
    padding: '4rem 2rem',
  },
};

export default TiendaPublica;
