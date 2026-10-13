// RUTA: src/utils/activacion.js
//
// ACTIVACIÓN de la cartera, semana a semana, con el detalle que pidió el dueño
// (13-oct): no solo el porcentaje, sino QUIÉNES se activaron y con cuánta
// facturación, y quiénes faltan.
//
// Definición (la misma del Bono Activación, `computeActivacionPeriodo`):
//   · La activación es la visita que FACTURA: una sucursal (carnet de Zoho)
//     queda activada en la semana si se le facturaron ≥ `minUnits` unidades
//     (12 por defecto) en esa semana. La factura es la prueba; la visita
//     registrada en la app se muestra al lado, pero no es requisito.
//   · Semanas de 7 días desde el inicio del período. Meta: `threshold`% (80) de
//     la cartera cada semana.
//   · No cuentan anuladas, reposiciones, recuperadas ni foodservice.
// El puntaje del índice es PROPORCIONAL (cuánto se acercó cada semana a la meta,
// promediado); el bono paga las semanas LOGRADAS. Misma definición, dos usos.

import { cuentaEnCartera } from '@/utils/facturaEstado.js';
import { fechaCalendario, tamanoCartera, cuentaParaActivacion } from '@/utils/vendedorMeta.js';

const DIA = 86400000, SEMANA = 7 * DIA;
const clave = (f) => f.zohoCustomerId ? String(f.zohoCustomerId) : `n:${String(f.clienteName || f.customerName || '?').toLowerCase().trim()}`;

/**
 * @param {object} p
 * @param {Array}  p.facturas  — facturas del vendedor.
 * @param {Array}  p.clientes  — sus `clientes_zoho` (la cartera; da nombres y los que faltan).
 * @param {Date}   p.inicio, p.fin, p.ahora
 * @param {number} p.minUnits, p.threshold
 * @param {Array}  [p.gestiones] — su registro de visitas, para marcar qué activación salió de una visita.
 */
export function detalleActivacion({ facturas = [], clientes = [], inicio, fin, ahora = new Date(), minUnits = 12, threshold = 80, gestiones = [] }) {
    const cartera = (clientes || []).filter(cuentaParaActivacion);
    const total = tamanoCartera(clientes);
    const objetivo = total > 0 ? Math.max(1, Math.ceil(total * threshold / 100)) : 0;
    const nombreDe = new Map(cartera.map(c => [String(c.customerId || c.id), c.customerName || c.customerId || c.id]));
    const limite = Math.min(fin.getTime(), ahora.getTime());
    const validas = (facturas || []).filter(f => cuentaEnCartera(f) && !f.recuperada && f.categoria !== 'foodservice')
        .map(f => ({ ...f, _t: fechaCalendario(f.fecha)?.getTime() || 0 })).filter(f => f._t);

    const porCliente = new Map();   // clave → {nombre, facturas, unidades, monto, semanas:Set}
    const semanas = [];
    for (let ws = inicio.getTime(); ws < limite; ws += SEMANA) {
        const we = ws + SEMANA;
        const enSemana = new Map();
        validas.filter(f => f._t >= ws && f._t < we).forEach(f => {
            const k = clave(f);
            const x = enSemana.get(k) || { uds: 0, fs: [] };
            x.uds += Number(f.unidades) || 0; x.fs.push(f);
            enSemana.set(k, x);
        });
        const activados = [];
        enSemana.forEach((x, k) => {
            if (x.uds < minUnits) return;
            activados.push(k);
            const c = porCliente.get(k) || { clave: k, nombre: nombreDe.get(k) || x.fs[0].clienteName || x.fs[0].customerName || k, facturas: 0, unidades: 0, monto: 0, semanas: new Set() };
            c.facturas += x.fs.length;
            c.unidades += x.uds;
            c.monto += x.fs.reduce((s, f) => s + (Number(f.monto ?? f.total) || 0), 0);
            c.semanas.add(semanas.length);
            porCliente.set(k, c);
        });
        const enCurso = we > ahora.getTime();
        semanas.push({
            n: semanas.length + 1, inicio: new Date(ws), fin: new Date(Math.min(we, fin.getTime())),
            activados: activados.length, objetivo, lograda: objetivo > 0 && activados.length >= objetivo,
            pct: objetivo > 0 ? Math.min(1, activados.length / objetivo) : null, enCurso,
        });
    }

    // ¿La activación salió de una visita suya registrada? (misma semana o la anterior)
    const gestPorCliente = new Map();
    (gestiones || []).forEach(g => {
        if (!g.clienteZohoId) return;
        const t = g.fecha?.toDate ? g.fecha.toDate().getTime() : new Date(g.fecha).getTime();
        const arr = gestPorCliente.get(String(g.clienteZohoId)) || [];
        arr.push(t); gestPorCliente.set(String(g.clienteZohoId), arr);
    });
    const activados = [...porCliente.values()].map(c => {
        const ts = gestPorCliente.get(c.clave) || [];
        return { ...c, semanas: c.semanas.size, conVisita: ts.some(t => t >= inicio.getTime() - SEMANA && t < limite) };
    }).sort((a, b) => b.semanas - a.semanas || b.unidades - a.unidades);

    // Los que faltan: de su cartera, sin activación en el período, con días sin comprar.
    const ultima = new Map();
    validas.forEach(f => { const k = clave(f); if (!ultima.has(k) || ultima.get(k) < f._t) ultima.set(k, f._t); });
    const sinActivar = cartera.filter(c => !porCliente.has(String(c.customerId || c.id))).map(c => {
        const t = ultima.get(String(c.customerId || c.id));
        return { clave: String(c.customerId || c.id), nombre: c.customerName || c.customerId, diasSinComprar: t ? Math.floor((ahora - t) / DIA) : null };
    }).sort((a, b) => (b.diasSinComprar ?? 9999) - (a.diasSinComprar ?? 9999));

    const cerradas = semanas.filter(s => s.pct != null);
    return {
        cartera: total, objetivo, threshold, minUnits, semanas,
        semanasLogradas: semanas.filter(s => s.lograda).length,
        pctPromedio: cerradas.length ? cerradas.reduce((s, w) => s + w.pct, 0) / cerradas.length : null,
        activadosPeriodo: activados.length,
        coberturaPeriodo: total > 0 ? activados.length / total : null,
        interacciones: activados.reduce((s, c) => s + c.facturas, 0),
        activados, sinActivar,
        conVisita: activados.filter(c => c.conVisita).length,
    };
}
