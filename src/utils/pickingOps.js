// RUTA: src/utils/pickingOps.js
//
// Picking en Frimaca en UNA transacción: descuenta la fila de
// `inventario_comercial` con el stock REAL del momento, anota el libro de
// movimientos de GK y crea el registro del picking — o no hace nada.
//
// Antes eran tres escrituras sueltas que calculaban "stock − cantidad" con el
// dato que tenía el teléfono al abrir la hoja: dos personas a la vez se pisaban
// y la última dejaba el stock mal. Para el inventario perpetuo el picking es la
// SALIDA de Frimaca (decisión del dueño, 2026-10), así que además lleva su
// marca de movimiento y, si se indicó, el punto de venta de destino.

import { collection, doc, runTransaction, serverTimestamp } from 'firebase/firestore';
import { marcaMov } from './movInventario.js';

const r3 = (n) => Math.round((Number(n) + Number.EPSILON) * 1000) / 1000;

export async function registrarPicking(db, { itemId, cantidad, fecha, hora, actor = {}, pdv = null }) {
    const qty = r3(cantidad);
    if (!(qty > 0)) throw new Error('Indica cuánto retiras.');
    const actorLabel = { id: actor.id || '', nombre: actor.nombre || '', role: actor.role || '' };
    let resultado = null;
    await runTransaction(db, async (tx) => {
        const ref = doc(db, 'inventario_comercial', itemId);
        const snap = await tx.get(ref);
        if (!snap.exists()) throw new Error('Ese lote ya no está en Frimaca. Recarga la pantalla.');
        const item = snap.data();
        const stock = Number(item.unidades) || 0;
        const unit = item.unit || 'ud';
        if (unit !== 'kg' && Math.round(qty) !== qty) throw new Error('Este producto sale por unidades enteras.');
        if (qty > stock + 0.0005) throw new Error(`Solo quedan ${stock} ${unit} de este lote y se quieren retirar ${qty}.`);
        const despues = r3(Math.max(0, stock - qty));
        const pickRef = doc(collection(db, 'pickings'));
        const destino = pdv?.id ? { posId: pdv.id, posNombre: pdv.nombre || '' } : null;

        tx.update(ref, {
            unidades: despues, updatedAt: serverTimestamp(), updatedBy: actorLabel,
            ...marcaMov('picking', {
                motivo: destino ? `Picking para ${destino.posNombre}` : 'Picking (ruta)',
                ref: { pickingId: pickRef.id, ...(destino || {}) }, usuario: actorLabel,
            }),
        });
        tx.set(doc(collection(db, 'inventario_movimientos')), {
            almacenId: item.almacenId || null, almacenNombre: item.almacenNombre || '',
            productoNombre: item.productoNombre, presentacion: item.presentacion || '',
            lote: item.lote || '', fechaVencimiento: item.fechaVencimiento || '',
            tipo: 'picking', cantidad: -qty, unidadesAntes: stock, unidadesDespues: despues,
            unit, ref: { itemId, pickingId: pickRef.id, ...(destino || {}) },
            actorId: actorLabel.id, actorNombre: actorLabel.nombre, actorRole: actorLabel.role,
            nota: `Picking ${fecha} ${hora}${destino ? ` · ${destino.posNombre}` : ''}`, createdAt: serverTimestamp(),
        });
        tx.set(pickRef, {
            almacenId: item.almacenId || null, almacenNombre: item.almacenNombre || '',
            productoNombre: item.productoNombre, presentacion: item.presentacion || '',
            lote: item.lote || '', fechaVencimiento: item.fechaVencimiento || '',
            logId: item.logId || null, itemId,
            unit, cantidad: qty, fecha, hora,
            stockAntes: stock, stockDespues: despues,
            ...(destino || {}),
            mercaderistaId: actorLabel.id, mercaderistaNombre: actorLabel.nombre, mercaderistaRole: actorLabel.role,
            estado: 'aplicado', createdAt: serverTimestamp(),
        });
        resultado = { pickingId: pickRef.id, unidades: despues };
    });
    return resultado;
}
