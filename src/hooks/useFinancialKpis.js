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
        const abiertas = activas.filter(f => f.estado !== 'pagada');
        const porCobrar = sum(abiertas, f => f.monto);
        // Antigüedad por DÍAS DESDE LA FACTURA (ventanas de cobro del negocio:
        // 0–30 a tiempo · 31–45 sin bono · >45 en riesgo de anularse la comisión).
        let a0 = 0, a1 = 0, a2 = 0;
        abiertas.forEach(f => {
            const t = toDate(f.fecha); const monto = Number(f.monto) || 0;
            const age = t ? (now - t) / 86400000 : 0;
            if (age <= 30) a0 += monto; else if (age <= 45) a1 += monto; else a2 += monto;
        });
        const clientesMas45 = new Set(
            abiertas.filter(f => { const t = toDate(f.fecha); return t && (now - t) / 86400000 > 45; })
                    .map(f => f.razonSocialCanonica || f.clienteName)
        ).size;

        // DSO y % a tiempo sobre pagos de los últimos 90 días.
        // Se EXCLUYEN las recuperadas (heredadas): son facturas viejas cobradas
        // hoy → días de cobro de cientos de días que no reflejan la velocidad de
        // cobro de las ventas propias (era la causa del "666 días"). Además el DSO
        // se calcula con la MEDIANA (robusta a outliers), no el promedio.
        const median = (arr) => {
            if (!arr.length) return null;
            const s = [...arr].sort((a, b) => a - b);
            const m = Math.floor(s.length / 2);
            return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
        };
        const pagadasPropias = activas.filter(f =>
            f.estado === 'pagada' && !f.recuperada && toDate(f.fechaPago) && toDate(f.fecha)
            && (now - toDate(f.fechaPago)) / 86400000 <= 90
        );
        const deltas = pagadasPropias
            .map(f => (toDate(f.fechaPago) - toDate(f.fecha)) / 86400000)
            .filter(d => d >= 0 && d <= 365); // descarta negativos y outliers de datos
        const dso = median(deltas);
        const aTiempoPct = pagadasPropias.length
            ? (pagadasPropias.filter(f => f.pagadaDentroDePlazo === true).length / pagadasPropias.length) * 100
            : null;

        return {
            facturadoMes, unidadesMes, facturadoPrev, unidadesPrev, topClientes,
            porCobrar, aging: { d0_30: a0, d31_45: a1, d45p: a2 }, clientesMas45,
            dso, aTiempoPct,
            tieneFacturas: facturas.length > 0,
        };
    }, [facturas]);

    return { ...kpis, loading, error };
}
