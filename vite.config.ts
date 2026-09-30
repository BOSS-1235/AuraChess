import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// A plain static build — deploys as-is to Vercel, Netlify, Cloudflare Pages,
// GitHub Pages, or any static host. No server-side code required to run it.
export default defineConfig({
  plugins: [react()],
  worker: {
    format: 'es'
  },
  server: {
    // The API server (npm run dev:server) runs on 8787; same-origin from the browser's point of view.
    proxy: { '/api': 'http://localhost:8787' }
  },
  build: {
    target: 'es2020',
    sourcemap: true
  }
})
