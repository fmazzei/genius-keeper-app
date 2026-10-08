// RUTA: src/utils/avisosAnaquel.js
//
// AVISOS AL MÁSTER SOBRE EL ANAQUEL (8-oct). Solo decisiones; nada de rutina.
// Motor puro: recibe los datos ya leídos y devuelve la lista de avisos.
//
//  1. Sin salida prolongada — el anaquel no bajó en DIAS_SIN_SALIDA días o más,
//     con producto adentro.
//  2. Riesgo de vencimiento — en la última visita hay lotes que vencen en
//     UMBRAL_ALERTA_VENCIMIENTO_DIAS (7) días o menos, o ya vencidos.
//  3. Rotación alta: conviene surtir más — PDV del cuartil alto de rotación cuyo
//     producto no alcanza hasta la próxima visita.
//  4. Caída en el registro de entregas — lo anotado como entregado, frente a lo
//     facturado, cayó respecto a las semanas anteriores: algo se rompió.
//
// Los avisos de calidad de datos NO van aquí: se le hacen al mercaderista en el
// momento de la captura.

import * as C from './anaquelConstantes.js';
import { rotacionPorPdv, aSeg, diaLocal, fmtNum, normalizarVisita } from './anaquelV2.js';
import { facturasPorPdv } from './anaquelFacturas.js';
import { diasParaVencer } from './retiros.js';
import { fmtVence } from './fechaCorta.js';

const DIA = 86400;

/** Semana ISO 'AAAA-Wnn': un mismo aviso conserva su id (y su "leído") toda la semana. */
function semana(s) {
    const d = new Date(s * 1000);
    const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
    const dia = t.getUTCDay() || 7;
    t.setUTCDate(t.getUTCDate() + 4 - dia);
    const inicio = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
    return `${t.getUTCFullYear()}-W${String(Math.ceil(((t - inicio) / 86400000 + 1) / 7)).padStart(2, '0')}`;
}

const activo = (p) => p && !p.eliminado && p.active !== false && (p.type ? p.type === 'pos' : true);

export function avisosAnaquel({ reports = [], devoluciones = [], facturas = null, posList = [], ahora = new Date() } = {}) {
    const hoy = ahora.getTime() / 1000;
    const sem = semana(hoy);
    const pdv = Object.fromEntries((posList || []).filter(activo).map(p => [p.id, p]));
    const rot = rotacionPorPdv({ reports, devoluciones, facturas, posList, ahora });
    const avisos = [];

    // Visitas por PDV (con la hora real), para 1 y 2.
    const porPos = {};
    (reports || []).forEach(r => {
        if (!r?.posId || !pdv[r.posId]) return;
        const v = normalizarVisita(r);
        if (!v.t) return;
        v._lotes = (r.batches || []).filter(b => b && b.expiryDate && !b.devuelto && (Number(b.quantity) || 0) > 0);
        (porPos[r.posId] = porPos[r.posId] || []).push(v);
    });
    Object.values(porPos).forEach(l => l.sort((a, b) => a.t - b.t));

    Object.entries(porPos).forEach(([posId, vs]) => {
        const ult = vs[vs.length - 1];
        const nombre = pdv[posId]?.name || ult.nombre || posId;
        if (hoy - ult.t > C.DIAS_VIGENCIA_AVISO * DIA) return;

        // 1. Sin salida: desde la última visita hacia atrás, mientras el anaquel no se movió.
        if (ult.inv > 0) {
            let desdeIdx = vs.length - 1;
            for (let i = vs.length - 2; i >= 0; i--) {
                // Exactamente igual: no se vendió nada. Si subió sin entrega anotada,
                // entró producto que nadie registró y no se puede afirmar que no vendió.
                const vendido = vs[i].inv + vs[i].rep - vs[i + 1].inv;
                if (vendido !== 0) break;
                desdeIdx = i;
            }
            const dias = (ult.t - vs[desdeIdx].t) / DIA;
            if (desdeIdx < vs.length - 1 && dias >= C.DIAS_SIN_SALIDA) {
                avisos.push({
                    id: `anaquel:sin_salida:${posId}:${sem}`, tipo: 'sin_salida', posId, nombre, prioridad: 1,
                    titulo: `${nombre}: sin salida en ${Math.round(dias)} días`,
                    cuerpo: `0 unidades vendidas desde el ${fmtVence(diaLocal(vs[desdeIdx].t))}: el anaquel tenía ${vs[desdeIdx].inv} y en la última visita (${fmtVence(diaLocal(ult.t))}) ${ult.inv}. Decidir: mover el producto, cambiarlo de lugar o dejar de surtir.`,
                });
            }
        }

        // 2. Riesgo de vencimiento en la última visita.
        const enRiesgo = ult._lotes
            .map(b => ({ vence: b.expiryDate, uds: Number(b.quantity) || 0, dias: diasParaVencer(b.expiryDate, ahora) }))
            .filter(l => l.dias != null && l.dias <= C.UMBRAL_ALERTA_VENCIMIENTO_DIAS);
        if (enRiesgo.length) {
            const uds = enRiesgo.reduce((s, l) => s + l.uds, 0);
            const primero = enRiesgo.sort((a, b) => a.dias - b.dias)[0];
            avisos.push({
                id: `anaquel:vencimiento:${posId}:${sem}`, tipo: 'vencimiento', posId, nombre, prioridad: 2,
                titulo: `${nombre}: ${uds} uds ${primero.dias <= 0 ? 'vencidas o por vencer' : `vencen en ${primero.dias} días o menos`}`,
                cuerpo: `Lote más próximo: vence el ${fmtVence(primero.vence)}. Visto el ${fmtVence(diaLocal(ult.t))}. Decidir: retirar, cambiar o mover a un PDV que rote más.`,
            });
        }
    });

    // 3. Rotación alta: conviene surtir más.
    const conCifra = Object.values(rot).filter(x => x.estado === 'ok' && pdv[x.posId] && x.rotacion > 0);
    if (conCifra.length >= 4) {
        const orden = conCifra.map(x => x.rotacion).sort((a, b) => a - b);
        const corte = orden[Math.floor((orden.length - 1) * C.CUARTIL_ROTACION_ALTA)];
        conCifra.filter(x => x.rotacion >= corte).forEach(x => {
            const u = x.ultimaVisita;
            if (!u || hoy - u.t > C.DIAS_VIGENCIA_AVISO * DIA) return;
            const mov = x.movUltima || { retiradas: 0, repuestas: 0, entradas: 0 };
            const quedo = Math.max(0, u.inv + u.rep + mov.repuestas + mov.entradas - mov.retiradas);
            const intervalo = Number(pdv[x.posId].visitInterval) > 0 ? Number(pdv[x.posId].visitInterval) : 7;
            const alcanza = quedo / x.rotacion;
            if (alcanza >= intervalo) return;
            const faltan = Math.ceil(x.rotacion * intervalo - quedo);
            avisos.push({
                id: `anaquel:surtir:${x.posId}:${sem}`, tipo: 'surtir_mas', posId: x.posId, nombre: x.nombre, prioridad: 3,
                titulo: `${x.nombre}: conviene surtir más`,
                cuerpo: `Vende ${fmtNum(x.rotacion)} uds/día y quedaron ${quedo} uds: alcanzan para ${fmtNum(alcanza, 0)} días y la visita es cada ${intervalo}. Faltan unas ${faltan} uds por visita.`,
            });
        });
    }

    // 4. Caída en el registro de entregas frente a lo facturado.
    if (facturas) {
        const fx = facturasPorPdv(facturas, posList);
        const conCarnet = new Set(Object.entries(fx.estadoPdv).filter(([, e]) => e === 'ok').map(([id]) => id));
        const ventana = (iniDias, finDias) => {
            const a = hoy - iniDias * DIA, b = hoy - finDias * DIA;
            const diaA = diaLocal(a), diaB = diaLocal(b);
            let facturado = 0, anotado = 0;
            conCarnet.forEach(id => (fx.porPos[id] || []).forEach(f => { if (f.dia > diaA && f.dia <= diaB) facturado += f.unidades; }));
            (reports || []).forEach(r => {
                if (!conCarnet.has(r.posId)) return;
                const t = aSeg(r.startTime) || aSeg(r.createdAt);
                if (t > a && t <= b) anotado += Number(r.orderQuantity) || 0;
            });
            return { facturado, anotado, razon: facturado > 0 ? anotado / facturado : null };
        };
        const reciente = ventana(C.DIAS_VENTANA_ENTREGAS, 0);
        const base = ventana(C.DIAS_VENTANA_ENTREGAS + C.DIAS_BASE_ENTREGAS, C.DIAS_VENTANA_ENTREGAS);
        if (reciente.facturado >= C.MIN_UDS_FACTURADAS_AVISO && base.razon != null && reciente.razon != null
            && reciente.razon < base.razon * C.CAIDA_REGISTRO_ENTREGAS) {
            avisos.push({
                id: `anaquel:registro_entregas:${sem}`, tipo: 'registro_entregas', posId: null, nombre: null, prioridad: 0,
                titulo: 'Se están registrando menos entregas de las facturadas',
                cuerpo: `Últimos ${C.DIAS_VENTANA_ENTREGAS} días: anotadas ${reciente.anotado} uds de ${reciente.facturado} facturadas (${fmtNum(reciente.razon * 100, 0)} %). Antes: ${fmtNum(base.razon * 100, 0)} %. Revisar si el equipo está confirmando las entregas en la visita.`,
            });
        }
    }

    return avisos.sort((a, b) => a.prioridad - b.prioridad);
}
