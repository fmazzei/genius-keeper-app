// Flete de la leche en el costo del lote (sección 5).
//   TZ=America/Caracas node --import ./tests/alias.mjs tests/fleteLeche.test.mjs
import { componenteFlete, costeoPlanilla } from '@/Kroma/costeoLote.js';
let fallas = 0;
const ok = (c, m) => { console.log(`${c ? '✓' : '✗'} ${m}`); if (!c) fallas++; };
const log = (fecha, extra = {}) => ({ fechaInicio: new Date(`${fecha}T12:00:00`), recepciones: [{ litros: 396, costoUsdLitro: 1.3, proveedorNombre: 'Los Gilgares' }],
    litrosIngresados: 396, litrosNetos: 386, totalKgProducido: 52.39, ...extra });
const leche = { fletePorLitro: 0.2488 };
const f = componenteFlete(log('2026-11-03'), leche);
ok(f && f.tipo === 'flete' && f.cantidad === 396 && Math.abs(f.monto - 98.5248) < 1e-6, 'lote del 3-nov: 396 L × $0,2488 = $98,52 de flete');
ok(componenteFlete(log('2026-10-30'), leche) === null, 'lote anterior al 1-nov: sin flete');
ok(componenteFlete(log('2026-11-03'), { fletePorLitro: 0 }) === null && componenteFlete(log('2026-11-03'), null) === null, 'sin flete configurado: nada');
ok(componenteFlete(log('2026-10-20'), { fletePorLitro: 0.25, fleteDesde: '2026-10-15' }) !== null, 'la fecha de inicio del flete se puede mover');
const c = costeoPlanilla(log('2026-11-05'), {}, {}, leche);
ok(c.componentes.some(x => x.tipo === 'flete') && Math.abs(c.costoBaseTotal - (396 * 1.3 + 396 * 0.2488)) < 1e-4, 'planilla: el flete entra al costo base del lote');
if (fallas) { console.log(`\n${fallas} fallaron`); process.exit(1); }
console.log('\nTodas en verde');
