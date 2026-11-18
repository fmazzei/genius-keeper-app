// RUTA: functions/handlers/cxpDocId.js
//
// Id del documento de `cuentas_por_pagar` para cada factura de proveedor de
// Zoho. Puro (se prueba en Node).
//
// El id es el número de la factura, pero Zoho deja que dos proveedores usen el
// mismo número (pasó el 11-nov: «CXP 11112026» de Las Nieves y de La Toñera).
// Con el número solo, la segunda pisaba a la primera y desaparecía de GK.
// Regla: entre las que comparten número, la de bill_id más viejo conserva el
// número como id; las demás llevan `<número>__<bill_id>`. Así el id no cambia
// de una corrida a otra.

const limpiar = (s) => String(s || '').trim().replace(/\//g, '-');
const numeroDe = (b) => String(b.bill_number || b.reference_number || b.bill_id || '').trim();
const compararId = (a, b) => {
    const x = String(a.bill_id || ''), y = String(b.bill_id || '');
    return x.length - y.length || (x < y ? -1 : x > y ? 1 : 0);
};

/** Map bill_id → id del documento, y la lista de números repetidos. */
function idsDeCuentasPorPagar(bills) {
    const grupos = new Map();
    for (const b of bills || []) {
        const numero = numeroDe(b);
        if (!numero) continue;
        const clave = limpiar(numero);
        if (!grupos.has(clave)) grupos.set(clave, []);
        grupos.get(clave).push(b);
    }
    const ids = new Map();
    const repetidos = [];
    for (const [clave, lista] of grupos) {
        lista.sort(compararId);
        lista.forEach((b, i) => ids.set(String(b.bill_id), i === 0 ? clave : `${clave}__${b.bill_id}`));
        if (lista.length > 1) {
            repetidos.push({ numero: numeroDe(lista[0]), proveedores: lista.map(b => b.vendor_name || '—') });
        }
    }
    return { ids, repetidos };
}

module.exports = { idsDeCuentasPorPagar, numeroDe };
