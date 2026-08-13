import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  base: '/',
  plugins: [react()],
  build: {
    emptyOutDir: false,
    minify: 'terser',
    terserOptions: {
      compress: {
        drop_console: true,
        drop_debugger: true,
        passes: 2,
      },
      mangle: {
        toplevel: true,
        eval: true,
      },
      format: {
        comments: false,
      },
    },
    rollupOptions: {
      input: {
        main: './index.html',
        portal: './portal.html',
        teknisi: './teknisi.html',
        kolektor: './kolektor.html',
      },
      output: {
        entryFileNames: `assets/[name].[hash].js`,
        chunkFileNames: `assets/[name].[hash].js`,
        assetFileNames: `assets/[name].[hash].[ext]`
      }
    }
  },
  server: {
    port: 3000,
    proxy: {
      '/api': 'http://localhost:5001'
    }
  },
  preview: {
    proxy: {
      '/api': 'http://localhost:5001'
    }
  }
})
