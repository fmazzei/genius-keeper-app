// RUTA: src/Kroma/despachoOps.js
//
// Registrar un despacho de planta, en UNA transacción: se descuenta la planta,
// se anota el libro de movimientos y se crea el despacho — o no se hace nada.
// Separado de DespachoPage para poder probarlo contra el emulador con el mismo
// código que corre en la app.
//
//   aCaracas / aOtros — líneas ya armadas ({inventoryId, productoNombre,
//   presentacion, tipo, lote, fechaVencimiento, cantidad, unit, destino}).
//   Se guarda un despacho por cada vía: Caracas lo cierra la Recepción en
//   Frimaca (GK); el resto, "Marcar como Entregado" en Kroma.
//
// TODAS las líneas se descuentan de la planta AL DESPACHAR (decisión del
// dueño, 2026-10): a Caracas es un TRASLADO (sigue siendo inventario de
// Lacteoca, en camino a Frimaca); a otra ciudad es una SALIDA definitiva, como
// una venta. Antes, las de otra ciudad se descontaban recién al "Marcar como
// Entregado", sin verificar stock y sin dejar movimiento en el libro.

import { collection, doc, runTransaction, serverTimestamp } from 'firebase/firestore';

const destinoTexto = (d) => {
    if (!d) return 'Otra ciudad';
    if (typeof d === 'string') return d;
    return [d.ciudad, d.estado].filter(Boolean).join(', ') || d.nombre || 'Otra ciudad';
};

export async function registrarDespacho(db, {
    aCaracas = [], aOtros = [], fecha, hoy, notas = '', empresaId = 'lacteoca',
    responsable = { id: '', nombre: '' }, nombreAlmacen = () => 'Planta',
}) {
    if (aCaracas.length === 0 && aOtros.length === 0) throw new Error('No hay líneas que despachar.');
    const ids = [];
    await runTransaction(db, async (tx) => {
        ids.length = 0;   // la transacción puede reintentarse
        // Lecturas primero (regla de las transacciones): el stock REAL del
        // momento. Dos líneas del mismo lote se suman antes de validar.
        // Un mismo lote puede ir a las dos vías: se valida contra el TOTAL y se
        // anota un movimiento por vía.
        const todas = [...aCaracas.map(l => ({ ...l, _caracas: true })), ...aOtros.map(l => ({ ...l, _caracas: false }))];
        const porItem = new Map();
        todas.forEach(l => porItem.set(l.inventoryId, (porItem.get(l.inventoryId) || 0) + (Number(l.cantidad) || 0)));
        const leidos = [];
        for (const [invId, total] of porItem) {
            const ref = doc(db, 'kroma_inventory_pt', invId);
            const snap = await tx.get(ref);
            const linea = todas.find(l => l.inventoryId === invId);
            if (!snap.exists() || snap.data().active === false) {
                throw new Error(`"${linea.productoNombre}" (lote ${linea.lote || '—'}) ya no está en el inventario de la planta.`);
            }
            const data = snap.data();
            const isEmpacado = data.tipo === 'empacado';
            const field = isEmpacado ? 'unidades' : 'kgTotales';
            const actual = Number(data[field]) || 0;
            const deducir = isEmpacado ? Math.round(total) : +(+total).toFixed(3);
            if (deducir > actual + 0.0005) {
                throw new Error(`Del lote ${linea.lote || '—'} de "${linea.productoNombre}" solo quedan ${actual} ${isEmpacado ? 'ud' : 'kg'} y se quieren despachar ${deducir}.`);
            }
            leidos.push({ ref, data, field, restante: +(actual - deducir).toFixed(3), isEmpacado,
                lineas: todas.filter(l => l.inventoryId === invId) });
        }

        for (const r of leidos) {
            tx.update(r.ref, r.restante <= 0 ? { [r.field]: 0, active: false } : { [r.field]: r.restante });
            for (const l of r.lineas) {
                const cant = r.isEmpacado ? Math.round(Number(l.cantidad) || 0) : +(+l.cantidad).toFixed(3);
                tx.set(doc(collection(db, 'kroma_warehouse_movements')), {
                    tipo:            l._caracas ? 'despacho_salida' : 'despacho_ciudad',
                    origenId:        r.data.warehouseId || null,
                    origenNombre:    nombreAlmacen(r.data.warehouseId),
                    destinoId:       null,
                    destinoNombre:   l._caracas ? 'Camino a Caracas — cierra Recepción Frimaca' : destinoTexto(l.destino),
                    productoNombre:  r.data.productoNombre || '',
                    presentacion:    r.data.presentacion || '',
                    lote:            r.data.lote || '',
                    fechaVencimiento: r.data.fechaVencimiento || null,
                    logId:           r.data.logId || null,
                    inventoryId:     r.ref.id,
                    cantidad:        cant,
                    unidad:          r.isEmpacado ? 'unidades' : 'kg',
                    fecha,
                    empresaId,
                    creadoPorId:     responsable.id || null,
                    creadoPorNombre: responsable.nombre || null,
                    createdAt:       serverTimestamp(),
                });
            }
        }

        const base = {
            fecha,
            cargadaEnDiferido: fecha !== hoy,
            horasSalida: serverTimestamp(),
            responsable,
            notas,
            estado:      'en_transito',
            empresaId,
            active:      true,
            createdAt:   serverTimestamp(),
        };
        if (aCaracas.length) {
            const ref = doc(collection(db, 'kroma_despachos'));
            tx.set(ref, { ...base, destinoCaracas: true, lineas: aCaracas.map(l => ({ ...l, plantaDeducida: true })) });
            ids.push(ref.id);
        }
        if (aOtros.length) {
            const ref = doc(collection(db, 'kroma_despachos'));
            tx.set(ref, { ...base, destinoCaracas: false, lineas: aOtros.map(l => ({ ...l, plantaDeducida: true })) });
            ids.push(ref.id);
        }
    });
    return ids;
}
