// RUTA: src/utils/canalVenta.js
//
// RETAIL vs FOODSERVICE, en un solo lugar (decisión del dueño, 16-oct-2026).
//
// Retail se mide en UNIDADES de venta (la bolsa de 250 g). Foodservice compra por
// kilo (bolsas de 1 y 3 kg), así que se mide en KG DE QUESO COLOCADO, con su
// propia meta. GK guarda todas las facturas en unidades de 250 g (el servidor
// convierte los kg de Zoho al sincronizar), así que los kg salen de ahí:
// kg = unidades × 250 g ÷ 1000.

/** Peso de la unidad de venta de GK, en gramos (la bolsa retail). */
export const GRAMOS_UNIDAD = 250;

/** Unidades de 250 g → kg de queso. */
export const kgDeUnidades = (u, gramos = GRAMOS_UNIDAD) => (Number(u) || 0) * (Number(gramos) || GRAMOS_UNIDAD) / 1000;

/** Redondeo de kg a 1 decimal (lo que se muestra y se compara). */
export const redKg = (x) => Math.round((Number(x) || 0) * 10) / 10;

/** "12,5 kg" */
export const fmtKg = (x) => `${redKg(x).toLocaleString('es-VE', { maximumFractionDigits: 1 })} kg`;

/** Canal de una factura según su categoría guardada (o la que diga `canalDe`). */
export const esFoodservice = (f, canalDe) => (canalDe ? canalDe(f) : f?.categoria) === 'foodservice';
