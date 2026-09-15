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
    stock_minimo: '',
    visible_en_tienda: true
  });
  const [imagenFile, setImagenFile] = useState(null);
  const [imagenPreview, setImagenPreview] = useState(null);
  const [videoFile, setVideoFile] = useState(null);
  const [videoPreview, setVideoPreview] = useState(null);

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

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    setFormData({ ...formData, [name]: type === 'checkbox' ? checked : value });
  };

  const handleImageChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      setImagenFile(file);
      setImagenPreview(URL.createObjectURL(file));
    }
  };

  const removeImage = () => {
    setImagenFile(null);
    setImagenPreview(null);
  };

  const handleVideoChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      setVideoFile(file);
      setVideoPreview(URL.createObjectURL(file));
    }
  };

  const removeVideo = () => {
    setVideoFile(null);
    setVideoPreview(null);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const payload = {
      ...formData,
      id_local: user?.id_local,
      precio_compra: parseFloat(formData.precio_compra) || 0,
      precio_venta: parseFloat(formData.precio_venta),
      stock_actual: parseInt(formData.stock_actual),
      stock_minimo: parseInt(formData.stock_minimo) || 0
    };

    try {
      // apiPost retorna JSON directamente y lanza Error si falla
      const data = await apiPost(`${API_URL}/api/productos`, payload);

      // Subir imagen si existe
      if (imagenFile && data.id_producto) {
        const fd = new FormData();
        fd.append('imagen', imagenFile);
        await fetch(`${API_URL}/api/productos/${data.id_producto}/imagen`, {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${getToken()}` },
          body: fd
        });
      }
      // Subir video si existe
      if (videoFile && data.id_producto) {
        const fd = new FormData();
        fd.append('video', videoFile);
        await fetch(`${API_URL}/api/productos/${data.id_producto}/video`, {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${getToken()}` },
          body: fd
        });
      }
      setShowModal(false);
      setFormData({
        codigo_barras: '', nombre_producto: '', imagen_url: '',
        precio_compra: '', precio_venta: '', stock_actual: '', stock_minimo: '',
        visible_en_tienda: true
      });
      setImagenFile(null);
      setImagenPreview(null);
      setVideoFile(null);
      setVideoPreview(null);
      fetchProductos();
    } catch (err) {
      alert('Error al guardar: ' + err.message);
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
                <label>Fotografía del Producto</label>
                {imagenPreview ? (
                  <div style={{ position: 'relative', display: 'inline-block', width: '100%' }}>
                    <img src={imagenPreview} alt="Vista previa" style={{ width: '100%', maxHeight: '200px', objectFit: 'contain', borderRadius: '8px', border: '1px solid var(--border-color)' }} />
                    <button type="button" onClick={removeImage} style={{ position: 'absolute', top: 8, right: 8, background: 'rgba(0,0,0,0.6)', border: 'none', color: '#fff', borderRadius: '50%', width: 28, height: 28, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <X size={14} />
                    </button>
                  </div>
                ) : (
                  <label style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '2rem', border: '2px dashed var(--border-color)', borderRadius: '10px', cursor: 'pointer', backgroundColor: 'var(--bg-light)', transition: 'border-color 0.2s' }}>
                    <Upload size={32} color="var(--text-light)" />
                    <span style={{ marginTop: '0.5rem', color: 'var(--text-light)', fontSize: '0.85rem' }}>Haz clic para seleccionar una foto</span>
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-light)' }}>JPG, PNG o WebP · máx 5 MB</span>
                    <input type="file" accept=".jpg,.jpeg,.png,.webp" onChange={handleImageChange} style={{ display: 'none' }} />
                  </label>
                )}
                <small style={{ color: 'var(--text-light)' }}>Opcional. También puedes agregar más fotos después con el botón de imágenes.</small>
              </div>
              <div className="form-group">
                <label>Video del Producto (opcional)</label>
                {videoPreview ? (
                  <div style={{ position: 'relative', display: 'inline-block', width: '100%' }}>
                    <video src={videoPreview} controls style={{ width: '100%', maxHeight: '200px', borderRadius: '8px', border: '1px solid var(--border-color)' }} />
                    <button type="button" onClick={removeVideo} style={{ position: 'absolute', top: 8, right: 8, background: 'rgba(0,0,0,0.6)', border: 'none', color: '#fff', borderRadius: '50%', width: 28, height: 28, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <X size={14} />
                    </button>
                  </div>
                ) : (
                  <label style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '1.5rem', border: '2px dashed var(--border-color)', borderRadius: '10px', cursor: 'pointer', backgroundColor: 'var(--bg-light)' }}>
                    <Upload size={28} color="var(--text-light)" />
                    <span style={{ marginTop: '0.4rem', color: 'var(--text-light)', fontSize: '0.85rem' }}>Haz clic para seleccionar un video</span>
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-light)' }}>MP4, WebM o MOV · máx 50 MB</span>
                    <input type="file" accept=".mp4,.webm,.mov" onChange={handleVideoChange} style={{ display: 'none' }} />
                  </label>
                )}
                <small style={{ color: 'var(--text-light)' }}>Opcional. Los clientes podrán ver el video en la tienda.</small>
              </div>
              <div className="grid-2">
                <div className="form-group">
                  <label>Número Serial</label>
                  <input type="text" name="codigo_barras" placeholder="Ej: SN-12345678" value={formData.codigo_barras} onChange={handleChange} />
                </div>
                <div></div>
              </div>
              {/* ── Precios + Calculadora de Ganancia ── */}
              <div className="grid-2">
                <div className="form-group">
                  <label>Precio de Compra (COP)</label>
                  <input type="number" name="precio_compra" min="0" value={formData.precio_compra} onChange={handleChange} placeholder="Ej: 450000" />
                </div>
                <div className="form-group">
                  <label>Precio de Venta (COP)</label>
                  <input type="number" name="precio_venta" min="0" value={formData.precio_venta} onChange={handleChange} required placeholder="Ej: 600000" />
                </div>
              </div>
              {Number(formData.precio_compra) > 0 && Number(formData.precio_venta) > 0 && (
                <div style={{
                  background: Number(formData.precio_venta) >= Number(formData.precio_compra)
                    ? 'linear-gradient(135deg, rgba(42,157,143,0.12), rgba(38,70,83,0.12))'
                    : 'linear-gradient(135deg, rgba(239,68,68,0.12), rgba(180,40,40,0.12))',
                  border: `1px solid ${Number(formData.precio_venta) >= Number(formData.precio_compra) ? 'rgba(42,157,143,0.3)' : 'rgba(239,68,68,0.3)'}`,
                  borderRadius: '12px', padding: '1rem 1.25rem', marginTop: '0.5rem', marginBottom: '0.5rem'
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.6rem' }}>
                    <span style={{ fontSize: '1.1rem' }}>💰</span>
                    <span style={{ fontWeight: 700, fontSize: '0.85rem', color: 'var(--text-primary)' }}>Resumen de Ganancia</span>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0.75rem', textAlign: 'center' }}>
                    <div>
                      <div style={{ fontSize: '0.7rem', color: 'var(--text-light)', marginBottom: '0.2rem' }}>Ganancia Unitaria</div>
                      <div style={{ fontSize: '1.1rem', fontWeight: 800, color: Number(formData.precio_venta) >= Number(formData.precio_compra) ? '#2A9D8F' : '#ef4444' }}>
                        ${Number(formData.precio_venta - formData.precio_compra).toLocaleString('es-CO')}
                      </div>
                    </div>
                    <div>
                      <div style={{ fontSize: '0.7rem', color: 'var(--text-light)', marginBottom: '0.2rem' }}>Margen</div>
                      <div style={{ fontSize: '1.1rem', fontWeight: 800, color: Number(formData.precio_venta) >= Number(formData.precio_compra) ? '#2A9D8F' : '#ef4444' }}>
                        {(((Number(formData.precio_venta) - Number(formData.precio_compra)) / Number(formData.precio_compra)) * 100).toFixed(1)}%
                      </div>
                    </div>
                    <div>
                      <div style={{ fontSize: '0.7rem', color: 'var(--text-light)', marginBottom: '0.2rem' }}>Ganancia Total (x{formData.stock_actual || 1})</div>
                      <div style={{ fontSize: '1.1rem', fontWeight: 800, color: Number(formData.precio_venta) >= Number(formData.precio_compra) ? '#2A9D8F' : '#ef4444' }}>
                        ${((Number(formData.precio_venta) - Number(formData.precio_compra)) * (parseInt(formData.stock_actual) || 1)).toLocaleString('es-CO')}
                      </div>
                    </div>
                  </div>
                </div>
              )}
              <div className="grid-2">
                <div className="form-group">
                  <label>Stock Físico Inicial</label>
                  <input type="number" name="stock_actual" min="0" value={formData.stock_actual} onChange={handleChange} required />
                </div>
                <div className="form-group">
                  <label>Stock Mínimo (Alerta en 0)</label>
                  <input type="number" name="stock_minimo" min="0" value={formData.stock_minimo} onChange={handleChange} placeholder="1" />
                  <small style={{ color: 'var(--text-light)' }}>Se alerta cuando el stock llegue a este número.</small>
                </div>
              </div>
              {/* ── Toggle visibilidad en tienda ── */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.85rem 1rem', background: 'var(--bg-light)', borderRadius: '10px', marginTop: '0.5rem', marginBottom: '0.5rem' }}>
                <div>
                  <div style={{ fontWeight: 600, fontSize: '0.9rem' }}>Visible en tienda web</div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-light)' }}>Si está activo, este producto aparece en la página pública de la tienda.</div>
                </div>
                <label style={{ position: 'relative', display: 'inline-block', width: '48px', height: '26px', cursor: 'pointer' }}>
                  <input type="checkbox" name="visible_en_tienda" checked={formData.visible_en_tienda !== false} onChange={handleChange} style={{ opacity: 0, width: 0, height: 0 }} />
                  <span style={{
                    position: 'absolute', inset: 0, borderRadius: '26px', transition: 'all .3s',
                    background: formData.visible_en_tienda !== false ? '#2A9D8F' : '#555'
                  }}></span>
                  <span style={{
                    position: 'absolute', height: '20px', width: '20px', left: formData.visible_en_tienda !== false ? '24px' : '3px',
                    bottom: '3px', background: '#fff', borderRadius: '50%', transition: 'all .3s'
                  }}></span>
                </label>
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
