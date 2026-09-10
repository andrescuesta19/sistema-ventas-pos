import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  // Base path para GitHub Pages (usa nombre del repo)
  // En producción local/Electron usa './'
  base: process.env.GITHUB_ACTIONS ? '/sistema-ventas-pos/' : './',
})
