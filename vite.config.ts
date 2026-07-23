import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import legacy from '@vitejs/plugin-legacy'
import path from 'path' // Asegúrate de que esta línea esté presente

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    react(),
    // Compatibilidad con Android WebView viejos (spinner infinito al abrir):
    // el build por defecto de Vite emite es2020 (p.ej. `??` de react-dom y
    // firestore) SIN transpilar — un WebView < Chrome 80 lanza SyntaxError al
    // parsear el chunk de entrada y el splash gira para siempre (iOS no lo
    // sufre: Safari 14+ soporta es2020). Se transpilan los chunks modernos
    // hasta el piso real de <script type="module"> (Chrome/WebView 61) y se
    // inyectan los polyfills de runtime que falten (globalThis, queueMicrotask,
    // Promise.allSettled…). No se generan chunks legacy/SystemJS: sin soporte
    // de módulos (< 61) la app no es viable de todos modos.
    legacy({
      modernTargets: ['chrome >= 61', 'android >= 61', 'safari >= 12', 'firefox >= 60', 'edge >= 79'],
      modernPolyfills: true,
      renderLegacyChunks: false,
    }),
  ],
  build: {
    // esbuild transpila la SINTAXIS moderna (??, ?., espárcelo, etc.) hasta este
    // piso — el default de Vite ('modules' ≈ es2020) dejaba pasar `??` crudo y un
    // WebView < Chrome 80 no podía ni parsear el chunk de entrada (spinner
    // infinito en Android). Los polyfills de RUNTIME (globalThis, queueMicrotask,
    // Promise.allSettled…) los aporta @vitejs/plugin-legacy (modernPolyfills).
    target: ['es2015', 'chrome61', 'safari12', 'firefox60', 'edge79'],
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
})
