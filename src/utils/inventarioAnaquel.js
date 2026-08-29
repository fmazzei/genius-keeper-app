// RUTA: src/utils/inventarioAnaquel.js
//
// FOTO DEL INVENTARIO EN ANAQUEL de toda la red: una línea por PDV con lo que
// reportó su ÚLTIMA visita (no el histórico de visitas).
//
// ADVERTENCIA DE LECTURA: esto NO es un stock en tiempo real. Es lo último que
// vio el mercaderista. Por eso cada fila lleva los DÍAS DE ANTIGÜEDAD del dato:
// un PDV con 12 días sin visita tiene una cifra de hace 12 días, y sin ese
// contexto el informe daría una falsa sensación de precisión.

const seg = (r) => r?.createdAt?.seconds ?? (r?.createdAt?.toDate ? r.createdAt.toDate().getTime() / 1000 : 0);
const DIA = 86400000;

export const ESTADO = {
    QUIEBRE: 'quiebre',
    BAJO:    'bajo',
    NORMAL:  'normal',
    SIN_DATO:'sin_dato',
};

/**
 * @param {object[]} pos      maestro de puntos de venta
 * @param {object[]} reports  visit_reports (todos)
 * @param {object} opts       { piso = 12, diasPorVencer = 30, ahora }
 */
export function inventarioEnAnaquel(pos = [], reports = [], opts = {}) {
    const piso = Number(opts.piso) > 0 ? Number(opts.piso) : 12;
    const diasPorVencer = Number(opts.diasPorVencer) || 30;
    const ahora = opts.ahora || new Date();

    // Última visita por PDV.
    const ultima = {};
    reports.forEach(r => {
        if (!r?.posId) return;
        const t = seg(r);
        if (!t) return;
        if (!ultima[r.posId] || t > seg(ultima[r.posId])) ultima[r.posId] = r;
    });

    const filas = pos.map(p => {
        const v = ultima[p.id] || null;
        const fecha = v ? new Date(seg(v) * 1000) : null;
        const dias = fecha ? Math.floor((ahora - fecha) / DIA) : null;
        const nivel = v && Number.isFinite(Number(v.inventoryLevel)) ? Number(v.inventoryLevel) : null;

        // Lotes observados, ordenados por urgencia de vencimiento. Los RETIRADOS
        // del anaquel en la visita no cuentan: ya no están en el punto de venta.
        const lotes = (v?.batches || [])
            .filter(b => b?.devuelto !== true && b?.retirado !== true)
            .map(b => {
                const d = b?.expiryDate ? new Date(`${b.expiryDate}T00:00:00`) : null;
                if (!d || isNaN(d)) return null;
                return {
                    vence: b.expiryDate,
                    cantidad: Number(b.quantity) || 0,
                    dias: Math.ceil((d - ahora) / DIA),
                };
            })
            .filter(Boolean)
            .sort((a, b) => a.dias - b.dias);

        const unidadesEnLotes = lotes.reduce((s, l) => s + l.cantidad, 0);
        const porVencer = lotes.filter(l => l.dias <= diasPorVencer);
        const vencido   = lotes.filter(l => l.dias <= 0);

        let estado = ESTADO.SIN_DATO;
        if (nivel !== null) {
            estado = nivel <= 0 ? ESTADO.QUIEBRE : nivel < piso ? ESTADO.BAJO : ESTADO.NORMAL;
        }

        return {
            id: p.id,
            nombre: p.name || '(sin nombre)',
            cadena: p.chain || 'Automercados Individuales',
            ciudad: p.city || '',
            zona: p.zone || '',
            unidades: nivel,
            lotes, unidadesEnLotes,
            porVencerUds: porVencer.reduce((s, l) => s + l.cantidad, 0),
            vencidoUds: vencido.reduce((s, l) => s + l.cantidad, 0),
            proximoVence: lotes[0] || null,
            visita: fecha, diasDelDato: dias,
            estado,
        };
    });

    const conDato = filas.filter(f => f.estado !== ESTADO.SIN_DATO);
    return {
        filas,
        piso,
        resumen: {
            pdv: filas.length,
            conDato: conDato.length,
            sinDato: filas.length - conDato.length,
            unidades: conDato.reduce((s, f) => s + (f.unidades || 0), 0),
            quiebres: filas.filter(f => f.estado === ESTADO.QUIEBRE).length,
            bajos:    filas.filter(f => f.estado === ESTADO.BAJO).length,
            porVencerUds: filas.reduce((s, f) => s + f.porVencerUds, 0),
            vencidoUds:   filas.reduce((s, f) => s + f.vencidoUds, 0),
            // Antigüedad del dato: clave para saber cuánto confiar en el total.
            datoMasViejo: conDato.reduce((m, f) => Math.max(m, f.diasDelDato ?? 0), 0),
        },
    };
}
