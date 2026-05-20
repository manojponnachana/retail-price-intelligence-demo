import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig(({ mode }) => ({
  plugins: [react()],
  server: {
    port: 3000,
    // Development proxy — only active during npm run dev
    proxy: {
      '/api': {
        target: 'http://localhost:8000',
        changeOrigin: true,
      }
    }
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
    rollupOptions: {
      output: {
        // Split vendor chunks for better caching
        manualChunks: {
          vendor:  ['react', 'react-dom'],
          query:   ['@tanstack/react-query'],
          table:   ['@tanstack/react-table'],
          plotly:  ['plotly.js-dist-min'],
        }
      }
    }
  }
}))
