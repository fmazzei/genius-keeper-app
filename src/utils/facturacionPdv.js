// RUTA: src/utils/facturacionPdv.js
//
// CUÁNTO FACTURA CADA PUNTO DE VENTA.
//
// Es lo que ordena la lista de PDV del tablero: el socio quiere verlos por PESO
// de facturación, no alfabéticos ni por fecha de alta. Un PDV que factura $4.000
// al mes y uno que factura $80 no son el mismo problema, y en una lista ordenada
// por nombre se ven igual.
//
// La llave es el CARNET de Zoho (`zohoCustomerId`), no el nombre: es la regla
// establecida en GK desde que un renombre en Zoho dejó 45 facturas huérfanas de
// su PDV en silencio (ver "El PDV se vincula al CARNET de Zoho, no al nombre").
// El nombre queda como respaldo para lo que todavía no se ha re-vinculado.

import { cuentaEnCartera } from './facturaEstado.js';

/**
 * Corte de las ventas: el socio pidió contar SOLO desde 2026. Lo anterior es
 * historia de otra etapa comercial y mezclarla desdibuja la tendencia.
 * Vive acá —con la lógica de ventas— y no dentro del hook, para poder
 * verificarla sin montar React ni Firebase.
 */
export const DESDE_VENTAS = new Date(2026, 0, 1);

const sinAcentos = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '');

/** Nombre comparable: sin acentos, sin puntuación ni forma jurídica. */
export const clavePorNombre = (s) => sinAcentos(s)
    .toLowerCase()
    .replace(/\b(c\.?\s?a\.?|s\.?\s?a\.?|srl|rl|compania|compañia)\b/g, ' ')
    .replace(/[.,;:'"]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

/** La fecha de una factura, venga como Timestamp, Date o texto. */
export const fechaDeFactura = (f) => {
    const v = f?.fecha;
    if (!v) return null;
    const d = v?.toDate ? v.toDate() : new Date(v);
    return Number.isNaN(d.getTime()) ? null : d;
};

/**
 * Facturación acumulada por punto de venta.
 *
 * @param pos       lista de PDV (`pos`)
 * @param facturas  `facturas_vendedor`
 * @param desde     opcional: Date a partir de la cual contar
 * @returns Map posId → { monto, nFacturas }
 *
 * Solo entran facturas que cuentan en cartera: una anulada o una que ya no
 * existe en Zoho no es una venta, y contarla ordenaría mal la lista.
 */
export function facturacionPorPdv(pos = [], facturas = [], { desde = null } = {}) {
    // Índices del lado de los PDV.
    const porCarnet = new Map();
    const porNombre = new Map();
    pos.forEach(p => {
        if (p?.zohoCustomerId) {
            if (!porCarnet.has(p.zohoCustomerId)) porCarnet.set(p.zohoCustomerId, []);
            porCarnet.get(p.zohoCustomerId).push(p.id);
        }
        const k = clavePorNombre(p?.razonSocialZoho);
        if (k) {
            if (!porNombre.has(k)) porNombre.set(k, []);
            porNombre.get(k).push(p.id);
        }
    });

    const acum = new Map();
    const sumar = (posId, monto) => {
        const a = acum.get(posId) || { monto: 0, nFacturas: 0 };
        a.monto += monto; a.nFacturas += 1;
        acum.set(posId, a);
    };

    facturas.forEach(f => {
        if (!cuentaEnCartera(f)) return;
        if (desde) {
            const d = fechaDeFactura(f);
            if (!d || d < desde) return;
        }
        const monto = Number(f.monto ?? f.total ?? 0) || 0;

        let destinos = f.zohoCustomerId ? porCarnet.get(f.zohoCustomerId) : null;
        if (!destinos || destinos.length === 0) {
            destinos = porNombre.get(clavePorNombre(f.clienteNombre || f.customerName));
        }
        if (!destinos || destinos.length === 0) return;   // factura sin PDV: no se reparte
        // Si varios PDV comparten el mismo cliente, la venta se reparte entre
        // ellos: atribuirla entera a cada uno inflaría el total de la empresa.
        const parte = monto / destinos.length;
        destinos.forEach(id => sumar(id, parte));
    });

    return acum;
}

/** ¿Este PDV está activo? `INACTIVO` en GK significa frecuencia 0, no borrado. */
export const pdvActivo = (p) => p?.active !== false;

/** La ciudad del PDV, normalizada para agrupar. */
export const ciudadDePdv = (p) => {
    const c = String(p?.ciudad || p?.city || '').trim();
    return c || 'Sin ciudad';
};
