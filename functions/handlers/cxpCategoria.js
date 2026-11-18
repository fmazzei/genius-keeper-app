// RUTA: functions/handlers/cxpCategoria.js
//
// Categoría de una factura de proveedor del PERSONAL. Puro (se prueba en Node).
//
// La ficha de la persona en Zoho (campo "Categoría CxP") dice si es de nómina o
// de destajo, pero una misma persona puede tener las dos cosas: Diana Hurtado
// cobra su quincena fija (nómina) y además trabajos a destajo. Por eso, en las
// facturas del personal manda la CUENTA de sus líneas:
//   - todas en "Trabajos adicionales-destajo" (5.3.2.02.005) → destajo;
//   - alguna en una cuenta de sueldos → nómina;
//   - si no, lo que diga la ficha.
// Un proveedor (no personal) sigue siendo proveedor sin mirar las líneas.

const CUENTA_DESTAJO = '5.3.2.02.005';
// Sueldos de producción, administración y ventas, y sueldos de la finca.
const PREFIJOS_SUELDO = ['5.3.2.01.01', '6.1.1.01.01', '6.2.1.01.01', '5.3.1.01.07'];

const esPersonal = (cat) => cat === 'nomina' || cat === 'destajo';

function categoriaPorCuentas(lineas, categoriaFicha) {
    if (!esPersonal(categoriaFicha)) return categoriaFicha || 'proveedor';
    const codigos = (lineas || []).map(l => String(l.account_code || '').trim()).filter(Boolean);
    if (!codigos.length) return categoriaFicha;
    if (codigos.some(c => PREFIJOS_SUELDO.some(p => c.startsWith(p)))) return 'nomina';
    if (codigos.every(c => c === CUENTA_DESTAJO)) return 'destajo';
    return categoriaFicha;
}

module.exports = { categoriaPorCuentas, esPersonal, CUENTA_DESTAJO, PREFIJOS_SUELDO };
