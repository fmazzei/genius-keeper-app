// Prueba: lo que se usa en cada paso de la producción se anota en su unidad.
// Correr: node --import ./tests/alias.mjs tests/consumosPaso.test.mjs
import {
    unidadDeAnotar, filasDeConsumo, usadosDeFilas, resumenConsumo, copiarConsumo,
    totalesConsumo, textoCantidad, sumasRapidas, pasoDeAnotar,
} from '../src/Kroma/consumoUnidades.js';

let ok = 0, mal = 0;
const t = (n, c) => { if (c) ok++; else { mal++; console.error('✗', n); } };

// Inventario real de planta (23-nov).
const inv = [
    { id: 'G6IN', materialNombre: 'Tapabocas Kn95', unidadBase: 'und' },
    { id: 'KBC0', materialNombre: 'Limpiador desengrasante jabonoso concentrado', unidadBase: 'l' },
    { id: 'Qwcq', materialNombre: 'desinfectante clorado 12,5%litro', unidadBase: 'l' },
    { id: 'oBzN', materialNombre: 'Soda caustica 98% escama', unidadBase: 'kg' },
    { id: 'zlEv', materialNombre: 'guantes quirurgicos', unidadBase: 'par' },
];

t('guantes por pares', unidadDeAnotar('par') === 'par');
t('tapabocas por unidad', unidadDeAnotar('und') === 'und');
t('líquidos en ml', unidadDeAnotar('l') === 'ml' && unidadDeAnotar('L') === 'ml');
t('soda en gramos', unidadDeAnotar('kg') === 'g');

const filas = filasDeConsumo(inv);
t('primero lo que se cuenta', filas[0].unidad === 'par' && filas[1].unidad === 'und');
t('luego líquidos y sólidos', filas[2].unidad === 'ml' && filas[4].unidad === 'g');
t('nombre con mayúscula', filas.find(f => f.materialId === 'Qwcq').nombre.startsWith('Desinfectante'));
t('todo arranca en cero', filas.every(f => f.cantidad === 0));

filas.find(f => f.materialId === 'zlEv').cantidad = 2;
filas.find(f => f.materialId === 'Qwcq').cantidad = 100;
filas.find(f => f.materialId === 'oBzN').cantidad = 50;
const usados = usadosDeFilas(filas);
t('solo lo que tiene cantidad', usados.length === 3);
t('cada uno en su unidad', usados.find(u => u.materialId === 'Qwcq').unidad === 'ml');
t('resumen legible', resumenConsumo(usados) === '2 pares de guantes quirurgicos · 100 ml de desinfectante clorado 12,5%litro · 50 g de soda caustica 98% escama');
t('nada usado = resumen vacío', resumenConsumo([]) === '');

t('textos de unidad', textoCantidad(1, 'par') === '1 par' && textoCantidad(3, 'und') === '3 unidades' && textoCantidad(1.5, 'ml') === '1,5 ml');
t('sumas rápidas', sumasRapidas('ml').join() === '50,100,250' && sumasRapidas('par').join() === '1,2,5' && sumasRapidas('g').join() === '10,50,100');
t('pasos de + y −', pasoDeAnotar('ml') === 10 && pasoDeAnotar('g') === 5 && pasoDeAnotar('par') === 1);

const copiadas = copiarConsumo(filasDeConsumo(inv), usados);
t('«lo mismo que el paso anterior»', usadosDeFilas(copiadas).length === 3 && copiadas.find(f => f.materialId === 'zlEv').cantidad === 2);
t('copiar desde un cierre viejo en L pasa a ml', copiarConsumo(filasDeConsumo(inv), [{ materialId: 'KBC0', cantidad: 0.25, unidad: 'l' }]).find(f => f.materialId === 'KBC0').cantidad === 250);

const tot = totalesConsumo([...usados, { materialId: 'zlEv', nombre: 'guantes', cantidad: 1, unidad: 'par' }, { materialId: 'Qwcq', nombre: 'cloro', cantidad: 0.05, unidad: 'l' }]);
t('total por material', tot.find(x => x.materialId === 'zlEv').cantidad === 3);
t('total suma ml con L viejos', tot.find(x => x.materialId === 'Qwcq').cantidad === 150);

console.log(`${ok} en verde${mal ? `, ${mal} en rojo` : ''}`);
if (mal) process.exit(1);
