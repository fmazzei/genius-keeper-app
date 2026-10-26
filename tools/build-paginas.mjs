// Genera /donde-comprar (desde data/puntos.json), /recetas y sitemap.xml con el mismo estilo del home.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
const raiz = new URL('../', import.meta.url);
const leer = p => readFileSync(new URL(p, raiz), 'utf8');
const escribir = (p, s) => { mkdirSync(new URL(p.replace(/[^/]+$/, ''), raiz), { recursive: true }); writeFileSync(new URL(p, raiz), s); };
const home = leer('sitio/index.html');
const css = [...home.matchAll(/<style>([\s\S]*?)<\/style>/g)][1][1].replaceAll('url(assets/', 'url(/assets/');
const wa = home.match(/(<svg class="ico wa"[\s\S]*?<\/svg>)/)[1];
const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const hoy = new Date().toISOString().slice(0, 10);

// ---------- Puntos de venta ----------
const ARREGLOS = { 'El Marques': 'El Marqués', 'Prado de Maria': 'Prado de María', 'Lomas de Sol': 'Lomas del Sol', 'Sta Paula': 'Santa Paula' };
const CADENA = { 'Central Madeirense': 'Central Madeirense', 'Grupo Páramo': 'Hipermercado Páramo', 'Río Supermarket': 'Río Market', 'Excelsior Gama': 'Excelsior Gama', 'Automercados Luz': 'Automercados Luz' };
const ZONAS_CONOCIDAS = ['Los Palos Grandes', 'Altamira', 'Chacao', 'La Castellana', 'El Hatillo', 'Los Naranjos', 'La Boyera', 'Las Mercedes'];
function lugar(p) {
  let n = p.name.trim(), z = (p.zone || '').trim();
  let l = '';
  if (/ - /.test(n)) l = n.split(' - ').pop().trim();
  else if (/\(([^)]+)\)/.test(n)) l = n.match(/\(([^)]+)\)/)[1];
  if (!l && z && z !== 'N/A') l = z;
  if (!l && p.address) l = ZONAS_CONOCIDAS.find(k => p.address.includes(k)) || '';
  return ARREGLOS[l] || l;
}
function tienda(p) {
  if (CADENA[p.chain]) return CADENA[p.chain];
  let n = p.name.split(' - ')[0].trim();
  return n.replace(/\s*\([^)]*\)\s*$/, '');
}
const puntos = JSON.parse(leer('data/puntos.json')).map(p => ({ tienda: tienda(p), lugar: lugar(p) }));
const grupos = {};
for (const p of puntos) (grupos[p.tienda] ||= []).push(p);
const orden = Object.keys(grupos).sort((a, b) => grupos[b].length - grupos[a].length || a.localeCompare(b, 'es'));
const zonas = [...new Set(puntos.map(p => p.lugar).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'es'));
const mapa = p => 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(`${p.tienda} ${p.lugar} Caracas`);
const lista = orden.map(t => `
      <section class="chain" data-chain="${esc(t)}">
        <h2>${esc(t)} <span class="count">${grupos[t].length}</span></h2>
        <ul class="stores-list">
${grupos[t].sort((a, b) => a.lugar.localeCompare(b.lugar, 'es')).map(p => `          <li data-q="${esc((t + ' ' + p.lugar).toLowerCase())}"><span class="where"><b>${esc(t)}</b>${p.lugar ? `<span>${esc(p.lugar)}</span>` : ''}</span><a class="go" href="${mapa(p)}" target="_blank" rel="noopener">Cómo llegar</a></li>`).join('\n')}
        </ul>
      </section>`).join('\n');

const extra = `
  .page-top { background: var(--navy); color: var(--white); }
  .page-top .bar-in { display: flex; justify-content: space-between; align-items: center; gap: 12px; padding-block: calc(env(safe-area-inset-top, 0px) + 18px) 0; }
  .page-top .bar-in img { width: 130px; filter: brightness(0) invert(1); }
  .page-top nav { display: flex; flex-wrap: wrap; gap: 6px 18px; }
  .page-top nav a { color: var(--white); font-family: var(--display); font-weight: 700; text-transform: uppercase; letter-spacing: 0.08em; text-decoration: none; font-size: 0.88rem; }
  .page-top .head { padding-block: 36px 56px; }
  .page-top h1 { color: var(--white); font-size: clamp(2.1rem, 5.4vw, 3.4rem); font-weight: 800; }
  .page-top p { color: #DCE5F1; font-size: 1.15rem; margin-top: 14px; max-width: 60ch; }
  .finder { margin-top: 26px; max-width: 520px; }
  .finder input { width: 100%; font: inherit; font-size: 1.05rem; padding: 14px 18px; border-radius: 999px; border: 2px solid var(--white); background: var(--white); color: var(--ink); }
  .finder input:focus-visible { outline: 3px solid #C9D6E8; outline-offset: 2px; }
  .chain { margin-top: 40px; }
  .chain h2 { font-size: clamp(1.5rem, 3.6vw, 2.1rem); display: flex; align-items: baseline; gap: 12px; }
  .chain .count { font-size: 1rem; color: var(--muted); font-weight: 700; }
  .stores-list { list-style: none; margin: 16px 0 0; padding: 0; border-top: 2px solid var(--navy); }
  .stores-list li { display: flex; justify-content: space-between; align-items: center; gap: 12px; padding: 14px 0; border-bottom: 1px solid var(--line); }
  .stores-list .where { display: flex; flex-direction: column; min-width: 0; }
  .stores-list .where b { font-family: var(--display); font-weight: 700; font-size: 1.1rem; color: var(--navy); }
  .stores-list .where span { color: var(--muted); }
  .go { flex: none; font-family: var(--display); font-weight: 700; text-transform: uppercase; letter-spacing: 0.06em; font-size: 0.82rem; text-decoration: none; color: var(--navy); border: 2px solid var(--navy); border-radius: 999px; padding: 8px 14px; }
  .go:hover { background: var(--navy); color: var(--white); }
  .zones { margin-top: 48px; color: var(--muted); max-width: 70ch; }
  .empty { margin-top: 30px; color: var(--muted); }
  .recipe { background: var(--white); padding: clamp(22px, 4vw, 36px); margin-top: 22px; }
  .recipe h2 { font-size: clamp(1.5rem, 3.6vw, 2rem); }
  .recipe .meta { font-family: var(--display); font-weight: 700; text-transform: uppercase; letter-spacing: 0.1em; color: var(--muted); font-size: 0.9rem; margin-top: 6px; }
  .recipe .cols { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 260px), 1fr)); gap: 12px 40px; margin-top: 16px; }
  .recipe h3 { font-size: 1.05rem; margin-bottom: 8px; }
  .recipe ul, .recipe ol { margin: 0; padding-left: 1.2em; }
  .recipe li + li { margin-top: 4px; }
  .cta-row { display: flex; flex-wrap: wrap; gap: 10px; margin-top: 28px; }
  .cta-row a { font-family: var(--display); font-weight: 700; text-transform: uppercase; letter-spacing: 0.06em; text-decoration: none; padding: 12px 20px; border-radius: 999px; border: 2px solid var(--navy); color: var(--navy); }
  .cta-row a.solid { background: var(--navy); color: var(--white); }
`;
const cabeza = (titulo, desc, ruta, ld) => `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>${esc(titulo)}</title>
<meta name="description" content="${esc(desc)}">
<link rel="canonical" href="https://lacteoca.com${ruta}">
<link rel="icon" type="image/png" href="/assets/icono-192.png">
<link rel="apple-touch-icon" href="/assets/icono-180.png">
<meta property="og:type" content="website">
<meta property="og:site_name" content="Lacteoca">
<meta property="og:title" content="${esc(titulo)}">
<meta property="og:description" content="${esc(desc)}">
<meta property="og:url" content="https://lacteoca.com${ruta}">
<meta property="og:image" content="https://lacteoca.com/assets/compartir-3.jpg">
<meta name="twitter:card" content="summary_large_image">
${ld.map(o => `<script type="application/ld+json">${JSON.stringify(o)}</script>`).join('\n')}
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Barlow+Semi+Condensed:wght@600;700;800&family=Barlow:wght@400;500;600&display=swap">
<style>html,body{margin:0}${css}${extra}</style>
</head>
<body>`;
const barra = `<div class="in bar-in"><a href="/" aria-label="Lacteoca, inicio"><img src="/assets/palabra-azul.png" alt="Lacteoca" width="884" height="174"></a>
    <nav aria-label="Secciones"><a href="/">Inicio</a><a href="/donde-comprar">Dónde comprar</a><a href="/recetas">Recetas</a><a href="/foodservice">Foodservice</a></nav></div>`;
const pie = `
<footer class="in foot">
  <a href="/"><img src="/assets/palabra-azul.png" alt="Lacteoca" width="884" height="174"></a>
  <a class="ig" href="https://wa.me/584120719307" target="_blank" rel="noopener">${wa}+58 412 071 9307</a>
  <span>Lacteoca, C.A. · RIF J-50044805-8</span>
</footer>
</body>
</html>
`;
const n = puntos.length;
const ldTiendas = { '@context': 'https://schema.org', '@type': 'ItemList', name: 'Dónde comprar Lacteoca Chèvre en Caracas', numberOfItems: n,
  itemListElement: puntos.map((p, i) => ({ '@type': 'ListItem', position: i + 1, name: `${p.tienda}${p.lugar ? ' ' + p.lugar : ''}, Caracas` })) };
const dondeHtml = cabeza(`Dónde comprar queso de cabra Lacteoca Chèvre en Caracas · ${n} puntos de venta`,
  `Lacteoca Chèvre, queso de cabra, está en ${n} supermercados de Caracas: ${orden.join(', ')}. Encuentra el más cercano en ${zonas.slice(0, 8).join(', ')} y más.`,
  '/donde-comprar', [ldTiendas]) + `
<header class="page-top">
  ${barra}
  <div class="in head">
    <h1>Dónde comprar Lacteoca Chèvre</h1>
    <p>Queso de cabra, en la nevera de lácteos de ${n} supermercados de Caracas. Busca por zona o por supermercado.</p>
    <div class="finder"><label class="sr" for="q" style="position:absolute;left:-9999px">Buscar zona o supermercado</label><input id="q" type="search" placeholder="Escribe tu zona: El Hatillo, Chacao, La Boyera…" autocomplete="off"></div>
  </div>
</header>
<main class="in" style="padding-bottom:72px">
${lista}
  <p class="empty" id="empty" hidden>No encontramos esa zona todavía. Escríbenos por WhatsApp y te decimos el punto más cercano.</p>
  <p class="zones">Lacteoca Chèvre está en ${esc(zonas.join(', '))}. Lista actualizada el ${hoy}.</p>
  <div class="cta-row"><a class="solid" href="https://wa.me/584120719307?text=${encodeURIComponent('Hola, ¿dónde consigo Lacteoca Chèvre cerca de mi zona?')}" target="_blank" rel="noopener">¿No está tu zona? Escríbenos</a><a href="/recetas">Ideas para usarlo</a></div>
</main>
<script>
(function(){var q=document.getElementById('q'),items=[].slice.call(document.querySelectorAll('.stores-list li')),groups=[].slice.call(document.querySelectorAll('.chain')),empty=document.getElementById('empty');
function norm(s){return s.toLowerCase().normalize('NFD').replace(/[\\u0300-\\u036f]/g,'')}
q.addEventListener('input',function(){var t=norm(q.value.trim()),any=false;items.forEach(function(li){var ok=!t||norm(li.dataset.q).indexOf(t)>-1;li.hidden=!ok;if(ok)any=true});groups.forEach(function(g){g.hidden=!g.querySelector('li:not([hidden])')});empty.hidden=any});})();
</script>` + pie;
escribir('sitio/donde-comprar/index.html', dondeHtml);

// ---------- Recetas ----------
const recetas = [
  { t: 'Arepa con Chèvre y aguacate', c: 0, m: 'Desayuno · 10 minutos', ing: ['2 arepas recién asadas', '4 cucharadas de Lacteoca Chèvre', '½ aguacate en láminas', 'Sal y pimienta'], pasos: ['Abre las arepas aún calientes.', 'Unta el Chèvre por dentro para que se ablande con el calor.', 'Agrega el aguacate, sal y pimienta.'] },
  { t: 'Pasta cremosa con Chèvre', c: 10, m: 'Almuerzo · 15 minutos', ing: ['250 g de pasta corta', '125 g de Lacteoca Chèvre (media tina)', '1 taza del agua de cocción', 'Pimienta negra y aceite de oliva'], pasos: ['Cocina la pasta y guarda una taza del agua de cocción.', 'En la misma olla, mezcla el Chèvre con un poco del agua hasta formar una salsa lisa.', 'Agrega la pasta, ajusta con más agua si hace falta y termina con pimienta y aceite de oliva.'] },
  { t: 'Huevos revueltos con Chèvre', c: 5, m: 'Desayuno · 8 minutos', ing: ['3 huevos', '2 cucharadas de Lacteoca Chèvre', 'Cebollín picado', 'Sal'], pasos: ['Bate los huevos con una pizca de sal.', 'Cocínalos a fuego bajo, moviendo siempre.', 'Justo antes de que cuajen, agrega el Chèvre en trocitos y el cebollín. Retira del fuego.'] },
  { t: 'Tostadas con Chèvre y miel', c: 0, m: 'Merienda · 5 minutos', ing: ['Pan tostado', 'Lacteoca Chèvre', 'Miel', 'Nueces o frutos secos (opcional)'], pasos: ['Unta una capa generosa de Chèvre sobre el pan tostado.', 'Termina con un hilo de miel y frutos secos.'] },
  { t: 'Ensalada con Chèvre desmenuzado', c: 0, m: 'Almuerzo · 10 minutos', ing: ['Hojas verdes', 'Tomates cherry o fruta de temporada', '4 cucharadas de Lacteoca Chèvre', 'Aceite de oliva, limón y sal'], pasos: ['Arma la ensalada con las hojas y el tomate o la fruta.', 'Desmenuza el Chèvre por encima con una cucharita.', 'Aliña con aceite, limón y sal.'] },
  { t: 'Dip de Chèvre con hierbas', c: 0, m: 'Para compartir · 5 minutos', ing: ['1 tina de Lacteoca Chèvre (250 g)', '2 cucharadas de aceite de oliva', 'Hierbas frescas picadas (perejil, cilantro o albahaca)', 'Ralladura de limón'], pasos: ['Mezcla el Chèvre con el aceite hasta que quede suave.', 'Incorpora las hierbas y la ralladura.', 'Sirve con vegetales crudos, tostadas o tequeños.'] },
];
const ldRecetas = recetas.map(r => {
  const min = parseInt(r.m.split(' · ')[1], 10) || 10;
  return { '@context': 'https://schema.org', '@type': 'Recipe', name: r.t, image: 'https://lacteoca.com/assets/chevre-textura.jpg', author: { '@type': 'Organization', name: 'Lacteoca' },
    description: `${r.t}: una forma fácil de usar Lacteoca Chèvre, queso de cabra cremoso.`,
    keywords: `queso de cabra, Lacteoca Chèvre, ${r.t.toLowerCase()}, receta con queso de cabra`,
    recipeCategory: r.m.split(' · ')[0], prepTime: `PT${min - (r.c || 0)}M`, cookTime: `PT${r.c || 0}M`, totalTime: `PT${min}M`, recipeYield: '2 porciones',
    recipeIngredient: r.ing, recipeInstructions: r.pasos.map(p => ({ '@type': 'HowToStep', text: p })) };
});
const recetasHtml = cabeza('Recetas con queso de cabra · Lacteoca Chèvre', 'Ideas fáciles para usar queso de cabra Lacteoca Chèvre: arepas, pasta cremosa, huevos revueltos, tostadas con miel, ensaladas y dips.', '/recetas', ldRecetas) + `
<header class="page-top">
  ${barra}
  <div class="in head">
    <h1>Recetas con queso de cabra</h1>
    <p>Lacteoca Chèvre es una base neutra y cremosa: combina con lo dulce y con lo salado. Estas son algunas formas de usarlo.</p>
  </div>
</header>
<main class="in" style="padding-bottom:72px">
${recetas.map(r => `  <article class="recipe">
    <h2>${esc(r.t)}</h2>
    <p class="meta">${esc(r.m)}</p>
    <div class="cols">
      <div><h3>Ingredientes</h3><ul>${r.ing.map(i => `<li>${esc(i)}</li>`).join('')}</ul></div>
      <div><h3>Preparación</h3><ol>${r.pasos.map(i => `<li>${esc(i)}</li>`).join('')}</ol></div>
    </div>
  </article>`).join('\n')}
  <div class="cta-row"><a class="solid" href="/donde-comprar">Dónde comprar Lacteoca Chèvre</a><a href="/foodservice">Para restaurantes: bolsa de 1 kg</a></div>
</main>` + pie;
escribir('sitio/recetas/index.html', recetasHtml);

// ---------- Sitemap ----------
escribir('sitio/sitemap.xml', `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${['/', '/donde-comprar', '/recetas', '/foodservice'].map(u => `  <url><loc>https://lacteoca.com${u}</loc><lastmod>${hoy}</lastmod></url>`).join('\n')}
</urlset>
`);
console.log('Páginas generadas. Puntos:', n, 'Cadenas:', orden.join(' | '));
