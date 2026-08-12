// RUTA: src/utils/rotacion.js
//
// ROTACIÓN ESTIMADA POR PDV — motor puro, para poder verla por corte de mes.
//
// Método (el MISMO que usa la tarjeta del dashboard, para que los números
// coincidan): entre dos visitas consecutivas al mismo punto de venta,
//     consumido = (inventario_previo + lo_pedido_en_esa_visita) − inventario_actual
//     días      = tiempo transcurrido entre ambas visitas
// y la rotación es Σconsumido ÷ Σdías, es decir unidades por día y por PDV.
//
// LÍMITES QUE HAY QUE TENER PRESENTES (es un ESTIMADO, no venta de caja):
//  · Asume que lo pedido en la visita anterior YA fue entregado antes de la
//    siguiente. Si no se entregó, el consumo se sobreestima.
//  · Las diferencias negativas (reposiciones no registradas) se recortan a cero,
//    lo que sesga el resultado ligeramente HACIA ARRIBA.
//  · Necesita al menos DOS visitas al mismo PDV para producir un dato; con pocas
//    visitas el número es muy sensible (por eso se reporta la muestra).

const seg = (r) => r?.createdAt?.seconds ?? (r?.createdAt?.toDate ? r.createdAt.toDate().getTime() / 1000 : 0);

/**
 * Rotación sobre un conjunto de reportes ya filtrado.
 * Cada PAR de visitas consecutivas se atribuye al mes de la visita MÁS RECIENTE.
 * @returns {{ unidades:number, dias:number, porDia:number|null, pares:number, pdv:number }}
 */
export function computeRotacion(reports = [], filtroPar = null) {
    const porPos = {};
    reports.forEach(r => {
        if (!r?.posId || !seg(r)) return;
        (porPos[r.posId] = porPos[r.posId] || []).push(r);
    });

    let unidades = 0, dias = 0, pares = 0;
    const pdvConDato = new Set();

    Object.entries(porPos).forEach(([posId, lista]) => {
        const orden = [...lista].sort((a, b) => seg(a) - seg(b));
        for (let i = 1; i < orden.length; i++) {
            const prev = orden[i - 1];
            const curr = orden[i];
            const d = (seg(curr) - seg(prev)) / 86400;
            if (!(d > 0)) continue;
            if (filtroPar && !filtroPar(curr)) continue;   // atribución por mes de la visita actual
            const disponible = (Number(prev.inventoryLevel) || 0) + (Number(prev.orderQuantity) || 0);
            const consumido  = Math.max(0, disponible - (Number(curr.inventoryLevel) || 0));
            unidades += consumido;
            dias     += d;
            pares    += 1;
            pdvConDato.add(posId);
        }
    });

    return {
        unidades, dias, pares,
        pdv: pdvConDato.size,
        porDia: dias > 0 ? unidades / dias : null,
    };
}

/**
 * Serie mensual de rotación (del mes más reciente hacia atrás).
 * @param {object[]} reports  todos los visit_reports disponibles
 * @param {number} meses      cuántos meses hacia atrás incluir
 */
export function rotacionPorMes(reports = [], meses = 12) {
    const hoy = new Date();
    const salida = [];
    for (let i = 0; i < meses; i++) {
        const desde = new Date(hoy.getFullYear(), hoy.getMonth() - i, 1);
        const hasta = new Date(hoy.getFullYear(), hoy.getMonth() - i + 1, 1);
        const r = computeRotacion(reports, (curr) => {
            const t = seg(curr) * 1000;
            return t >= desde.getTime() && t < hasta.getTime();
        });
        salida.push({
            key: `${desde.getFullYear()}-${String(desde.getMonth() + 1).padStart(2, '0')}`,
            label: desde.toLocaleDateString('es-VE', { month: 'long', year: 'numeric' }),
            desde, hasta, enCurso: i === 0,
            ...r,
        });
    }
    // Se recorta la cola sin datos para no mostrar meses vacíos eternamente.
    const ultimoConDato = salida.reduce((acc, m, idx) => (m.pares > 0 ? idx : acc), -1);
    return ultimoConDato >= 0 ? salida.slice(0, ultimoConDato + 1) : salida.slice(0, 1);
}
