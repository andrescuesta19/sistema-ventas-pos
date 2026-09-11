-- v2.0.1: Agregar id_usuario_cierre a turnos_caja
ALTER TABLE turnos_caja ADD COLUMN IF NOT EXISTS id_usuario_cierre INTEGER NULL;
ALTER TABLE turnos_caja DROP CONSTRAINT IF EXISTS turnos_caja_id_usuario_cierre_fkey;
ALTER TABLE turnos_caja ADD CONSTRAINT turnos_caja_id_usuario_cierre_fkey 
    FOREIGN KEY (id_usuario_cierre) REFERENCES usuarios(id_usuario);
