import { useState, useCallback, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, ChevronLeft, ChevronRight, ShoppingCart, ZoomIn, ZoomOut, RotateCcw } from 'lucide-react';

/* ═══════════════════════════════════════════════════════════════
   ProductGallery — Modal de galería de imágenes de productos
   
   Características:
   - Carrusel con navegación izquierda/derecha
   - Miniaturas clickeables
   - Swipe en móvil (touch events)
   - Zoom con + / - / reset (niveles: 1x, 1.5x, 2x, 2.5x, 3x)
   - Click en imagen también alterna zoom
   - Animaciones suaves con Framer Motion
   - Botón de agregar al carrito integrado
   ═══════════════════════════════════════════════════════════════ */
const ZOOM_LEVELS = [1, 1.5, 2, 2.5, 3];
const ProductGallery = ({ product, images = [], onClose, onAddToCart }) => {
  const [activeIndex, setActiveIndex] = useState(0);
  const [zoomLevel, setZoomLevel] = useState(0); // índice en ZOOM_LEVELS
  const [touchStart, setTouchStart] = useState(null);

  const allImages = images.length > 0 ? images : (product?.imagen_url ? [product.imagen_url] : []);
  const zoom = ZOOM_LEVELS[zoomLevel];

  const zoomIn = useCallback(() => {
    setZoomLevel(prev => Math.min(prev + 1, ZOOM_LEVELS.length - 1));
  }, []);

  const zoomOut = useCallback(() => {
    setZoomLevel(prev => Math.max(prev - 1, 0));
  }, []);

  const zoomReset = useCallback(() => {
    setZoomLevel(0);
  }, []);

  // Navegación del carrusel
  const goNext = useCallback(() => {
    setActiveIndex(prev => (prev + 1) % allImages.length);
    setZoomLevel(0);
  }, [allImages.length]);

  const goPrev = useCallback(() => {
    setActiveIndex(prev => (prev - 1 + allImages.length) % allImages.length);
    setZoomLevel(0);
  }, [allImages.length]);

  // Teclado
  useEffect(() => {
    const handleKey = (e) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowRight') goNext();
      if (e.key === 'ArrowLeft') goPrev();
      if (e.key === '+' || e.key === '=') zoomIn();
      if (e.key === '-') zoomOut();
      if (e.key === '0') zoomReset();
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [onClose, goNext, goPrev, zoomIn, zoomOut, zoomReset]);

  // Touch swipe para móvil
  const handleTouchStart = (e) => setTouchStart(e.touches[0].clientX);
  const handleTouchEnd = (e) => {
    if (touchStart === null) return;
    const diff = touchStart - e.changedTouches[0].clientX;
    if (Math.abs(diff) > 50) {
      diff > 0 ? goNext() : goPrev();
    }
    setTouchStart(null);
  };

  if (!product || allImages.length === 0) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.25 }}
        onClick={onClose}
        style={{
          position: 'fixed',
          inset: 0,
          zIndex: 10000,
          background: 'rgba(0, 0, 0, 0.85)',
          backdropFilter: 'blur(12px)',
          WebkitBackdropFilter: 'blur(12px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '1rem',
        }}
      >
        {/* Contenido del modal */}
        <motion.div
          initial={{ scale: 0.9, opacity: 0, y: 30 }}
          animate={{ scale: 1, opacity: 1, y: 0 }}
          exit={{ scale: 0.9, opacity: 0, y: 30 }}
          transition={{ type: 'spring', stiffness: 300, damping: 25 }}
          onClick={(e) => e.stopPropagation()}
          style={{
            background: '#fff',
            borderRadius: '20px',
            maxWidth: '900px',
            width: '100%',
            maxHeight: '90vh',
            overflow: 'hidden',
            display: 'flex',
            flexDirection: 'column',
            boxShadow: '0 25px 60px rgba(0, 0, 0, 0.5)',
          }}
        >
          {/* Header */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '1rem 1.25rem',
            borderBottom: '1px solid #E2E8F0',
          }}>
            <div style={{ flex: 1 }}>
              <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 700, color: '#1E293B' }}>
                {product.nombre_producto}
              </h3>
              <span style={{ fontSize: '0.8rem', color: '#64748B' }}>
                {allImages.length} imagen{allImages.length !== 1 ? 'es' : ''} • Imagen {activeIndex + 1} de {allImages.length}
              </span>
            </div>
            <motion.button
              whileHover={{ scale: 1.1, rotate: 90 }}
              whileTap={{ scale: 0.9 }}
              onClick={onClose}
              style={{
                width: '36px',
                height: '36px',
                borderRadius: '10px',
                border: 'none',
                background: '#F1F5F9',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#64748B',
              }}
            >
              <X size={18} />
            </motion.button>
          </div>

          {/* Imagen principal */}
          <div
            style={{
              position: 'relative',
              flex: 1,
              minHeight: '400px',
              maxHeight: '65vh',
              background: '#F8FAFC',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              overflow: zoom > 1 ? 'auto' : 'hidden',
              cursor: zoom > 1 ? 'grab' : 'zoom-in',
            }}
            onClick={() => zoom > 1 ? zoomReset() : zoomIn()}
            onTouchStart={handleTouchStart}
            onTouchEnd={handleTouchEnd}
          >
            <AnimatePresence mode="wait">
              <motion.img
                key={activeIndex}
                src={allImages[activeIndex]}
                alt={product.nombre_producto}
                initial={{ opacity: 0, x: 30 }}
                animate={{
                  opacity: 1,
                  x: 0,
                  scale: zoom,
                }}
                exit={{ opacity: 0, x: -30 }}
                transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
                style={{
                  maxWidth: zoom > 1 ? 'none' : '100%',
                  maxHeight: zoom > 1 ? 'none' : '100%',
                  width: zoom > 1 ? 'auto' : undefined,
                  height: zoom > 1 ? 'auto' : undefined,
                  objectFit: 'contain',
                  padding: zoom > 1 ? '1rem' : '1.5rem',
                  userSelect: 'none',
                }}
                draggable={false}
              />
            </AnimatePresence>

            {/* Controles de zoom — + / reset / - */}
            <div style={{
              position: 'absolute',
              top: '12px',
              right: '12px',
              display: 'flex',
              flexDirection: 'column',
              gap: '4px',
              zIndex: 5,
            }}>
              <motion.button
                whileHover={{ scale: 1.1 }}
                whileTap={{ scale: 0.9 }}
                onClick={(e) => { e.stopPropagation(); zoomIn(); }}
                disabled={zoomLevel >= ZOOM_LEVELS.length - 1}
                style={{
                  width: '34px',
                  height: '34px',
                  borderRadius: '10px',
                  border: 'none',
                  background: zoomLevel >= ZOOM_LEVELS.length - 1 ? '#E2E8F0' : 'rgba(0,0,0,0.6)',
                  color: zoomLevel >= ZOOM_LEVELS.length - 1 ? '#94A3B8' : '#fff',
                  cursor: zoomLevel >= ZOOM_LEVELS.length - 1 ? 'not-allowed' : 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  backdropFilter: 'blur(8px)',
                }}
              >
                <ZoomIn size={16} />
              </motion.button>

              <div style={{
                width: '34px',
                height: '24px',
                borderRadius: '8px',
                background: 'rgba(0,0,0,0.6)',
                backdropFilter: 'blur(8px)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#fff',
                fontSize: '0.65rem',
                fontWeight: 700,
              }}>
                {zoom}x
              </div>

              <motion.button
                whileHover={{ scale: 1.1 }}
                whileTap={{ scale: 0.9 }}
                onClick={(e) => { e.stopPropagation(); zoomOut(); }}
                disabled={zoomLevel <= 0}
                style={{
                  width: '34px',
                  height: '34px',
                  borderRadius: '10px',
                  border: 'none',
                  background: zoomLevel <= 0 ? '#E2E8F0' : 'rgba(0,0,0,0.6)',
                  color: zoomLevel <= 0 ? '#94A3B8' : '#fff',
                  cursor: zoomLevel <= 0 ? 'not-allowed' : 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  backdropFilter: 'blur(8px)',
                }}
              >
                <ZoomOut size={16} />
              </motion.button>

              {zoomLevel > 0 && (
                <motion.button
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  whileHover={{ scale: 1.1 }}
                  whileTap={{ scale: 0.9 }}
                  onClick={(e) => { e.stopPropagation(); zoomReset(); }}
                  style={{
                    width: '34px',
                    height: '34px',
                    borderRadius: '10px',
                    border: 'none',
                    background: 'rgba(42,157,143,0.9)',
                    color: '#fff',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <RotateCcw size={14} />
                </motion.button>
              )}
            </div>

            {/* Flechas de navegación */}
            {allImages.length > 1 && (
              <>
                <motion.button
                  whileHover={{ scale: 1.1 }}
                  whileTap={{ scale: 0.9 }}
                  onClick={(e) => { e.stopPropagation(); goPrev(); }}
                  style={{
                    position: 'absolute',
                    left: '12px',
                    top: '50%',
                    transform: 'translateY(-50%)',
                    width: '42px',
                    height: '42px',
                    borderRadius: '50%',
                    border: 'none',
                    background: 'rgba(255, 255, 255, 0.95)',
                    boxShadow: '0 4px 15px rgba(0, 0, 0, 0.15)',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: '#1E293B',
                    zIndex: 2,
                  }}
                >
                  <ChevronLeft size={20} />
                </motion.button>

                <motion.button
                  whileHover={{ scale: 1.1 }}
                  whileTap={{ scale: 0.9 }}
                  onClick={(e) => { e.stopPropagation(); goNext(); }}
                  style={{
                    position: 'absolute',
                    right: '12px',
                    top: '50%',
                    transform: 'translateY(-50%)',
                    width: '42px',
                    height: '42px',
                    borderRadius: '50%',
                    border: 'none',
                    background: 'rgba(255, 255, 255, 0.95)',
                    boxShadow: '0 4px 15px rgba(0, 0, 0, 0.15)',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: '#1E293B',
                    zIndex: 2,
                  }}
                >
                  <ChevronRight size={20} />
                </motion.button>
              </>
            )}

            {/* Puntos indicadores */}
            {allImages.length > 1 && allImages.length <= 8 && (
              <div style={{
                position: 'absolute',
                bottom: '12px',
                left: '50%',
                transform: 'translateX(-50%)',
                display: 'flex',
                gap: '6px',
                background: 'rgba(0, 0, 0, 0.5)',
                borderRadius: '20px',
                padding: '6px 10px',
              }}>
                {allImages.map((_, i) => (
                  <motion.button
                    key={i}
                    onClick={(e) => { e.stopPropagation(); setActiveIndex(i); setZoomLevel(0); }}
                    animate={{
                      scale: i === activeIndex ? 1.2 : 1,
                      background: i === activeIndex ? '#2A9D8F' : 'rgba(255, 255, 255, 0.5)',
                    }}
                    style={{
                      width: '8px',
                      height: '8px',
                      borderRadius: '50%',
                      border: 'none',
                      cursor: 'pointer',
                      padding: 0,
                    }}
                  />
                ))}
              </div>
            )}
          </div>

          {/* Miniaturas */}
          {allImages.length > 1 && (
            <div style={{
              display: 'flex',
              gap: '0.5rem',
              padding: '0.75rem 1.25rem',
              overflowX: 'auto',
              borderTop: '1px solid #E2E8F0',
              background: '#FAFAFA',
            }}>
              {allImages.map((url, i) => (
                <motion.button
                  key={i}
                  whileHover={{ scale: 1.08 }}
                  whileTap={{ scale: 0.95 }}
                  onClick={() => { setActiveIndex(i); setZoomLevel(0); }}
                  style={{
                    flexShrink: 0,
                    width: '56px',
                    height: '56px',
                    borderRadius: '10px',
                    border: i === activeIndex ? '2.5px solid #2A9D8F' : '2px solid #E2E8F0',
                    overflow: 'hidden',
                    cursor: 'pointer',
                    padding: 0,
                    background: '#fff',
                    boxShadow: i === activeIndex ? '0 2px 10px rgba(42, 157, 143, 0.3)' : 'none',
                    transition: 'border-color 0.2s, box-shadow 0.2s',
                  }}
                >
                  <img src={url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                </motion.button>
              ))}
            </div>
          )}

          {/* Footer con precio y botón agregar */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '1rem 1.25rem',
            borderTop: '1px solid #E2E8F0',
            background: '#fff',
          }}>
            <div>
              <span style={{ fontSize: '1.4rem', fontWeight: 800, color: '#264653' }}>
                ${Number(product.precio_venta || 0).toLocaleString('es-CO')}
              </span>
              <span style={{ fontSize: '0.75rem', color: '#2A9D8F', fontWeight: 600, marginLeft: '0.5rem' }}>
                IVA Incluido
              </span>
              {product.stock_actual !== undefined && (
                <span style={{
                  fontSize: '0.75rem',
                  fontWeight: 600,
                  marginLeft: '0.75rem',
                  padding: '0.15rem 0.5rem',
                  borderRadius: '8px',
                  background: product.stock_actual > 0 ? '#ECFDF5' : '#FEF2F2',
                  color: product.stock_actual > 0 ? '#059669' : '#DC2626',
                }}>
                  Stock: {product.stock_actual}
                </span>
              )}
            </div>
            <motion.button
              whileHover={{ scale: 1.04 }}
              whileTap={{ scale: 0.96 }}
              onClick={() => { onAddToCart?.(product); onClose(); }}
              disabled={product.stock_actual <= 0}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
                padding: '0.7rem 1.3rem',
                fontSize: '0.9rem',
                fontWeight: 700,
                fontFamily: 'inherit',
                borderRadius: '12px',
                border: 'none',
                background: product.stock_actual > 0
                  ? 'linear-gradient(135deg, #2A9D8F 0%, #264653 100%)'
                  : '#CBD5E1',
                color: '#fff',
                cursor: product.stock_actual > 0 ? 'pointer' : 'not-allowed',
                boxShadow: product.stock_actual > 0 ? '0 4px 14px rgba(42, 157, 143, 0.35)' : 'none',
              }}
            >
              <ShoppingCart size={16} />
              {product.stock_actual > 0 ? 'Agregar al carrito' : 'Sin stock'}
            </motion.button>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
};

export default ProductGallery;
