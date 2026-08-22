import { API_URL } from "../config";
import { useState, useEffect, useCallback } from "react";
import { Globe, Link2, Unlink, RefreshCw, CheckCircle, Clock, AlertCircle, ExternalLink, Store } from "lucide-react";

const PLATAFORMAS = [
  { id: "shopify", nombre: "Shopify", descripcion: "La plataforma lider para crear y gestionar tiendas en linea. Publica tus productos y sincroniza tu inventario automaticamente.", color: "#96BF48", bgColor: "rgba(150,191,72,0.08)", logoText: "S", logoBg: "#96BF48", logoColor: "#fff", requiereToken: true, tokenLabel: "Admin API Access Token", tokenPlaceholder: "shpat_xxx", tokenHelp: "Opcional: agrega el token para sincronizar productos automaticamente." },
  { id: "mercadolibre", nombre: "MercadoLibre", descripcion: "El marketplace lider en America Latina. Llega a millones de compradores en Colombia y el resto de Latinoamerica.", color: "#FFE600", bgColor: "rgba(255,230,0,0.08)", logoText: "ML", logoBg: "#FFE600", logoColor: "#333", requiereToken: false },
  { id: "amazon", nombre: "Amazon", descripcion: "Vende en el marketplace mas grande del mundo. Conecta la URL de tu tienda para tenerla como referencia.", color: "#FF9900", bgColor: "rgba(255,153,0,0.08)", logoText: "a", logoBg: "#FF9900", logoColor: "#fff", requiereToken: false },
  { id: "woocommerce", nombre: "WooCommerce", descripcion: "Plugin de WordPress para convertir tu sitio web en una tienda en linea. Sincroniza productos y pedidos con el POS.", color: "#7F54B3", bgColor: "rgba(127,84,179,0.08)", logoText: "Woo", logoBg: "#7F54B3", logoColor: "#fff", requiereToken: true, tokenLabel: "Consumer Key", tokenPlaceholder: "ck_xxx", tokenLabel2: "Consumer Secret", tokenPlaceholder2: "cs_xxx", tokenHelp: "Crea credenciales REST en WooCommerce > Ajustes > Avanzado > API REST." },
  { id: "vtex", nombre: "VTEX", descripcion: "Plataforma de comercio digital empresarial con soluciones omnicanal.", color: "#F71963", bgColor: "rgba(247,25,99,0.08)", logoText: "VTX", logoBg: "#F71963", logoColor: "#fff", requiereToken: false },
  { id: "wix", nombre: "Wix", descripcion: "Crea tu tienda online con plantillas profesionales. Sincroniza tu catalogo del POS.", color: "#0C6EFC", bgColor: "rgba(12,110,252,0.08)", logoText: "Wix", logoBg: "#0C6EFC", logoColor: "#fff", requiereToken: false },
  { id: "aliexpress", nombre: "AliExpress", descripcion: "Plataforma global de comercio. Conecta la URL de tu tienda para tenerla como referencia.", color: "#E43226", bgColor: "rgba(228,50,38,0.08)", logoText: "Ali", logoBg: "#E43226", logoColor: "#fff", requiereToken: false }
];

const Ecommerce = ({ user }) => {
  const [integraciones, setIntegraciones] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showConectar, setShowConectar] = useState(false);
  const [plataformaSel, setPlataformaSel] = useState(null);
  const [urlTienda, setUrlTienda] = useState("");
  const [nombreTienda, setNombreTienda] = useState("");
  const [accessToken, setAccessToken] = useState("");
  const [consumerKey, setConsumerKey] = useState("");
  const [consumerSecret, setConsumerSecret] = useState("");
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

  const abrirConectar = (plat) => {
    setPlataformaSel(plat);
    setUrlTienda(""); setNombreTienda(""); setAccessToken(""); setConsumerKey(""); setConsumerSecret("");
    setShowConectar(true);
  };

  const conectarTienda = async (e) => {
    e.preventDefault();
    setConectando(true);
    try {
      const body = { plataforma: plataformaSel.id, url_tienda: urlTienda, nombre_tienda: nombreTienda || undefined };
      if (plataformaSel.id === "shopify" && accessToken) body.access_token = accessToken;
      if (plataformaSel.id === "woocommerce" && consumerKey && consumerSecret) { body.consumer_key = consumerKey; body.consumer_secret = consumerSecret; }
      const res = await fetch(API_URL + "/api/ecommerce/conectar", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: "Bearer " + token },
        body: JSON.stringify(body)
      });
      const data = await res.json();
      if (res.ok) {
        setShowConectar(false);
        fetchIntegraciones();
        // Mostrar resultado de sincronización automática
        if (data.sync && data.sync.productos_total > 0) {
          showToast(`Tienda conectada. ${data.sync.productos_sincronizados}/${data.sync.productos_total} productos sincronizados.`);
          if (data.sync.errores > 0) {
            setTimeout(() => showToast(`${data.sync.errores} productos tuvieron error al sincronizar.`, "warning"), 1500);
          }
        } else {
          showToast("Tienda conectada exitosamente.");
        }
      }
      else showToast(data.error || "Error al conectar", "error");
    } catch { showToast("Error de conexion", "error"); }
    finally { setConectando(false); }
  };

  const desconectar = async (id, nombre) => {
    if (!confirm("Desconectar la tienda " + nombre + "?")) return;
    try {
      const res = await fetch(API_URL + "/api/ecommerce/integraciones/" + id, { method: "DELETE", headers: { Authorization: "Bearer " + token } });
      if (res.ok) { showToast("Tienda desconectada."); fetchIntegraciones(); }
    } catch { showToast("Error al desconectar", "error"); }
  };

  const sincronizar = async (int) => {
    setSyncing(int.id); setSyncResult(null);
    try {
      const endpoint = int.plataforma === "woocommerce" ? "/api/ecommerce/woocommerce/sync-productos" : "/api/ecommerce/shopify/sync-productos";
      const res = await fetch(API_URL + endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: "Bearer " + token },
        body: JSON.stringify({ integracion_id: int.id })
      });
      const data = await res.json();
      setSyncResult(data);
      if (res.ok) showToast(data.sincronizados + " de " + data.total + " productos sincronizados.");
      else showToast(data.error || "Error al sincronizar", "error");
    } catch { showToast("Error de sincronizacion", "error"); }
    finally { setSyncing(null); }
  };

  const puedeSincronizar = (plataforma) => plataforma === "shopify" || plataforma === "woocommerce";

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

      {integraciones.length > 0 && (
        <div className="card" style={{ marginBottom: "2rem" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "1rem" }}>
            <CheckCircle size={18} color="#22c55e" />
            <p style={{ margin: 0, fontSize: "0.95rem" }}>Tiendas conectadas</p>
          </div>
          {integraciones.map(t => {
            const plat = PLATAFORMAS.find(p => p.id === t.plataforma);
            return (
              <div key={t.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "1rem 1.25rem", borderRadius: "10px", border: "1px solid #dcfce7", backgroundColor: "#f0fdf4", marginBottom: "0.5rem", flexWrap: "wrap", gap: "0.75rem" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "1rem" }}>
                  <div style={{ width: 36, height: 36, borderRadius: "8px", background: plat ? plat.logoBg : "#e2e8f0", display: "flex", alignItems: "center", justifyContent: "center", color: plat ? plat.logoColor : "#64748b", fontWeight: 700, fontSize: "0.85rem" }}>{plat ? plat.logoText : "?"}</div>
                  <div>
                    <p style={{ margin: 0, fontWeight: 500 }}>{t.nombre_tienda}</p>
                    <p style={{ margin: 0, fontSize: "0.8rem", color: "var(--text-light)" }}>{t.shop_domain}</p>
                  </div>
                </div>
                <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
                  {puedeSincronizar(t.plataforma) && (
                    <button onClick={() => sincronizar(t)} disabled={syncing === t.id} className="btn-secondary" style={{ display: "flex", alignItems: "center", gap: "0.4rem", fontSize: "0.85rem", padding: "0.5rem 0.9rem" }}>
                      <RefreshCw size={14} style={{ animation: syncing === t.id ? "spin 1s linear infinite" : "none" }} />
                      {syncing === t.id ? "Sincronizando..." : "Sincronizar productos"}
                    </button>
                  )}
                  <button onClick={() => desconectar(t.id, t.nombre_tienda)} style={{ display: "flex", alignItems: "center", gap: "0.4rem", fontSize: "0.85rem", padding: "0.5rem 0.9rem", background: "transparent", border: "1px solid #fca5a5", color: "#dc2626", borderRadius: "8px", cursor: "pointer" }}>
                    <Unlink size={14} /> Desconectar
                  </button>
                </div>
              </div>
            );
          })}
          {syncResult && (
            <div style={{ marginTop: "0.75rem", padding: "0.75rem 1rem", borderRadius: "8px", background: "#f8fafc", border: "1px solid var(--border-color)", fontSize: "0.85rem", color: "var(--text-light)" }}>
              Resultado: {syncResult.sincronizados}/{syncResult.total} productos publicados.
              {syncResult.errores?.length > 0 && <span style={{ color: "#dc2626" }}> Errores: {syncResult.errores.join(", ")}</span>}
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
              {yaConectada && (
                <div style={{ position: "absolute", top: "1rem", right: "1rem", fontSize: "0.7rem", fontWeight: 600, padding: "0.2rem 0.6rem", borderRadius: "20px", backgroundColor: "#dcfce7", color: "#166534" }}>Conectada</div>
              )}
              <div style={{ display: "flex", alignItems: "center", gap: "1rem" }}>
                <div style={{ width: 44, height: 44, borderRadius: "10px", background: plat.logoBg, display: "flex", alignItems: "center", justifyContent: "center", color: plat.logoColor, fontSize: "1rem", fontWeight: 800, flexShrink: 0 }}>{plat.logoText}</div>
                <p style={{ margin: 0, fontSize: "1.05rem", fontWeight: 600 }}>{plat.nombre}</p>
              </div>
              <p style={{ margin: 0, fontSize: "0.85rem", color: "var(--text-light)", lineHeight: "1.5" }}>{plat.descripcion}</p>
              <div style={{ marginTop: "auto", paddingTop: "0.5rem" }}>
                <button onClick={() => abrirConectar(plat)} disabled={yaConectada}
                  style={{ width: "100%", padding: "0.65rem 1rem", borderRadius: "8px", border: "none", cursor: yaConectada ? "default" : "pointer", backgroundColor: yaConectada ? plat.color + "20" : plat.color, color: yaConectada ? plat.color : "#fff", fontWeight: 600, fontSize: "0.9rem", display: "flex", alignItems: "center", justifyContent: "center", gap: "0.5rem" }}>
                  <Link2 size={16} />
                  {yaConectada ? "Ya conectada" : "Conectar tienda"}
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {showConectar && plataformaSel && (
        <div className="modal-overlay">
          <div className="modal-content" style={{ maxWidth: 480 }}>
            <div className="modal-header">
              <h2>{plataformaSel.nombre} - Conectar tienda</h2>
              <button className="close-btn" onClick={() => setShowConectar(false)}>x</button>
            </div>
            <form onSubmit={conectarTienda}>
              <div style={{ marginBottom: "1rem" }}>
                <label style={{ display: "block", marginBottom: "0.4rem", fontSize: "0.9rem" }}>URL de tu tienda</label>
                <input type="text" value={urlTienda} onChange={e => setUrlTienda(e.target.value)} placeholder={plataformaSel.id === "shopify" ? "mi-tienda.myshopify.com" : "https://tu-tienda.com"} required style={{ width: "100%" }} />
              </div>
              <div style={{ marginBottom: "1rem" }}>
                <label style={{ display: "block", marginBottom: "0.4rem", fontSize: "0.9rem" }}>Nombre de la tienda (opcional)</label>
                <input type="text" value={nombreTienda} onChange={e => setNombreTienda(e.target.value)} placeholder="Mi Tienda" style={{ width: "100%" }} />
              </div>
              {plataformaSel.requiereToken && (
                <>
                  <div style={{ marginBottom: "1rem" }}>
                    <label style={{ display: "block", marginBottom: "0.4rem", fontSize: "0.9rem" }}>{plataformaSel.tokenLabel} (opcional)</label>
                    <input type="password" value={accessToken} onChange={e => setAccessToken(e.target.value)} placeholder={plataformaSel.tokenPlaceholder} style={{ width: "100%" }} />
                  </div>
                  {plataformaSel.tokenLabel2 && (
                    <div style={{ marginBottom: "1rem" }}>
                      <label style={{ display: "block", marginBottom: "0.4rem", fontSize: "0.9rem" }}>{plataformaSel.tokenLabel2} (opcional)</label>
                      <input type="password" value={consumerSecret} onChange={e => setConsumerSecret(e.target.value)} placeholder={plataformaSel.tokenPlaceholder2} style={{ width: "100%" }} />
                    </div>
                  )}
                  <p style={{ fontSize: "0.78rem", color: "var(--text-light)", marginTop: "0.3rem", marginBottom: "1rem" }}>{plataformaSel.tokenHelp}</p>
                </>
              )}
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