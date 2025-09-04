import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path' // Asegúrate de que esta línea esté presente

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
})
