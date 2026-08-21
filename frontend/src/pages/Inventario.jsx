import { API_URL } from '../config';
import { apiGet, apiPost, apiPut, apiDelete, getToken } from '../api';
import { useState, useEffect } from 'react';
import { Plus, Trash2, Image as ImageIcon, ImagePlus, Upload, X } from 'lucide-react';

const Inventario = ({ user }) => {
  const [productos, setProductos] = useState([]);
  const [showModal, setShowModal] = useState(false);
  const [formData, setFormData] = useState({
    codigo_barras: '',
    nombre_producto: '',
    imagen_url: '',
    precio_compra: '',
    precio_venta: '',
    stock_actual: '',
    stock_minimo: ''
  });

  // === v1.7.2: Galería de imágenes ===
  const [galeria, setGaleria] = useState(null);      // producto seleccionado o null
  const [galeriaImagenes, setGaleriaImagenes] = useState([]);
  const [subiendo, setSubiendo] = useState(false);
  const [galeriaMsg, setGaleriaMsg] = useState(null);

  useEffect(() => {
    fetchProductos();
  }, []);

  const fetchProductos = async () => {
    const data = await apiGet(`${API_URL}/api/productos?id_local=${user?.id_local}`);
    setProductos(data);
  };

  const formatearCOP = (valor) => {
    return new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0 }).format(valor);
  };

  const handleChange = (e) => setFormData({ ...formData, [e.target.name]: e.target.value });

  const handleSubmit = async (e) => {
    e.preventDefault();
    const payload = {
      ...formData,
      id_local: user?.id_local,
      precio_compra: parseFloat(formData.precio_compra),
      precio_venta: parseFloat(formData.precio_venta),
      stock_actual: parseInt(formData.stock_actual),
      stock_minimo: parseInt(formData.stock_minimo)
    };

    const res = await apiPost(`${API_URL}/api/productos`, payload);

    if (res.ok) {
      setShowModal(false);
      setFormData({
        codigo_barras: '', nombre_producto: '', imagen_url: '',
        precio_compra: '', precio_venta: '', stock_actual: '', stock_minimo: ''
      });
      fetchProductos();
    } else {
      alert('Error al guardar el producto');
    }
  };

  const handleDelete = async (id) => {
    if (window.confirm('¿Estás seguro de eliminar este producto?')) {
      await apiDelete(`${API_URL}/api/productos/${id}`);
      fetchProductos();
    }
  };

  // === v1.7.2: Funciones de la galería ===
  const abrirGaleria = async (producto) => {
    setGaleria(producto);
    setGaleriaMsg(null);
    try {
      const imgs = await apiGet(`${API_URL}/api/productos/${producto.id_producto}/imagenes`);
      setGaleriaImagenes(Array.isArray(imgs) ? imgs : []);
    } catch {
      setGaleriaImagenes([]);
    }
  };

  const cerrarGaleria = () => {
    setGaleria(null);
    setGaleriaImagenes([]);
    setGaleriaMsg(null);
  };

  const subirImagenes = async (e) => {
    const files = Array.from(e.target.files || []);
    if (!files.length || !galeria) return;

    setSubiendo(true);
    setGaleriaMsg(null);
    const fd = new FormData();
    files.forEach(f => fd.append('imagenes', f));

    try {
      const res = await fetch(`${API_URL}/api/productos/${galeria.id_producto}/imagenes`, {
        method: 'POST',
        headers: { Authorization: 'Bearer ' + getToken() }, // sin Content-Type: el browser pone el boundary
        body: fd,
      });
      const data = await res.json();
      if (res.ok) {
        setGaleriaMsg({ type: 'success', text: `Se subieron ${data.imagenes.length} imagen(es).` });
        const imgs = await apiGet(`${API_URL}/api/productos/${galeria.id_producto}/imagenes`);
        setGaleriaImagenes(Array.isArray(imgs) ? imgs : []);
        fetchProductos(); // refrescar thumbnails
      } else {
        setGaleriaMsg({ type: 'error', text: data.error || 'Error al subir imágenes.' });
      }
    } catch (err) {
      setGaleriaMsg({ type: 'error', text: err.message || 'Error al subir imágenes.' });
    } finally {
      setSubiendo(false);
      e.target.value = ''; // permitir volver a seleccionar el mismo archivo
    }
  };

  const eliminarImagen = async (idImagen) => {
    if (!window.confirm('¿Eliminar esta imagen?')) return;
    try {
      await apiDelete(`${API_URL}/api/productos/${galeria.id_producto}/imagenes/${idImagen}`);
      const imgs = await apiGet(`${API_URL}/api/productos/${galeria.id_producto}/imagenes`);
      setGaleriaImagenes(Array.isArray(imgs) ? imgs : []);
      fetchProductos();
    } catch (err) {
      setGaleriaMsg({ type: 'error', text: err.message || 'Error al eliminar.' });
    }
  };

  return (
    <div className="page-content" style={{ padding: '2rem' }}>
      <div className="flex-between" style={{ marginBottom: '2rem' }}>
        <h2>Gestión de Catálogo</h2>
        <button className="btn-primary flex-row" onClick={() => setShowModal(true)}>
          <Plus size={18} /> Nuevo Producto
        </button>
      </div>

      <div className="card" style={{ padding: '0' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ backgroundColor: '#f9f9f9', borderBottom: '1px solid var(--border-color)', textAlign: 'left' }}>
              <th style={{ padding: '1rem' }}>Foto</th>
              <th style={{ padding: '1rem' }}>Código / SKU</th>
              <th style={{ padding: '1rem' }}>Producto</th>
              <th style={{ padding: '1rem' }}>Precio Venta</th>
              <th style={{ padding: '1rem' }}>Stock</th>
              <th style={{ padding: '1rem', textAlign: 'center' }}>Acciones</th>
            </tr>
          </thead>
          <tbody>
            {productos.map(p => (
              <tr key={p.id_producto} style={{ borderBottom: '1px solid var(--border-color)' }}>
                <td style={{ padding: '1rem' }}>
                  {p.imagen_url ? (
                    <img src={p.imagen_url} alt={p.nombre_producto} style={{ width: '40px', height: '40px', objectFit: 'cover', borderRadius: '4px' }} />
                  ) : (
                    <div style={{ width: '40px', height: '40px', backgroundColor: '#eee', borderRadius: '4px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <ImageIcon size={20} color="var(--text-light)" />
                    </div>
                  )}
                </td>
                <td style={{ padding: '1rem', color: 'var(--text-light)', fontSize: '0.9rem' }}>{p.codigo_barras}</td>
                <td style={{ padding: '1rem', fontWeight: 500 }}>{p.nombre_producto}</td>
                <td style={{ padding: '1rem', color: 'var(--primary-color)', fontWeight: 600 }}>{formatearCOP(p.precio_venta)}</td>
                <td style={{ padding: '1rem' }}>
                  <span style={{ padding: '0.2rem 0.6rem', borderRadius: '12px', backgroundColor: p.stock_actual <= p.stock_minimo ? 'rgba(231,111,81,0.1)' : 'rgba(42,157,143,0.1)', color: p.stock_actual <= p.stock_minimo ? 'var(--accent-color)' : 'var(--primary-color)', fontSize: '0.8rem', fontWeight: 600 }}>
                    {p.stock_actual} ud.
                  </span>
                </td>
                <td style={{ padding: '1rem', textAlign: 'center' }}>
                  <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'center', alignItems: 'center' }}>
                    {/* v1.7.2: botón de galería de fotos */}
                    <button onClick={() => abrirGaleria(p)} title="Ver / subir fotos"
                      style={{ backgroundColor: 'var(--green-light)', border: '1px solid var(--border-soft)', color: 'var(--green-primary)', cursor: 'pointer', padding: '0.5rem 0.7rem', borderRadius: '8px', display: 'flex', alignItems: 'center', gap: '0.3rem', fontSize: '0.8rem', fontWeight: 600 }}>
                      <ImagePlus size={16} />
                      {(p.imagenes && p.imagenes.length) ? `${p.imagenes.length}` : ''}
                    </button>
                    <button onClick={() => handleDelete(p.id_producto)} style={{ backgroundColor: 'transparent', border: 'none', color: 'var(--accent-color)', cursor: 'pointer', padding: '0.5rem' }}>
                      <Trash2 size={18} />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {productos.length === 0 && (
              <tr>
                <td colSpan="6" style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-light)' }}>
                  No tienes productos registrados en tu local. Agrega tu primer producto.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {showModal && (
        <div className="modal-overlay">
          <div className="modal-content" style={{ maxWidth: '600px' }}>
            <div className="modal-header">
              <h2>Agregar Nuevo Producto</h2>
              <button className="close-btn" onClick={() => setShowModal(false)}>×</button>
            </div>
            <form onSubmit={handleSubmit}>
              <div className="form-group">
                <label>Nombre del Producto</label>
                <input type="text" name="nombre_producto" value={formData.nombre_producto} onChange={handleChange} required />
              </div>
              <div className="form-group">
                <label>URL de la Fotografía (opcional)</label>
                <input type="url" name="imagen_url" placeholder="https://..." value={formData.imagen_url} onChange={handleChange} />
                <small style={{ color: 'var(--text-light)' }}>También puedes subir varias fotos después de crear el producto con el botón de imágenes.</small>
              </div>
              <div className="grid-2">
                <div className="form-group">
                  <label>Código Interno (SKU)</label>
                  <input type="text" name="codigo_barras" value={formData.codigo_barras} onChange={handleChange} required />
                </div>
                <div className="form-group">
                  <label>Precio de Venta (COP)</label>
                  <input type="number" name="precio_venta" value={formData.precio_venta} onChange={handleChange} required />
                </div>
              </div>
              <div className="grid-2">
                <div className="form-group">
                  <label>Stock Físico Inicial</label>
                  <input type="number" name="stock_actual" value={formData.stock_actual} onChange={handleChange} required />
                </div>
                <div className="form-group">
                  <label>Stock Mínimo (Alerta)</label>
                  <input type="number" name="stock_minimo" value={formData.stock_minimo} onChange={handleChange} required />
                </div>
              </div>
              <div style={{ display: 'flex', gap: '1rem', marginTop: '2rem' }}>
                <button type="button" className="btn-secondary" style={{ flex: 1 }} onClick={() => setShowModal(false)}>Cancelar</button>
                <button type="submit" className="btn-primary" style={{ flex: 1 }}>Guardar Producto</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* v1.7.2: Modal de galería de imágenes */}
      {galeria && (
        <div className="modal-overlay">
          <div className="modal-content" style={{ maxWidth: '680px', maxHeight: '85vh', overflowY: 'auto' }}>
            <div className="modal-header">
              <h2 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <ImagePlus size={20} color="var(--green-primary)" />
                Fotos de: {galeria.nombre_producto}
              </h2>
              <button className="close-btn" onClick={cerrarGaleria}>×</button>
            </div>

            {galeriaMsg && (
              <div style={{ marginBottom: '1rem', padding: '0.75rem 1rem', borderRadius: '8px', fontSize: '0.88rem', backgroundColor: galeriaMsg.type === 'error' ? '#fef2f2' : '#f0fdf4', color: galeriaMsg.type === 'error' ? '#dc2626' : '#166534', border: '1px solid ' + (galeriaMsg.type === 'error' ? '#fecaca' : '#bbf7d0') }}>
                {galeriaMsg.text}
              </div>
            )}

            {/* Grid de imágenes */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))', gap: '0.75rem', marginBottom: '1.5rem' }}>
              {galeriaImagenes.map(img => (
                <div key={img.id} style={{ position: 'relative', borderRadius: '10px', overflow: 'hidden', border: '1px solid var(--border-color)', aspectRatio: '1/1' }}>
                  <img src={img.url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  <button onClick={() => eliminarImagen(img.id)} title="Eliminar imagen"
                    style={{ position: 'absolute', top: 6, right: 6, width: 26, height: 26, borderRadius: '50%', border: 'none', backgroundColor: 'rgba(0,0,0,0.55)', color: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <X size={14} />
                  </button>
                </div>
              ))}
              {galeriaImagenes.length === 0 && (
                <div style={{ gridColumn: '1 / -1', padding: '2rem', textAlign: 'center', color: 'var(--text-light)', border: '1px dashed var(--border-color)', borderRadius: '10px', fontSize: '0.9rem' }}>
                  Este producto aún no tiene fotos. Sube una o varias.
                </div>
              )}
            </div>

            {/* Subir imágenes */}
            <div style={{ border: '1px dashed var(--green-primary)', borderRadius: '10px', padding: '1rem', textAlign: 'center', backgroundColor: 'var(--green-light)' }}>
              <label style={{ cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.4rem', color: 'var(--green-primary)', fontWeight: 600 }}>
                <Upload size={22} />
                {subiendo ? 'Subiendo...' : 'Haz clic para seleccionar fotos (puedes elegir varias)'}
                <input type="file" accept=".jpg,.jpeg,.png,.webp" multiple onChange={subirImagenes} disabled={subiendo} style={{ display: 'none' }} />
              </label>
              <p style={{ fontSize: '0.75rem', color: 'var(--text-light)', margin: '0.4rem 0 0' }}>JPG, PNG o WebP · máx 5 MB por archivo · hasta 10 fotos</p>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '1.25rem' }}>
              <button className="btn-secondary" onClick={cerrarGaleria}>Cerrar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Inventario;
