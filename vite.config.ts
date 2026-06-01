import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';
import fs from 'fs';

export default defineConfig({
  plugins: [
    react(),
    {
      name: 'copy-manifest',
      closeBundle() {
        const srcPath = resolve(__dirname, 'src/manifest.json');
        const destPath = resolve(__dirname, 'dist/manifest.json');
        
        // Ensure dist directory exists
        if (!fs.existsSync(resolve(__dirname, 'dist'))) {
          fs.mkdirSync(resolve(__dirname, 'dist'));
        }
        
        if (fs.existsSync(srcPath)) {
          fs.copyFileSync(srcPath, destPath);
          console.log('[Vite Copy Plugin] Copied manifest.json to dist/');
        } else {
          console.error('[Vite Copy Plugin] src/manifest.json not found!');
        }
      }
    }
  ],
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    rollupOptions: {
      input: {
        popup: resolve(__dirname, 'src/popup/popup.html'),
        options: resolve(__dirname, 'src/options/options.html'),
        background: resolve(__dirname, 'src/background.ts'),
        content: resolve(__dirname, 'src/content.ts'),
      },
      output: {
        // Output background and content scripts as clean root-level files
        entryFileNames: (chunkInfo) => {
          if (chunkInfo.name === 'background' || chunkInfo.name === 'content') {
            return '[name].js';
          }
          return 'assets/[name]-[hash].js';
        },
        chunkFileNames: 'assets/[name]-[hash].js',
        assetFileNames: 'assets/[name]-[hash].[ext]'
      }
    }
  }
});
