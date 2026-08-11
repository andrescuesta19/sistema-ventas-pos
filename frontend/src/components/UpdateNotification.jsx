import { useEffect, useState } from 'react';
import { Download, CheckCircle, X, AlertCircle, RefreshCw } from 'lucide-react';

/**
 * Componente flotante que muestra el estado de las actualizaciones.
 * Solo se muestra si la app está corriendo en Electron y tiene la API de update.
 */
const UpdateNotification = () => {
  const [visible, setVisible] = useState(false);
  const [status, setStatus] = useState('idle'); // idle | checking | available | downloading | downloaded | error
  const [progress, setProgress] = useState(0);
  const [version, setVersion] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    if (typeof window === 'undefined' || !window.electronAPI?.onUpdateAvailable) {
      return; // No estamos en Electron o no hay update API
    }

    const unsubChecking = window.electronAPI.onUpdateChecking(() => {
      setStatus('checking');
      setVisible(true);
    });

    const unsubAvailable = window.electronAPI.onUpdateAvailable((info) => {
      setStatus('available');
      setVersion(info?.version || '');
      setVisible(true);
    });

    const unsubProgress = window.electronAPI.onUpdateProgress((p) => {
      setStatus('downloading');
      setProgress(Math.round(p?.percent || 0));
      setVisible(true);
    });

    const unsubDownloaded = window.electronAPI.onUpdateDownloaded((info) => {
      setStatus('downloaded');
      setVersion(info?.version || '');
      setVisible(true);
    });

    return () => {
      unsubChecking?.();
      unsubAvailable?.();
      unsubProgress?.();
      unsubDownloaded?.();
    };
  }, []);

  if (!visible) return null;

  const handleUpdate = () => {
    if (status === 'downloaded') {
      window.electronAPI?.installUpdate?.();
    } else if (status === 'available') {
      window.electronAPI?.downloadUpdate?.();
    }
  };

  const handleClose = () => {
    setVisible(false);
  };

  const handleCheck = async () => {
    setStatus('checking');
    setError('');
    try {
      await window.electronAPI?.checkForUpdates?.();
    } catch (err) {
      setError(err.message || 'Error');
      setStatus('error');
    }
  };

  // Solo mostrar si hay algo interesante
  if (status === 'idle' || status === 'checking') {
    if (status === 'checking') {
      return (
        <div style={styles.toast}>
          <RefreshCw size={20} color="var(--green-primary)" className="spin" />
          <div style={{ flex: 1 }}>
            <div style={styles.title}>Buscando actualizaciones…</div>
          </div>
        </div>
      );
    }
    return null;
  }

  if (status === 'available') {
    return (
      <div style={styles.toast}>
        <Download size={20} color="var(--green-primary)" />
        <div style={{ flex: 1 }}>
          <div style={styles.title}>¡Actualización disponible!</div>
          <div style={styles.sub}>Versión {version} lista para descargar</div>
        </div>
        <button style={styles.btn} onClick={handleUpdate}>Descargar</button>
        <button style={styles.btnClose} onClick={handleClose}><X size={14} /></button>
      </div>
    );
  }

  if (status === 'downloading') {
    return (
      <div style={styles.toast}>
        <Download size={20} color="var(--green-primary)" />
        <div style={{ flex: 1 }}>
          <div style={styles.title}>Descargando actualización…</div>
          <div style={styles.progressBar}>
            <div style={{ ...styles.progressFill, width: `${progress}%` }} />
          </div>
          <div style={styles.sub}>{progress}%</div>
        </div>
        <button style={styles.btnClose} onClick={handleClose}><X size={14} /></button>
      </div>
    );
  }

  if (status === 'downloaded') {
    return (
      <div style={styles.toast}>
        <CheckCircle size={20} color="var(--green-primary)" />
        <div style={{ flex: 1 }}>
          <div style={styles.title}>Actualización lista</div>
          <div style={styles.sub}>v{version} se instalará al reiniciar</div>
        </div>
        <button style={styles.btn} onClick={handleUpdate}>Reiniciar</button>
        <button style={styles.btnClose} onClick={handleClose}><X size={14} /></button>
      </div>
    );
  }

  if (status === 'error') {
    return (
      <div style={styles.toast}>
        <AlertCircle size={20} color="#dc2626" />
        <div style={{ flex: 1 }}>
          <div style={styles.title}>Error de actualización</div>
          <div style={styles.sub}>{error}</div>
        </div>
        <button style={styles.btn} onClick={handleCheck}>Reintentar</button>
        <button style={styles.btnClose} onClick={handleClose}><X size={14} /></button>
      </div>
    );
  }

  return null;
};

const styles = {
  toast: {
    position: 'fixed',
    bottom: '1.5rem',
    right: '1.5rem',
    zIndex: 9999,
    display: 'flex',
    alignItems: 'center',
    gap: '0.75rem',
    padding: '0.85rem 1rem',
    background: 'white',
    border: '1px solid #e5eae7',
    borderRadius: '12px',
    boxShadow: '0 8px 32px rgba(0, 0, 0, 0.12)',
    minWidth: '320px',
    maxWidth: '420px'
  },
  title: {
    fontWeight: 600,
    fontSize: '0.9rem',
    color: '#0a2818'
  },
  sub: {
    fontSize: '0.78rem',
    color: '#6b7c70',
    marginTop: '0.1rem'
  },
  btn: {
    padding: '0.45rem 0.9rem',
    fontSize: '0.8rem',
    fontWeight: 600,
    color: 'white',
    background: 'var(--green-primary)',
    border: 'none',
    borderRadius: '8px',
    cursor: 'pointer',
    whiteSpace: 'nowrap'
  },
  btnClose: {
    padding: '0.35rem',
    background: 'transparent',
    border: 'none',
    cursor: 'pointer',
    color: '#9aa8a0',
    borderRadius: '6px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center'
  },
  progressBar: {
    height: '4px',
    background: '#eef2f0',
    borderRadius: '2px',
    overflow: 'hidden',
    marginTop: '0.3rem'
  },
  progressFill: {
    height: '100%',
    background: 'var(--green-primary)',
    transition: 'width 0.3s ease'
  }
};

export default UpdateNotification;
