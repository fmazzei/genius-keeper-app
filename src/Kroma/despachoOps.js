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

import { collection, doc, runTransaction, serverTimestamp } from 'firebase/firestore';

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
        const porItem = new Map();
        aCaracas.forEach(l => porItem.set(l.inventoryId, (porItem.get(l.inventoryId) || 0) + (Number(l.cantidad) || 0)));
        const leidos = [];
        for (const [invId, total] of porItem) {
            const ref = doc(db, 'kroma_inventory_pt', invId);
            const snap = await tx.get(ref);
            const linea = aCaracas.find(l => l.inventoryId === invId);
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
            leidos.push({ ref, data, field, deducir, restante: +(actual - deducir).toFixed(3), isEmpacado });
        }

        for (const r of leidos) {
            tx.update(r.ref, r.restante <= 0 ? { [r.field]: 0, active: false } : { [r.field]: r.restante });
            tx.set(doc(collection(db, 'kroma_warehouse_movements')), {
                tipo:            'despacho_salida',
                origenId:        r.data.warehouseId || null,
                origenNombre:    nombreAlmacen(r.data.warehouseId),
                destinoId:       null,
                destinoNombre:   'Camino a Caracas — cierra Recepción Frimaca',
                productoNombre:  r.data.productoNombre || '',
                presentacion:    r.data.presentacion || '',
                lote:            r.data.lote || '',
                fechaVencimiento: r.data.fechaVencimiento || null,
                cantidad:        r.deducir,
                unidad:          r.isEmpacado ? 'unidades' : 'kg',
                empresaId,
                creadoPorId:     responsable.id || null,
                creadoPorNombre: responsable.nombre || null,
                createdAt:       serverTimestamp(),
            });
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
            tx.set(ref, { ...base, destinoCaracas: false, lineas: aOtros });
            ids.push(ref.id);
        }
    });
    return ids;
}
