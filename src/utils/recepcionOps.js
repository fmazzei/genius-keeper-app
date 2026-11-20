// RUTA: src/utils/recepcionOps.js
//
// Recepción en Frimaca de un despacho de planta, en UNA transacción:
// inventario comercial + libro de movimientos + acta + cierre del despacho, o
// nada. Separado de RecepcionFrimacaSheet para probarlo contra el emulador con
// el mismo código de la app.

import { collection, doc, runTransaction, serverTimestamp } from 'firebase/firestore';
import { marcaMov } from './movInventario.js';
import { registrarPicking } from './pickingOps.js';

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
    const grupoDeLinea = [];
    lineas.forEach((l, i) => {
        const recibida = Number(rows[i]?.cantidadRecibida) || 0;
        if (recibida <= 0) return;
        // También por lote de producción y costo: dos lotes con el mismo texto
        // (las planillas "-H" se repiten) no se mezclan en una fila con un
        // costo que no es de ninguno (inventario perpetuo).
        const k = [norm(l.productoNombre), norm(l.presentacion), l.lote || '', l.fechaVencimiento || '', l.logId || '', l.costoUnitarioUsd || ''].join('|');
        const g = grupos.get(k) || { l, recibida: 0, notas: [] };
        g.recibida += recibida;
        grupoDeLinea[i] = k;
        if (!rows[i]?.estadoOk) g.notas.push(rows[i]?.novedad || 'novedad');
        grupos.set(k, g);
    });

    // UNA transacción: inventario + libro + acta + cierre del despacho, o
    // nada. Antes eran escrituras sueltas: si se caía la conexión a mitad,
    // el reintento volvía a sumar lo que ya había entrado. Y comprueba que
    // el despacho SIGA en tránsito: dos teléfonos no pueden recibirlo dos
    // veces.
    const itemDeGrupo = new Map();
    await runTransaction(db, async (tx) => {
        itemDeGrupo.clear();
        const despRef = doc(db, 'kroma_despachos', despachoId);
        const despSnap = await tx.get(despRef);
        if (!despSnap.exists()) throw new Error('Ese despacho ya no existe.');
        const d = despSnap.data();
        if (d.estado !== 'en_transito' || d.inventarioAplicado === true) {
            throw new Error('Este despacho ya fue recibido. Recarga la pantalla.');
        }

        const planes = [];
        for (const [k, g] of grupos) {
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
            planes.push({ g, ref, antes, k });
        }

        for (const { g, ref, antes, k } of planes) {
            const { l, recibida } = g;
            const despues = +(antes + recibida).toFixed(3);
            const marca = marcaMov('recepcion', { motivo: `Recepción del despacho ${despachoId}`, ref: { despachoId }, usuario: actor });
            if (ref) {
                tx.update(ref, { unidades: despues, updatedAt: serverTimestamp(), updatedBy: actor, ...marca });
                itemDeGrupo.set(k, ref.id);
            } else {
                const nuevo = doc(collection(db, 'inventario_comercial'));
                itemDeGrupo.set(k, nuevo.id);
                tx.set(nuevo, {
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
    // Partida de Frimaca donde quedó cada línea (para el retiro del mercaderista).
    return { itemPorLinea: lineas.map((_, i) => itemDeGrupo.get(grupoDeLinea[i]) || null) };
}

/**
 * Recepción con RETIRO DEL MERCADERISTA (pedido del dueño, 20-nov): cuando el
 * mercaderista se queda con parte del camión para despacharla de una vez, todo
 * se recibe en Frimaca y lo que se llevó sale como picking a su nombre. Así el
 * inventario sigue el hilo: Barinas → camión → Frimaca → ruta del mercaderista,
 * y «En la mano» sigue si lo entregó.
 *
 * Son dos pasos porque el libro valorado necesita ver la entrada y la salida de
 * la partida por separado. Si el retiro falla, la recepción ya quedó y el error
 * dice qué falta anotar como picking.
 *
 * `retiros[i]`: unidades de la línea i con las que se quedó el mercaderista.
 */
export async function recibirConRetiro(db, args) {
    const { retiros = [], mercaderista = null, actor = {}, despachoId, lineas = [], rows = [] } = args;
    const total = retiros.reduce((s, n) => s + (Number(n) || 0), 0);
    if (total > 0) {
        if (!mercaderista?.id) throw new Error('Elige qué mercaderista se quedó con el producto.');
        lineas.forEach((l, i) => {
            const r = Number(retiros[i]) || 0;
            const rec = Number(rows[i]?.cantidadRecibida) || 0;
            if (r < 0 || r > rec) throw new Error(`${l.productoNombre}: el mercaderista no puede quedarse con más de lo recibido (${rec}).`);
        });
    }
    const { itemPorLinea } = await recibirDespacho(db, args);
    if (!(total > 0)) return { itemPorLinea, pickings: [] };

    const ahora = new Date();
    const fecha = `${ahora.getFullYear()}-${String(ahora.getMonth() + 1).padStart(2, '0')}-${String(ahora.getDate()).padStart(2, '0')}`;
    const hora = `${String(ahora.getHours()).padStart(2, '0')}:${String(ahora.getMinutes()).padStart(2, '0')}`;
    const pickings = [];
    const faltan = [];
    for (let i = 0; i < lineas.length; i++) {
        const n = Number(retiros[i]) || 0;
        if (!(n > 0)) continue;
        const itemId = itemPorLinea[i];
        try {
            if (!itemId) throw new Error('no se encontró la partida recibida');
            const res = await registrarPicking(db, {
                itemId, cantidad: n, fecha, hora, actor, retiradoPor: mercaderista,
                origen: 'recepcion', despachoId,
            });
            pickings.push(res.pickingId);
        } catch (e) {
            faltan.push(`${n} de ${lineas[i].productoNombre}${lineas[i].lote ? ` (lote ${lineas[i].lote})` : ''}`);
        }
    }
    if (faltan.length) {
        throw new Error(`La recepción quedó guardada, pero no el retiro de ${faltan.join(' y ')}. Anótalo como picking a nombre de ${mercaderista.nombre}.`);
    }
    return { itemPorLinea, pickings };
}
