// RUTA: src/hooks/useFinancialKpis.js
//
// KPIs financieros REALES para el Dashboard Gerencial (bandas ¿Vendemos? /
// ¿Cobramos?), calculados desde `facturas_vendedor` (Zoho Books) — la venta y
// cobranza de verdad, no un proxy de visitas. Mes en curso vs. mes anterior para
// las tendencias, y un snapshot de cartera abierta para la cobranza.

import { useState, useEffect, useMemo } from 'react';
import { collection, getDocs } from 'firebase/firestore';
import { db } from '@/Firebase/config.js';

const toDate = (t) => t?.toDate?.() || (t ? new Date(t) : null);
const sum = (arr, sel) => arr.reduce((s, f) => s + (Number(sel(f)) || 0), 0);

// ── Días de pago PONDERADO por peso del cliente (metodología del dueño) ───────
// Para un período [start, end) (por fecha de EMISIÓN de la factura):
//   1. Lista las facturas PAGADAS del período con vencimiento y fecha de pago.
//   2. A cada factura le calcula sus "días para pago" = fechaPago − vencimiento
//      (positivo = pagó tarde; negativo = pagó antes de vencer).
//   3. Pondera por el PESO del cliente en la facturación (monto), no un simple
//      promedio de facturas — así los clientes grandes (que mueven la caja)
//      pesan lo que deben, y no un montón de facturas chicas viejas inflan el
//      número (causa del "+221 días" sin sentido).
// El promedio ponderado por monto de factura equivale exactamente a ponderar
// por el peso de cada cliente: Σ(monto·días)/Σ(monto).
export function computeDiasPago(facturas, start, end) {
    const enPeriodo = (facturas || []).filter(f => {
        if (f.estado !== 'pagada') return false;
        const t = toDate(f.fecha);
        if (!t || t < start || t >= end) return false;
        return toDate(f.vencimiento) && toDate(f.fechaPago);
    });

    const porClienteMap = {};
    let totMonto = 0, totMontoDias = 0, totSimpleDias = 0, n = 0;

    enPeriodo.forEach(f => {
        const dias = (toDate(f.fechaPago) - toDate(f.vencimiento)) / 86400000;
        if (!Number.isFinite(dias)) return;
        const monto = Number(f.monto) || 0;
        const k = f.razonSocialCanonica || f.clienteName || '—';
        if (!porClienteMap[k]) porClienteMap[k] = { nombre: k, facturado: 0, montoDias: 0, nFacturas: 0 };
        porClienteMap[k].facturado += monto;
        porClienteMap[k].montoDias += monto * dias;
        porClienteMap[k].nFacturas += 1;
        totMonto += monto;
        totMontoDias += monto * dias;
        totSimpleDias += dias;
        n += 1;
    });

    const porCliente = Object.values(porClienteMap)
        .map(c => ({
            nombre: c.nombre,
            facturado: c.facturado,
            nFacturas: c.nFacturas,
            diasProm: c.facturado > 0 ? c.montoDias / c.facturado : 0,
            pesoPct: totMonto > 0 ? (c.facturado / totMonto) * 100 : 0,
        }))
        .sort((a, b) => b.facturado - a.facturado);

    return {
        diasPonderado: totMonto > 0 ? totMontoDias / totMonto : null, // el número "de verdad"
        diasSimple: n > 0 ? totSimpleDias / n : null,                 // promedio simple (referencia)
        totalFacturado: totMonto,
        nFacturas: n,
        nClientes: porCliente.length,
        porCliente,
    };
}

// Saldo REAL por cobrar de una factura abierta. Zoho reporta `balance` (lo que
// falta cobrar tras abonos parciales); si aún no se ha conciliado y no existe,
// cae al monto total. Esto evita sobre-contar "Por Cobrar" cuando hay pagos
// parciales (GK marcaba el total mientras Zoho ya mostraba el saldo restante).
const saldoAbierto = (f) => {
    const b = Number(f.balance);
    return (f.balance != null && Number.isFinite(b)) ? b : (Number(f.monto) || 0);
};

export function useFinancialKpis() {
    const [facturas, setFacturas] = useState([]);
    const [loading, setLoading]   = useState(true);
    const [error, setError]       = useState('');

    useEffect(() => {
        let alive = true;
        (async () => {
            setLoading(true); setError('');
            try {
                const snap = await getDocs(collection(db, 'facturas_vendedor'));
                if (alive) setFacturas(snap.docs.map(d => d.data()));
            } catch (e) {
                console.error(e);
                if (alive) setError('No se pudo cargar la facturación.');
            } finally {
                if (alive) setLoading(false);
            }
        })();
        return () => { alive = false; };
    }, []);

    const kpis = useMemo(() => {
        const now = new Date();
        const mStart = new Date(now.getFullYear(), now.getMonth(), 1);
        const mEnd   = new Date(now.getFullYear(), now.getMonth() + 1, 1);
        const pStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);

        const activas = facturas.filter(f => f.estado !== 'anulada');
        const inWin = (f, a, b) => { const t = toDate(f.fecha); return t && t >= a && t < b; };

        // ── Ventas (por fecha de factura): mes en curso vs. mes anterior
        const mesF  = activas.filter(f => inWin(f, mStart, mEnd));
        const prevF = activas.filter(f => inWin(f, pStart, mStart));
        const facturadoMes  = sum(mesF, f => f.monto);
        const unidadesMes   = sum(mesF, f => f.unidades);
        const facturadoPrev = sum(prevF, f => f.monto);
        const unidadesPrev  = sum(prevF, f => f.unidades);

        // Top clientes del mes por unidades (rank ¿Vendemos? / trade)
        const byCliente = {};
        mesF.forEach(f => {
            const k = f.razonSocialCanonica || f.clienteName || '—';
            byCliente[k] = (byCliente[k] || 0) + (Number(f.unidades) || 0);
        });
        const topClientes = Object.entries(byCliente)
            .map(([nombre, unidades]) => ({ nombre, unidades }))
            .sort((a, b) => b.unidades - a.unidades)
            .slice(0, 5);

        // ── Cobranza (snapshot de cartera ABIERTA, no ventana de tiempo)
        // Se usa el SALDO real (balance de Zoho) por factura, no el monto total,
        // para cuadrar con "Total de cuentas por cobrar" de Zoho Books cuando hay
        // abonos parciales.
        const abiertas = activas.filter(f => f.estado !== 'pagada');
        const porCobrar = sum(abiertas, saldoAbierto);
        // Antigüedad por DÍAS DESDE LA FACTURA (ventanas de cobro del negocio:
        // 0–30 a tiempo · 31–45 sin bono · >45 en riesgo de anularse la comisión).
        let a0 = 0, a1 = 0, a2 = 0;
        abiertas.forEach(f => {
            const t = toDate(f.fecha); const monto = saldoAbierto(f);
            const age = t ? (now - t) / 86400000 : 0;
            if (age <= 30) a0 += monto; else if (age <= 45) a1 += monto; else a2 += monto;
        });
        const clientesMas45 = new Set(
            abiertas.filter(f => { const t = toDate(f.fecha); return t && (now - t) / 86400000 > 45; })
                    .map(f => f.razonSocialCanonica || f.clienteName)
        ).size;

        // "Días de pago" del AÑO EN CURSO, ponderado por peso del cliente
        // (metodología del dueño). Es el número que se muestra en la banda; el
        // modal permite ver mes / trimestre / semestre / año de cualquier año.
        const yStart = new Date(now.getFullYear(), 0, 1);
        const yEnd   = new Date(now.getFullYear() + 1, 0, 1);
        const diasPagoAnio = computeDiasPago(facturas, yStart, yEnd);
        const diasTrasVencimiento = diasPagoAnio.diasPonderado;

        // % a tiempo sobre los pagos del año (dentro de vencimiento + gracia).
        const pagadasAnio = activas.filter(f =>
            f.estado === 'pagada' && toDate(f.fecha) && toDate(f.fecha) >= yStart && toDate(f.fecha) < yEnd
        );
        const aTiempoPct = pagadasAnio.length
            ? (pagadasAnio.filter(f => f.pagadaDentroDePlazo === true).length / pagadasAnio.length) * 100
            : null;

        return {
            facturadoMes, unidadesMes, facturadoPrev, unidadesPrev, topClientes,
            porCobrar, aging: { d0_30: a0, d31_45: a1, d45p: a2 }, clientesMas45,
            diasTrasVencimiento, dso: diasTrasVencimiento, diasPagoAnio, aTiempoPct,
            facturas,
            tieneFacturas: facturas.length > 0,
        };
    }, [facturas]);

    return { ...kpis, loading, error };
}
