-- v2.1.1: Tracking de instalaciones + Actualizaciones remotas

-- Tabla de instalaciones reportadas por los clientes
CREATE TABLE IF NOT EXISTS instalaciones (
  id SERIAL PRIMARY KEY,
  ip VARCHAR(45),
  sistema_operativo VARCHAR(50),
  hostname VARCHAR(255),
  version_app VARCHAR(20),
  fecha TIMESTAMP DEFAULT NOW(),
  activa BOOLEAN DEFAULT true
);

-- Tabla de actualizaciones publicadas por SuperAdmin
CREATE TABLE IF NOT EXISTS actualizaciones (
  id SERIAL PRIMARY KEY,
  version VARCHAR(20) NOT NULL,
  changelog TEXT,
  url_descarga VARCHAR(500),
  fecha_publicacion TIMESTAMP DEFAULT NOW(),
  activa BOOLEAN DEFAULT true
);
