import { defineConfig } from 'vite';
import { mapgenPlugin } from './server/mapgen';

export default defineConfig({
  plugins: [mapgenPlugin()],
  server: { port: 5173, host: true },
  build: {
    target: 'es2022',
    sourcemap: true,
    rollupOptions: {
      output: {
        manualChunks: { pixi: ['pixi.js'] },
      },
    },
  },
});
