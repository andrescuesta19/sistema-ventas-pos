import { API_URL } from '../config';
import { apiGet, apiPost, apiPut, apiDelete, getToken } from '../api';
import { resolverUrlImagen } from '../utils/imageUrl';
import { useState, useEffect } from 'react';
import { Plus, Trash2, Image as ImageIcon, ImagePlus, Upload, X, Edit3, Link as LinkIcon, Star, GripVertical, Save, Tag } from 'lucide-react';

const CATEGORIAS_DEFAULT = [
  { id_categoria: 1, nombre_categoria: 'Reloj Hombre' },
  { id_categoria: 2, nombre_categoria: 'Reloj Dama' },
  { id_categoria: 3, nombre_categoria: 'General' },
  { id_categoria: 4, nombre_categoria: 'Relojes' },
  { id_categoria: 5, nombre_categoria: 'Smartwatches' },
  { id_categoria: 6, nombre_categoria: 'Accesorios' },
  { id_categoria: 7, nombre_categoria: 'Smartphones' }
];

const Inventario = ({ user }) => {
  const [productos, setProductos] = useState([]);
  const [categorias, setCategorias] = useState(CATEGORIAS_DEFAULT);
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState(null);

  // v2.2.6: gestión de productos destacados
  const [showReorderModal, setShowReorderModal] = useState(false);
  const [destacados, setDestacados] = useState([]);
  const [savingReorder, setSavingReorder] = useState(false);
  const [dragIdx, setDragIdx] = useState(null);
  // v2.2.10: estado para el modal de gestión de oferta y para saber
  // qué fila está guardando (muestra spinner).
  const [showOfertaModal, setShowOfertaModal] = useState(false);
  const [ofertaTarget, setOfertaTarget] = useState(null);
  const [ofertaForm, setOfertaForm] = useState({ precio_oferta: '', activa: false });
  const [guardandoOferta, setGuardandoOferta] = useState(null);

  const initialForm = {
    codigo_barras: '',
    nombre_producto: '',
    id_categoria: null,
    marca: '',
    genero: '',
    imagen_url: '',
    precio_compra: '',
    precio_venta: '',
    stock_actual: '',
    stock_minimo: '',
    visible_en_tienda: true
  };

  const [formData, setFormData] = useState(initialForm);
  const [imagenFiles, setImagenFiles] = useState([]);
  const [videoFile, setVideoFile] = useState(null);
  const [videoPreview, setVideoPreview] = useState(null);

  // === Galería de imágenes ===
  const [galeria, setGaleria] = useState(null);
  const [galeriaImagenes, setGaleriaImagenes] = useState([]);
  const [subiendo, setSubiendo] = useState(false);
  const [galeriaMsg, setGaleriaMsg] = useState(null);

  useEffect(() => {
    fetchProductos();
    fetchCategorias();
  }, []);

  const fetchCategorias = async () => {
    try {
      const data = await apiGet(`${API_URL}/api/categorias`);
      if (Array.isArray(data) && data.length > 0) {
        setCategorias(data);
      }
    } catch {
      setCategorias(CATEGORIAS_DEFAULT);
    }
  };

  const fetchProductos = async () => {
    try {
      const data = await apiGet(`${API_URL}/api/productos?id_local=${user?.id_local}`);
      setProductos(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error('Error cargando productos:', err);
      setProductos([]);
    }
  };

  const formatearCOP = (valor) => {
    return new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0 }).format(valor || 0);
  };

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    // Para campos de precio: solo números enteros (sin puntos ni comas, evita
    // que "410.000" se lea como 410 con decimal)
    if (name === 'precio_compra' || name === 'precio_venta') {
      const clean = value.replace(/[^0-9]/g, '');
      setFormData(prev => ({ ...prev, [name]: clean }));
      return;
    }
    setFormData(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value
    }));
  };

  // Formatea un número como COP con separador de miles (para mostrar visualmente)
  const formatearNumeroCOP = (valor) => {
    if (!valor) return '';
    const num = String(valor).replace(/[^0-9]/g, '');
    return num ? Number(num).toLocaleString('es-CO') : '';
  };

  const handleImagesChange = (e) => {
    const files = Array.from(e.target.files || []);
    if (files.length > 0) {
      setImagenFiles(prev => [...prev, ...files]);
    }
  };

  const removeImageAt = (index) => {
    setImagenFiles(prev => prev.filter((_, i) => i !== index));
  };

  const handleVideoChange = (e) => {
    const file = e.target.files?.[0];
    if (file) {
      setVideoFile(file);
      setVideoPreview(URL.createObjectURL(file));
    }
  };

  const removeVideo = () => {
    setVideoFile(null);
    setVideoPreview(null);
  };

  const abrirCrear = () => {
    setEditingId(null);
    setFormData(initialForm);
    setImagenFiles([]);
    setVideoFile(null);
    setVideoPreview(null);
    setSaveError(null);
    setShowModal(true);
  };

  const abrirEditar = (prod) => {
    setEditingId(prod.id_producto);
    setFormData({
      codigo_barras: prod.codigo_barras || '',
      nombre_producto: prod.nombre_producto || '',
      id_categoria: prod.id_categoria || null,
      marca: prod.marca || '',
      genero: prod.genero || '',
      imagen_url: prod.imagen_url || '',
      precio_compra: prod.precio_compra || '',
      precio_venta: prod.precio_venta || '',
      stock_actual: prod.stock_actual ?? '',
      stock_minimo: prod.stock_minimo ?? '',
      visible_en_tienda: prod.visible_en_tienda !== false
    });
    setImagenFiles([]);
    setVideoFile(null);
    setVideoPreview(prod.video_url ? resolverUrlImagen(prod.video_url) : null);
    setSaveError(null);
    setShowModal(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setSaveError(null);

    const payload = {
      ...formData,
      id_local: user?.id_local,
      id_categoria: formData.id_categoria ? parseInt(formData.id_categoria) : null,
      precio_compra: parseFloat(formData.precio_compra?.replace(/,/g, '')) || 0,
      precio_venta: parseFloat(formData.precio_venta?.replace(/,/g, '')) || 0,
      stock_actual: parseInt(formData.stock_actual) || 0,
      stock_minimo: parseInt(formData.stock_minimo) || 0,
      imagen_url: formData.imagen_url?.trim() || null
    };

    try {
      let prodId = editingId;

      if (editingId) {
        await apiPut(`${API_URL}/api/productos/${editingId}`, payload);
      } else {
        const data = await apiPost(`${API_URL}/api/productos`, payload);
        prodId = data.id_producto;
      }

      // Subir imágenes locales (error no crítico — no cierra el flujo)
      if (imagenFiles.length > 0 && prodId) {
        try {
          const fd = new FormData();
          imagenFiles.forEach(file => fd.append('imagenes', file));
          const imgRes = await fetch(`${API_URL}/api/productos/${prodId}/imagenes`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${getToken()}` },
            body: fd
          });
          if (!imgRes.ok) {
            console.warn('Advertencia al subir imágenes:', await imgRes.text());
          }
        } catch (imgErr) {
          console.warn('Advertencia al subir imágenes:', imgErr);
        }
      }

      // Subir video (error no crítico — no cierra el flujo)
      if (videoFile && prodId) {
        try {
          const fd = new FormData();
          fd.append('video', videoFile);
          const vidRes = await fetch(`${API_URL}/api/productos/${prodId}/video`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${getToken()}` },
            body: fd
          });
          if (!vidRes.ok) {
            console.warn('Advertencia al subir video:', await vidRes.text());
          }
        } catch (vidErr) {
          console.warn('Advertencia al subir video:', vidErr);
        }
      }

      // Cerrar modal y resetear estado ANTES de recargar lista
      setShowModal(false);
      setFormData(initialForm);
      setImagenFiles([]);
      setVideoFile(null);
      setVideoPreview(null);
      setEditingId(null);
      setSaveError(null);

      // Recargar lista de productos (independiente — no afecta el éxito del guardado)
      fetchProductos().catch(err => console.warn('Error recargando productos:', err));

    } catch (err) {
      // Error real al guardar el producto (POST/PUT fallido)
      const msg = err.message || 'Error desconocido al guardar.';
      setSaveError(msg);
      console.error('Error al guardar producto:', err);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id) => {
    if (window.confirm('¿Estás seguro de eliminar este producto?')) {
      try {
        await apiDelete(`${API_URL}/api/productos/${id}`);
        fetchProductos();
      } catch (err) {
        alert('Error al eliminar: ' + err.message);
      }
    }
  };

  const toggleVisibilidad = async (producto) => {
    const nuevaVisibilidad = producto.visible_en_tienda === false;
    try {
      await apiPut(`${API_URL}/api/productos/${producto.id_producto}`, {
        ...producto,
        visible_en_tienda: nuevaVisibilidad
      });
      fetchProductos();
    } catch (err) {
      alert('Error al cambiar visibilidad: ' + err.message);
    }
  };

  // v2.2.6: Toggle de producto destacado
  const toggleDestacado = async (producto) => {
    const nuevoEstado = !producto.destacado;
    try {
      await fetch(`${API_URL}/api/productos/${producto.id_producto}/destacado`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${getToken()}`
        },
        body: JSON.stringify({ destacado: nuevoEstado })
      }).then(r => { if (!r.ok) throw new Error('Error ' + r.status); return r.json(); });
      await fetchProductos();
    } catch (err) {
      alert('Error al cambiar destacado: ' + err.message);
    }
  };

  // v2.2.10: Toggle de oferta.
  // - Si ya está activa → abre modal para editar/desactivar
  // - Si no está activa → abre modal para configurar el precio de oferta
  const toggleOferta = (producto) => {
    setOfertaTarget(producto);
    setOfertaForm({
      precio_oferta: producto.precio_oferta != null ? String(producto.precio_oferta) : '',
      activa: !!producto.oferta_activa
    });
    setShowOfertaModal(true);
  };

  // v2.2.10: guardar la oferta (PUT /api/productos/:id/oferta)
  const guardarOferta = async () => {
    if (!ofertaTarget) return;
    const idProducto = ofertaTarget.id_producto;
    setGuardandoOferta(idProducto);
    try {
      const precioNum = ofertaForm.precio_oferta
 ? Number(ofertaForm.precio_oferta) : null;
      // Si está activa pero no hay precio, no permitir guardar
      if (ofertaForm.activa && (precioNum === null || precioNum <= 0)) {
        alert('Para activar la oferta debes ingresar un precio válido mayor que 0.');
        setGuardandoOferta(null);
        return;
      }
      const payload = {
        precio_oferta: ofertaForm.activa ? precioNum : null,
        oferta_activa: ofertaForm.activa
      };
      const resp = await fetch(`${API_URL}/api/productos/${idProducto}/oferta`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${getToken()}`
        },
        body: JSON.stringify(payload)
      }).then(r => r.json().then(d => ({ ok: r.ok, body: d })));
      if (!resp.ok) {
        alert('Error: ' + (resp.body.error || 'desconocido'));
        setGuardandoOferta(null);
        return;
      }
      // Éxito: refrescar productos y cerrar modal
      await fetchProductos();
      setShowOfertaModal(false);
      setOfertaTarget(null);
    } catch (err) {
      alert('Error al guardar oferta: ' + err.message);
    } finally {
      setGuardandoOferta(null);
    }
  };

  // v2.2.10: eliminar oferta completamente
  const eliminarOferta = async () => {
    if (!ofertaTarget) return;
    if (!confirm('¿Eliminar la oferta de este producto? El precio volverá al normal.')) return;
    const idProducto = ofertaTarget.id_producto;
    setGuardandoOferta(idProducto);
    try {
      const resp = await fetch(`${API_URL}/api/productos/${idProducto}/oferta`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${getToken()}`
        }
      }).then(r => r.json().then(d => ({ ok: r.ok, body: d })));
      if (!resp.ok) {
        alert('Error: ' + (resp.body.error || 'desconocido'));
        return;
      }
      await fetchProductos();
      setShowOfertaModal(false);
      setOfertaTarget(null);
    } catch (err) {
      alert('Error al eliminar oferta: ' + err.message);
    } finally {
      setGuardandoOferta(null);
    }
  };

  // v2.2.6: Abrir modal de reordenar destacados
  const abrirReorderDestacados = async () => {
    try {
      const data = await apiGet(`${API_URL}/api/productos/destacados`);
      setDestacados(Array.isArray(data) ? data : []);
      setShowReorderModal(true);
    } catch (err) {
      alert('Error al cargar destacados: ' + err.message);
    }
  };

  // v2.2.6: Drag & drop nativo HTML5 para reordenar
  const handleDragStart = (idx) => setDragIdx(idx);
  const handleDragOver = (e) => e.preventDefault();
  const handleDrop = (idx) => {
    if (dragIdx === null || dragIdx === idx) {
      setDragIdx(null);
      return;
    }
    const newList = [...destacados];
    const [moved] = newList.splice(dragIdx, 1);
    newList.splice(idx, 0, moved);
    setDestacados(newList);
    setDragIdx(null);
  };

  const guardarReorder = async () => {
    setSavingReorder(true);
    try {
      const ids = destacados.map(d => d.id_producto);
      await fetch(`${API_URL}/api/productos/reordenar-destacados`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${getToken()}`
        },
        body: JSON.stringify({ ids })
      }).then(r => { if (!r.ok) throw new Error('Error ' + r.status); return r.json(); });
      setShowReorderModal(false);
      await fetchProductos();
    } catch (err) {
      alert('Error al guardar el orden: ' + err.message);
    } finally {
      setSavingReorder(false);
    }
  };

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
        headers: { Authorization: 'Bearer ' + getToken() },
        body: fd,
      });
      const data = await res.json();
      if (res.ok) {
        setGaleriaMsg({ type: 'success', text: `Se subieron ${data.imagenes?.length || files.length} imagen(es).` });
        const imgs = await apiGet(`${API_URL}/api/productos/${galeria.id_producto}/imagenes`);
        setGaleriaImagenes(Array.isArray(imgs) ? imgs : []);
        fetchProductos();
      } else {
        setGaleriaMsg({ type: 'error', text: data.error || 'Error al subir imágenes.' });
      }
    } catch (err) {
      setGaleriaMsg({ type: 'error', text: err.message || 'Error al subir imágenes.' });
    } finally {
      setSubiendo(false);
      e.target.value = '';
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
        <div>
          <h2>Gestión de Catálogo</h2>
          <p style={{ color: 'var(--text-light)', fontSize: '0.9rem', margin: 0 }}>
            {productos.length} producto{productos.length !== 1 ? 's' : ''} registrado{productos.length !== 1 ? 's' : ''}
            {productos.filter(p => p.destacado).length > 0 && (
              <> · <Star size={12} fill="#F59E0B" style={{ verticalAlign: 'middle' }} /> {productos.filter(p => p.destacado).length} destacado{productos.filter(p => p.destacado).length !== 1 ? 's' : ''}</>
            )}
          </p>
        </div>
        <div style={{ display: 'flex', gap: '0.6rem' }}>
          <button
            onClick={abrirReorderDestacados}
            disabled={productos.filter(p => p.destacado).length < 2}
            title={productos.filter(p => p.destacado).length < 2 ? 'Necesitas al menos 2 productos destacados' : 'Reordenar los productos que aparecen al inicio del catálogo'}
            style={{
              backgroundColor: '#FEF3C7',
              border: '1px solid #F59E0B',
              color: '#B45309',
              padding: '0.6rem 1rem',
              borderRadius: '8px',
              cursor: productos.filter(p => p.destacado).length < 2 ? 'not-allowed' : 'pointer',
              opacity: productos.filter(p => p.destacado).length < 2 ? 0.4 : 1,
              fontWeight: 600,
              fontSize: '0.9rem',
              display: 'flex',
              alignItems: 'center',
              gap: '0.4rem'
            }}
          >
            <Star size={16} fill="#F59E0B" /> Reordenar Destacados ({productos.filter(p => p.destacado).length})
          </button>
          <button className="btn-primary flex-row" onClick={abrirCrear}>
            <Plus size={18} /> Nuevo Producto
          </button>
        </div>
      </div>

      <div className="card" style={{ padding: '0', overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ backgroundColor: '#f9f9f9', borderBottom: '1px solid var(--border-color)', textAlign: 'left' }}>
              <th style={{ padding: '1rem' }}>Foto</th>
              <th style={{ padding: '1rem' }}>Serial / Código</th>
              <th style={{ padding: '1rem' }}>Producto</th>
              <th style={{ padding: '1rem' }}>Categoría</th>
              <th style={{ padding: '1rem' }}>Precio Venta</th>
              <th style={{ padding: '1rem' }}>Stock</th>
              <th style={{ padding: '1rem', textAlign: 'center' }} title="Destacado: aparece al inicio en la tienda pública">Dest.</th>
              <th style={{ padding: '1rem', textAlign: 'center' }} title="Oferta activa: badge OFERTA + precio tachado en tienda pública">Oferta</th>
              <th style={{ padding: '1rem', textAlign: 'center' }}>Tienda</th>
              <th style={{ padding: '1rem', textAlign: 'center' }}>Acciones</th>
            </tr>
          </thead>
          <tbody>
            {productos.map(p => {
              const fotoUrl = resolverUrlImagen(p.imagen_url);
              return (
                <tr key={p.id_producto} style={{ borderBottom: '1px solid var(--border-color)', opacity: p.visible_en_tienda === false ? 0.5 : 1 }}>
                  <td style={{ padding: '1rem' }}>
                    {fotoUrl ? (
                      <img 
                        src={fotoUrl} 
                        alt={p.nombre_producto} 
                        onError={(e) => {
                          e.target.onerror = null;
                          e.target.style.display = 'none';
                        }}
                        style={{ width: '44px', height: '44px', objectFit: 'cover', borderRadius: '6px', border: '1px solid #e2e8f0' }} 
                      />
                    ) : (
                      <div style={{ width: '44px', height: '44px', backgroundColor: '#f1f5f9', borderRadius: '6px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <ImageIcon size={20} color="var(--text-light)" />
                      </div>
                    )}
                  </td>
                  <td style={{ padding: '1rem', color: 'var(--text-light)', fontSize: '0.9rem' }}>{p.codigo_barras || '—'}</td>
                  <td style={{ padding: '1rem', fontWeight: 600 }}>{p.nombre_producto}</td>
                  <td style={{ padding: '1rem' }}>
                    <span style={{ fontSize: '0.78rem', padding: '0.2rem 0.6rem', borderRadius: '12px', background: '#f1f5f9', color: '#475569', fontWeight: 600 }}>
                      {p.nombre_categoria || 'General'}
                    </span>
                  </td>
                  <td style={{ padding: '1rem', color: 'var(--primary-color)', fontWeight: 700 }}>{formatearCOP(p.precio_venta)}</td>
                  <td style={{ padding: '1rem' }}>
                    <span style={{ padding: '0.25rem 0.65rem', borderRadius: '12px', backgroundColor: p.stock_actual <= (p.stock_minimo || 0) ? 'rgba(231,111,81,0.12)' : 'rgba(42,157,143,0.12)', color: p.stock_actual <= (p.stock_minimo || 0) ? 'var(--accent-color)' : 'var(--primary-color)', fontSize: '0.8rem', fontWeight: 700 }}>
                      {p.stock_actual} ud.
                    </span>
                  </td>
                  <td style={{ padding: '1rem', textAlign: 'center' }}>
                    <button
                      onClick={() => toggleDestacado(p)}
                      title={p.destacado ? `Destacado #${p.posicion_destacado || '?'} — click para quitar` : 'Click para destacar'}
                      style={{
                        background: p.destacado ? '#FEF3C7' : 'transparent',
                        border: p.destacado ? '1px solid #F59E0B' : '1px dashed #cbd5e1',
                        color: p.destacado ? '#B45309' : '#94a3b8',
                        cursor: 'pointer',
                        padding: '0.35rem 0.6rem',
                        borderRadius: '8px',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '0.3rem',
                        fontSize: '0.78rem',
                        fontWeight: 600,
                        transition: 'all .2s'
                      }}
                    >
                      <Star size={14} fill={p.destacado ? '#F59E0B' : 'none'} />
                      {p.destacado ? `#${p.posicion_destacado || '?'}` : ''}
                    </button>
                  </td>
                  {/* v2.2.10: Botón toggle de oferta (mismo patrón que destacado). */}
                  <td style={{ padding: '1rem', textAlign: 'center' }}>
                    <button
                      onClick={() => toggleOferta(p)}
                      title={p.oferta_activa ? `Oferta activa: ${formatearCOP(p.precio_oferta)} (clic para gestionar)` : 'Clic para configurar oferta'}
                      disabled={guardandoOferta === p.id_producto}
                      style={{
                        background: p.oferta_activa ? '#FEE2E2' : 'transparent',
                        border: p.oferta_activa ? '1px solid #dc2626' : '1px dashed #cbd5e1',
                        color: p.oferta_activa ? '#dc2626' : '#94a3b8',
                        cursor: p.oferta_activa ? 'pointer' : 'pointer',
                        padding: '0.35rem 0.6rem',
                        borderRadius: '8px',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '0.3rem',
                        fontSize: '0.78rem',
                        fontWeight: 600,
                        transition: 'all .2s'
                      }}
                    >
                      <Tag size={14} fill={p.oferta_activa ? '#dc2626' : 'none'} />
                      {p.oferta_activa ? formatearCOP(p.precio_oferta) : ''}
                    </button>
                  </td>
                  <td style={{ padding: '1rem', textAlign: 'center' }}>
                    <label style={{ position: 'relative', display: 'inline-block', width: '40px', height: '22px', cursor: 'pointer' }}>
                      <input type="checkbox" checked={p.visible_en_tienda !== false} onChange={() => toggleVisibilidad(p)}
                        style={{ opacity: 0, width: 0, height: 0 }} />
                      <span style={{ position: 'absolute', inset: 0, borderRadius: '22px', transition: 'all .3s', background: p.visible_en_tienda !== false ? '#2A9D8F' : '#cbd5e1' }}></span>
                      <span style={{ position: 'absolute', height: '16px', width: '16px', left: p.visible_en_tienda !== false ? '20px' : '3px', bottom: '3px', background: '#fff', borderRadius: '50%', transition: 'all .3s' }}></span>
                    </label>
                  </td>
                  <td style={{ padding: '1rem', textAlign: 'center' }}>
                    <div style={{ display: 'flex', gap: '0.4rem', justifyContent: 'center', alignItems: 'center' }}>
                      <button onClick={() => abrirEditar(p)} title="Editar producto"
                        style={{ backgroundColor: '#f8fafc', border: '1px solid #e2e8f0', color: '#334155', cursor: 'pointer', padding: '0.45rem', borderRadius: '8px', display: 'flex', alignItems: 'center' }}>
                        <Edit3 size={16} />
                      </button>
                      <button onClick={() => abrirGaleria(p)} title="Ver / gestionar fotos"
                        style={{ backgroundColor: 'var(--green-light)', border: '1px solid var(--border-soft)', color: 'var(--green-primary)', cursor: 'pointer', padding: '0.45rem 0.65rem', borderRadius: '8px', display: 'flex', alignItems: 'center', gap: '0.3rem', fontSize: '0.8rem', fontWeight: 600 }}>
                        <ImagePlus size={16} />
                        {(p.imagenes && p.imagenes.length) ? `${p.imagenes.length}` : ''}
                      </button>
                      <button onClick={() => handleDelete(p.id_producto)} title="Eliminar producto"
                        style={{ backgroundColor: 'transparent', border: 'none', color: 'var(--accent-color)', cursor: 'pointer', padding: '0.45rem' }}>
                        <Trash2 size={17} />
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
            {productos.length === 0 && (
              <tr>
                <td colSpan="8" style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-light)' }}>
                  No tienes productos registrados en tu local. Agrega tu primer producto.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* v2.2.6: Modal Reordenar Destacados (drag & drop) */}
      {showReorderModal && (
        <div className="modal-overlay" onClick={() => setShowReorderModal(false)}>
          <div className="modal-content" style={{ maxWidth: '560px' }} onClick={e => e.stopPropagation()}>
            <div className="modal-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border-color)', paddingBottom: '0.75rem' }}>
              <h3 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <Star size={18} fill="#F59E0B" /> Reordenar Destacados
              </h3>
              <button onClick={() => setShowReorderModal(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-light)' }}>
                <X size={20} />
              </button>
            </div>
            <p style={{ color: 'var(--text-light)', fontSize: '0.85rem', margin: '0.75rem 0' }}>
              Arrastra las filas para definir el orden en que aparecerán al inicio de la tienda pública. El primero de la lista es el que sale primero.
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', maxHeight: '50vh', overflowY: 'auto' }}>
              {destacados.length === 0 && (
                <p style={{ color: 'var(--text-light)', textAlign: 'center', padding: '2rem' }}>
                  No tienes productos destacados. Marca la estrella ⭐ en algún producto de la tabla para empezar.
                </p>
              )}
              {destacados.map((d, idx) => {
                const fotoUrl = resolverUrlImagen(d.imagen_url);
                return (
                  <div
                    key={d.id_producto}
                    draggable
                    onDragStart={() => handleDragStart(idx)}
                    onDragOver={handleDragOver}
                    onDrop={() => handleDrop(idx)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.75rem',
                      padding: '0.65rem 0.85rem',
                      background: dragIdx === idx ? '#FEF3C7' : '#f8fafc',
                      border: '1px solid ' + (dragIdx === idx ? '#F59E0B' : '#e2e8f0'),
                      borderRadius: '10px',
                      cursor: 'grab',
                      transition: 'background .15s'
                    }}
                  >
                    <GripVertical size={18} color="#94a3b8" />
                    <span style={{ fontWeight: 700, color: '#B45309', minWidth: '24px', textAlign: 'center' }}>
                      #{idx + 1}
                    </span>
                    {fotoUrl ? (
                      <img src={fotoUrl} alt="" style={{ width: '36px', height: '36px', objectFit: 'cover', borderRadius: '6px' }} />
                    ) : (
                      <div style={{ width: '36px', height: '36px', backgroundColor: '#e2e8f0', borderRadius: '6px' }} />
                    )}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 600, fontSize: '0.9rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {d.nombre_producto}
                      </div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-light)' }}>
                        {d.marca && `${d.marca} · `}{d.codigo_barras || '—'} · {d.stock_actual} ud.
                      </div>
                    </div>
                    <Star size={14} fill="#F59E0B" />
                  </div>
                );
              })}
            </div>
            <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end', marginTop: '1rem' }}>
              <button onClick={() => setShowReorderModal(false)} style={{ padding: '0.6rem 1rem', borderRadius: '8px', border: '1px solid var(--border-color)', background: 'transparent', cursor: 'pointer', fontWeight: 600 }}>
                Cancelar
              </button>
              <button
                onClick={guardarReorder}
                disabled={savingReorder}
                style={{
                  padding: '0.6rem 1rem',
                  borderRadius: '8px',
                  border: 'none',
                  background: 'var(--primary-color)',
                  color: '#fff',
                  cursor: savingReorder ? 'wait' : 'pointer',
                  fontWeight: 600,
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.4rem',
                  opacity: savingReorder ? 0.7 : 1
                }}
              >
                <Save size={16} /> {savingReorder ? 'Guardando...' : 'Guardar orden'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Crear / Editar Producto */}
      {showModal && (
        <div className="modal-overlay">
          <div className="modal-content" style={{ maxWidth: '640px', maxHeight: '90vh', overflowY: 'auto' }}>
            <div className="modal-header">
              <h2>{editingId ? 'Editar Producto' : 'Agregar Nuevo Producto'}</h2>
              <button className="close-btn" onClick={() => { setShowModal(false); setSaveError(null); }}>×</button>
            </div>
            {/* Mensaje de error al guardar */}
            {saveError && (
              <div style={{
                margin: '0 0 1rem 0',
                padding: '0.85rem 1rem',
                borderRadius: '10px',
                backgroundColor: '#fef2f2',
                border: '1px solid #fecaca',
                color: '#dc2626',
                fontSize: '0.88rem',
                display: 'flex',
                alignItems: 'flex-start',
                gap: '0.5rem'
              }}>
                <span style={{ fontSize: '1rem', flexShrink: 0 }}>⚠️</span>
                <div>
                  <strong>Error al guardar:</strong> {saveError}
                  <div style={{ marginTop: '0.25rem', fontSize: '0.8rem', color: '#991b1b' }}>Verifica tu conexión y vuelve a intentarlo.</div>
                </div>
              </div>
            )}
            <form onSubmit={handleSubmit}>
              <div className="form-group">
                <label>Nombre del Producto *</label>
                <input type="text" name="nombre_producto" value={formData.nombre_producto} onChange={handleChange} required placeholder="Ej: iPhone 15 Pro Max 256GB" />
              </div>

              <div className="grid-2">
                <div className="form-group">
                  <label>Categoría</label>
                  <select name="id_categoria" value={formData.id_categoria} onChange={handleChange} style={{ width: '100%', padding: '0.65rem', borderRadius: '8px', border: '1px solid var(--border-color)', backgroundColor: 'var(--bg-card)', color: 'var(--text-primary)' }}>
                    {categorias.map(cat => (
                      <option key={cat.id_categoria} value={cat.id_categoria}>{cat.nombre_categoria}</option>
                    ))}
                  </select>
                </div>
                <div className="form-group">
                  <label>Número Serial / Código de Barras</label>
                  <input type="text" name="codigo_barras" placeholder="Ej: SN-12345678" value={formData.codigo_barras} onChange={handleChange} />
                  <small style={{ color: 'var(--text-light)', fontSize: '0.75rem' }}>
                    Opcional. Varios productos pueden compartir el mismo modelo (ej: TM-318139 con caja en acero, oro, titanio).
                  </small>
                </div>
              </div>

              <div className="grid-2">
                <div className="form-group">
                  <label>Marca</label>
                  <input type="text" name="marca" placeholder="Ej: TechnoMarine, MULCO, INVICTA" value={formData.marca} onChange={handleChange} />
                  <small style={{ color: 'var(--text-light)', fontSize: '0.75rem' }}>
                    Si es un reloj conocido, escríbela para filtrar en la tienda web.
                  </small>
                </div>
                <div className="form-group">
                  <label>Género</label>
                  <select name="genero" value={formData.genero} onChange={handleChange} style={{ width: '100%', padding: '0.65rem', borderRadius: '8px', border: '1px solid var(--border-color)', backgroundColor: 'var(--bg-card)', color: 'var(--text-primary)' }}>
                    <option value="">No especificado</option>
                    <option value="hombre">Hombre</option>
                    <option value="mujer">Mujer</option>
                  </select>
                  <small style={{ color: 'var(--text-light)', fontSize: '0.75rem' }}>
                    Para filtrar "Relojes de hombre" o "Relojes de mujer" en la tienda.
                  </small>
                </div>
              </div>

              {/* URL Directa de Imagen (Opcional) */}
              <div className="form-group">
                <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                  <LinkIcon size={14} /> URL Directa de Imagen (opcional o de la web)
                </label>
                <input 
                  type="url" 
                  name="imagen_url" 
                  value={formData.imagen_url || ''} 
                  onChange={handleChange} 
                  placeholder="https://ejemplo.com/foto-producto.png" 
                />
                <small style={{ color: 'var(--text-light)', fontSize: '0.75rem' }}>
                  Puedes pegar un enlace directo de internet o seleccionar archivos abajo.
                </small>
              </div>

              {/* Fotografías locales del Producto */}
              <div className="form-group">
                <label>Fotografías del Producto (subir archivos)</label>
                {imagenFiles.length > 0 && (
                  <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '0.75rem' }}>
                    {imagenFiles.map((file, i) => (
                      <div key={i} style={{ position: 'relative', width: '80px', height: '80px' }}>
                        <img src={URL.createObjectURL(file)} alt={`Img ${i+1}`} style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: '8px', border: '1px solid var(--border-color)' }} />
                        <button type="button" onClick={() => removeImageAt(i)} style={{ position: 'absolute', top: -4, right: -4, background: '#ef4444', border: 'none', color: '#fff', borderRadius: '50%', width: 20, height: 20, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '10px' }}>×</button>
                      </div>
                    ))}
                  </div>
                )}
                <label style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '1.25rem', border: '2px dashed var(--border-color)', borderRadius: '10px', cursor: 'pointer', backgroundColor: 'var(--bg-light)', transition: 'border-color 0.2s' }}>
                  <Upload size={28} color="var(--text-light)" />
                  <span style={{ marginTop: '0.4rem', color: 'var(--text-light)', fontSize: '0.85rem' }}>Seleccionar fotos locales</span>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-light)' }}>JPG, PNG o WebP · Puedes seleccionar varias</span>
                  <input type="file" accept=".jpg,.jpeg,.png,.webp" multiple onChange={handleImagesChange} style={{ display: 'none' }} />
                </label>
              </div>

              {/* Video del Producto (opcional) */}
              <div className="form-group">
                <label>Video del Producto (opcional)</label>
                {videoPreview ? (
                  <div style={{ position: 'relative', display: 'inline-block', width: '100%' }}>
                    <video src={videoPreview} controls style={{ width: '100%', maxHeight: '180px', borderRadius: '8px', border: '1px solid var(--border-color)' }} />
                    <button type="button" onClick={removeVideo} style={{ position: 'absolute', top: 8, right: 8, background: 'rgba(0,0,0,0.6)', border: 'none', color: '#fff', borderRadius: '50%', width: 28, height: 28, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <X size={14} />
                    </button>
                  </div>
                ) : (
                  <label style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '1rem', border: '2px dashed var(--border-color)', borderRadius: '10px', cursor: 'pointer', backgroundColor: 'var(--bg-light)' }}>
                    <Upload size={24} color="var(--text-light)" />
                    <span style={{ marginTop: '0.3rem', color: 'var(--text-light)', fontSize: '0.85rem' }}>Seleccionar video (MP4, WebM)</span>
                    <input type="file" accept=".mp4,.webm,.mov" onChange={handleVideoChange} style={{ display: 'none' }} />
                  </label>
                )}
              </div>

              {/* Precios + Calculadora de Ganancia */}
              <div className="grid-2">
                <div className="form-group">
                  <label>Precio de Compra (COP)</label>
                  <input
                    type="text"
                    inputMode="numeric"
                    name="precio_compra"
                    min="0"
                    value={formatearNumeroCOP(formData.precio_compra)}
                    onChange={handleChange}
                    placeholder="Ej: 450.000"
                  />
                </div>
                <div className="form-group">
                  <label>Precio de Venta (COP) *</label>
                  <input
                    type="text"
                    inputMode="numeric"
                    name="precio_venta"
                    min="0"
                    value={formatearNumeroCOP(formData.precio_venta)}
                    onChange={handleChange}
                    required
                    placeholder="Ej: 600.000"
                  />
                </div>
              </div>

              {Number(formData.precio_compra) > 0 && Number(formData.precio_venta) > 0 && (
                <div style={{
                  background: Number(formData.precio_venta) >= Number(formData.precio_compra)
                    ? 'linear-gradient(135deg, rgba(42,157,143,0.12), rgba(38,70,83,0.12))'
                    : 'linear-gradient(135deg, rgba(239,68,68,0.12), rgba(180,40,40,0.12))',
                  border: `1px solid ${Number(formData.precio_venta) >= Number(formData.precio_compra) ? 'rgba(42,157,143,0.3)' : 'rgba(239,68,68,0.3)'}`,
                  borderRadius: '12px', padding: '0.9rem 1.25rem', marginTop: '0.25rem', marginBottom: '0.75rem'
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
                    <span style={{ fontSize: '1rem' }}>💰</span>
                    <span style={{ fontWeight: 700, fontSize: '0.85rem', color: 'var(--text-primary)' }}>Resumen de Margen</span>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0.75rem', textAlign: 'center' }}>
                    <div>
                      <div style={{ fontSize: '0.7rem', color: 'var(--text-light)' }}>Ganancia Unitaria</div>
                      <div style={{ fontSize: '1rem', fontWeight: 800, color: Number(formData.precio_venta) >= Number(formData.precio_compra) ? '#2A9D8F' : '#ef4444' }}>
                        ${Number(formData.precio_venta - formData.precio_compra).toLocaleString('es-CO')}
                      </div>
                    </div>
                    <div>
                      <div style={{ fontSize: '0.7rem', color: 'var(--text-light)' }}>Margen</div>
                      <div style={{ fontSize: '1rem', fontWeight: 800, color: Number(formData.precio_venta) >= Number(formData.precio_compra) ? '#2A9D8F' : '#ef4444' }}>
                        {(((Number(formData.precio_venta) - Number(formData.precio_compra)) / Number(formData.precio_compra)) * 100).toFixed(1)}%
                      </div>
                    </div>
                    <div>
                      <div style={{ fontSize: '0.7rem', color: 'var(--text-light)' }}>Ganancia Total</div>
                      <div style={{ fontSize: '1rem', fontWeight: 800, color: Number(formData.precio_venta) >= Number(formData.precio_compra) ? '#2A9D8F' : '#ef4444' }}>
                        ${((Number(formData.precio_venta) - Number(formData.precio_compra)) * (parseInt(formData.stock_actual) || 1)).toLocaleString('es-CO')}
                      </div>
                    </div>
                  </div>
                </div>
              )}

              <div className="grid-2">
                <div className="form-group">
                  <label>Stock Físico Inicial *</label>
                  <input type="number" name="stock_actual" min="0" value={formData.stock_actual} onChange={handleChange} required />
                </div>
                <div className="form-group">
                  <label>Stock Mínimo (Alerta)</label>
                  <input type="number" name="stock_minimo" min="0" value={formData.stock_minimo} onChange={handleChange} placeholder="1" />
                </div>
              </div>

              {/* Toggle visibilidad en tienda */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.75rem 1rem', background: 'var(--bg-light)', borderRadius: '10px', marginTop: '0.5rem', marginBottom: '1rem' }}>
                <div>
                  <div style={{ fontWeight: 600, fontSize: '0.9rem' }}>Visible en tienda web</div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-light)' }}>Activa este producto para pedidos online.</div>
                </div>
                <label style={{ position: 'relative', display: 'inline-block', width: '44px', height: '24px', cursor: 'pointer' }}>
                  <input type="checkbox" name="visible_en_tienda" checked={formData.visible_en_tienda !== false} onChange={handleChange} style={{ opacity: 0, width: 0, height: 0 }} />
                  <span style={{
                    position: 'absolute', inset: 0, borderRadius: '24px', transition: 'all .3s',
                    background: formData.visible_en_tienda !== false ? '#2A9D8F' : '#cbd5e1'
                  }}></span>
                  <span style={{
                    position: 'absolute', height: '18px', width: '18px', left: formData.visible_en_tienda !== false ? '22px' : '3px', bottom: '3px',
                    background: '#fff', borderRadius: '50%', transition: 'all .3s'
                  }}></span>
                </label>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
                <button type="button" className="btn-secondary" onClick={() => { setShowModal(false); setSaveError(null); }}>Cancelar</button>
                <button type="submit" className="btn-primary" disabled={saving}>
                  {saving ? (
                    <span style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                      <span style={{ width: 14, height: 14, border: '2px solid rgba(255,255,255,0.4)', borderTopColor: '#fff', borderRadius: '50%', display: 'inline-block', animation: 'spin 0.8s linear infinite' }} />
                      Guardando...
                    </span>
                  ) : (editingId ? 'Actualizar Producto' : 'Guardar Producto')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* v2.2.10: Modal de gestión de oferta (activar/desactivar/configurar). */}
      {showOfertaModal && ofertaTarget && (
        <div className="modal-overlay" onClick={() => setShowOfertaModal(false)}>
          <div className="modal-content" style={{ maxWidth: '480px' }} onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <Tag size={20} color="#dc2626" />
                Oferta: {ofertaTarget.nombre_producto}
              </h2>
              <button className="close-btn" onClick={() => setShowOfertaModal(false)}>×</button>
            </div>
            <div style={{ padding: '1.25rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <p style={{ margin: 0, color: 'var(--text-light)', fontSize: '0.88rem' }}>
                Precio de venta actual: < <strong>{formatearCOP(ofertaTarget.precio_venta)}</strong>.
                Define el precio con descuento. La tienda web mostrará precio tachado + nuevo + badge OFERTA.
              </p>

              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.3rem' }}>
                  Precio con oferta (COP) *
                </label>
                <input
                  type="number"
                  step="100"
                  min="1"
                  max={ofertaTarget.precio_venta - 1}
                  placeholder="Ej: 580000"
                  value={ofertaForm.precio_oferta}
                  onChange={e => setOfertaForm({ ...ofertaForm, precio_oferta: e.target.value })}
                  style={{ width: '100%', padding: '0.6rem 0.75rem', border: '1.5px solid var(--border-color)', borderRadius: '8px', fontSize: '1rem' }}
                />
                {ofertaForm.precio_oferta && Number(ofertaForm.precio_oferta) > 0 && Number(ofertaForm.precio_oferta) < Number(ofertaTarget.precio_venta) && (
                  <div style={{ marginTop: '0.4rem', fontSize: '0.82rem', color: '#dc2626', fontWeight: 600 }}>
                    Descuento: −{Math.round((1 - Number(ofertaForm.precio_oferta) / Number(ofertaTarget.precio_venta)) * 100)}% ({formatearCOP(Number(ofertaTarget.precio_venta) - Number(ofertaForm.precio_oferta))} menos)
                  </div>
                )}
                {ofertaForm.precio_oferta && Number(ofertaForm.precio_oferta) >= Number(ofertaTarget.precio_venta) && (
                  <div style={{ marginTop: '0.4rem', fontSize: '0.82rem', color: '#dc2626' }}>
                    ⚠️ El precio con oferta debe ser menor que {formatearCOP(ofertaTarget.precio_venta)}.
                  </div>
                )}
              </div>

              <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={ofertaForm.activa}
                  onChange={e => setOfertaForm({ ...ofertaForm, activa: e.target.checked })}
                  style={{ width: '18px', height: '18px', cursor: 'pointer' }}
                />
                <span style={{ fontWeight: 600, fontSize: '0.9rem' }}>Oferta activa</span>
                <span style={{ fontSize: '0.8rem', color: 'var(--text-light)' }}>(visible en la tienda pública)</span>
              </label>

              <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.75rem', borderTop: '1px solid var(--border-color)', paddingTop: '1rem' }}>
                {ofertaTarget.oferta_activa && (
                  <button
                    type="button"
                    onClick={eliminarOferta}
                    disabled={guardandoOferta === ofertaTarget.id_producto}
                    style={{ background: 'transparent', border: '1px solid #dc2626', color: '#dc2626', padding: '0.55rem 0.9rem', borderRadius: '8px', fontWeight: 600, cursor: 'pointer' }}
                  >
                    Eliminar oferta
                  </button>
                )}
                <div style={{ display: 'flex', gap: '0.5rem', marginLeft: 'auto' }}>
                  <button type="button" className="btn-secondary" onClick={() => setShowOfertaModal(false)}>
                    Cancelar
                  </button>
                  <button
                    type="button"
                    className="btn-primary"
                    onClick={guardarOferta}
                    disabled={guardandoOferta === ofertaTarget.id_producto || !ofertaForm.activa}
                    style={{ background: '#dc2626', display: 'flex', alignItems: 'center', gap: '0.4rem' }}
                  >
                    {guardandoOferta === ofertaTarget.id_producto ? 'Guardando…' : (ofertaForm.activa ? 'Activar oferta' : 'Guardar')}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal de Galería de Imágenes */}
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
              {galeriaImagenes.map(img => {
                const imgRes = resolverUrlImagen(img.url);
                return (
                  <div key={img.id} style={{ position: 'relative', borderRadius: '10px', overflow: 'hidden', border: '1px solid var(--border-color)', aspectRatio: '1/1' }}>
                    <img src={imgRes} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    <button onClick={() => eliminarImagen(img.id)} title="Eliminar imagen"
                      style={{ position: 'absolute', top: 6, right: 6, width: 26, height: 26, borderRadius: '50%', border: 'none', backgroundColor: 'rgba(0,0,0,0.6)', color: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <X size={14} />
                    </button>
                  </div>
                );
              })}
              {galeriaImagenes.length === 0 && (
                <div style={{ gridColumn: '1 / -1', padding: '2rem', textAlign: 'center', color: 'var(--text-light)', border: '1px dashed var(--border-color)', borderRadius: '10px', fontSize: '0.9rem' }}>
                  Este producto aún no tiene fotos en su galería. Sube una o varias abajo.
                </div>
              )}
            </div>

            {/* Subir imágenes */}
            <div style={{ border: '1px dashed var(--green-primary)', borderRadius: '10px', padding: '1rem', textAlign: 'center', backgroundColor: 'var(--green-light)' }}>
              <label style={{ cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.4rem', color: 'var(--green-primary)', fontWeight: 600 }}>
                <Upload size={22} />
                {subiendo ? 'Subiendo...' : 'Haz clic para seleccionar fotos adicionales'}
                <input type="file" accept=".jpg,.jpeg,.png,.webp" multiple onChange={subirImagenes} disabled={subiendo} style={{ display: 'none' }} />
              </label>
              <p style={{ fontSize: '0.75rem', color: 'var(--text-light)', margin: '0.4rem 0 0' }}>JPG, PNG o WebP · máx 10 MB por archivo</p>
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
