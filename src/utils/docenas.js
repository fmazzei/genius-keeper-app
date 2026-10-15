// RUTA: src/utils/docenas.js
//
// En planta y en Frimaca el producto se cuenta y se despacha por DOCENA. Esta es
// la única definición de cómo se muestran y se capturan las docenas (la usan
// Kroma y GK). Reglas del dueño:
//   · Las docenas ACOMPAÑAN a las unidades, nunca las reemplazan.
//   · Las presentaciones de 1 kg (y el granel en kg) son independientes: NUNCA
//     se agrupan en docenas.

/** "2 docenas y 6 sueltas" / "3 docenas" / "8 sueltas". */
export const enDocenas = (unidades) => {
    const n = Math.max(0, Math.floor(Number(unidades) || 0));
    const d = Math.floor(n / 12), s = n % 12;
    const tD = d === 1 ? '1 docena' : `${d} docenas`;
    const tS = s === 1 ? '1 suelta' : `${s} sueltas`;
    if (d === 0) return tS;
    return s === 0 ? tD : `${tD} y ${tS}`;
};

/** { docenas, sueltas } de un total de unidades. */
export const partirDocenas = (unidades) => {
    const n = Math.max(0, Math.floor(Number(unidades) || 0));
    return { docenas: Math.floor(n / 12), sueltas: n % 12 };
};

/** Unidades a partir de docenas + sueltas. */
export const desdeDocenas = (docenas, sueltas) =>
    Math.max(0, Math.floor(Number(docenas) || 0)) * 12 + Math.max(0, Math.floor(Number(sueltas) || 0));

/**
 * ¿Esta partida se cuenta en docenas? No si va en kg ni si es de 1 kg o más
 * (por su peso por unidad o por el texto de la presentación).
 */
export const cuentaEnDocenas = (item) => {
    if (!item) return false;
    if (String(item.unit || '').toLowerCase() === 'kg') return false;
    const peso = Number(item.pesoPorUnidad) || 0;     // kg por unidad
    if (peso >= 1) return false;
    const txt = `${item.presentacion || ''} ${item.productoNombre || ''}`.toLowerCase();
    const m = txt.match(/(\d+(?:[.,]\d+)?)\s*kg\b/);
    if (m && Number(m[1].replace(',', '.')) >= 1) return false;
    return true;
};

/**
 * Estado del vencimiento ("YYYY-MM-DD") a la fecha `hoy`, para darle color:
 * vencido (rojo), ≤7 días (rojo), ≤30 días (ámbar), resto (verde).
 */
export const estadoVence = (fecha, hoy = new Date()) => {
    const m = String(fecha || '').match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (!m) return null;
    const v = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
    const h = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate());
    const dias = Math.round((v - h) / 86400000);
    const nivel = dias < 0 ? 'vencido' : dias <= 7 ? 'critico' : dias <= 30 ? 'pronto' : 'ok';
    const texto = dias < 0 ? `vencido hace ${-dias} d` : dias === 0 ? 'vence hoy' : `faltan ${dias} d`;
    return { dias, nivel, texto };
};
