import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: { '/api': { target: 'http://localhost:5000', changeOrigin: true } }
  },
  // Same proxy for `npm run preview`, so the built app also reaches the
  // backend on localhost:5000. The frontend needs no Atlas config at all —
  // only the backend's server/.env has MONGO_URI.
  preview: {
    port: 5173,
    proxy: { '/api': { target: 'http://localhost:5000', changeOrigin: true } }
  }
})
