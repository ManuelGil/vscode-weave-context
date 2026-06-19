import path from "path";

import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import vueDevTools from 'vite-plugin-vue-devtools'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    vue(),
    vueDevTools(),
  ],
  resolve: {
    alias: {
      "@src": path.resolve(__dirname, "./src"),

      "@webview": path.resolve(
        __dirname,
        "./webview"
      ),
    },
  },
  build: {
    minify: true,
    rollupOptions: {
      output: {
        entryFileNames: 'main.js',
        assetFileNames: 'main.css',
      },
    },
  },
  worker: {
    format: "es",
  },
})
