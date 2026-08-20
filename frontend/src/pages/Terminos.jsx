import { Link } from "react-router-dom";
import { ArrowLeft, ShieldCheck, FileText, Scale, Lock, Database, AlertTriangle } from "lucide-react";

const Terminos = () => {
  const sectionStyle = { marginBottom: "1.5rem" };
  const h2Style = { fontSize: "1.05rem", fontWeight: 600, marginBottom: "0.5rem", display: "flex", alignItems: "center", gap: "0.5rem" };
  const pStyle = { fontSize: "0.9rem", color: "var(--text-light)", lineHeight: "1.7", margin: 0 };

  return (
    <div style={{ minHeight: "100vh", background: "var(--bg-main)", display: "flex", justifyContent: "center", padding: "2rem 1rem" }}>
      <div style={{ maxWidth: 760, width: "100%" }}>
        <Link to="/login" style={{ display: "inline-flex", alignItems: "center", gap: "0.4rem", color: "var(--text-light)", textDecoration: "none", fontSize: "0.9rem", marginBottom: "1.5rem" }}>
          <ArrowLeft size={16} /> Volver al inicio de sesión
        </Link>

        <div className="card" style={{ padding: "2rem" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", marginBottom: "1.75rem" }}>
            <div style={{ width: 44, height: 44, borderRadius: "10px", background: "rgba(126,217,87,0.12)", display: "flex", alignItems: "center", justifyContent: "center", color: "#7ed957" }}>
              <FileText size={22} />
            </div>
            <div>
              <h1 style={{ margin: 0, fontSize: "1.4rem", fontWeight: 700 }}>Términos y Condiciones</h1>
              <p style={{ margin: 0, fontSize: "0.82rem", color: "var(--text-light)" }}>Sistema de Ventas POS · Última actualización: 20 de agosto de 2026</p>
            </div>
          </div>

          <div style={sectionStyle}>
            <h2 style={h2Style}><Scale size={18} color="#7ed957" /> 1. Aceptación de los términos</h2>
            <p style={pStyle}>
              Al acceder y utilizar el Sistema de Ventas POS, el usuario acepta cumplir con los presentes Términos y Condiciones.
              Si no está de acuerdo con alguna parte de estos términos, no debe utilizar el sistema.
            </p>
          </div>

          <div style={sectionStyle}>
            <h2 style={h2Style}><ShieldCheck size={18} color="#7ed957" /> 2. Uso del sistema</h2>
            <p style={pStyle}>
              El sistema está diseñado para la gestión de ventas, inventario, clientes, cotizaciones y facturación de un establecimiento comercial.
              El usuario se compromete a utilizar el sistema únicamente para fines comerciales legítimos y de acuerdo con la legislación
              colombiana aplicable, incluyendo las normas de facturación electrónica de la DIAN.
            </p>
          </div>

          <div style={sectionStyle}>
            <h2 style={h2Style}><Lock size={18} color="#7ed957" /> 3. Credenciales y responsabilidad</h2>
            <p style={pStyle}>
              El usuario es responsable de mantener la confidencialidad de sus credenciales de acceso (usuario y contraseña).
              Cualquier actividad realizada con una cuenta registrada es responsabilidad del titular de dicha cuenta.
              Se recomienda cambiar la contraseña periódicamente y no compartir las credenciales con terceros.
            </p>
          </div>

          <div style={sectionStyle}>
            <h2 style={h2Style}><Database size={18} color="#7ed957" /> 4. Datos e información</h2>
            <p style={pStyle}>
              Los datos ingresados en el sistema (productos, clientes, ventas, cotizaciones) son propiedad del establecimiento que los registra.
              El sistema almacena esta información de forma segura en la nube. El usuario es responsable de la veracidad y exactitud
              de la información que ingresa. El sistema no comparte los datos con terceros sin autorización.
            </p>
          </div>

          <div style={sectionStyle}>
            <h2 style={h2Style}><AlertTriangle size={18} color="#7ed957" /> 5. Limitación de responsabilidad</h2>
            <p style={pStyle}>
              El Sistema de Ventas POS se proporciona "tal cual". No se garantiza que el servicio sea ininterrumpido o libre de errores.
              El sistema no se hace responsable por pérdidas de datos debidas a fallos de conexión, cortes de energía o errores del usuario.
              Se recomienda realizar respaldos periódicos de la información.
            </p>
          </div>

          <div style={sectionStyle}>
            <h2 style={h2Style}><Scale size={18} color="#7ed957" /> 6. Modificaciones</h2>
            <p style={pStyle}>
              El sistema se reserva el derecho de modificar estos Términos y Condiciones en cualquier momento.
              Los cambios serán efectivos al momento de su publicación. El uso continuado del sistema después de los cambios
              constituye la aceptación de los nuevos términos.
            </p>
          </div>

          <div style={{ borderTop: "1px solid var(--border-color)", paddingTop: "1.25rem", marginTop: "1.5rem" }}>
            <p style={{ ...pStyle, fontSize: "0.82rem", textAlign: "center" }}>
              © 2026 Sistema de Ventas POS. Todos los derechos reservados.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Terminos;