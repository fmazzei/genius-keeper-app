// RUTA: src/Kroma/planillaForm.js
//
// De un registro de producción GUARDADO al formulario de la planilla.
//
// Corregir una planilla cargada es reabrirla con todo lo que ya tenía, no
// volver a teclearla. Esto traduce el documento de `kroma_production_logs` a
// los campos del formulario — y lo hace también para las planillas cargadas con
// el esquema VIEJO, que guardaban los kilos en `rendimientoKg`: son justamente
// las que más necesitan corregirse.

import { kgProducidos } from './estadoPlanta.js';
import { modoDeLog } from './ptPlanilla.js';

const txt = (v) => (v === null || v === undefined || Number.isNaN(v)) ? '' : String(v);

/** "YYYY-MM-DD" en partes LOCALES (en Venezuela el UTC retrocede un día). */
const aInputFecha = (v) => {
    if (!v) return '';
    const d = v?.toDate ? v.toDate() : new Date(v);
    if (Number.isNaN(d.getTime())) return '';
    const p = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};

const curva = (c = {}) => ({ inicial: txt(c.inicial), h24: txt(c.h24), h72: txt(c.h72) });

/**
 * El peso de una presentación en texto ("250 g", "1 kg"). Es lo que distingue
 * a las presentaciones entre sí: en el catálogo suelen llevar TODAS el nombre
 * del producto ("Lacteoca Chèvre Original"), así que el nombre solo no sirve.
 */
export const pesoPresentacion = (sku) => {
    const p = Number(sku?.pesoNeto);
    if (!Number.isFinite(p) || p <= 0) return '';
    return `${String(p).replace('.', ',')} ${sku?.unidad || 'g'}`;
};

/** Nombre completo de la presentación: producto + peso, sin repetir el peso. */
export const nombrePresentacion = (sku) => {
    const nombre = (sku?.nombre || '').trim() || 'Presentación';
    const peso = pesoPresentacion(sku);
    if (!peso) return nombre;
    // Si alguien ya escribió el peso dentro del nombre, no se duplica.
    const norm = (s) => s.toLowerCase().replace(/\s+/g, '');
    return norm(nombre).includes(norm(peso)) ? nombre : `${nombre} · ${peso}`;
};

/** Kg por unidad de una presentación del catálogo. */
export const kgPorUnidadDeSku = (sku) => {
    const p = Number(sku?.pesoNeto) || 0;
    return sku?.unidad === 'kg' ? p : p / 1000;
};

function sinEnvasarInicial(log) {
    const kg = Number(log?.kgSinEnvasar) || 0;
    if (kg <= 0) return '';
    const kilos = kgProducidos(log) || 0;
    const envasado = (log.productosFinales || [])
        .reduce((s, p) => s + (Number(p.pesoPorUnidad) || 0) * (Number(p.unidades) || 0), 0);
    const sugerido = Math.max(0, kilos - envasado);
    if (Math.abs(kg - sugerido) < 0.0005) return '';          // es lo sugerido
    if (kilos > 0 && kg + envasado > kilos + 0.0005) return ''; // incoherente: quedó viejo
    return txt(kg);
}

/** El estado inicial del formulario a partir de un log ya guardado. */
export function formularioDesdeLog(log) {
    if (!log) return null;
    const recs = log.recepciones || [];
    const insumos = log.insumosDeclarados || {};
    return {
        fecha:   aInputFecha(log.fechaInicio || log.fechaCierre || log.createdAt),
        fichaId: log.fichaId || '',
        entregas: recs.length > 0
            ? recs.map(r => ({
                proveedorId: r.proveedorId || '',
                litros:      txt(r.litros),
                temperatura: txt(r.temperatura),
                pH:          txt(r.pH),
                densidad:    txt(r.densidad),
            }))
            : [{ proveedorId: '', litros: '', temperatura: '', pH: '', densidad: '' }],
        litrosProceso: txt(log.litrosNetos),
        insumos: {
            conservante: txt(insumos.conservante), fermento: txt(insumos.fermento),
            calcio: txt(insumos.calcio), cuajo: txt(insumos.cuajo), sal: txt(insumos.sal),
        },
        curvaPh:   curva(log.curvaMaduracion?.pH),
        curvaTemp: curva(log.curvaMaduracion?.temperatura),
        // `kgProducidos` lee bien los dos esquemas: sin él, una planilla vieja
        // se reabriría con los kilos en blanco.
        kilos: txt(kgProducidos(log) || ''),
        empaques: (log.productosFinales || []).map(p => ({
            catalogId:   p.catalogId || null,
            nombre:      p.nombre || '',
            kgPorUnidad: txt(p.pesoPorUnidad),
            unidades:    txt(p.unidades),
            enCava:           !!p.enCava,
            fechaEnvasado:    p.fechaEnvasado || '',
            fechaVencimiento: p.fechaVencimiento || '',
        })),
        // `null` = no se declaró queso sin envasar (la pill queda apagada).
        // Vacío = sigue a lo sugerido (kilos − envasado), así que corregir los
        // kilos o agregar bolsas recalcula solo lo sin envasar. Solo se
        // conserva escrito si alguien declaró a propósito un valor distinto
        // y coherente (no más de lo producido).
        sinEnvasar: sinEnvasarInicial(log),
        vencSinEnvasar: log.fechaVencimientoSinEnvasar || '',
        modo: modoDeLog(log),
        precioLeche: txt(recs.find(r => r.costoUsdLitro)?.costoUsdLitro),
        notas: log.notas || '',
    };
}
