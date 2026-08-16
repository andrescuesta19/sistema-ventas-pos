import { API_URL } from '../config';
import { apiGet, apiPost, apiPut, apiDelete } from '../api';
import { useState, useEffect } from 'react';
import { Plus, Trash2, Image as ImageIcon, Package } from 'lucide-react';

const Inventario = ({ user }) => {
  const [productos, setProductos] = useState([]);
  const [categorias, setCategorias] = useState([]);
  const [showModal, setShowModal] = useState(false);
  const [formData, setFormData] = useState({
    codigo_barras: '',
    nombre_producto: '',
    imagen_url: '',
    id_categoria: '',
    precio_compra: '',
    precio_venta: '',
    stock_actual: '',
    stock_minimo: ''
  });

  useEffect(() => {
    fetchProductos();
    fetchCategorias();
  }, []);

  const fetchProductos = async () => {
    const data = await apiGet(`${API_URL}/api/productos?id_local=${user.id_local}`);
    setProductos(Array.isArray(data) ? data : []);
  };

  const fetchCategorias = async () => {
    try {
      const data = await apiGet(`${API_URL}/api/categorias`);
      setCategorias(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error('Error al obtener categorías:', err);
    }
  };

  const formatearCOP = (valor) => {
    return new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0 }).format(valor || 0);
  };

  const handleChange = (e) => setFormData({ ...formData, [e.target.name]: e.target.value });

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      const payload = {
        ...formData,
        id_local: user.id_local,
        id_categoria: formData.id_categoria ? parseInt(formData.id_categoria) : null,
        precio_compra: parseFloat(formData.precio_compra) || 0,
        precio_venta: parseFloat(formData.precio_venta) || 0,
        stock_actual: parseInt(formData.stock_actual) || 0,
        stock_minimo: parseInt(formData.stock_minimo) || 5
      };

      await apiPost(`${API_URL}/api/productos`, payload);
      setShowModal(false);
      setFormData({
        codigo_barras: '', nombre_producto: '', imagen_url: '', id_categoria: '',
        precio_compra: '', precio_venta: '', stock_actual: '', stock_minimo: ''
      });
      fetchProductos();
    } catch (err) {
      alert(`Error al guardar el producto: ${err.message || 'Intente de nuevo'}`);
    }
  };

  const handleDelete = async (id) => {
    if (window.confirm('¿Estás seguro de eliminar este producto?')) {
      try {
        await apiDelete(`${API_URL}/api/productos/${id}`);
        fetchProductos();
      } catch (err) {
        alert('No se pudo eliminar el producto.');
      }
    }
  };

  return (
    <div className="page-content" style={{ padding: '2rem' }}>
      <div className="flex-between" style={{ marginBottom: '2rem' }}>
        <div>
          <h2>Gestión de Catálogo & Productos</h2>
          <p style={{ color: 'var(--text-light)', fontSize: '0.9rem', margin: '0.2rem 0 0 0' }}>
            Administra los ítems, imágenes, categorías y stock de tu local.
          </p>
        </div>
        <button className="btn-primary flex-row" onClick={() => setShowModal(true)}>
          <Plus size={18} /> Nuevo Producto
        </button>
      </div>

      <div className="card" style={{ padding: '0', overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ backgroundColor: '#f9f9f9', borderBottom: '1px solid var(--border-color)', textAlign: 'left' }}>
              <th style={{ padding: '1rem' }}>Foto</th>
              <th style={{ padding: '1rem' }}>Código / SKU</th>
              <th style={{ padding: '1rem' }}>Producto</th>
              <th style={{ padding: '1rem' }}>Categoría</th>
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
                    <img 
                      src={p.imagen_url} 
                      alt={p.nombre_producto} 
                      style={{ width: '42px', height: '42px', objectFit: 'contain', borderRadius: '6px', border: '1px solid #e2e8f0', padding: '2px', backgroundColor: '#fff' }} 
                      onError={(e) => {
                        e.target.onerror = null;
                        e.target.style.display = 'none';
                      }}
                    />
                  ) : (
                    <div style={{ width: '42px', height: '42px', backgroundColor: '#f1f5f9', borderRadius: '6px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <ImageIcon size={20} color="var(--text-light)" />
                    </div>
                  )}
                </td>
                <td style={{ padding: '1rem', color: 'var(--text-light)', fontSize: '0.88rem', fontFamily: 'monospace' }}>{p.codigo_barras}</td>
                <td style={{ padding: '1rem', fontWeight: 600, color: '#1e293b' }}>{p.nombre_producto}</td>
                <td style={{ padding: '1rem' }}>
                  <span style={{ fontSize: '0.8rem', padding: '0.2rem 0.6rem', borderRadius: '12px', backgroundColor: '#f1f5f9', color: '#475569', fontWeight: 500 }}>
                    {p.nombre_categoria || 'Sin Categoría'}
                  </span>
                </td>
                <td style={{ padding: '1rem', color: 'var(--primary-color)', fontWeight: 700 }}>{formatearCOP(p.precio_venta)}</td>
                <td style={{ padding: '1rem' }}>
                  <span style={{ padding: '0.2rem 0.6rem', borderRadius: '12px', backgroundColor: p.stock_actual <= p.stock_minimo ? 'rgba(231,111,81,0.1)' : 'rgba(42,157,143,0.1)', color: p.stock_actual <= p.stock_minimo ? 'var(--accent-color)' : 'var(--primary-color)', fontSize: '0.8rem', fontWeight: 600 }}>
                    {p.stock_actual} ud.
                  </span>
                </td>
                <td style={{ padding: '1rem', textAlign: 'center' }}>
                  <button onClick={() => handleDelete(p.id_producto)} style={{ backgroundColor: 'transparent', border: 'none', color: 'var(--accent-color)', cursor: 'pointer', padding: '0.5rem' }} title="Eliminar producto">
                    <Trash2 size={18} />
                  </button>
                </td>
              </tr>
            ))}
            {productos.length === 0 && (
              <tr>
                <td colSpan="7" style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-light)' }}>
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
                <input type="text" name="nombre_producto" value={formData.nombre_producto} onChange={handleChange} required placeholder="Ej: Zapatillas Urbanas Blancas" />
              </div>

              <div className="grid-2">
                <div className="form-group">
                  <label>Categoría</label>
                  <select name="id_categoria" value={formData.id_categoria} onChange={handleChange} style={{ width: '100%', padding: '0.75rem', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
                    <option value="">-- Seleccionar Categoría --</option>
                    {categorias.map(cat => (
                      <option key={cat.id_categoria} value={cat.id_categoria}>
                        {cat.nombre_categoria}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="form-group">
                  <label>Código Interno / SKU / Código de Barras</label>
                  <input type="text" name="codigo_barras" value={formData.codigo_barras} onChange={handleChange} required placeholder="Ej: CAL-ZAP-001" />
                </div>
              </div>

              <div className="form-group">
                <label>URL de Fotografía (opcional)</label>
                <input type="url" name="imagen_url" placeholder="https://..." value={formData.imagen_url} onChange={handleChange} />
                {formData.imagen_url && (
                  <div style={{ marginTop: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-light)' }}>Vista previa:</span>
                    <img src={formData.imagen_url} alt="Preview" style={{ height: '36px', borderRadius: '4px', objectFit: 'contain', border: '1px solid #ddd' }} onError={(e) => e.target.style.display = 'none'} />
                  </div>
                )}
              </div>

              <div className="grid-2">
                <div className="form-group">
                  <label>Precio de Compra (COP)</label>
                  <input type="number" name="precio_compra" value={formData.precio_compra} onChange={handleChange} required placeholder="0" />
                </div>
                <div className="form-group">
                  <label>Precio de Venta (COP)</label>
                  <input type="number" name="precio_venta" value={formData.precio_venta} onChange={handleChange} required placeholder="0" />
                </div>
              </div>

              <div className="grid-2">
                <div className="form-group">
                  <label>Stock Físico Inicial</label>
                  <input type="number" name="stock_actual" value={formData.stock_actual} onChange={handleChange} required placeholder="0" />
                </div>
                <div className="form-group">
                  <label>Stock Mínimo (Alerta)</label>
                  <input type="number" name="stock_minimo" value={formData.stock_minimo} onChange={handleChange} required placeholder="5" />
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
    </div>
  );
};

export default Inventario;
