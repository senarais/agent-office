import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const proxy = { '/api': `http://127.0.0.1:${process.env.PORT || env.PORT || 3001}` };
  return {
  plugins: [react()],
  server: { host: '127.0.0.1', port: Number(process.env.GAME_PORT || env.GAME_PORT) || 5173, strictPort: true, proxy },
  preview: { host: '127.0.0.1', port: 5173, strictPort: true, proxy },
  build: { rollupOptions: { output: { manualChunks: {
    phaser: ['phaser'],
  } } } },
  };
});
