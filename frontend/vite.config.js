import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  // v2.2.3: base '/' para que assets funcionen en rutas como /tienda/1
  // En GitHub Pages se sobreescribe con GITHUB_ACTIONS
  base: process.env.GITHUB_ACTIONS ? '/sistema-ventas-pos/' : '/',
  build: {
    // v2.2.7: minificación agresiva + eliminación de metadata + división de chunks
    minify: 'terser',
    sourcemap: false,
    terserOptions: {
      compress: {
        drop_console: true,
        drop_debugger: true,
        passes: 2,
        pure_funcs: ['console.log', 'console.info', 'console.debug']
      },
      mangle: { toplevel: true },
      format: { comments: false }
    },
    chunkSizeWarningLimit: 1000,
    rollupOptions: {
      output: {
        // v2.2.7: dividir manualmente para mejor cache + carga inicial más rápida
        manualChunks: {
          'react-vendor': ['react', 'react-dom', 'react-router-dom'],
          'animation-vendor': ['framer-motion'],
          'ui-icons': ['lucide-react']
        },
        entryFileNames: 'assets/[name]-[hash].js',
        chunkFileNames: 'assets/[name]-[hash].js',
        assetFileNames: 'assets/[name]-[hash][extname]',
      }
    }
  }
})
