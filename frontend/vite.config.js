import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  // v2.2.3: base '/' para que assets funcionen en rutas como /tienda/1
  // En GitHub Pages se sobreescribe con GITHUB_ACTIONS
  base: process.env.GITHUB_ACTIONS ? '/sistema-ventas-pos/' : '/',
})
