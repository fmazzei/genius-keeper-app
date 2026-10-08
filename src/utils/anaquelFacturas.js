// RUTA: src/utils/anaquelFacturas.js
//
// FACTURAS DE ZOHO COMO ENTREGAS AL ANAQUEL (anaquel v2, solo lectura).
//
// Cruce del dueño (8-oct): de 21 intervalos de visitas negativos, 13 tenían una
// factura fechada entre las dos visitas; sumándola, la venta salía positiva y
// razonable. Las entregas facturadas y despachadas fuera de una visita no
// entraban en ningún `orderQuantity`. Este módulo asigna cada factura a un PDV
// y a un día, para usarla como "unidades que entraron al anaquel".
//
// Reglas:
//  · Se usan las unidades que GK guarda en la factura (`unidades`, suma de las
//    cantidades de las líneas, ya convertidas de kg a unidades de venta). No se
//    deducen del monto.
//  · Cuentan las facturas que representan mercancía física: fuera las anuladas,
//    las que ya no existen en Zoho y las que volvieron a borrador. Las de
//    reposición SÍ cuentan: el producto repuesto entra al anaquel.
//  · Factura → PDV por el carnet de Zoho del PDV (`zohoCustomerId`); si el PDV no
//    tiene carnet, por su razón social normalizada. Si el carnet o la razón
//    social la comparten dos PDV o más (cadena con factura central, o un PDV
//    duplicado), la factura NO se asigna: no se sabe a qué anaquel fue.
//  · Cada factura cae en UN solo intervalo: el que termina en su día o después y
//    empezó antes de su día — (día de la visita inicial, día de la visita final].
//  · "Dudosa": a ±1 día de una de las dos visitas (suele haber 24 h entre
//    facturar y despachar, así que pudo entrar en el intervalo vecino).

import { DIAS_FACTURA_DUDOSA } from './anaquelConstantes.js';

const DIA = 86400;

export function aSegF(v) {
    if (!v) return 0;
    if (typeof v === 'number') return v > 1e11 ? v / 1000 : v;
    if (v.seconds != null) return v.seconds;
    if (v.toDate) return v.toDate().getTime() / 1000;
    if (v instanceof Date) return v.getTime() / 1000;
    if (typeof v === 'string') {
        const m = v.match(/^(\d{4})-(\d{2})-(\d{2})$/);
        if (m) return new Date(+m[1], +m[2] - 1, +m[3], 12).getTime() / 1000;
        const t = Date.parse(v);
        return Number.isNaN(t) ? 0 : t / 1000;
    }
    return 0;
}

/** 'YYYY-MM-DD' en hora local. */
export function diaDe(s) {
    if (!s) return null;
    const d = new Date(s * 1000);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Días entre dos 'YYYY-MM-DD' (b − a). */
export function diasEntre(a, b) {
    const [y1, m1, d1] = a.split('-').map(Number);
    const [y2, m2, d2] = b.split('-').map(Number);
    return Math.round((Date.UTC(y2, m2 - 1, d2) - Date.UTC(y1, m1 - 1, d1)) / (DIA * 1000));
}

export const normNombreF = (s) => String(s || '').toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/\b(c\s*a|s\s*a|s\s*r\s*l|c\s*v\s*a)\b\.?/g, ' ')
    .replace(/[^a-z0-9()]+/g, ' ').replace(/\s+/g, ' ').trim();

/** ¿La factura representa mercancía que salió hacia un cliente? */
export function esFacturaFisica(f) {
    if (!f) return false;
    if (f.estado === 'anulada' || f.estado === 'borrador') return false;
    if (f.ausenteEnZoho === true || f.borradorEnZoho === true) return false;
    return (Number(f.unidades) || 0) > 0 && !!aSegF(f.fecha);
}

const llaveDePdv = (p) => (p?.zohoCustomerId ? `c:${p.zohoCustomerId}` : (p?.razonSocialZoho ? `n:${normNombreF(p.razonSocialZoho)}` : null));

/**
 * Asigna las facturas físicas a los PDV.
 * @returns {{
 *   porPos: Object<string, {numero, dia, t, unidades}[]>,
 *   estadoPdv: Object<string, 'ok'|'sin_vinculo'|'compartido'>,
 *   noAsignadas: {numero, dia, t, unidades, motivo:'compartida'|'sin_pdv'}[],
 *   compartidos: {llave, pdv:string[]}[],
 * }}
 */
export function facturasPorPdv(facturas = [], posList = []) {
    const vivos = (posList || []).filter(p => p && !p.eliminado);
    const uso = {};
    vivos.forEach(p => { const k = llaveDePdv(p); if (k) (uso[k] = uso[k] || []).push(p.id); });
    const estadoPdv = {};
    const pdvDeLlave = {};
    vivos.forEach(p => {
        const k = llaveDePdv(p);
        if (!k) { estadoPdv[p.id] = 'sin_vinculo'; return; }
        if (uso[k].length > 1) { estadoPdv[p.id] = 'compartido'; return; }
        estadoPdv[p.id] = 'ok';
        pdvDeLlave[k] = p.id;
    });
    const porPos = {};
    const noAsignadas = [];
    (facturas || []).filter(esFacturaFisica).forEach(f => {
        const t = aSegF(f.fecha);
        const x = { numero: f.numero || f.id || null, dia: diaDe(t), t, unidades: Number(f.unidades) || 0 };
        const kC = f.zohoCustomerId ? `c:${f.zohoCustomerId}` : null;
        const kN = f.clienteName ? `n:${normNombreF(f.clienteName)}` : null;
        const k = (kC && uso[kC]) ? kC : (kN && uso[kN]) ? kN : null;
        if (!k) { noAsignadas.push({ ...x, motivo: 'sin_pdv' }); return; }
        if (uso[k].length > 1) { noAsignadas.push({ ...x, motivo: 'compartida' }); return; }
        (porPos[pdvDeLlave[k]] = porPos[pdvDeLlave[k]] || []).push(x);
    });
    Object.values(porPos).forEach(l => l.sort((a, b) => a.t - b.t));
    const compartidos = Object.entries(uso).filter(([, l]) => l.length > 1).map(([llave, pdv]) => ({ llave, pdv }));
    return { porPos, estadoPdv, noAsignadas, compartidos };
}

/** Facturas de un PDV que caen en el intervalo (díaIni, díaFin], con su marca de "dudosa". */
export function facturasDelIntervalo(lista = [], diaIni, diaFin) {
    return (lista || [])
        .filter(f => f.dia > diaIni && f.dia <= diaFin)
        .map(f => ({
            ...f,
            dudosa: Math.abs(diasEntre(diaIni, f.dia)) <= DIAS_FACTURA_DUDOSA || Math.abs(diasEntre(f.dia, diaFin)) <= DIAS_FACTURA_DUDOSA,
        }));
}
