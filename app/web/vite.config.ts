import vue from '@vitejs/plugin-vue';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [vue()],
  server: {
    host: '0.0.0.0',
    port: 5173,
    strictPort: true,
    // Dev-Server ist im LAN erreichbar, Zugriff per Hostname erlauben
    allowedHosts: true,
    proxy: {
      '/api': process.env.API_TARGET ?? 'http://localhost:3000',
    },
  },
});
