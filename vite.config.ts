import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { skillApiPlugin } from './server/apiPlugin.mjs';

export default defineConfig({
  plugins: [react(), skillApiPlugin()],
  server: {
    host: '127.0.0.1',
    port: 5173,
    strictPort: false
  },
  preview: {
    host: '127.0.0.1',
    port: 4173
  },
  build: {
    target: 'es2022',
    rollupOptions: {
      output: {
        manualChunks: {
          react: ['react', 'react-dom'],
          three: ['three', 'three/examples/jsm/controls/OrbitControls.js'],
          icons: ['lucide-react']
        }
      }
    }
  }
});
