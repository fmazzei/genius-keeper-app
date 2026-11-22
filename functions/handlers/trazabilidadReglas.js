// RUTA: functions/handlers/trazabilidadReglas.js
//
// TRAZABILIDAD DE UN LOTE — puro (pedido del dueño, 22-nov-2026).
//
// Con una fecha de vencimiento o un lote, arma la pista completa del producto:
// de qué leche salió (productores, litros y parámetros de recepción con fecha y
// hora), cómo se produjo (inicio, cada paso con sus parámetros, cierre), cuánto
// estuvo guardado hasta envasarse, a dónde se despachó, a qué clientes pudo
// llegar y cuánto queda aproximadamente en la calle.
//
// Fuentes (las lee `trazabilidad.js`, el servidor, y las pasa ya planas):
//   · kroma_production_logs, kroma_milk_reception — la producción y su leche.
//   · kroma_inventory_pt — las partidas de la cava (granel y envasado).
//   · kroma_despachos, recepciones_frimaca — despachos y su recepción en Caracas.
//   · kroma_inv_libro — el libro valorado: saldo de cada ubicación hoy, pickings
//     y las facturas de Zoho asignadas a lote por vencimiento (FEFO).
//   · kroma_ventas_planta — ventas y reposiciones desde la cava de Barinas.
//   · visit_reports — dónde lo vio el mercaderista en anaquel (lotes por fecha).
//   · devoluciones — lo que se retiró del anaquel.
//
// Nunca muestra costos: la trazabilidad es del producto, no del dinero.

const TZ_MS = 4 * 3600 * 1000; // Caracas, UTC−4

const num = (v) => { const n = Number(v); return Number.isFinite(n) ? n : null; };
const r2 = (n) => Math.round(n * 100) / 100;

function aMs(v) {
    if (v == null || v === '') return null;
    if (typeof v === 'number') return v;
    if (typeof v === 'string') {
        if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return Date.parse(`${v}T12:00:00-04:00`);
        const t = Date.parse(v);
        return Number.isFinite(t) ? t : null;
    }
    if (typeof v.toMillis === 'function') return v.toMillis();
    if (typeof v.seconds === 'number') return v.seconds * 1000;
    if (typeof v._seconds === 'number') return v._seconds * 1000;
    if (v instanceof Date) return v.getTime();
    return null;
}
const diaDe = (v) => {
    if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v)) return v;
    const ms = aMs(v);
    return ms == null ? null : new Date(ms - TZ_MS).toISOString().slice(0, 10);
};
const diasEntre = (a, b) => {
    const da = diaDe(a), db = diaDe(b);
    if (!da || !db) return null;
    return Math.round((Date.parse(`${db}T00:00:00Z`) - Date.parse(`${da}T00:00:00Z`)) / 86400000);
};
const quitarAcentos = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '');

// ── La consulta ──────────────────────────────────────────────────────────
/**
 * Lo que escribió la persona → { tipo:'vencimiento', fecha:'AAAA-MM-DD' } o
 * { tipo:'lote', texto } o null. Acepta 23/11/26, 23-11-2026, 2026-11-23 y
 * «23 de noviembre de 2026».
 */
const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
function resolverConsulta(q) {
    const s = String(q || '').trim();
    if (!s) return null;
    const fechaValida = (y, m, d) => {
        if (!(m >= 1 && m <= 12 && d >= 1 && d <= 31)) return null;
        const iso = `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
        const t = new Date(`${iso}T12:00:00Z`);
        return t.getUTCMonth() + 1 === m && t.getUTCDate() === d ? iso : null;
    };
    let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
    if (m) { const f = fechaValida(+m[1], +m[2], +m[3]); return f ? { tipo: 'vencimiento', fecha: f } : null; }
    m = s.match(/^(\d{1,2})\s*[/\-.]\s*(\d{1,2})\s*[/\-.]\s*(\d{2}|\d{4})$/);
    if (m) {
        const y = m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3]);
        const f = fechaValida(y, +m[2], +m[1]);
        return f ? { tipo: 'vencimiento', fecha: f } : null;
    }
    const t = quitarAcentos(s).toLowerCase();
    m = t.match(/^(\d{1,2})\s*(?:de\s+)?([a-z]+)\s*(?:de(?:l)?\s+)?(\d{2}|\d{4})$/);
    if (m) {
        const mes = MESES.findIndex(n => n.startsWith(m[2].slice(0, 3))) + 1;
        if (mes > 0) {
            const y = m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3]);
            const f = fechaValida(y, mes, +m[1]);
            if (f) return { tipo: 'vencimiento', fecha: f };
        }
    }
    const texto = s.toUpperCase().replace(/\s+/g, '');
    return texto.length >= 3 ? { tipo: 'lote', texto } : null;
}

const vencDeLog = (log) => {
    const out = new Set();
    (log.productosFinales || []).forEach(p => p?.fechaVencimiento && out.add(p.fechaVencimiento));
    if (log.fechaVencimientoSinEnvasar) out.add(log.fechaVencimientoSinEnvasar);
    if (log.fechaVencimiento) out.add(log.fechaVencimiento);
    return out;
};

/**
 * Los lotes que corresponden a la consulta. Para una fecha: todo lote que tenga
 * algo con ese vencimiento en la producción, la cava, los despachos, Caracas o
 * el libro. Para un texto: los lotes que lo contienen (exacto primero).
 * → [{ lote, logId|null }]
 */
function lotesDeConsulta(consulta, { logs = [], partidas = [], comercial = [], despachos = [], libro = [] } = {}) {
    if (!consulta) return [];
    const porLote = new Map();
    const add = (lote, logId) => {
        if (!lote) return;
        const e = porLote.get(lote) || { lote, logId: null };
        if (logId && !e.logId) e.logId = logId;
        porLote.set(lote, e);
    };
    const logDeLote = new Map(logs.filter(l => l.lote && l.active !== false).map(l => [l.lote, l.id]));
    if (consulta.tipo === 'vencimiento') {
        const f = consulta.fecha;
        logs.forEach(l => { if (l.active !== false && vencDeLog(l).has(f)) add(l.lote, l.id); });
        partidas.forEach(p => { if (p.fechaVencimiento === f && !p.deletedMotivo) add(p.lote, p.logId); });
        comercial.forEach(c => { if (c.fechaVencimiento === f) add(c.lote, c.logId); });
        despachos.forEach(d => (d.lineas || []).forEach(l => { if (l.fechaVencimiento === f) add(l.lote, l.logId); }));
        libro.forEach(a => { if (a.fechaVencimiento === f) add(a.lote, a.logId); });
    } else {
        const t = consulta.texto;
        const todos = new Set([...logs.filter(l => l.active !== false).map(l => l.lote), ...partidas.map(p => p.lote), ...comercial.map(c => c.lote)].filter(Boolean));
        const exactos = [...todos].filter(l => l.toUpperCase() === t);
        const parecidos = exactos.length ? exactos : [...todos].filter(l => l.toUpperCase().includes(t));
        parecidos.forEach(l => add(l, null));
    }
    for (const e of porLote.values()) if (!e.logId) e.logId = logDeLote.get(e.lote) || null;
    return [...porLote.values()].sort((a, b) => a.lote.localeCompare(b.lote));
}

// ── Etiquetas de los parámetros ─────────────────────────────────────────
const NOMBRE_PASO = {
    pasteurizacion: 'Pasteurización', cuajado: 'Cuajado', corte: 'Corte de la cuajada', desuerado: 'Desuerado',
    preprensa: 'Pre-prensa', pre_prensa: 'Pre-prensa', moldeado: 'Moldeado', prensado: 'Prensado', salado: 'Salado',
    maduracion: 'Maduración', empaque: 'Empaque', inoculacion: 'Inoculación', agregar_insumo: 'Insumo',
};
const ETIQUETAS = {
    tempMax: ['Temperatura máxima', '°C'], tempSalidaMin: ['Salida (choque térmico) mín.', '°C'], tempSalidaMax: ['Salida (choque térmico) máx.', '°C'],
    tiempoSostenimiento: ['Sostenimiento'], metodo: ['Método'], tempPreCuajado: ['Temperatura antes de cuajar', '°C'], phPreCuajado: ['pH antes de cuajar'],
    tipoCoagulacion: ['Coagulación'], tempInoculacion: ['Temperatura de inoculación', '°C'], tipoFermento: ['Fermento'], cuajoTipo: ['Cuajo'],
    tempCoagulacion: ['Temperatura de coagulación', '°C'], tiempoCoagulacion: ['Tiempo de coagulación'], temperaturaAmbiente: ['Temperatura del cuarto', '°C'],
    tiempo: ['Tiempo'], phPost: ['pH al terminar'], conMoldes: ['Con moldes'], cantidadSal: ['Sal'], temperatura: ['Temperatura', '°C'],
    concentracion: ['Concentración'], presentacionesPesos: ['Presentaciones'], tiposEmpaque: ['Empaque'], aspersionConservante: ['Aspersión de conservante'],
    precintado: ['Precintado'], envalado: ['Envalado'], fermentoMaterialNombre: ['Fermento usado'], cuajoMaterialNombre: ['Cuajo usado'],
    conservanteMaterialNombre: ['Conservante usado'], calcioMaterialNombre: ['Calcio usado'], conservanteNombre: ['Conservante'],
    tamanoGrano: ['Tamaño de grano'], ph: ['pH'], humedad: ['Humedad', '%'],
    cuajoReal: ['Cuajo añadido', 'ml'], fermentoReal: ['Fermento añadido', 'g'], conservanteReal: ['Conservante añadido', 'g'], calcioReal: ['Calcio añadido', 'g'],
    masaKg: ['Masa', 'kg'], cantidadSalReal: ['Sal añadida', 'g'], totalKgProducido: ['Kg producidos', 'kg'], phQueso: ['pH del queso'],
    disposicion: ['Destino del queso'], phSalida: ['pH de la cuajada al sacarla'], tiempoCoagulacionReal: ['Tiempo real de coagulación'],
    tempSalidaCuajada: ['Temperatura de la cuajada al sacarla', '°C'], tempPost: ['Temperatura al terminar', '°C'], mermaL: ['Merma', 'L'],
    litrosNetos: ['Litros netos', 'L'], tempEntrada: ['Temperatura de entrada', '°C'], tempObjetivo: ['Temperatura objetivo', '°C'],
};
const VALORES = {
    lactica: 'láctica', enzimatica: 'enzimática', mesofilico: 'mesófilo', termofilico: 'termófilo', microbiano: 'microbiano',
    gravedad: 'por gravedad', masa: 'en masa', salmuera: 'en salmuera', manual: 'manual', guardar_todo: 'a granel en cava',
    empacar_todo: 'envasado', mixto: 'parte envasado, parte a granel', si: 'sí', no: 'no', dias: 'días', h: 'h', min: 'min', seg: 'seg',
    g_por_kg: 'g por kg', historico: 'cargado por planilla',
    por_vencer: 'por vencer', vencido: 'vencido', danado: 'envase dañado', calidad: 'calidad',
};
const OMITIR = /costo|monto|precio|usd|materialid$|^id$|ingredienteorden|consumoscosteo|unidad|^fermentoesperapost$/i;
const humano = (k) => k.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/^./, c => c.toUpperCase());
function valorLegible(v) {
    if (v == null || v === '') return null;
    if (typeof v === 'boolean') return v ? 'sí' : 'no';
    if (Array.isArray(v)) return v.map(valorLegible).filter(Boolean).join(', ') || null;
    if (typeof v === 'object') return null;
    if (typeof v === 'number') return String(r2(v)).replace('.', ',');
    return VALORES[v] || String(v);
}
/** Parámetros de un paso → [{ k, v }] en español, sin costos ni ids. */
function filasParametros(obj = {}) {
    const filas = [];
    const unidadDe = (k) => obj[`${k}Unidad`] || (k === 'tiempo' ? obj.unidadTiempo : k === 'tiempoSostenimiento' ? obj.unidadTiempo
        : k === 'tiempoCoagulacion' ? obj.unidadTiempoCoagulacion : k === 'cantidadSal' ? obj.unidadSal : null);
    for (const [k, raw] of Object.entries(obj || {})) {
        if (OMITIR.test(k) || /^vuelta\d/i.test(k) || /Agitar(Unidad)?$/.test(k) || /^(calcio|conservante|fermento)$/.test(k)) continue;
        const v = valorLegible(raw);
        if (v == null) continue;
        const [nombre, u] = ETIQUETAS[k] || [humano(k)];
        const uni = unidadDe(k);
        filas.push({ k: nombre, v: `${v}${uni ? ` ${VALORES[uni] || uni}` : u ? ` ${u}` : ''}` });
    }
    return filas;
}

// ── Leche ───────────────────────────────────────────────────────────────
function parametrosRecepcion(rec = {}, enLog = {}) {
    const p = { ...(enLog || {}), ...(rec.parametros || {}) };
    const filas = [];
    const t = num(p.temperatura); if (t != null) filas.push({ k: 'Temperatura', v: `${valorLegible(t)} °C` });
    const ph = num(p.pH ?? p.ph); if (ph != null) filas.push({ k: 'pH', v: valorLegible(ph) });
    const d = num(p.densidad); if (d != null) filas.push({ k: 'Densidad', v: valorLegible(d) });
    const b = num(p.brix ?? p.Brix); if (b != null) filas.push({ k: 'Brix', v: `${valorLegible(b)} °Bx` });
    const a = num(p.acidez ?? p.titulacion); if (a != null) filas.push({ k: 'Acidez', v: `${valorLegible(a)} °D` });
    return filas;
}

function lecheDeLog(log, recepcionesPorId) {
    const enLog = log.recepciones || [];
    const ids = [...new Set([...(log.recepcionIds || []), ...enLog.map(r => r.recepcionId).filter(Boolean)])];
    const filas = ids.map(id => {
        const rec = recepcionesPorId.get(id) || {};
        const e = enLog.find(r => r.recepcionId === id) || {};
        const fechaMs = aMs(rec.fecha) ?? aMs(rec.createdAt);
        return {
            recepcionId: id,
            proveedor: rec.proveedorNombre || e.proveedorNombre || '—',
            litros: num(rec.litros) ?? num(e.litros),
            litrosUsados: num(e.litros),
            fechaMs,
            horaConocida: !(rec.origen === 'planilla_papel' || rec.cargadaEnDiferido),
            ruta: (rec.enrutamiento || e.rutaLeche) === 'tanque' ? 'Pasó por el tanque de enfriamiento' : (rec.enrutamiento || e.rutaLeche) ? 'Directo a producción' : null,
            recibio: rec.operarioNombre || null,
            parametros: parametrosRecepcion(rec, { temperatura: e.temperatura, densidad: e.densidad, pH: e.pH, brix: e.Brix ?? e.brix }),
            deFicha: !recepcionesPorId.has(id),
        };
    });
    if (!filas.length && (log.proveedorNombre || log.parametrosLeche)) {
        filas.push({ recepcionId: null, proveedor: log.proveedorNombre || '—', litros: num(log.litrosIngresados), litrosUsados: num(log.litrosIngresados),
            fechaMs: aMs(log.fechaInicio), horaConocida: false, ruta: null, recibio: null, parametros: parametrosRecepcion({}, log.parametrosLeche), deFicha: true });
    }
    return filas.sort((a, b) => (a.fechaMs || 0) - (b.fechaMs || 0));
}

// ── Producción ──────────────────────────────────────────────────────────
function produccionDeLog(log) {
    const snap = log.bloquesSnapshot || [];
    const data = log.bloquesData || {};
    const pasos = snap.map((b, i) => {
        const d = data[i] || data[String(i)] || {};
        const plan = filasParametros(b.params || {});
        const registro = filasParametros(d.registros || {});
        // Lo que se pidió al retomar un paso largo se guarda en el paso largo.
        return {
            tipo: b.tipo, nombre: NOMBRE_PASO[b.tipo] || humano(b.tipo || 'Paso'),
            inicioMs: aMs(d.iniciadoAt), finMs: aMs(d.completadoAt), completado: !!d.completado,
            esperaMin: num(d.tiempoEsperaRealMin), plan, registro,
        };
    });
    const planilla = log.origen === 'planilla_papel';
    const insumos = planilla
        ? Object.entries(log.insumosDeclarados || {}).filter(([, v]) => v !== '' && v != null).map(([k, v]) => ({ k: humano(k), v: String(v) }))
        : [];
    const kg = num(log.totalKgProducido);
    const litros = num(log.litrosIngresados);
    return {
        planilla,
        modoCarga: log.modoCarga || null,
        operario: log.operarioNombre || null,
        inicioMs: aMs(log.fechaInicio) ?? aMs(log.createdAt),
        cierreMs: aMs(log.fechaCierre),
        estado: log.estado || null,
        litrosIngresados: litros, merma: num(log.merma), litrosNetos: num(log.litrosNetos),
        kgProducidos: kg,
        rendimiento: num(log.rendimientoKg) ?? (kg && litros ? r2(litros / kg) : null),
        disposicion: valorLegible(log.disposicion),
        parametrosLeche: parametrosRecepcion({}, log.parametrosLeche),
        pasos, insumos,
        notas: log.notas || null,
    };
}

// ── Guardado y envasado ─────────────────────────────────────────────────
const unidadesDePartida = (p) => num(p.cantidadCargada)
    ?? ((num(p.totalKg) && num(p.pesoPorUnidad)) ? Math.round(num(p.totalKg) / num(p.pesoPorUnidad)) : num(p.unidades));
function envasadosDeLog(log, partidas) {
    const porClave = new Map();
    const poner = (e) => {
        const k = `${e.fechaEnvasado || ''}|${e.fechaVencimiento || ''}|${e.presentacion || ''}`;
        const prev = porClave.get(k);
        if (!prev || (e.unidades || 0) > (prev.unidades || 0)) porClave.set(k, e);
    };
    (log.productosFinales || []).forEach(p => poner({
        presentacion: p.nombre || p.presentacion || '', pesoPorUnidad: num(p.pesoPorUnidad),
        unidades: num(p.unidades), fechaEnvasado: p.fechaEnvasado || null, fechaVencimiento: p.fechaVencimiento || null,
    }));
    partidas.filter(p => p.tipo === 'empacado' && !p.deletedMotivo).forEach(p => poner({
        presentacion: p.presentacion || '', pesoPorUnidad: num(p.pesoPorUnidad),
        unidades: unidadesDePartida(p), fechaEnvasado: p.fechaEnvasado || null, fechaVencimiento: p.fechaVencimiento || null,
    }));
    const cierre = log.fechaCierre || log.fechaInicio;
    return [...porClave.values()]
        .map(e => ({ ...e, diasGuardado: e.fechaEnvasado ? diasEntre(cierre, e.fechaEnvasado) : null }))
        .sort((a, b) => String(a.fechaEnvasado || '').localeCompare(String(b.fechaEnvasado || '')));
}

// ── Lo que pasó después: despachos, ventas, Caracas, clientes ───────────
const ES_CARACAS = (d) => d.destinoCaracas === true || (d.lineas || []).some(l => /caracas/i.test(l.destino?.ciudad || ''));
function despachosDelLote(lote, despachos, actasPorId) {
    return despachos.filter(d => d.active !== false && (d.lineas || []).some(l => l.lote === lote)).map(d => {
        const lineas = (d.lineas || []).filter(l => l.lote === lote);
        const acta = actasPorId.get(d.id) || null;
        const ciudad = lineas[0]?.destino?.ciudad || lineas[0]?.destino?.nombre || (ES_CARACAS(d) ? 'Caracas' : null);
        return {
            despachoId: d.id, fecha: d.fecha || diaDe(d.createdAt), salidaMs: aMs(d.horasSalida) ?? aMs(d.createdAt),
            destino: ES_CARACAS(d) ? 'Caracas (almacén Frimaca)' : (ciudad || 'Otro destino'),
            caracas: ES_CARACAS(d),
            lineas: lineas.map(l => ({ presentacion: l.presentacion || l.productoNombre || '', fechaVencimiento: l.fechaVencimiento || null,
                cantidad: num(l.cantidad), unidad: l.unit || 'ud' })),
            responsable: d.responsable?.nombre || null, notas: d.notas || null, estado: d.estado || null,
            factura: d.facturaNumero || null, consumoInterno: d.consumoInterno || null,
            recepcion: acta || d.recibidoCaracas ? {
                fechaMs: aMs(acta?.recibidoAt) ?? aMs(acta?.createdAt) ?? aMs(d.recibidoEnGKAt),
                quien: acta?.recibidoPor?.nombre || d.recibidoPor?.nombre || null,
                novedad: !!(acta?.conNovedad ?? d.conNovedad),
            } : null,
        };
    }).sort((a, b) => (a.salidaMs || 0) - (b.salidaMs || 0));
}

function ventasPlantaDelLote(lote, ventas) {
    return ventas.filter(v => v.active !== false && (v.lineas || []).some(l => l.lote === lote)).map(v => {
        const lineas = (v.lineas || []).filter(l => l.lote === lote);
        return {
            ventaId: v.id, fecha: v.fecha || diaDe(v.createdAt), tipo: v.tipo === 'reposicion' ? 'Reposición' : 'Venta en planta',
            cliente: v.clienteNombre || '—', clienteId: v.clienteZohoId || null, factura: v.facturaNumero || null,
            lineas: lineas.map(l => ({ presentacion: l.presentacion || l.productoNombre || '', fechaVencimiento: l.fechaVencimiento || null,
                cantidad: num(l.cantidad), unidad: l.tipo === 'sin_envasar' ? 'kg' : (l.unit || 'ud') })),
        };
    });
}

const nombreDeMotivo = (m) => String(m || '').replace(/^Factura\s+\S+\s*·\s*/, '').trim();
const UBICACION = { planta: 'Cava de planta (Barinas)', transito: 'En camino a Caracas', frimaca: 'Almacén Frimaca (Caracas)', ruta: 'Con el mercaderista' };

/** Saldos de hoy, facturas, pickings y salidas, del libro valorado. */
function libroDelLote(lote, libro) {
    const asientos = libro.filter(a => a.lote === lote);
    const saldos = {};
    const porVenc = {};
    asientos.forEach(a => {
        if (!UBICACION[a.ubicacion]) return;
        const c = num(a.cantidad) || 0;
        saldos[a.ubicacion] = (saldos[a.ubicacion] || 0) + c;
        const v = a.fechaVencimiento || '—';
        porVenc[v] = porVenc[v] || {};
        porVenc[v][a.ubicacion] = (porVenc[v][a.ubicacion] || 0) + c;
    });
    const facturas = asientos.filter(a => a.tipo === 'factura' || a.tipo === 'nota_credito').map(a => ({
        fecha: a.fecha, factura: a.ref?.facturaNumero || null, clienteId: a.ref?.clienteId || null,
        cliente: nombreDeMotivo(a.motivo) || '—', cantidad: -(num(a.cantidad) || 0), unidad: a.unidad || 'ud',
        fechaVencimiento: a.fechaVencimiento || null, reposicion: a.categoria === 'reposicion', devolucion: a.tipo === 'nota_credito',
    }));
    const reposicionesGk = asientos.filter(a => a.tipo === 'reposicion_gk').map(a => ({
        fecha: a.fecha, cliente: a.ref?.posName || nombreDeMotivo(a.motivo) || '—', posId: a.ref?.posId || null,
        cantidad: -(num(a.cantidad) || 0), fechaVencimiento: a.fechaVencimiento || null,
    }));
    const pickings = asientos.filter(a => a.ubicacion === 'frimaca' && /picking/.test(a.tipo || '') && (num(a.cantidad) || 0) < 0).map(a => ({
        fecha: a.fecha, cantidad: -(num(a.cantidad) || 0), fechaVencimiento: a.fechaVencimiento || null,
        nota: a.motivo || null, declarado: a.tipo === 'picking',
    }));
    const salidas = asientos.filter(a => ['merma', 'consumo_interno'].includes(a.categoria) && (num(a.cantidad) || 0) < 0).map(a => ({
        fecha: a.fecha, ubicacion: UBICACION[a.ubicacion] || a.ubicacion, cantidad: -(num(a.cantidad) || 0), unidad: a.unidad || 'ud',
        motivo: a.motivo || (a.categoria === 'merma' ? 'Merma' : 'Consumo interno'), fechaVencimiento: a.fechaVencimiento || null,
    }));
    const limpio = (o) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, r2(v)]));
    return {
        hayLibro: asientos.length > 0, saldos: limpio(saldos),
        saldosPorVencimiento: Object.fromEntries(Object.entries(porVenc).map(([v, s]) => [v, limpio(s)])),
        facturas, reposicionesGk, pickings, salidas,
    };
}

/** Clientes a los que pudo llegar: facturas asignadas, ventas en planta, reposiciones. */
function clientesDelLote({ facturas, ventas, reposicionesGk, despachos }) {
    const porCliente = new Map();
    const sumar = (clave, nombre, fila) => {
        const c = porCliente.get(clave) || { cliente: nombre, unidades: 0, movimientos: [] };
        c.unidades += fila.cantidad || 0;
        c.movimientos.push(fila);
        porCliente.set(clave, c);
    };
    facturas.filter(f => !f.devolucion).forEach(f => sumar(f.clienteId || f.cliente, f.cliente, {
        fecha: f.fecha, como: f.reposicion ? 'Factura de reposición' : 'Factura', ref: f.factura, cantidad: f.cantidad, fechaVencimiento: f.fechaVencimiento, fuente: 'factura',
    }));
    facturas.filter(f => f.devolucion).forEach(f => sumar(f.clienteId || f.cliente, f.cliente, {
        fecha: f.fecha, como: 'Nota de crédito (devolvió)', ref: f.factura, cantidad: f.cantidad, fechaVencimiento: f.fechaVencimiento, fuente: 'factura',
    }));
    reposicionesGk.forEach(r => sumar(r.posId || r.cliente, r.cliente, {
        fecha: r.fecha, como: 'Reposición del mercaderista', ref: null, cantidad: r.cantidad, fechaVencimiento: r.fechaVencimiento, fuente: 'reposicion',
    }));
    ventas.forEach(v => v.lineas.filter(l => l.unidad !== 'kg').forEach(l => sumar(v.clienteId || v.cliente, v.cliente, {
        fecha: v.fecha, como: v.tipo, ref: v.factura, cantidad: l.cantidad, fechaVencimiento: l.fechaVencimiento, fuente: 'planta',
    })));
    despachos.filter(d => !d.caracas && !d.consumoInterno).forEach(d => d.lineas.forEach(l => sumar(`desp:${d.destino}`, d.destino, {
        fecha: d.fecha, como: 'Despacho a otra ciudad', ref: d.factura, cantidad: l.cantidad, fechaVencimiento: l.fechaVencimiento, fuente: 'despacho',
    })));
    return [...porCliente.values()].map(c => ({ ...c, unidades: r2(c.unidades) }))
        .sort((a, b) => b.unidades - a.unidades || a.cliente.localeCompare(b.cliente));
}

// ── En la calle: lo que vio el mercaderista ─────────────────────────────
/**
 * Por punto de venta, las visitas que vieron lotes con estos vencimientos, y la
 * ÚLTIMA visita del punto (aunque ya no lo tenga). La estimación de lo que queda
 * en anaquel suma lo que contó la última visita de cada punto.
 */
function enLaCalle(vencimientos, visitas, posPorId, hoy) {
    const vs = new Set(vencimientos);
    const porPdv = new Map();
    for (const v of visitas) {
        const posId = v.posId || v.posName;
        if (!posId) continue;
        const ms = aMs(v.startTime) ?? aMs(v.createdAt);
        const lotes = (v.batches || []).filter(b => b && !b.devuelto && vs.has(b.expiryDate) && (num(b.quantity) || 0) > 0);
        const unidades = lotes.reduce((s, b) => s + (num(b.quantity) || 0), 0);
        const e = porPdv.get(posId) || { posId: v.posId || null, punto: posPorId.get(v.posId)?.name || v.posName || '—', vistas: [], ultimaMs: null, ultimaUnidades: 0 };
        if (ms != null && (e.ultimaMs == null || ms > e.ultimaMs)) { e.ultimaMs = ms; e.ultimaUnidades = unidades; e.ultimaQuien = v.userName || null; }
        if (unidades > 0) e.vistas.push({ fechaMs: ms, unidades, quien: v.userName || null,
            porVencimiento: Object.fromEntries([...vs].map(f => [f, lotes.filter(b => b.expiryDate === f).reduce((s, b) => s + (num(b.quantity) || 0), 0)]).filter(([, n]) => n > 0)) });
        porPdv.set(posId, e);
    }
    const puntos = [...porPdv.values()].filter(p => p.vistas.length).map(p => ({
        ...p,
        vistas: p.vistas.sort((a, b) => (a.fechaMs || 0) - (b.fechaMs || 0)),
        sigue: p.ultimaUnidades > 0,
        diasDesdeUltima: p.ultimaMs != null ? diasEntre(p.ultimaMs, hoy) : null,
    })).sort((a, b) => (b.sigue - a.sigue) || (b.ultimaUnidades - a.ultimaUnidades) || a.punto.localeCompare(b.punto));
    const estimado = puntos.reduce((s, p) => s + (p.sigue ? p.ultimaUnidades : 0), 0);
    return { puntos, estimado, conProducto: puntos.filter(p => p.sigue).length };
}

function retirosDelAnaquel(vencimientos, devoluciones, posPorId) {
    const vs = new Set(vencimientos);
    const out = [];
    for (const d of devoluciones) {
        if (d.active === false || d.anulada) continue;
        const lotes = (d.lotes || []).filter(l => vs.has(l.expiryDate));
        const uds = lotes.reduce((s, l) => s + (num(l.unidades) || 0), 0);
        if (uds > 0) out.push({ fecha: diaDe(d.fecha) || diaDe(d.createdAt), punto: posPorId.get(d.posId)?.name || d.posName || '—', unidades: uds,
            motivo: lotes.map(l => VALORES[l.motivo] || l.motivo).filter(Boolean).join(', ') || null, resolucion: d.resolucion || null, repuestas: num(d.unidadesRepuestas) });
    }
    return out.sort((a, b) => String(a.fecha).localeCompare(String(b.fecha)));
}

// ── Línea de tiempo ─────────────────────────────────────────────────────
const ddmmaa = (v) => { const m = String(v || '').match(/^(\d{4})-(\d{2})-(\d{2})/); return m ? `${m[3]}/${m[2]}/${m[1].slice(2)}` : (v || '—'); };
const CON_HORA = new Set(['leche', 'produccion', 'paso', 'despacho', 'recepcion', 'anaquel']);
function lineaDeTiempo(t) {
    const ev = [];
    const add = (ms, titulo, detalle, tipo, sinHora = false) => { if (ms != null) ev.push({ ms, titulo, detalle, tipo, conHora: CON_HORA.has(tipo) && !sinHora }); };
    t.leche.forEach(r => add(r.fechaMs, `Leche recibida · ${r.proveedor}`, `${valorLegible(r.litros) || '—'} L${r.ruta ? ` · ${r.ruta.toLowerCase()}` : ''}`, 'leche', !r.horaConocida));
    const p = t.produccion;
    if (p) {
        add(p.inicioMs, 'Inicio de la producción', `${valorLegible(p.litrosIngresados) || '—'} L${p.operario ? ` · ${p.operario}` : ''}`, 'produccion', p.planilla);
        p.pasos.forEach(s => { if (s.finMs) add(s.finMs, `${s.nombre} terminado`, null, 'paso'); });
        if (p.cierreMs && !p.planilla) add(p.cierreMs, 'Producción cerrada', `${valorLegible(p.kgProducidos) || '—'} kg · ${p.disposicion || ''}`, 'produccion');
    }
    t.envasados.forEach(e => add(aMs(e.fechaEnvasado), `Envasado · ${e.presentacion}`, `${e.unidades ?? '—'} ud · vence ${ddmmaa(e.fechaVencimiento)}${e.diasGuardado != null ? ` · ${e.diasGuardado} días guardado` : ''}`, 'envasado'));
    t.despachos.forEach(d => {
        add(d.salidaMs, `Despacho a ${d.destino}`, d.lineas.map(l => `${valorLegible(l.cantidad)} ${l.unidad}`).join(' + '), 'despacho');
        if (d.recepcion?.fechaMs) add(d.recepcion.fechaMs, 'Recibido en Caracas', d.recepcion.novedad ? 'con novedad' : null, 'recepcion');
    });
    t.ventas.forEach(v => add(aMs(v.fecha), `${v.tipo} · ${v.cliente}`, v.lineas.map(l => `${valorLegible(l.cantidad)} ${l.unidad}`).join(' + '), 'venta'));
    t.libro.pickings.forEach(k => add(aMs(k.fecha), k.declarado ? 'Retiro del mercaderista (Frimaca)' : 'Salió de Frimaca sin picking anotado', `${k.cantidad} ud`, 'picking'));
    t.libro.facturas.forEach(f => add(aMs(f.fecha), `${f.devolucion ? 'Nota de crédito' : 'Factura'} ${f.factura || ''} · ${f.cliente}`, `${f.cantidad} ud`, 'factura'));
    t.libro.reposicionesGk.forEach(r => add(aMs(r.fecha), `Reposición · ${r.cliente}`, `${r.cantidad} ud`, 'factura'));
    t.calle.puntos.forEach(pt => pt.vistas.forEach(v => add(v.fechaMs, `Visto en anaquel · ${pt.punto}`, `${v.unidades} ud`, 'anaquel')));
    t.retiros.forEach(r => add(aMs(r.fecha), `Retirado del anaquel · ${r.punto}`, `${r.unidades} ud${r.motivo ? ` · ${r.motivo}` : ''}`, 'retiro'));
    t.vencimientos.forEach(v => add(aMs(v), 'Vence', ddmmaa(v), 'vence'));
    return ev.sort((a, b) => a.ms - b.ms);
}

/**
 * Arma la pista de UN lote.
 * @param {object} p  lote, logId y las colecciones ya filtradas a este lote (o completas)
 */
function trazarLote({ lote, logId, consulta, logs = [], recepciones = [], partidas = [], despachos = [], actas = [], ventas = [], libro = [],
    visitas = [], devoluciones = [], posList = [], hoy }) {
    const log = logs.find(l => l.id === logId) || logs.find(l => l.lote === lote && l.active !== false) || null;
    const recepcionesPorId = new Map(recepciones.map(r => [r.id, r]));
    const actasPorId = new Map(actas.map(a => [a.id, a]));
    const posPorId = new Map(posList.map(p => [p.id, p]));
    const partidasLote = partidas.filter(p => p.lote === lote || (log && p.logId === log.id));

    const envasados = log ? envasadosDeLog(log, partidasLote) : envasadosDeLog({}, partidasLote);
    const libroL = libroDelLote(lote, libro);
    const desp = despachosDelLote(lote, despachos, actasPorId);
    const vent = ventasPlantaDelLote(lote, ventas);

    const vencimientos = [...new Set([
        ...(log ? [...vencDeLog(log)] : []),
        ...envasados.map(e => e.fechaVencimiento),
        ...partidasLote.filter(p => !p.deletedMotivo).map(p => p.fechaVencimiento),
        ...desp.flatMap(d => d.lineas.map(l => l.fechaVencimiento)),
        ...Object.keys(libroL.saldosPorVencimiento).filter(v => v !== '—'),
    ].filter(Boolean))].sort();
    // Para «en la calle» solo cuentan los vencimientos de lo envasado (el granel no llega al anaquel).
    const vencEnvasado = [...new Set([...envasados.map(e => e.fechaVencimiento), ...desp.flatMap(d => d.lineas.filter(l => l.unidad !== 'kg').map(l => l.fechaVencimiento))].filter(Boolean))];
    const calle = enLaCalle(vencEnvasado, visitas, posPorId, hoy);
    const retiros = retirosDelAnaquel(vencEnvasado, devoluciones, posPorId);
    const clientes = clientesDelLote({ facturas: libroL.facturas, ventas: vent, reposicionesGk: libroL.reposicionesGk, despachos: desp });

    const granel = partidasLote.filter(p => p.tipo === 'sin_envasar' && !p.deletedMotivo);
    const kgGranel = num(log?.disposicion === 'guardar_todo' ? log?.totalKgProducido : null)
        ?? (granel.length ? Math.max(...granel.map(p => num(p.cantidadCargada) ?? num(p.kgTotales) ?? 0)) : null);

    const t = {
        lote, logId: log?.id || null, producto: log?.productoNombre?.trim() || partidasLote[0]?.productoNombre?.trim() || null,
        consulta: consulta?.tipo === 'vencimiento' ? consulta.fecha : null,
        vencimientos, vencidos: vencimientos.filter(v => hoy && v < hoy),
        leche: log ? lecheDeLog(log, recepcionesPorId) : [],
        produccion: log ? produccionDeLog(log) : null,
        guardado: {
            disposicion: log ? valorLegible(log.disposicion) : null,
            kgAGranel: kgGranel,
            vencimientoTentativo: log?.fechaVencimientoSinEnvasar || granel.find(g => g.vencimientoTentativo)?.fechaVencimiento || null,
            kgSinEnvasarHoy: num(log?.kgSinEnvasar),
        },
        envasados, despachos: desp, ventas: vent, libro: libroL, clientes, calle, retiros,
        ubicaciones: Object.entries(libroL.saldos).filter(([, n]) => n > 0.0005).map(([u, n]) => ({ ubicacion: UBICACION[u], clave: u, cantidad: n })),
        avisos: [],
    };
    if (!log) t.avisos.push('No se encontró la producción de este lote en Kroma: solo se muestra lo que pasó con el producto.');
    if (!libroL.hayLibro) t.avisos.push('Este lote no aparece en el inventario valorado (empezó el 5-oct): los saldos de hoy no se pueden dar.');
    const facturadas = libroL.facturas.length;
    const salioSinCliente = libroL.pickings.filter(k => !k.declarado || /ventas ya realizadas/i.test(k.nota || '')).reduce((s, k) => s + k.cantidad, 0);
    if (salioSinCliente > 0 && facturadas === 0) t.avisos.push(`Salieron de Frimaca ${salioSinCliente} ud antes de que las facturas se asignaran a un lote (16-oct): sus clientes no se pueden saber con certeza.`);
    if (libroL.facturas.length) t.avisos.push('Los clientes salen de las facturas de Zoho, asignadas al lote que vencía primero en Caracas el día de la factura: es lo más probable, no una certeza. Lo visto en anaquel sí es seguro.');
    t.tiempo = lineaDeTiempo(t);
    return t;
}

module.exports = {
    resolverConsulta, lotesDeConsulta, trazarLote, filasParametros, enLaCalle, libroDelLote, envasadosDeLog,
    diaDe, aMs, diasEntre, UBICACION,
};
