// RUTA: tests/modoAvion.e2e.mjs
//
// PRUEBA EN MODO AVIÓN (8-oct, obligatoria antes de publicar). La APP REAL
// (build de producción apuntando a los emuladores) en un Chromium de teléfono:
//   1. con señal: entra el mercaderista, el teléfono guarda la ruta y la app;
//   2. sin señal: se reabre la app, se hace una visita completa con una entrega
//      por factura y se cierra → "Guardado en el teléfono, pendiente de envío";
//   3. vuelve la señal: el reporte llega UNA sola vez, con la hora real de la
//      visita y la entrega vinculada a la factura; un reenvío no lo duplica.
//
// Cómo correrla (ver CLAUDE.md, "Modo sin conexión"):
//   VITE_EMULADORES=1 npx vite build --outDir <e2e>/dist
//   (en <e2e>: firebase.json con hosting→dist y emuladores auth 9099,
//    firestore 8080, functions 5001, hosting 5055; functions con el handler
//    rutaMercaderista.js)
//   firebase emulators:start --only auth,firestore,functions,hosting --project geniuskeeper-36553
//   node tests/modoAvion.e2e.mjs
import { createRequire } from 'module';

const require = createRequire(new URL('../functions/package.json', import.meta.url));
const admin = require('firebase-admin');
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || '/opt/node22/lib/node_modules/playwright/index.mjs');

const PROYECTO = 'geniuskeeper-36553';
const BASE = process.env.E2E_URL || 'http://127.0.0.1:5055';
const SHOTS = process.env.E2E_SHOTS || null;
process.env.FIRESTORE_EMULATOR_HOST = '127.0.0.1:8080';
process.env.FIREBASE_AUTH_EMULATOR_HOST = '127.0.0.1:9099';
admin.initializeApp({ projectId: PROYECTO });
const fs = admin.firestore();

let fallas = 0;
const ok = (c, m) => { console.log(`${c ? '✓' : '✗'} ${m}`); if (!c) fallas++; };
const espera = (ms) => new Promise(r => setTimeout(r, ms));

// ── Datos de prueba ──
await fetch(`http://127.0.0.1:8080/emulator/v1/projects/${PROYECTO}/databases/(default)/documents`, { method: 'DELETE' });
await fetch(`http://127.0.0.1:9099/emulator/v1/projects/${PROYECTO}/accounts`, { method: 'DELETE' });
const usuario = await admin.auth().createUser({ email: 'anaquel@lacteoca.com', password: 'Password123!' });
const DIA = 86400000;
const ayerUTC = new Date(); ayerUTC.setUTCHours(0, 0, 0, 0); ayerUTC.setUTCDate(ayerUTC.getUTCDate() - 1);
const hace7 = Date.now() - 7 * DIA;
await Promise.all([
    fs.doc(`users_metadata/${usuario.uid}`).set({ role: 'merchandiser', email: 'anaquel@lacteoca.com', name: 'Equipo de Campo' }),
    fs.doc('reporters/rep1').set({ name: 'Eduardo Carrillo', active: true }),
    fs.doc('pos/P1').set({ name: 'La Muralla', chain: 'La Muralla', active: true, zohoCustomerId: 'C1', visitInterval: 7, zone: 'Este', coordinates: { lat: 10.49, lng: -66.85 } }),
    fs.doc('settings/appConfig').set({ gpsRequired: false, competitorFrequencyDays: 15 }),
    fs.doc('competitors/c1').set({ brand: 'Marca', name: 'Crema', weight_g: 200, active: true }),
    fs.doc('facturas_vendedor/INV-001').set({ numero: 'INV-001', zohoCustomerId: 'C1', clienteName: 'La Muralla, C.A.', fecha: admin.firestore.Timestamp.fromDate(ayerUTC), unidades: 24, estado: 'pendiente', total: 134.4 }),
    fs.doc('visit_reports/previo').set({ posId: 'P1', posName: 'La Muralla', userId: usuario.uid, reportId: 'previo', createdAt: admin.firestore.Timestamp.fromMillis(hace7), startTime: new Date(hace7).toISOString(), inventoryLevel: 10, orderQuantity: 0, formVersion: 2, stockout: false, batches: [{ expiryDate: '2026-12-01', quantity: 10 }] }),
]);
const reportesDeP1 = async () => (await fs.collection('visit_reports').where('posId', '==', 'P1').get()).docs.map(d => ({ id: d.id, ...d.data() }));

// ── Teléfono ──
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'allow' });
const page = await ctx.newPage();
const errores = [];
page.on('pageerror', e => errores.push(e.message));
const foto = async (n) => { if (SHOTS) await page.screenshot({ path: `${SHOTS}/${n}.png` }); };
const pin = async () => {
    for (const d of ['2', '0', '1', '7']) await page.getByRole('button', { name: d, exact: true }).click();
    await page.getByRole('button', { name: 'OK', exact: true }).click();
};
const siguiente = () => page.locator('footer button').nth(1).click();

try {
    // 1. Con señal
    await page.goto(BASE);
    await page.getByText('Merchandise', { exact: false }).first().click();
    await pin();
    await page.getByText('Eduardo Carrillo').click();
    await page.getByText('Iniciar Reporte').waitFor({ timeout: 30000 });
    let listo = false;
    for (let i = 0; i < 60 && !listo; i++) {
        listo = await page.evaluate(async () => {
            try {
                const ruta = JSON.parse(localStorage.getItem('gk_ruta_v1') || '{}');
                const lista = (await (await fetch('/precache.json', { cache: 'no-store' })).json()).archivos;
                const c = await caches.open('gk-app-v1');
                const faltan = [];
                for (const f of lista) if (!(await c.match(f))) faltan.push(f);
                const pagina = !!(await c.match('/index.html'));
                return (ruta.facturas?.P1?.length === 1) && ruta.competidores?.length === 1 && Array.isArray(ruta.pos) && Array.isArray(ruta.reporters) && faltan.length === 0 && pagina;
            } catch { return false; }
        });
        if (!listo) await espera(1000);
    }
    ok(listo, 'con señal: el teléfono guardó la ruta (PDV, mercaderistas, competidores, factura por entregar) y la app completa');

    // 2. MODO AVIÓN: se reabre la app sin señal
    await ctx.setOffline(true);
    const tSinSenal = Date.now();
    await page.reload();
    await page.getByRole('button', { name: '2', exact: true }).waitFor({ timeout: 30000 });
    ok(true, 'sin señal: la app abre (desde la copia del teléfono)');
    await pin();
    await page.getByText('Eduardo Carrillo').click({ timeout: 15000 });
    await page.getByText('Iniciar Reporte').click({ timeout: 15000 });
    await page.getByText('La Muralla').first().click();
    const pdv = page.locator('li', { hasText: 'La Muralla' });
    if (await pdv.count()) await pdv.first().click();
    const tAntes = Date.now();
    await page.getByText('¿Cómo está el anaquel?').waitFor({ timeout: 15000 });
    const tDespues = Date.now();
    await foto('a1_formulario_sin_senal');
    const guia = page.getByText('No mostrar de nuevo');
    if (await guia.count()) await guia.first().click();

    // Paso 1: conteo
    await page.fill('input[type=date]', '2026-12-15');
    await page.getByRole('button', { name: '6', exact: true }).click();
    await page.getByText('Confirmar').click();
    await siguiente();
    // Paso 2: entrega por factura (un toque) + precio con coma
    await page.getByText('INV-001').waitFor({ timeout: 10000 });
    await page.getByRole('button', { name: 'Entregué todo' }).click();
    await page.fill('input[inputmode=decimal]', '10,25');
    await foto('a2_entrega_factura');
    await siguiente();
    // Paso 3
    for (const t of ['Nivel Ojos (Zona Caliente)', 'Quesos crema', 'Exhibido OK']) await page.getByText(t, { exact: true }).click();
    await page.getByText('Toca para ingresar...').click();
    await page.getByRole('button', { name: '3', exact: true }).click();
    await page.getByText('Confirmar').click();
    await siguiente();
    // Paso 4: competencia (catálogo de la copia del teléfono)
    await page.selectOption('select', { index: 1 });
    await page.fill('input[placeholder="Ej: 9,80"]', '9,80');
    await page.getByText('Añadir Reporte de Competidor').click();
    await page.getByText('Finalizar').click();
    await page.getByText('Guardado en el teléfono').waitFor({ timeout: 15000 });
    ok(await page.getByText('Pendiente de envío').count() > 0, 'sin señal: "Guardado en el teléfono · Pendiente de envío"');
    await foto('a3_guardado_en_telefono');
    await espera(4000);
    ok((await reportesDeP1()).length === 1, 'sin señal: nada llegó al servidor todavía');

    // 3. Vuelve la señal
    await ctx.setOffline(false);
    const tSenal = Date.now();
    let docs = [];
    for (let i = 0; i < 90 && docs.length < 2; i++) { await espera(1000); docs = await reportesDeP1(); }
    const nuevo = docs.find(d => d.id !== 'previo');
    if (!nuevo) {
        const cola = await page.evaluate(() => new Promise(res => {
            const req = indexedDB.open('GeniusKeeperDB');
            req.onsuccess = () => { const g = req.result.transaction('pending_reports').objectStore('pending_reports').getAll(); g.onsuccess = () => res(g.result.map(x => ({ intentos: x.intentos, ultimoError: x.ultimoError, reportId: x.reportId }))); };
        }));
        console.log('  cola en el teléfono:', JSON.stringify(cola), '· navigator.onLine =', await page.evaluate(() => navigator.onLine));
    }
    ok(docs.length === 2 && !!nuevo, `con señal: el reporte llegó (${docs.length - 1} nuevo)`);
    await page.getByText('Enviado', { exact: true }).waitFor({ timeout: 20000 }).catch(() => {});
    ok(await page.getByText('Enviado', { exact: true }).count() > 0, 'la pantalla cambia sola a "Enviado"');
    await foto('a4_enviado');
    if (nuevo) {
        const st = Date.parse(nuevo.startTime);
        ok(st >= tAntes - 15000 && st <= tDespues + 1000 && st < tSenal, `hora correcta: la de la visita sin señal (${nuevo.startTime}), no la del envío`);
        ok(nuevo.createdAt.toMillis() >= tSenal - 2000, 'la hora de subida queda aparte (createdAt)');
        ok(nuevo.id === nuevo.reportId, 'el documento se guarda con el id de la visita');
        const e = (nuevo.entregas || [])[0];
        ok(e && e.numero === 'INV-001' && e.opcion === 'todo' && e.unidadesEntregadas === 24 && nuevo.orderQuantity === 24,
            `entrega vinculada a la factura: ${JSON.stringify(nuevo.entregas)}`);
        ok(nuevo.formVersion === 3 && nuevo.inventoryLevel === 6 && nuevo.price === 10.25, 'versión 3, conteo 6, precio 10,25');
        ok(!JSON.stringify(nuevo).includes('134.4'), 'el teléfono nunca recibió montos');

        // Reenvío del mismo reporte: no duplica.
        await page.evaluate((r) => new Promise((res, rej) => {
            const req = indexedDB.open('GeniusKeeperDB');
            req.onsuccess = () => {
                const tx = req.result.transaction('pending_reports', 'readwrite');
                tx.objectStore('pending_reports').add({ reportId: r.reportId, posId: 'P1', userId: r.userId, inventoryLevel: 6, startTime: r.startTime, createdAt: new Date().toISOString() });
                tx.oncomplete = () => res(); tx.onerror = () => rej(tx.error);
            };
            req.onerror = () => rej(req.error);
        }), { reportId: nuevo.reportId, userId: nuevo.userId, startTime: nuevo.startTime });
        await page.evaluate(() => window.dispatchEvent(new Event('online')));
        let quedan = 1;
        for (let i = 0; i < 30 && quedan > 0; i++) {
            await espera(1000);
            quedan = await page.evaluate(() => new Promise(res => {
                const req = indexedDB.open('GeniusKeeperDB');
                req.onsuccess = () => { const c = req.result.transaction('pending_reports').objectStore('pending_reports').count(); c.onsuccess = () => res(c.result); };
            }));
        }
        const final = await reportesDeP1();
        ok(quedan === 0 && final.length === 2, `reenvío del mismo reporte: no duplica (${final.length - 1} reporte nuevo, cola vacía)`);
        const r = await fs.doc(`visit_reports/${nuevo.reportId}`).get();
        ok(r.data().inventoryLevel === 6 && Array.isArray(r.data().entregas), 'el reenvío no pisó el reporte original');
    }
} catch (e) {
    fallas++;
    console.log('✗ la prueba se detuvo:', e.message);
    await foto('zz_error');
} finally {
    if (errores.length) console.log('Errores de la página:', errores.slice(0, 5).join(' | '));
    await browser.close();
}
console.log(fallas ? `\n${fallas} verificación(es) en rojo` : '\nTodas las verificaciones en verde');
process.exit(fallas ? 1 : 0);
