// RUTA: src/utils/razonesZoho.js
//
// La lista de RAZONES SOCIALES de Zoho para elegir en la ficha del PDV.
// `clientes_zoho` trae un documento por CARNET (customer_id), y una razón
// social con sucursales tiene varios ("Central Madeirense, C.A. (El Marqués)",
// "… (Santa Marta)"). Acá se agrupan por razón social canónica (sin el
// paréntesis de sucursal) para elegir primero la empresa y después la sucursal.

const normalize = (str) =>
    (str || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();

/** Razón social sin el "(Sucursal)" final. */
export const canonRazon = (s) => String(s || '').replace(/\s*\([^)]*\)\s*$/, '').trim();

/** Una entrada por razón social, con sus carnets ordenados. */
export function agruparRazones(clientes = []) {
    const map = new Map();
    for (const c of clientes) {
        if (c.activoEnZoho === false) continue;
        const nombre = c.razonSocialCanonica || canonRazon(c.customerName);
        if (!nombre) continue;
        const k = normalize(nombre);
        const g = map.get(k) || { clave: k, nombre, carnets: [], foodservice: false, facturas: 0 };
        g.carnets.push({ customerId: String(c.customerId || c.id), customerName: c.customerName || nombre });
        if (c.categoria === 'foodservice') g.foodservice = true;
        g.facturas += c.facturas || 0;
        map.set(k, g);
    }
    for (const g of map.values()) g.carnets.sort((a, b) => a.customerName.localeCompare(b.customerName));
    return [...map.values()].sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
}
