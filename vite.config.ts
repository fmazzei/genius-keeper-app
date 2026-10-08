import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import legacy from '@vitejs/plugin-legacy'
import path from 'path' // Asegúrate de que esta línea esté presente

// Lista de archivos que el teléfono guarda para abrir la app SIN SEÑAL (8-oct).
// Solo lo que usa el mercaderista: el arranque (entry + sus imports), la pantalla
// AppShell con todo lo que importa de forma estática, y las hojas de estilo. El
// planificador y las pantallas de otros roles quedan fuera (siguen cargándose
// con señal, como siempre). Lo lee el service worker (public/firebase-messaging-sw.js).
function precacheMercaderista() {
  return {
    name: 'gk-precache-mercaderista',
    apply: 'build' as const,
    enforce: 'post' as const,
    generateBundle(_opts: unknown, bundle: Record<string, any>) {
      const porNombre: Record<string, any> = bundle;
      const lista = new Set<string>();
      const agregar = (fileName: string) => {
        if (!fileName || lista.has(fileName)) return;
        const c = porNombre[fileName];
        lista.add(fileName);
        if (c && c.type === 'chunk') {
          (c.imports || []).forEach(agregar);
          (c.viteMetadata?.importedCss ? [...c.viteMetadata.importedCss] : []).forEach((f: string) => lista.add(f));
        }
      };
      Object.values(bundle).forEach((c: any) => {
        if (c.type === 'chunk' && (c.isEntry || /src\/Pages\/AppShell\.jsx$/.test(c.facadeModuleId || '') || /polyfills/.test(c.fileName))) agregar(c.fileName);
        if (c.type === 'asset' && /\.css$/.test(c.fileName)) lista.add(c.fileName);
      });
      this.emitFile({
        type: 'asset',
        fileName: 'precache.json',
        source: JSON.stringify({ archivos: [...lista].map(f => '/' + f).sort() }),
      });
    },
  };
}

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    precacheMercaderista(),
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
  // Versión de la app (fecha y hora del build): cada reporte la guarda y el menú
  // del mercaderista la muestra, para saber qué versión corre cada teléfono.
  define: {
    'import.meta.env.VITE_GK_BUILD': JSON.stringify(new Date().toISOString()),
  },
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
