import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'path';
import { visualizer } from 'rollup-plugin-visualizer';

// https://vitejs.dev/config/
export default defineConfig({
  base: './',
  plugins: [
    react(),
    tailwindcss(),
    visualizer({
      filename: 'dist/stats.html',
      open: false,
      gzipSize: true,
      brotliSize: true,
    }),
  ],
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname || '.', './src'),
    },
  },
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: false,
    host: false,
    headers: {
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'require-corp',
    },
    watch: {
      ignored: ['**/src-tauri/**'],
    },
  },
  preview: {
    headers: {
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'require-corp',
    },
  },
  envPrefix: ['VITE_', 'TAURI_ENV_*'],
  build: {
    target: ['es2022'],
    rollupOptions: {
      output: {
        manualChunks(id: string) {
          if (id.includes('node_modules/react/') || id.includes('node_modules/react-dom/')) {
            return 'vendor-react';
          }
          if (id.includes('node_modules/pixi.js') || id.includes('node_modules/@pixi/')) {
            return 'vendor-pixi';
          }
          if (id.includes('node_modules/zustand')) {
            return 'vendor-zustand';
          }
          if (id.includes('node_modules/lucide-react') || id.includes('node_modules/@tanstack/react-virtual')) {
            return 'vendor-ui';
          }
        },
      },
    },
    chunkSizeWarningLimit: 600, // kB
    minify: 'esbuild',
    sourcemap: false, // production: tắt sourcemap
    cssCodeSplit: true,
  },
});
