import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  root: path.resolve(__dirname, 'src/overlay'),
  base: './',
  build: {
    outDir: path.resolve(__dirname, 'dist-overlay'),
    emptyOutDir: true,
  },
  server: {
    port: 6000,
    strictPort: true,
    host: true,
  },
});
