// RUTA: src/utils/exportarPdf.js
//
// PDF de los informes de GK SIN pasar por la impresión del navegador (pedido del
// dueño, 18-nov). `window.print()` en el iPhone, con la app instalada, tardaba
// minutos en abrir la hoja de imprimir (procesa la app entera, no solo el
// informe) y el botón parecía muerto; además no dejaba ponerle nombre al
// archivo.
//
// Cómo funciona:
//   1. Se copia la hoja del informe a un contenedor de 820 px fuera de la vista.
//   2. Se buscan los cortes de página: nunca a mitad de una fila, un párrafo o
//      un bloque marcado «no partir», y se respetan los saltos de página que el
//      informe ya pedía (`break-before: page`).
//   3. html2canvas dibuja SOLO ese contenedor (lo demás de la app no se copia)
//      en tramos de pocas páginas, para no pasar el límite de memoria del iPhone.
//   4. jsPDF arma el PDF tamaño carta con un nombre de archivo.
// Las librerías se cargan solo al exportar.

const ANCHO = 820;                 // ancho del informe en px de pantalla
const PAGINA_PT = { w: 612, h: 792, margen: 32 };   // carta, en puntos
const ESCALA = 2;                  // nitidez
const MAX_TRAMO = 4200;            // px de informe por dibujo (límite del iPhone)

// Fechas «18/11/26» pasan a «18-11-26»; lo que un sistema de archivos no acepta se quita.
const limpiar = (s) => String(s ?? '')
    .replace(/\//g, '-')
    .replace(/[\\:*?"<>|#%{}~&\n\r\t]+/g, ' ')
    .replace(/\s+/g, ' ').trim();

/** «Lacteoca - Cuentas por pagar - Mes 3 - 18-11-2026.pdf» */
export function nombrePdf(...partes) {
    const d = new Date();
    const f = `${String(d.getDate()).padStart(2, '0')}-${String(d.getMonth() + 1).padStart(2, '0')}-${d.getFullYear()}`;
    const piezas = ['Lacteoca', ...partes.flat().map(limpiar).filter(Boolean), f];
    // Sin repetir piezas (p. ej. un título que ya dice «Lacteoca»).
    const vistos = new Set();
    const unicas = piezas.filter(p => { const k = p.toLowerCase(); if (vistos.has(k)) return false; vistos.add(k); return true; });
    return `${unicas.join(' - ').slice(0, 150)}.pdf`;
}

/** Cortes de página (en px del informe) a partir de las posiciones medidas. Puro. */
export function calcularCortes({ alto, altoPagina, candidatos = [], saltos = [], sinPartir = [] }) {
    const cand = [...new Set(candidatos.map(n => Math.round(n)))]
        .filter(c => c > 0 && c < alto)
        .filter(c => !sinPartir.some(([a, b]) => b - a < altoPagina && c > a + 1 && c < b - 1))
        .sort((a, b) => a - b);
    const forzados = [...new Set(saltos.map(n => Math.round(n)))].filter(s => s > 0 && s < alto).sort((a, b) => a - b);
    const paginas = [];
    let ini = 0;
    while (ini < alto - 1) {
        const tope = ini + altoPagina;
        const salto = forzados.find(s => s > ini + 20 && s <= tope);
        let fin;
        if (salto != null) fin = salto;
        else if (tope >= alto) fin = alto;
        else {
            const posibles = cand.filter(c => c > ini + altoPagina * 0.35 && c <= tope);
            fin = posibles.length ? posibles[posibles.length - 1] : tope;
        }
        paginas.push([ini, fin]);
        ini = fin;
    }
    return paginas;
}

const SELECTOR_CORTE = 'tr, p, li, h1, h2, h3, h4, h5, img, svg, .gk-row, .gk-prov, .gk-sec, section';

async function esperarPintura() {
    await new Promise(r => requestAnimationFrame(() => setTimeout(r, 30)));
}

/**
 * Arma el PDF de la hoja y devuelve un File con su nombre.
 * @param {HTMLElement} hoja  la hoja visible del informe
 * @param {string} nombre     nombre del archivo (con .pdf)
 * @param {(n:number,total:number)=>void} [progreso]
 */
export async function armarPdf(hoja, nombre, progreso = () => {}) {
    if (!hoja) throw new Error('No se encontró el informe en pantalla.');
    await esperarPintura();
    const [{ default: html2canvas }, { jsPDF }] = await Promise.all([import('html2canvas'), import('jspdf')]);

    // 1. Copia de la hoja a 820 px, fuera de la vista.
    const cont = document.createElement('div');
    cont.setAttribute('data-gk-pdf', '1');
    Object.assign(cont.style, {
        position: 'absolute', left: '0', top: '0', width: `${ANCHO}px`, zIndex: '-1',
        background: '#ffffff', pointerEvents: 'none', margin: '0', padding: '0',
    });
    const copia = hoja.cloneNode(true);
    copia.removeAttribute('id');
    Object.assign(copia.style, { width: '100%', maxWidth: 'none', margin: '0', boxShadow: 'none', borderRadius: '0', alignSelf: 'auto' });
    copia.querySelectorAll('.gk-no-print').forEach(el => el.remove());
    cont.appendChild(copia);
    document.body.appendChild(cont);

    // Lo que se dibuja es una copia que html2canvas arma por su cuenta; por eso
    // los cortes se miden en ESA copia (en la de la pantalla los renglones
    // pueden medir distinto y una fila quedaba partida entre dos páginas).
    const ESTILO_PDF = '[data-gk-pdf] * { font-variant-numeric: normal !important; font-feature-settings: normal !important; text-rendering: auto !important; }';
    const anchoPt = PAGINA_PT.w - PAGINA_PT.margen * 2;
    const altoPt = PAGINA_PT.h - PAGINA_PT.margen * 2;
    const pxPorPt = ANCHO / anchoPt;
    const altoPagina = Math.floor(altoPt * pxPorPt);

    try {
        await esperarPintura();
        const base = cont.getBoundingClientRect();
        const baseX = base.left + window.scrollX;
        const baseY = base.top + window.scrollY;

        let medida = null;
        const opciones = (extra) => ({
            scale: ESCALA, backgroundColor: '#ffffff', logging: false, useCORS: true,
            scrollX: 0, scrollY: 0, x: baseX, width: ANCHO,
            // Solo se copia el informe: la app entera no entra al dibujo.
            ignoreElements: (el) => {
                if (el === cont || cont.contains(el) || el.contains(cont)) return false;
                const tag = el.tagName;
                if (tag === 'HEAD' || tag === 'STYLE' || tag === 'LINK' || tag === 'META' || tag === 'TITLE') return false;
                return !el.closest?.('head');
            },
            onclone: (doc) => {
                const st = doc.createElement('style');
                st.textContent = ESTILO_PDF;
                doc.head.appendChild(st);
                if (!medida) {
                    const c = doc.querySelector('[data-gk-pdf]');
                    const win = doc.defaultView;
                    const b0 = c.getBoundingClientRect();
                    const rel = (r) => [r.top - b0.top, r.bottom - b0.top];
                    const candidatos = [];
                    c.querySelectorAll(SELECTOR_CORTE).forEach(el => candidatos.push(rel(el.getBoundingClientRect())[1]));
                    const saltos = [];
                    const sinPartir = [];
                    c.querySelectorAll('*').forEach(el => {
                        const cs = win.getComputedStyle(el);
                        if (cs.breakBefore === 'page' || cs.pageBreakBefore === 'always') saltos.push(rel(el.getBoundingClientRect())[0]);
                        if (cs.breakInside === 'avoid' || cs.pageBreakInside === 'avoid') sinPartir.push(rel(el.getBoundingClientRect()));
                    });
                    medida = { alto: Math.ceil(c.scrollHeight), candidatos, saltos, sinPartir };
                }
            },
            ...extra,
        });

        // 2. Medición (una pasada mínima) y cortes de página.
        await html2canvas(cont, opciones({ y: baseY, height: 1, scale: 1 }));
        if (!medida) throw new Error('No se pudo medir el informe.');
        const paginas = calcularCortes({ ...medida, altoPagina });

        // 3. Dibujo por tramos (varias páginas por dibujo).
        const tramos = [];
        for (const p of paginas) {
            const t = tramos[tramos.length - 1];
            if (t && p[1] - t.ini <= MAX_TRAMO) { t.fin = p[1]; t.paginas.push(p); }
            else tramos.push({ ini: p[0], fin: p[1], paginas: [p] });
        }
        const pdf = new jsPDF({ unit: 'pt', format: 'letter', orientation: 'portrait', compress: true });
        let n = 0;
        for (const t of tramos) {
            progreso(n, paginas.length);
            await esperarPintura();
            const lienzo = await html2canvas(cont, opciones({ y: baseY + t.ini, height: t.fin - t.ini }));
            for (const [a, b] of t.paginas) {
                const h = Math.max(1, Math.round((b - a) * ESCALA));
                const pag = document.createElement('canvas');
                pag.width = lienzo.width; pag.height = h;
                const ctx = pag.getContext('2d');
                ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, pag.width, pag.height);
                ctx.drawImage(lienzo, 0, Math.round((a - t.ini) * ESCALA), lienzo.width, h, 0, 0, pag.width, h);
                if (n > 0) pdf.addPage();
                pdf.addImage(pag.toDataURL('image/jpeg', 0.9), 'JPEG', PAGINA_PT.margen, PAGINA_PT.margen, anchoPt, (b - a) / pxPorPt);
                n++;
                progreso(n, paginas.length);
            }
        }
        const blob = pdf.output('blob');
        return new File([blob], nombre, { type: 'application/pdf' });
    } finally {
        cont.remove();
    }
}

const esTactil = () => {
    try { return window.matchMedia('(pointer: coarse)').matches; } catch { return false; }
};

/** ¿Se puede compartir el archivo con el menú del teléfono? */
export function sePuedeCompartir(file) {
    try { return esTactil() && !!navigator.canShare && navigator.canShare({ files: [file] }); } catch { return false; }
}

/** Descarga directa con su nombre (computadora). */
export function descargarArchivo(file) {
    const url = URL.createObjectURL(file);
    const a = document.createElement('a');
    a.href = url; a.download = file.name; a.rel = 'noopener';
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60000);
}

/**
 * Entrega el archivo: menú de compartir en el teléfono (guardar en Archivos,
 * WhatsApp, imprimir), descarga directa en la computadora.
 * Devuelve 'compartido' | 'descargado' | 'cancelado' | 'necesita_toque'
 * (el teléfono pide otro toque porque pasó mucho tiempo desde el primero).
 */
export async function entregarPdf(file) {
    if (sePuedeCompartir(file)) {
        try {
            await navigator.share({ files: [file], title: file.name.replace(/\.pdf$/i, '') });
            return 'compartido';
        } catch (e) {
            if (e?.name === 'AbortError') return 'cancelado';
            if (e?.name === 'NotAllowedError') return 'necesita_toque';
            descargarArchivo(file);
            return 'descargado';
        }
    }
    descargarArchivo(file);
    return 'descargado';
}
