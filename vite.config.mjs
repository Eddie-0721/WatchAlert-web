import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import svgr from 'vite-plugin-svgr';

export default defineConfig({
  plugins: [react(), svgr()],
  server: {
    port: 3000,
    proxy: { '/api': { target: process.env.WATCHALERT_API_URL || 'http://localhost:9001', changeOrigin: true } },
  },
  build: { outDir: 'build', sourcemap: false },
  test: { include: ['src/**/*.test.{js,ts,jsx,tsx}'], environment: 'node' },
});
