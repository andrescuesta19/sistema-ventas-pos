import { useState, useEffect } from 'react';
import { Plus, Trash2, Image as ImageIcon } from 'lucide-react';

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

  useEffect(() => {
    fetchProductos();
  }, []);

  const fetchProductos = async () => {
    const res = await fetch(`http://localhost:3000/api/productos?id_local=${user.id_local}`);
    const data = await res.json();
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
      id_local: user.id_local,
      precio_compra: parseFloat(formData.precio_compra),
      precio_venta: parseFloat(formData.precio_venta),
      stock_actual: parseInt(formData.stock_actual),
      stock_minimo: parseInt(formData.stock_minimo)
    };

    const res = await fetch('http://localhost:3000/api/productos', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

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
      await fetch(`http://localhost:3000/api/productos/${id}`, { method: 'DELETE' });
      fetchProductos();
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
                  <button onClick={() => handleDelete(p.id_producto)} style={{ backgroundColor: 'transparent', border: 'none', color: 'var(--accent-color)', cursor: 'pointer', padding: '0.5rem' }}>
                    <Trash2 size={18} />
                  </button>
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
    </div>
  );
};

export default Inventario;
