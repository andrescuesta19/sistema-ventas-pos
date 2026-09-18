import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  // v2.2.3: base '/' para que assets funcionen en rutas como /tienda/1
  // En GitHub Pages se sobreescribe con GITHUB_ACTIONS
  base: process.env.GITHUB_ACTIONS ? '/sistema-ventas-pos/' : '/',
  build: {
    // v2.2.7: minificación estándar (suficiente). 'esbuild' es nativo y mucho
    // más rápido que terser. Eliminar terser reduce el tiempo de build
    // y la carga inicial.
    minify: 'esbuild',
    sourcemap: false,
    // v2.2.7: BUNDLE UNICO. Dividir en chunks (react-vendor, animation-vendor)
    // suena bien en teoria pero en localhost causa multiples requests HTTP
    // por cada navegación, lo que se siente lento. Con un solo bundle el
    // navegador lo lee de una vez (HTTP/2) sin fragmentación.
    chunkSizeWarningLimit: 1500,
    rollupOptions: {
      output: {
        entryFileNames: 'assets/[name]-[hash].js',
        chunkFileNames: 'assets/[name]-[hash].js',
        assetFileNames: 'assets/[name]-[hash][extname]',
      }
    }
  }
})
