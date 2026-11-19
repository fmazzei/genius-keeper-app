// RUTA: src/hooks/useEnLaMano.js
//
// Carga lo necesario para el cruce «en la mano» (src/utils/enLaMano.js) y lo
// calcula. Lo usan la pantalla «En la mano» y la alerta roja de administración
// (entregas sin factura).

import { useCallback, useEffect, useMemo, useState } from 'react';
import { collection, doc, getDoc, getDocs, query, where, Timestamp } from 'firebase/firestore';
import { db } from '@/Firebase/config.js';
import { calcularEnLaMano, diaCaracas } from '@/utils/enLaMano.js';

// Punto de partida: el conteo físico de Caracas del 12-nov dejó al mercaderista
// con 0 en la mano. Se mueve desde settings/appConfig (`enLaManoDesde`,
// `enLaManoInicial`) cuando se haga otro conteo.
export const DESDE_POR_DEFECTO = '2026-11-13';

export function useEnLaMano(activo = true) {
    const [datos, setDatos] = useState(null);
    const [error, setError] = useState(null);
    const [recarga, setRecarga] = useState(0);

    useEffect(() => {
        if (!activo) return undefined;
        let vivo = true;
        setError(null);
        (async () => {
            try {
                const cfg = await getDoc(doc(db, 'settings', 'appConfig')).then(s => s.data() || {}).catch(() => ({}));
                const desde = cfg.enLaManoDesde || DESDE_POR_DEFECTO;
                const inicial = Number(cfg.enLaManoInicial) || 0;
                const [y, m, d] = desde.split('-').map(Number);
                const corte = Timestamp.fromDate(new Date(y, m - 1, d - 2));
                const vacio = { docs: [] };
                const [movs, facts, visitas, pos, excl] = await Promise.all([
                    getDocs(collection(db, 'inventario_movimientos')),
                    getDocs(query(collection(db, 'facturas_vendedor'), where('fecha', '>=', corte))),
                    getDocs(query(collection(db, 'visit_reports'), where('createdAt', '>=', corte))),
                    getDocs(collection(db, 'pos')),
                    // Facturas que no salen de la ruta de Caracas (despachos a otra
                    // ciudad, ventas en planta): las marca el inventario de Kroma.
                    getDocs(query(collection(db, 'kroma_inv_facturas'), where('empresaId', '==', 'lacteoca'), where('estado', '==', 'excluida'))).catch(() => vacio),
                ]);
                if (!vivo) return;
                const lista = (s) => s.docs.map(x => ({ id: x.id, ...x.data() }));
                setDatos({
                    desde, inicial,
                    movimientos: lista(movs).filter(mv => /caracas/i.test(mv.almacenNombre || '')),
                    facturas: lista(facts),
                    visitas: lista(visitas),
                    posList: lista(pos),
                    excluidas: new Set(excl.docs.map(x => x.data().numero).filter(Boolean)),
                });
            } catch (e) {
                if (vivo) setError(e.message || String(e));
            }
        })();
        return () => { vivo = false; };
    }, [activo, recarga]);

    const r = useMemo(() => (datos ? calcularEnLaMano({ ...datos, hasta: diaCaracas(Date.now()) }) : null), [datos]);
    const recargar = useCallback(() => { setDatos(null); setRecarga(n => n + 1); }, []);
    return { r, error, recargar };
}

export { atrasadasPorFacturar } from '@/utils/enLaMano.js';
