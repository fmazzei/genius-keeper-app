// RUTA: src/utils/presentacionEntrega.js
//
// Presentaciones en lo que entrega el mercaderista. `orderQuantity` de una
// visita va en unidades de venta (250 g) para que cuadre con las facturas;
// `entregaPresentaciones` dice qué parte fue en otra presentación, para
// mostrarla como se entregó: una bolsa de 1 kg es «1 bolsa de 1 kg», no «4».
// Regla: nunca se suman bolsas de 1 kg con unidades de 250 g en lo que se ve.

/**
 * Lo que entró en una visita, por presentación. `orderQuantity` va siempre en
 * unidades de venta (250 g); `entregaPresentaciones` dice qué parte de eso fue
 * en otra presentación (una bolsa de 1 kg = 4 unidades de venta).
 */
export function partesDeEntrega(v) {
    const entro = Number(v?.orderQuantity) || 0;
    const kg1 = (Array.isArray(v?.entregaPresentaciones) ? v.entregaPresentaciones : [])
        .filter(p => /\b1\s*kg\b/i.test(String(p?.presentacion || '')))
        .reduce((s, p) => s + (Number(p.cantidad) || 0), 0);
    const u1kg = Math.min(entro, kg1 * 4);
    return [
        { pres: '250', unidades: entro - u1kg },
        { pres: '1kg', unidades: u1kg },
    ].filter(x => x.unidades > 0);
}

/**
 * Una cantidad como se cuenta en su presentación: las bolsas de 1 kg en
 * bolsas, nunca en unidades de 250 g (regla: no sumar presentaciones).
 */
export function textoCantidad(unidades, pres = '250') {
    const n = Number(unidades) || 0;
    if (pres === '1kg') {
        const b = Math.round((n / 4) * 100) / 100;
        return `${String(b).replace('.', ',')} bolsa${Math.abs(b) === 1 ? '' : 's'} de 1 kg`;
    }
    return `${n} ud${Math.abs(n) === 1 ? '' : 's'}`;
}

/** Varias presentaciones juntas: «84 uds y 1 bolsa de 1 kg». */
export function textoPartes(partes = []) {
    const por = new Map();
    for (const p of partes) if (p && p.unidades) por.set(p.pres, (por.get(p.pres) || 0) + p.unidades);
    const txt = ['250', '1kg'].filter(k => por.get(k)).map(k => textoCantidad(por.get(k), k));
    return txt.length ? txt.join(' y ') : '0 uds';
}

