// RUTA: src/utils/recepcionOps.js
//
// Recepción en Frimaca de un despacho de planta, en UNA transacción:
// inventario comercial + libro de movimientos + acta + cierre del despacho, o
// nada. Separado de RecepcionFrimacaSheet para probarlo contra el emulador con
// el mismo código de la app.

import { collection, doc, runTransaction, serverTimestamp } from 'firebase/firestore';
import { marcaMov } from './movInventario.js';

const norm = (s) => (s || '').trim().toLowerCase();

export async function recibirDespacho(db, {
    despachoId, lineas = [], rows = [], inventario = [],
    almacenId, almacenNombre, actor = { id: '', nombre: '', role: '' },
    planillaFoto = null, notas = '',
}) {
    const conNovedad = rows.some(r => r && r.estadoOk === false);
    // Cada renglón recibido va al lote VIGENTE del mismo producto, la
    // misma PRESENTACIÓN, lote y vencimiento (antes no miraba la
    // presentación: 250 g y 1 kg del mismo lote se sumaban en una sola
    // fila). Varios renglones iguales se juntan antes de escribir.
    const grupos = new Map();
    lineas.forEach((l, i) => {
        const recibida = Number(rows[i]?.cantidadRecibida) || 0;
        if (recibida <= 0) return;
        // También por lote de producción y costo: dos lotes con el mismo texto
        // (las planillas "-H" se repiten) no se mezclan en una fila con un
        // costo que no es de ninguno (inventario perpetuo).
        const k = [norm(l.productoNombre), norm(l.presentacion), l.lote || '', l.fechaVencimiento || '', l.logId || '', l.costoUnitarioUsd || ''].join('|');
        const g = grupos.get(k) || { l, recibida: 0, notas: [] };
        g.recibida += recibida;
        if (!rows[i]?.estadoOk) g.notas.push(rows[i]?.novedad || 'novedad');
        grupos.set(k, g);
    });

    // UNA transacción: inventario + libro + acta + cierre del despacho, o
    // nada. Antes eran escrituras sueltas: si se caía la conexión a mitad,
    // el reintento volvía a sumar lo que ya había entrado. Y comprueba que
    // el despacho SIGA en tránsito: dos teléfonos no pueden recibirlo dos
    // veces.
    await runTransaction(db, async (tx) => {
        const despRef = doc(db, 'kroma_despachos', despachoId);
        const despSnap = await tx.get(despRef);
        if (!despSnap.exists()) throw new Error('Ese despacho ya no existe.');
        const d = despSnap.data();
        if (d.estado !== 'en_transito' || d.inventarioAplicado === true) {
            throw new Error('Este despacho ya fue recibido. Recarga la pantalla.');
        }

        const planes = [];
        for (const g of grupos.values()) {
            const { l } = g;
            const existing = inventario.find(inv =>
                inv.almacenId === almacenId &&
                norm(inv.productoNombre) === norm(l.productoNombre) &&
                norm(inv.presentacion) === norm(l.presentacion) &&
                (inv.lote || '') === (l.lote || '') &&
                (inv.fechaVencimiento || '') === (l.fechaVencimiento || '') &&
                (inv.logId || null) === (l.logId || null) &&
                (Number(inv.costoUnitarioUsd) || null) === (Number(l.costoUnitarioUsd) || null) &&
                (Number(inv.unidades) || 0) > 0
            );
            let antes = 0; let ref = null;
            if (existing) {
                ref = doc(db, 'inventario_comercial', existing.id);
                const fresh = await tx.get(ref);
                if (fresh.exists() && (Number(fresh.data().unidades) || 0) > 0) antes = Number(fresh.data().unidades) || 0;
                else ref = null;   // se cerró entretanto: abre un registro nuevo
            }
            planes.push({ g, ref, antes });
        }

        for (const { g, ref, antes } of planes) {
            const { l, recibida } = g;
            const despues = +(antes + recibida).toFixed(3);
            const marca = marcaMov('recepcion', { motivo: `Recepción del despacho ${despachoId}`, ref: { despachoId }, usuario: actor });
            if (ref) {
                tx.update(ref, { unidades: despues, updatedAt: serverTimestamp(), updatedBy: actor, ...marca });
            } else {
                tx.set(doc(collection(db, 'inventario_comercial')), {
                    almacenId, almacenNombre: almacenNombre,
                    productoNombre: l.productoNombre, presentacion: l.presentacion || '',
                    tipo: l.tipo || 'empacado', unit: l.unit || 'ud',
                    lote: l.lote || '', fechaVencimiento: l.fechaVencimiento || '', unidades: despues,
                    // Identidad y costo del lote de Kroma (viajan en la línea del despacho).
                    productoId: l.productoId || null, catalogId: l.catalogId || null, logId: l.logId || null,
                    pesoPorUnidad: Number(l.pesoPorUnidad) || null,
                    ...(Number(l.costoUnitarioUsd) > 0 ? { costoUnitarioUsd: Number(l.costoUnitarioUsd) } : {}),
                    empresaId: 'lacteoca',
                    origenDespachoId: despachoId, updatedAt: serverTimestamp(), updatedBy: actor, ...marca,
                });
            }
            tx.set(doc(collection(db, 'inventario_movimientos')), {
                almacenId, almacenNombre: almacenNombre,
                productoNombre: l.productoNombre, presentacion: l.presentacion || '',
                lote: l.lote || '', fechaVencimiento: l.fechaVencimiento || '',
                tipo: 'entrada_recepcion', cantidad: recibida,
                unidadesAntes: antes, unidadesDespues: despues,
                ref: { despachoId: despachoId },
                actorId: actor.id, actorNombre: actor.nombre, actorRole: actor.role,
                nota: g.notas.join(' · '),
                createdAt: serverTimestamp(),
            });
        }

        // Acta de recepción con fotos (doc aparte para no inflar el despacho).
        tx.set(doc(db, 'recepciones_frimaca', despachoId), {
            despachoId: despachoId,
            recibidoPor: actor, recibidoAt: serverTimestamp(),
            almacenId, almacenNombre: almacenNombre,
            lineasRecibidas: lineas.map((l, i) => ({
                productoNombre: l.productoNombre, presentacion: l.presentacion || '',
                lote: l.lote || '', fechaVencimiento: l.fechaVencimiento || '',
                unit: l.unit || 'ud',
                cantidadEnviada: Number(l.cantidad) || 0,
                logId: l.logId || null, inventoryId: l.inventoryId || null,
                pesoPorUnidad: Number(l.pesoPorUnidad) || null,
                costoUnitarioUsd: Number(l.costoUnitarioUsd) > 0 ? Number(l.costoUnitarioUsd) : null,
                cantidadRecibida: Number(rows[i]?.cantidadRecibida) || 0,
                estadoOk: rows[i]?.estadoOk !== false,
                novedad: rows[i]?.estadoOk ? '' : (rows[i]?.novedad || ''),
                novedadFoto: rows[i]?.estadoOk ? null : (rows[i]?.novedadFoto || null),
            })),
            conNovedad, planillaFoto, notas: notas.trim(),
            createdAt: serverTimestamp(),
        });

        // Cerrar el despacho.
        tx.update(despRef, {
            estado: 'recibido_caracas',
            recibidoCaracas: true,
            recibidoPor: actor,
            recibidoEnGKAt: serverTimestamp(),
            almacenComercialId: almacenId,
            almacenComercialNombre: almacenNombre,
            conNovedad,
            inventarioAplicado: true,
        });
    });
}
