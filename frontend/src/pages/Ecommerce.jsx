import { API_URL } from "../config";
import { useState, useEffect, useCallback } from "react";
import { Globe, Link2, Unlink, RefreshCw, CheckCircle, Clock, AlertCircle, ExternalLink } from "lucide-react";

const PLATAFORMAS = [
  { id: "shopify", nombre: "Shopify", descripcion: "La plataforma lider para crear y gestionar tiendas en linea. Publica tus productos y sincroniza tu inventario automaticamente.", color: "#96BF48", bgColor: "rgba(150,191,72,0.08)", activa: true, logoText: "S", logoBg: "#96BF48", logoColor: "#fff" },
  { id: "mercadolibre", nombre: "MercadoLibre", descripcion: "El marketplace lider en America Latina. Llega a millones de compradores en Colombia y el resto de Latinoamerica.", color: "#FFE600", bgColor: "rgba(255,230,0,0.08)", activa: false, logoText: "ML", logoBg: "#FFE600", logoColor: "#333" },
  { id: "amazon", nombre: "Amazon", descripcion: "Vende en el marketplace mas grande del mundo. Gestiona tu inventario y recibe pedidos directamente en el POS.", color: "#FF9900", bgColor: "rgba(255,153,0,0.08)", activa: false, logoText: "a", logoBg: "#FF9900", logoColor: "#fff" },
  { id: "woocommerce", nombre: "WooCommerce", descripcion: "Plugin de WordPress para convertir tu sitio web en una tienda en linea. Sincroniza productos y pedidos con el POS.", color: "#7F54B3", bgColor: "rgba(127,84,179,0.08)", activa: false, logoText: "Woo", logoBg: "#7F54B3", logoColor: "#fff" },
  { id: "vtex", nombre: "VTEX", descripcion: "Plataforma de comercio digital empresarial con soluciones omnicanal.", color: "#F71963", bgColor: "rgba(247,25,99,0.08)", activa: false, logoText: "VTX", logoBg: "#F71963", logoColor: "#fff" },
  { id: "wix", nombre: "Wix", descripcion: "Crea tu tienda online con plantillas profesionales. Sincroniza tu catalogo del POS.", color: "#0C6EFC", bgColor: "rgba(12,110,252,0.08)", activa: false, logoText: "Wix", logoBg: "#0C6EFC", logoColor: "#fff" },
  { id: "aliexpress", nombre: "AliExpress", descripcion: "Plataforma global de comercio. Vende tus productos a compradores internacionales.", color: "#E43226", bgColor: "rgba(228,50,38,0.08)", activa: false, logoText: "Ali", logoBg: "#E43226", logoColor: "#fff" }
];

const Ecommerce = ({ user }) => {
  const [integraciones, setIntegraciones] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showConectar, setShowConectar] = useState(false);
  const [shopifyDomain, setShopifyDomain] = useState("");
  const [shopifyToken, setShopifyToken] = useState("");
  const [conectando, setConectando] = useState(false);
  const [syncing, setSyncing] = useState(null);
  const [syncResult, setSyncResult] = useState(null);
  const [toast, setToast] = useState(null);

  const token = localStorage.getItem("pos_token") || sessionStorage.getItem("pos_token");

  const showToast = (msg, type = "success") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 4000);
  };

  const fetchIntegraciones = useCallback(async () => {
    try {
      const res = await fetch(API_URL + "/api/ecommerce/integraciones", { headers: { Authorization: "Bearer " + token } });
      const data = await res.json();
      setIntegraciones(Array.isArray(data) ? data : []);
    } catch { setIntegraciones([]); }
    finally { setLoading(false); }
  }, [token]);

  useEffect(() => { fetchIntegraciones(); }, [fetchIntegraciones]);

  const conectarShopify = async (e) => {
    e.preventDefault();
    setConectando(true);
    try {
      const res = await fetch(API_URL + "/api/ecommerce/shopify/conectar", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: "Bearer " + token },
        body: JSON.stringify({ shop_domain: shopifyDomain, access_token: shopifyToken })
      });
      const data = await res.json();
      if (res.ok) { showToast("Tienda conectada exitosamente."); setShowConectar(false); setShopifyDomain(""); setShopifyToken(""); fetchIntegraciones(); }
      else showToast(data.error || "Error al conectar", "error");
    } catch { showToast("Error de conexion", "error"); }
    finally { setConectando(false); }
  };

  const desconectar = async (id, nombre) => {
    if (!confirm("Desconectar la tienda??")) return;
    try {
      const res = await fetch(API_URL + "/api/ecommerce/integraciones/" + id, { method: "DELETE", headers: { Authorization: "Bearer " + token } });
      if (res.ok) { showToast("Tienda desconectada."); fetchIntegraciones(); }
    } catch { showToast("Error al desconectar", "error"); }
  };

  const sincronizar = async (intId) => {
    setSyncing(intId); setSyncResult(null);
    try {
      const res = await fetch(API_URL + "/api/ecommerce/shopify/sync-productos", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: "Bearer " + token },
        body: JSON.stringify({ integracion_id: intId })
      });
      const data = await res.json();
      setSyncResult(data);
      if (res.ok) showToast(data.sincronizados + " de " + data.total + " productos sincronizados.");
      else showToast(data.error || "Error al sincronizar", "error");
    } catch { showToast("Error de sincronizacion", "error"); }
    finally { setSyncing(null); }
  };

  const shopifyConectada = integraciones.filter(i => i.plataforma === "shopify");

  const cardStyle = {
    display: "flex", flexDirection: "column", gap: "1rem",
    transition: "box-shadow 0.2s, transform 0.2s", position: "relative", overflow: "hidden"
  };

  return (
    <div className="page-content">
      {toast && (
        <div style={{ position: "fixed", top: "1.5rem", right: "1.5rem", zIndex: 9999, padding: "0.9rem 1.4rem", borderRadius: "10px", backgroundColor: toast.type === "error" ? "#fef2f2" : "#f0fdf4", border: "1px solid " + (toast.type === "error" ? "#fecaca" : "#bbf7d0"), color: toast.type === "error" ? "#dc2626" : "#166534", boxShadow: "0 4px 24px rgba(0,0,0,0.1)", display: "flex", alignItems: "center", gap: "0.6rem" }}>
          {toast.type === "error" ? <AlertCircle size={18} /> : <CheckCircle size={18} />}
          {toast.msg}
        </div>
      )}

      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "1.75rem" }}>
        <div>
          <h1 className="page-title" style={{ marginBottom: "0.25rem" }}>Canales de Venta</h1>
          <p style={{ color: "var(--text-light)", fontSize: "0.9rem", margin: 0 }}>Conecta tus tiendas en linea para centralizar ventas e inventario.</p>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", color: "var(--text-light)", fontSize: "0.85rem" }}>
          <Globe size={16} />
          <span>{integraciones.length} tienda{integraciones.length !== 1 ? "s" : ""} conectada{integraciones.length !== 1 ? "s" : ""}</span>
        </div>
      </div>

      {shopifyConectada.length > 0 && (
        <div className="card" style={{ marginBottom: "2rem" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "1rem" }}>
            <CheckCircle size={18} color="#22c55e" />
            <p style={{ margin: 0, fontSize: "0.95rem" }}>Tiendas conectadas</p>
          </div>
          {shopifyConectada.map(t => (
            <div key={t.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "1rem 1.25rem", borderRadius: "10px", border: "1px solid #dcfce7", backgroundColor: "#f0fdf4", marginBottom: "0.5rem" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "1rem" }}>
                <div style={{ width: 36, height: 36, borderRadius: "8px", background: "#96BF48", display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontWeight: 700 }}>S</div>
                <div>
                  <p style={{ margin: 0, fontWeight: 500 }}>{t.nombre_tienda}</p>
                  <p style={{ margin: 0, fontSize: "0.8rem", color: "var(--text-light)" }}>{t.shop_domain}</p>
                </div>
              </div>
              <div style={{ display: "flex", gap: "0.5rem" }}>
                <button onClick={() => sincronizar(t.id)} disabled={syncing === t.id} className="btn-secondary" style={{ display: "flex", alignItems: "center", gap: "0.4rem", fontSize: "0.85rem", padding: "0.5rem 0.9rem" }}>
                  <RefreshCw size={14} style={{ animation: syncing === t.id ? "spin 1s linear infinite" : "none" }} />
                  {syncing === t.id ? "Sincronizando..." : "Sincronizar productos"}
                </button>
                <button onClick={() => desconectar(t.id, t.nombre_tienda)} style={{ display: "flex", alignItems: "center", gap: "0.4rem", fontSize: "0.85rem", padding: "0.5rem 0.9rem", background: "transparent", border: "1px solid #fca5a5", color: "#dc2626", borderRadius: "8px", cursor: "pointer" }}>
                  <Unlink size={14} /> Desconectar
                </button>
              </div>
            </div>
          ))}
          {syncResult && (
            <div style={{ marginTop: "0.75rem", padding: "0.75rem 1rem", borderRadius: "8px", background: "#f8fafc", border: "1px solid var(--border-color)", fontSize: "0.85rem", color: "var(--text-light)" }}>
              Resultado: {syncResult.sincronizados}/{syncResult.total} productos publicados en Shopify.
            </div>
          )}
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: "1.25rem" }}>
        {PLATAFORMAS.map(plat => {
          const yaConectada = integraciones.some(i => i.plataforma === plat.id);
          return (
            <div key={plat.id} className="card"
              style={{ ...cardStyle, border: yaConectada ? "1.5px solid " + plat.color + "40" : "1px solid var(--border-color)", backgroundColor: yaConectada ? plat.bgColor : "var(--bg-card)" }}
              onMouseEnter={e => { e.currentTarget.style.transform = "translateY(-2px)"; e.currentTarget.style.boxShadow = "0 8px 24px rgba(0,0,0,0.08)"; }}
              onMouseLeave={e => { e.currentTarget.style.transform = "translateY(0)"; e.currentTarget.style.boxShadow = "none"; }}
            >
              {!plat.activa && !yaConectada && (
                <div style={{ position: "absolute", top: "1rem", right: "1rem", fontSize: "0.7rem", fontWeight: 600, padding: "0.2rem 0.6rem", borderRadius: "20px", backgroundColor: "#f1f5f9", color: "#64748b" }}>Proximamente</div>
              )}
              {yaConectada && (
                <div style={{ position: "absolute", top: "1rem", right: "1rem", fontSize: "0.7rem", fontWeight: 600, padding: "0.2rem 0.6rem", borderRadius: "20px", backgroundColor: "#dcfce7", color: "#166534" }}>Conectada</div>
              )}
              <div style={{ display: "flex", alignItems: "center", gap: "1rem" }}>
                <div style={{ width: 44, height: 44, borderRadius: "10px", background: plat.logoBg, display: "flex", alignItems: "center", justifyContent: "center", color: plat.logoColor, fontSize: "1rem", fontWeight: 800, flexShrink: 0 }}>{plat.logoText}</div>
                <p style={{ margin: 0, fontSize: "1.05rem", fontWeight: 600 }}>{plat.nombre}</p>
              </div>
              <p style={{ margin: 0, fontSize: "0.85rem", color: "var(--text-light)", lineHeight: "1.5" }}>{plat.descripcion}</p>
              <div style={{ marginTop: "auto", paddingTop: "0.5rem" }}>
                {plat.activa ? (
                  <button onClick={() => setShowConectar(true)} disabled={yaConectada}
                    style={{ width: "100%", padding: "0.65rem 1rem", borderRadius: "8px", border: "none", cursor: yaConectada ? "default" : "pointer", backgroundColor: yaConectada ? plat.color + "20" : plat.color, color: yaConectada ? plat.color : "#fff", fontWeight: 600, fontSize: "0.9rem", display: "flex", alignItems: "center", justifyContent: "center", gap: "0.5rem" }}>
                    <Link2 size={16} />
                    {yaConectada ? "Ya conectada" : "Conectar tienda"}
                  </button>
                ) : (
                  <button disabled style={{ width: "100%", padding: "0.65rem 1rem", borderRadius: "8px", border: "1px solid #e2e8f0", background: "#f8fafc", color: "#94a3b8", fontSize: "0.9rem", cursor: "not-allowed", display: "flex", alignItems: "center", justifyContent: "center", gap: "0.5rem" }}>
                    <Clock size={16} /> Disponible proximamente
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {showConectar && (
        <div className="modal-overlay">
          <div className="modal-content" style={{ maxWidth: 480 }}>
            <div className="modal-header">
              <h2>Shopify - Conectar tienda</h2>
              <button className="close-btn" onClick={() => setShowConectar(false)}>x</button>
            </div>
            <p style={{ color: "var(--text-light)", fontSize: "0.87rem", lineHeight: "1.5", marginBottom: "1rem" }}>
              Necesitas un <strong>Custom App Token</strong> con permisos de lectura y escritura en Productos e Inventario.
              <a href="https://help.shopify.com/es/manual/apps/app-types/custom-apps" target="_blank" rel="noopener noreferrer" style={{ color: "#96BF48", display: "inline-flex", alignItems: "center", gap: "0.3rem", marginLeft: "0.3rem" }}>
                Ver guia <ExternalLink size={12} />
              </a>
            </p>
            <form onSubmit={conectarShopify}>
              <div style={{ marginBottom: "1rem" }}>
                <label style={{ display: "block", marginBottom: "0.4rem", fontSize: "0.9rem" }}>Dominio de tu tienda</label>
                <input type="text" value={shopifyDomain} onChange={e => setShopifyDomain(e.target.value)} placeholder="mi-tienda.myshopify.com" required style={{ width: "100%" }} />
              </div>
              <div style={{ marginBottom: "1.5rem" }}>
                <label style={{ display: "block", marginBottom: "0.4rem", fontSize: "0.9rem" }}>Admin API Access Token</label>
                <input type="password" value={shopifyToken} onChange={e => setShopifyToken(e.target.value)} placeholder="shpat_xxx" required style={{ width: "100%" }} />
                <p style={{ fontSize: "0.78rem", color: "var(--text-light)", marginTop: "0.3rem" }}>El token se guarda de forma segura.</p>
              </div>
              <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.75rem" }}>
                <button type="button" className="btn-secondary" onClick={() => setShowConectar(false)}>Cancelar</button>
                <button type="submit" className="btn-primary" disabled={conectando}>{conectando ? "Verificando..." : "Conectar tienda"}</button>
              </div>
            </form>
          </div>
        </div>
      )}
      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
    </div>
  );
};

export default Ecommerce;
