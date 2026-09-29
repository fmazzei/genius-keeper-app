// RUTA: src/Kroma/salidasCava.js
//
// SALIDAS DE LA CAVA que NO son una transferencia (2026-09).
//
// Regla del dueño para distinguirlas: ¿el producto sigue siendo de la empresa?
//   · Transferencia — sí, solo cambia de lugar (a Caracas por despacho, o dentro
//     de la planta). No vive aquí: usa el despacho / "Mover producto".
//   · Venta         — no, pasa a un cliente (carnet de Zoho). Queda "por
//     facturar" hasta que administración la factura o le vincula su factura.
//   · Reposición    — no: se le reemplaza a un cliente, sin cobrar, producto
//     vencido o dañado. Lleva cliente, motivo y lo que el cliente DEVOLVIÓ.
//     Esquema contable de la administradora (decidido por el dueño): en Zoho
//     se hace una NOTA DE CRÉDITO por lo devuelto y una FACTURA por lo repuesto,
//     y se cruzan — saldo del cliente intacto, rastro producto por producto.
//     La reposición queda "por documentar" hasta que se vinculan las dos, y GK
//     saca esa factura de ventas, meta y comisión (`esReposicion`).
//   · Otra salida   — no, y no entra dinero: merma, vencido, muestra, consumo
//     interno, donación u otro. Motivo OBLIGATORIO.
//
// `registrarSalidaCava` hace todo en UNA transacción, igual que el despacho:
// lee el stock real, descuenta, anota el libro y (si es venta) crea el
// registro de la venta — o no hace nada. Separado de la pantalla para poder
// probarlo contra el emulador con el mismo código que corre en la app.

import { collection, doc, runTransaction, serverTimestamp } from 'firebase/firestore';

export const MOTIVOS_SALIDA = [
    { key: 'merma',           label: 'Merma o producto dañado' },
    { key: 'vencido',         label: 'Vencido' },
    { key: 'muestra',         label: 'Muestra o degustación' },
    { key: 'consumo_interno', label: 'Consumo interno' },
    { key: 'donacion',        label: 'Donación' },
    { key: 'otro',            label: 'Otro motivo' },
];
// Reposición: se le REEMPLAZA al cliente, sin cobrar, producto que se le venció
// o se le dañó. No es venta (no se factura) ni merma nuestra de cava: el
// producto sale a un cliente, y por eso lleva cliente Y motivo.
export const MOTIVOS_REPOSICION = [
    { key: 'vencido', label: 'Se le venció' },
    { key: 'danado',  label: 'Llegó o se dañó' },
];
export const motivoLabel = (k) => MOTIVOS_SALIDA.find(m => m.key === k)?.label || MOTIVOS_REPOSICION.find(m => m.key === k)?.label || k || '—';

/** Cantidad disponible de una partida (ud si está empacada, kg si es granel). */
export const disponible = (item) => item?.tipo === 'sin_envasar' ? (Number(item.kgTotales) || 0) : (Number(item?.unidades) || 0);

/** Gramos de una línea de salida (empacado: ud × peso por unidad; granel: kg). */
export const gramosDeLinea = (l) => l.tipo === 'sin_envasar'
    ? (Number(l.cantidad) || 0) * 1000
    : (Number(l.cantidad) || 0) * (Number(l.pesoPorUnidad) || 0) * 1000;

/**
 * Unidades de VENTA de GK (la bolsa de referencia, 250 g) que representa la
 * venta. Es la misma unidad en la que GK guarda las facturas (`unidades`, con
 * la conversión kg → uds ya aplicada), así que las dos cifras se comparan
 * directamente.
 */
export function unidadesEquivalentes(lineas = [], gramosPorUnidad = 250) {
    const g = lineas.reduce((s, l) => s + gramosDeLinea(l), 0);
    return gramosPorUnidad > 0 ? +(g / gramosPorUnidad).toFixed(2) : 0;
}

/**
 * ¿Cuadran la venta y su factura? Tolerancia de media unidad: el redondeo de
 * los kilos a unidades no puede disparar una falsa alarma.
 */
export function cuadreVentaFactura(venta, facturaUnidades, gramosPorUnidad = 250) {
    const entregadas = unidadesEquivalentes(venta?.lineas || [], gramosPorUnidad);
    const facturadas = Number(facturaUnidades) || 0;
    const diferencia = +(facturadas - entregadas).toFixed(2);
    return { entregadas, facturadas, diferencia, cuadra: Math.abs(diferencia) < 0.5 };
}

/** Texto corto de las líneas: "12 × 250 g · 3,5 kg granel". */
export function resumenLineas(lineas = []) {
    return lineas.map(l => l.tipo === 'sin_envasar'
        ? `${String(+(+l.cantidad).toFixed(3)).replace('.', ',')} kg granel`
        : `${l.cantidad} × ${l.presentacionLabel || l.presentacion || 'ud'}`).join(' · ');
}

/**
 * @param {object} p
 * @param {'venta'|'reposicion'|'salida'} p.tipo
 * @param {Array}  p.lineas   [{ inventoryId, cantidad }]
 * @param {object} [p.cliente] { customerId, customerName } — obligatorio en venta
 * @param {string} [p.motivo]  clave de MOTIVOS_SALIDA — obligatorio en salida
 * @param {string} [p.nota]    obligatoria si el motivo es "otro"
 * @param {number} [p.devueltas] reposición: unidades que el cliente devolvió
 *                  (entran y salen como merma: nunca vuelven a la venta)
 * @param {string} p.fecha     'YYYY-MM-DD'
 * @param {string} p.hoy       'YYYY-MM-DD'
 * @returns {Promise<{ventaId: string|null}>}
 */
export async function registrarSalidaCava(db, {
    tipo, lineas = [], cliente = null, motivo = '', nota = '', devueltas = 0, fecha, hoy,
    empresaId = 'lacteoca', responsable = { id: '', nombre: '' },
    nombreAlmacen = () => 'Cava', etiquetaPresentacion = () => '',
}) {
    if (!['venta', 'reposicion', 'salida'].includes(tipo)) throw new Error('Tipo de salida inválido.');
    const validas = lineas.filter(l => l.inventoryId && Number(l.cantidad) > 0);
    if (validas.length === 0) throw new Error('Indica qué producto sale y cuánto.');
    if ((tipo === 'venta' || tipo === 'reposicion') && !cliente?.customerId) throw new Error(tipo === 'venta' ? 'Elige el cliente de la venta.' : 'Elige el cliente al que se le repone.');
    if (tipo === 'reposicion' && !MOTIVOS_REPOSICION.some(m => m.key === motivo)) throw new Error('Indica por qué se repone: vencido o dañado.');
    const nDevueltas = Math.max(0, Math.round(Number(devueltas) || 0));
    if (tipo === 'reposicion' && !(nDevueltas > 0)) throw new Error('Indica cuántas unidades devolvió el cliente.');
    if (tipo === 'salida' && !MOTIVOS_SALIDA.some(m => m.key === motivo)) throw new Error('Elige el motivo de la salida.');
    if (tipo === 'salida' && motivo === 'otro' && !String(nota).trim()) throw new Error('Explica el motivo en la nota.');

    let ventaId = null;
    await runTransaction(db, async (tx) => {
        ventaId = null;   // la transacción puede reintentarse
        // Dos líneas de la misma partida se suman antes de validar.
        const porItem = new Map();
        validas.forEach(l => porItem.set(l.inventoryId, (porItem.get(l.inventoryId) || 0) + Number(l.cantidad)));

        const leidos = [];
        for (const [invId, total] of porItem) {
            const ref = doc(db, 'kroma_inventory_pt', invId);
            const snap = await tx.get(ref);
            if (!snap.exists() || snap.data().active === false) {
                throw new Error('Una de las partidas ya no está en la cava. Recarga y vuelve a intentarlo.');
            }
            const data = snap.data();
            const empacado = data.tipo !== 'sin_envasar';
            const field = empacado ? 'unidades' : 'kgTotales';
            const actual = Number(data[field]) || 0;
            const sale = empacado ? Math.round(total) : +(+total).toFixed(3);
            if (empacado && sale !== +total) throw new Error('El producto empacado sale por unidades enteras.');
            if (sale > actual + 0.0005) {
                throw new Error(`Del lote ${data.lote || '—'} de "${data.productoNombre}" solo quedan ${actual} ${empacado ? 'ud' : 'kg'} y se quieren sacar ${sale}.`);
            }
            leidos.push({ ref, id: invId, data, field, sale, empacado, restante: +(actual - sale).toFixed(3) });
        }

        const snapshotLineas = leidos.map(r => ({
            inventoryId:      r.id,
            productoNombre:   r.data.productoNombre || '',
            productoId:       r.data.productoId || null,
            presentacion:     r.data.presentacion || '',
            presentacionLabel: r.empacado ? (etiquetaPresentacion(r.data) || r.data.presentacion || '') : 'Granel',
            pesoPorUnidad:    Number(r.data.pesoPorUnidad) || 0,
            tipo:             r.data.tipo || 'empacado',
            lote:             r.data.lote || '',
            fechaVencimiento: r.data.fechaVencimiento || null,
            warehouseId:      r.data.warehouseId || null,
            cantidad:         r.sale,
            unidad:           r.empacado ? 'unidades' : 'kg',
        }));

        // Venta y reposición dejan un registro que se documenta en Zoho (factura;
        // en la reposición, además, la nota de crédito).
        const ventaRef = tipo !== 'salida' ? doc(collection(db, 'kroma_ventas_planta')) : null;
        if (ventaRef) ventaId = ventaRef.id;

        for (const r of leidos) {
            tx.update(r.ref, r.restante <= 0 ? { [r.field]: 0, active: false } : { [r.field]: r.restante });
            tx.set(doc(collection(db, 'kroma_warehouse_movements')), {
                // `venta` o `salida_<motivo>`: el libro dice QUÉ salió y POR QUÉ.
                tipo:            tipo === 'salida' ? `salida_${motivo}` : tipo,
                motivo:          tipo === 'venta' ? 'venta' : motivo,
                origenId:        r.data.warehouseId || null,
                origenNombre:    nombreAlmacen(r.data.warehouseId),
                destinoId:       null,
                destinoNombre:   tipo === 'venta' ? `Venta · ${cliente.customerName || ''}`
                               : tipo === 'reposicion' ? `Reposición · ${cliente.customerName || ''}` : motivoLabel(motivo),
                clienteZohoId:   tipo !== 'salida' ? String(cliente.customerId) : null,
                clienteNombre:   tipo !== 'salida' ? (cliente.customerName || '') : null,
                logId:           r.data.logId || null,
                ventaId:         ventaId,
                productoNombre:  r.data.productoNombre || '',
                presentacion:    r.data.presentacion || '',
                lote:            r.data.lote || '',
                fechaVencimiento: r.data.fechaVencimiento || null,
                cantidad:        r.sale,
                delta:           -r.sale,
                unidad:          r.empacado ? 'unidades' : 'kg',
                nota:            String(nota || '').trim() || null,
                fecha,
                cargadaEnDiferido: fecha !== hoy,
                empresaId,
                creadoPorId:     responsable.id || null,
                creadoPorNombre: responsable.nombre || null,
                createdAt:       serverTimestamp(),
            });
        }

        // Lo que el cliente devolvió: entra y sale como merma en el mismo acto
        // (queda en el libro, nunca suma a la cava vendible).
        if (tipo === 'reposicion') {
            const r0 = leidos[0];
            tx.set(doc(collection(db, 'kroma_warehouse_movements')), {
                tipo:            'devolucion_cliente',
                motivo,
                origenId:        null,
                origenNombre:    `Devuelto · ${cliente.customerName || ''}`,
                destinoId:       null,
                destinoNombre:   'Merma',
                clienteZohoId:   String(cliente.customerId),
                clienteNombre:   cliente.customerName || '',
                ventaId,
                productoNombre:  r0?.data.productoNombre || '',
                presentacion:    '',
                lote:            '',
                cantidad:        nDevueltas,
                delta:           0,
                unidad:          'unidades',
                nota:            String(nota || '').trim() || null,
                fecha,
                cargadaEnDiferido: fecha !== hoy,
                empresaId,
                creadoPorId:     responsable.id || null,
                creadoPorNombre: responsable.nombre || null,
                createdAt:       serverTimestamp(),
            });
        }

        if (ventaRef) {
            tx.set(ventaRef, {
                tipo:            tipo === 'reposicion' ? 'reposicion' : 'venta',
                ...(tipo === 'reposicion' ? { motivo, unidadesDevueltas: nDevueltas, notaCreditoNumero: null } : {}),
                empresaId,
                fecha,
                cargadaEnDiferido: fecha !== hoy,
                clienteZohoId:   String(cliente.customerId),
                clienteNombre:   cliente.customerName || '',
                lineas:          snapshotLineas,
                gramos:          snapshotLineas.reduce((s, l) => s + gramosDeLinea(l), 0),
                nota:            String(nota || '').trim() || null,
                estadoFactura:   'por_facturar',
                facturaNumero:   null,
                registradoPorId: responsable.id || null,
                registradoPorNombre: responsable.nombre || null,
                active:          true,
                createdAt:       serverTimestamp(),
            });
        }
    });
    return { ventaId };
}
