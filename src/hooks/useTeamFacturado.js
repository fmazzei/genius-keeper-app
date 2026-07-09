// RUTA: src/hooks/useTeamFacturado.js
//
// Progreso de FACTURACIÓN del equipo, medido por el MES DE EMPLEO de cada
// vendedor (misma verdad que Rendimiento Comercial y que el Home del vendedor):
// suma de las unidades facturadas por cada vendedor activo dentro de su período
// de empleo vigente. Devuelve también las facturas del período (fecha+unidades)
// para el gráfico/velocidad de la vista de Ventas.

import { useState, useEffect } from 'react';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { db } from '@/Firebase/config.js';
import { computeMetaMensual } from '@/utils/vendedorMeta.js';

const ym = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;

export function useTeamFacturado() {
    const [state, setState] = useState({ teamUnits: 0, facturas: [], loading: true });

    useEffect(() => {
        let alive = true;
        (async () => {
            try {
                const now = new Date();
                const cur = ym(now);
                const prevDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
                const prev = ym(prevDate);

                const [vendSnap, facSnap] = await Promise.all([
                    getDocs(query(collection(db, 'users_metadata'), where('role', '==', 'vendedor'))),
                    getDocs(query(collection(db, 'facturas_vendedor'), where('mesCohorte', 'in', [prev, cur]))),
                ]);

                const vends = vendSnap.docs.map(d => ({ id: d.id, ...d.data() })).filter(v => v.active !== false);
                const byVend = {};
                facSnap.docs.forEach(d => {
                    const f = { id: d.id, ...d.data() };
                    if (f.vendedorId) (byVend[f.vendedorId] ||= []).push(f);
                });

                let teamUnits = 0;
                const facturas = [];
                vends.forEach(v => {
                    const { periodStart, periodEnd } = computeMetaMensual(v);
                    (byVend[v.id] || []).forEach(f => {
                        const t = f.fecha?.toDate?.() || (f.fecha ? new Date(f.fecha) : null);
                        if (f.estado !== 'anulada' && t && t >= periodStart && t < periodEnd) {
                            const u = Number(f.unidades) || 0;
                            teamUnits += u;
                            facturas.push({ fecha: t, unidades: u });
                        }
                    });
                });

                if (alive) setState({ teamUnits, facturas, loading: false });
            } catch (e) {
                console.error('useTeamFacturado error:', e);
                if (alive) setState(s => ({ ...s, loading: false }));
            }
        })();
        return () => { alive = false; };
    }, []);

    return state;
}
