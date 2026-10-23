// RUTA: src/utils/liquidacionCorrecciones.js
//
// Corregir o eliminar un pago ya registrado (liquidación) DEJANDO CONSTANCIA
// (pedido del dueño, 2026-10: "si se carga un pago esto no puede corregirse y debe
// ser posible hacer la corrección dejando registro de que la hubo").
//
// La liquidación y su constancia se escriben en UNA tanda: o quedan las dos o
// ninguna. Las reglas de Firestore lo exigen así (`liquidaciones` solo acepta un
// cambio de monto/fecha/período/nota si en la misma escritura nace su registro en
// `liquidaciones_correcciones`, y esa colección no se edita ni se borra).

import { collection, doc, writeBatch, serverTimestamp, increment } from 'firebase/firestore';

export const CAMPOS_CORREGIBLES = ['monto', 'fecha', 'periodKey', 'nota'];

const igual = (a, b) => (a ?? '') === (b ?? '') || (typeof a === 'number' && Number(a) === Number(b));

/** Lee un monto escrito a mano: acepta coma decimal ("193,23") y separador de miles ("1.200,50"). */
export function leerMonto(txt) {
    const s = String(txt ?? '').trim().replace(/\s/g, '');
    if (!s) return NaN;
    const norm = s.includes(',') ? s.replace(/\./g, '').replace(',', '.') : s;
    const n = Number(norm);
    return Number.isFinite(n) ? Math.round(n * 100) / 100 : NaN;
}

/**
 * Qué cambia entre el pago guardado y lo nuevo. Solo los campos que de verdad
 * cambiaron. Devuelve { antes, despues, campos }.
 */
export function cambiosDe(liq, nuevo) {
    const antes = {}, despues = {}, campos = [];
    CAMPOS_CORREGIBLES.forEach(k => {
        if (!(k in nuevo)) return;
        const v = k === 'monto' ? Number(nuevo[k]) : (nuevo[k] ?? '');
        if (igual(liq[k], v)) return;
        antes[k] = liq[k] ?? null;
        despues[k] = v;
        campos.push(k);
    });
    return { antes, despues, campos };
}

/** Valida una corrección. Devuelve el texto del error o null. */
export function validarCorreccion(liq, nuevo, motivo) {
    if (!liq?.id) return 'Falta el pago a corregir.';
    if ('monto' in nuevo && !(Number(nuevo.monto) > 0)) return 'El monto debe ser mayor que cero. Para quitar el pago, usa "Eliminar".';
    if ('fecha' in nuevo && !/^\d{4}-\d{2}-\d{2}$/.test(String(nuevo.fecha || ''))) return 'La fecha no es válida.';
    if ('periodKey' in nuevo && !nuevo.periodKey) return 'Elige el período.';
    if (String(motivo || '').trim().length < 5) return 'Escribe el motivo de la corrección (queda en el registro).';
    if (!cambiosDe(liq, nuevo).campos.length) return 'No cambiaste nada.';
    return null;
}

const quien = (user) => ({ por: user?.uid || null, porEmail: user?.email || null });

/** Corrige un pago y deja la constancia. */
export async function corregirLiquidacion(db, { liq, nuevo, motivo, user }) {
    const err = validarCorreccion(liq, nuevo, motivo);
    if (err) throw new Error(err);
    const { antes, despues, campos } = cambiosDe(liq, nuevo);
    const corrRef = doc(collection(db, 'liquidaciones_correcciones'));
    const b = writeBatch(db);
    b.set(corrRef, {
        tipo: 'correccion', liquidacionId: liq.id, vendedorId: liq.vendedorId,
        motivo: String(motivo).trim(), campos, antes, despues,
        ...quien(user), at: serverTimestamp(),
    });
    b.update(doc(db, 'liquidaciones', liq.id), {
        ...despues,
        correcciones: increment(1),
        ultimaCorreccionId: corrRef.id,
        ultimaCorreccionAt: serverTimestamp(),
    });
    await b.commit();
    return corrRef.id;
}

/** Elimina un pago y deja la constancia con todo lo que tenía. */
export async function eliminarLiquidacion(db, { liq, motivo, user }) {
    if (!liq?.id) throw new Error('Falta el pago a eliminar.');
    if (String(motivo || '').trim().length < 5) throw new Error('Escribe el motivo (queda en el registro).');
    const antes = {};
    CAMPOS_CORREGIBLES.forEach(k => { antes[k] = liq[k] ?? null; });
    const b = writeBatch(db);
    b.set(doc(db, 'liquidaciones_correcciones', `${liq.id}__eliminado`), {
        tipo: 'eliminacion', liquidacionId: liq.id, vendedorId: liq.vendedorId,
        motivo: String(motivo).trim(), campos: CAMPOS_CORREGIBLES, antes, despues: null,
        registradoPorEmail: liq.registradoPorEmail || null,
        ...quien(user), at: serverTimestamp(),
    });
    b.delete(doc(db, 'liquidaciones', liq.id));
    await b.commit();
}

const NOMBRE_CAMPO = { monto: 'Monto', fecha: 'Fecha', periodKey: 'Período', nota: 'Nota' };
/** "Monto: $350,00 → $200,00 · Período: … → …" para mostrar el registro. */
export function describirCambio(c, { money = (n) => `$${Number(n).toFixed(2)}`, periodo = (k) => k } = {}) {
    if (c.tipo === 'eliminacion') return `Pago eliminado (${money(c.antes?.monto)} del ${c.antes?.fecha || '—'})`;
    return (c.campos || []).map(k => {
        const f = k === 'monto' ? money : k === 'periodKey' ? periodo : (v) => (v || '—');
        return `${NOMBRE_CAMPO[k] || k}: ${f(c.antes?.[k])} → ${f(c.despues?.[k])}`;
    }).join(' · ');
}
