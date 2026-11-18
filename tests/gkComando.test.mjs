// node tests/gkComando.test.mjs — resumen que guarda el comando de conciliar.
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { _conciliarInternos } = require('../functions/handlers/zohoReconcile.js');
const { resumenConciliacion } = _conciliarInternos;
let ok = 0, mal = 0;
const t = (n, c) => { if (c) ok++; else { mal++; console.error('✗', n); } };

const r = resumenConciliacion({
  revisadas: 120, creadas: 2, marcadasPagadas: 3, anuladas: 0, borradores: 1, ausentes: 0, errores: 0,
  detalles: new Array(500).fill({ numero: 'INV' }),
  porPagar: { autorizado: true, porPagar: 3079.24, nAbiertas: 20, vencidas: 2930,
    porCategoria: { nomina: { total: 192.34 } }, diag: { muestra: [1, 2, 3] },
    proximaNomina: { monto: 440, perfiles: [{ proveedor: 'Diana', monto: 140 }] } },
  cuadre: { zohoPorCobrar: 100, zohoFacturas: 3, gkPorCobrar: 100, gkFacturas: 3, porMotivo: {}, corregidas: 1, noCorregidas: [{ n: 1 }] },
});
t('cuenta lo revisado', r.revisadas === 120 && r.marcadasPagadas === 3);
t('no guarda las listas de facturas', !('detalles' in r));
t('cuentas por pagar resumidas', r.porPagar.total === 3079.24 && r.porPagar.facturas === 20 && !('diag' in r.porPagar));
t('próxima nómina', r.porPagar.proximaNomina.monto === 440);
t('cuadre: Zoho y GK, no corregidas como número', r.cuadre.zohoPorCobrar === 100 && r.cuadre.gkFacturas === 3 && r.cuadre.noCorregidas === 1 && !('porMotivo' in r.cuadre));
t('sin cuentas por pagar', resumenConciliacion({ revisadas: 1 }).porPagar === null);
t('sin permiso de bills', resumenConciliacion({ porPagar: { autorizado: false, motivo: 'scope' } }).porPagar.autorizado === false);
t('cabe en un documento', JSON.stringify(r).length < 5000);
console.log(`${ok} en verde, ${mal} fallas`);
process.exit(mal ? 1 : 0);
