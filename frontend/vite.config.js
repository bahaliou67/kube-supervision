// Configuration Vite. En développement, /api est redirigé vers le backend
// (port KUBE_SUPERVISION_PORT, 7420 par défaut).
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const portBackend = process.env.KUBE_SUPERVISION_PORT || 7420;

export default defineConfig({
  plugins: [react()],
  server: {
    host: '127.0.0.1',
    port: 5173,
    proxy: {
      '/api': {
        target: `http://127.0.0.1:${portBackend}`,
        changeOrigin: false,
      },
    },
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
});
