import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 3000,
    proxy: {
      '/api': {
        target: process.env.REDISX_GATEWAY_URL || 'http://localhost:4000',
        changeOrigin: true,
      },
      '/health': {
        target: process.env.REDISX_GATEWAY_URL || 'http://localhost:4000',
        changeOrigin: true,
      },
      '/ws': {
        target: process.env.REDISX_GATEWAY_URL || 'ws://localhost:4000',
        ws: true,
      },
    },
  },
  build: {
    chunkSizeWarningLimit: 600,
    rollupOptions: {
      output: {
        onlyExplicitManualChunks: false,
        manualChunks(id) {
          const module = id.replaceAll('\\', '/');
          if (module.includes('commonjsHelpers') || /node_modules\/(react|react-dom|react-router|react-router-dom|scheduler)\//.test(module)) return 'vendor-react';
          if (/node_modules\/(recharts|recharts-scale)\//.test(module)) return 'vendor-charts';
          if (/node_modules\/(@codemirror|@lezer|@uiw\/react-codemirror)\//.test(module)) return 'vendor-codemirror';
          if (module.includes('node_modules/lucide-react/')) return 'vendor-icons';
        },
      },
    },
  },
});
