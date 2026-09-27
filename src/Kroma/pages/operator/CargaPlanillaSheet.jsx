// RUTA: src/Kroma/pages/operator/CargaPlanillaSheet.jsx
//
// CARGAR UNA PLANILLA DE PAPEL.
//
// El dueño lleva la producción en una planilla impresa (LACTEOCA C.A · RECEPCIÓN
// DE LECHE / PROCESO) y quiere convertir ese archivo —unas 32 hojas— en datos de
// Kroma. La planilla se sigue llevando en papel como respaldo.
//
// POR QUÉ NO SIRVE EL FLUJO NORMAL. La planilla es un RESUMEN de todo el
// proceso en una hoja; el módulo de Producción es un asistente EN TIEMPO REAL
// que obliga a recorrer bloque por bloque (pasteurización, cuajado, corte,
// moldeado, prensado, salado, maduración, empaque) pidiendo en cada uno datos
// que el papel nunca capturó. Pasar 32 planillas por ahí sería insoportable y,
// peor, obligaría a INVENTAR datos para poder avanzar. Por eso esto escribe la
// producción directo, con lo que el papel sí tiene.
//
// LO QUE NO HACE, Y ES LO MÁS IMPORTANTE:
//   · NO descuenta inventario. Esos 177 de cuajo se consumieron en julio; el
//     stock de hoy no los tiene. Descontarlos destruiría el inventario real y
//     llenaría la pantalla de avisos de faltante.
//   · NO mete a cava lo que ya se vendió. Solo entra al almacén lo que el
//     papel declara que SIGUE ahí: los kg sin envasar y las filas de empaque
//     marcadas "En cava hoy" (con su envasado y vencimiento). Ver ptPlanilla.js.
// Los insumos se guardan DECLARADOS, como dato histórico del lote, no como
// movimiento de almacén.
//
// Detalles que el papel impone y hubo que respetar:
//   · Una planilla puede traer VARIOS productores (la del 22-07 trae Guanare
//     591,37 + Masparrito 292,5 = 883,87 L). En Kroma eso son dos recepciones
//     que alimentan una sola producción.
//   · Los campos en blanco son lo NORMAL, no un error: la planilla del 12-09 no
//     trae ni un parámetro de leche. Nada acá es obligatorio salvo fecha,
//     producto, litros y kilos.
//   · Las recepciones se crean con `status: 'completada'` — esa leche se
//     procesó hace meses. Crearlas como pendientes las mostraría como leche
//     disponible en el tanque, que es exactamente la "leche fantasma" que se
//     acaba de corregir.

import React, { useState, useMemo, useEffect } from 'react';
import { collection, doc, writeBatch, serverTimestamp, deleteField, getDocs, query, where } from 'firebase/firestore';
import { db } from '@/Firebase/config.js';
import { X, Plus, Trash2, Loader, AlertCircle, FileText } from 'lucide-react';
import { sinUndefined } from '@/Kroma/sinUndefined.js';
import CampoFecha, { hoyInput, fechaDesdeInput, sumarDiasInput, DIAS_VENCIMIENTO_ENVASADO } from '@/Kroma/Components/CampoFecha.jsx';
import { partidasDePlanilla, ptReemplazable } from '@/Kroma/ptPlanilla.js';
import { redondear, fmtNum } from '@/Kroma/formato.js';
import { formularioDesdeLog, nombrePresentacion, pesoPresentacion, kgPorUnidadDeSku } from '@/Kroma/planillaForm.js';

const MERMA_SUGERIDA = 10;   // lo que traen las planillas revisadas

const Lbl = ({ children }) => (
    <p className="text-slate-500 text-[10px] font-bold uppercase tracking-widest mb-1.5">{children}</p>
);

const Inp = (props) => (
    <input
        {...props}
        className={`w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2.5 text-white text-sm
            placeholder-slate-600 focus:outline-none focus:border-emerald-500 ${props.className || ''}`}
    />
);

const num = (v) => {
    // El papel usa coma decimal ("591,37"); el teclado del teléfono da punto.
    const n = parseFloat(String(v ?? '').replace(',', '.'));
    return Number.isFinite(n) ? n : 0;
};

// En esta pantalla los campos en blanco son lo NORMAL (la planilla del 12-09 no
// trae ni un parámetro de leche), y Firestore rechaza `undefined`: cada opcional
// sin llenar tumbaba el guardado entero. Se limpia el documento antes de
// escribir — red de seguridad para TODO el formulario, no solo para los campos
// que hoy fallan. Ver `src/Kroma/sinUndefined.js`.

/** Lote con la fecha REAL de la producción, no la de hoy. */
function loteHistorico(productoNombre, fecha) {
    const p = (n) => String(n).padStart(2, '0');
    const iniciales = (productoNombre || '')
        .split(/\s+/).filter(Boolean).map(w => w[0].toUpperCase()).join('').slice(0, 4);
    return `${iniciales}${fecha.getFullYear()}${p(fecha.getMonth() + 1)}${p(fecha.getDate())}-H`;
}

export default function CargaPlanillaSheet({ fichas = [], suppliers = [], productsMap = {}, verCostos = false, kromaUser, logEditar = null, onClose, onSaved }) {
    // Corregir una planilla es REABRIRLA con todo lo que ya tenía, no volver a
    // teclearla. Con `logEditar` el formulario arranca precargado y el guardado
    // escribe sobre ese mismo registro en vez de crear otro.
    const ini = logEditar ? formularioDesdeLog(logEditar) : null;
    const editando = !!ini;

    const [fecha, setFecha]       = useState(ini?.fecha || hoyInput());
    const [fichaId, setFichaId]   = useState(ini?.fichaId || '');
    const [entregas, setEntregas] = useState(ini?.entregas || [
        { proveedorId: '', litros: '', temperatura: '', pH: '', densidad: '' },
    ]);
    const [litrosProceso, setLitrosProceso] = useState(ini?.litrosProceso || '');
    const [insumos, setInsumos] = useState(ini?.insumos || { conservante: '', fermento: '', calcio: '', cuajo: '', sal: '' });
    const [curvaPh, setCurvaPh]     = useState(ini?.curvaPh   || { inicial: '', h24: '', h72: '' });
    const [curvaTemp, setCurvaTemp] = useState(ini?.curvaTemp || { inicial: '', h24: '', h72: '' });
    const [kilos, setKilos]   = useState(ini?.kilos || '');
    const [empaques, setEmpaques] = useState(ini?.empaques || []);   // lo que se envasó, declarado
    // Queso que se guardó SIN envasar (se envasa después). `null` = no declarado.
    const [sinEnvasar, setSinEnvasar] = useState(ini?.sinEnvasar ?? null);
    const [precioLeche, setPrecioLeche] = useState(ini?.precioLeche || '');  // $/L, opcional
    const [notas, setNotas]   = useState(ini?.notas || '');

    const [guardando, setGuardando] = useState(false);
    // Al corregir: lo que esta planilla ya tiene en cava. `null` = cargando.
    const [ptExistente, setPtExistente] = useState(editando ? null : []);
    useEffect(() => {
        if (!editando) return;
        let vivo = true;
        getDocs(query(collection(db, 'kroma_inventory_pt'),
            where('empresaId', '==', kromaUser?.empresaId || 'lacteoca'),
            where('logId', '==', logEditar.id)))
            .then(snap => {
                if (!vivo) return;
                setPtExistente(snap.docs.map(d => ({ id: d.id, ...d.data() })).filter(i => i.active !== false));
            })
            .catch(() => { if (vivo) setPtExistente([]); });
        return () => { vivo = false; };
    }, []);   // eslint-disable-line react-hooks/exhaustive-deps
    // Si lo que está en cava ya se tocó (despacho, envasado, ajuste), corregir
    // la planilla NO lo recrea: devolvería a cava producto que ya salió.
    const ptBloqueado = editando && ptExistente !== null && ptExistente.length > 0
        && (!ptReemplazable(ptExistente) || !!logEditar?.fechaFinalizacionEmpaque);
    const [error, setError]         = useState('');

    // `redondear` en la SUMA, no solo al mostrar: sumar 591,37 + 153,73 en coma
    // flotante da 745.0999999999999, y ese número se guardaba tal cual.
    const totalRecibido = useMemo(
        () => redondear(entregas.reduce((s, e) => s + num(e.litros), 0)), [entregas]);

    // El papel escribe los litros a proceso; la merma es la diferencia. Se
    // sugiere el total − 10 L porque es lo que traen las planillas, pero manda
    // lo que el operario haya anotado.
    const litrosProcesoNum = litrosProceso === '' && totalRecibido > 0
        ? Math.max(0, +(totalRecibido - MERMA_SUGERIDA).toFixed(2))
        : num(litrosProceso);
    const merma      = +(totalRecibido - litrosProcesoNum).toFixed(2);
    const kilosNum   = num(kilos);
    const rendimiento = kilosNum > 0 && litrosProcesoNum > 0
        ? +(litrosProcesoNum / kilosNum).toFixed(2) : null;

    const ficha = fichas.find(f => f.id === fichaId);
    // Presentaciones del producto de esa ficha, para no tener que escribirlas.
    const skus = (productsMap[ficha?.productoId]?.presentaciones || []);
    const kgEnvasados = redondear(
        empaques.reduce((s, e) => s + num(e.kgPorUnidad) * num(e.unidades), 0), 3);
    const kgSinEnvasarNum = sinEnvasar === null ? 0 : redondear(num(sinEnvasar), 3);
    const kgDeclarados = redondear(kgEnvasados + kgSinEnvasarNum, 3);
    const precioLecheNum = num(precioLeche);
    // Costo del lote por kg: leche declarada ÷ kilos. Los insumos los pone
    // gerencia desde la ficha (dosis teórica × precio del Maestro), por eso acá
    // solo se pide lo que el papel puede aportar: el precio de esa leche.
    const costoLecheHist = precioLecheNum > 0 ? redondear(precioLecheNum * totalRecibido) : null;
    const costoPorKgHist = costoLecheHist && kilosNum > 0
        ? redondear(costoLecheHist / kilosNum) : null;

    const agregarSku = (sku) => {
        setEmpaques(prev => [...prev, {
            catalogId: sku.id, nombre: nombrePresentacion(sku),
            kgPorUnidad: String(kgPorUnidadDeSku(sku)), unidades: '',
            enCava: false, fechaEnvasado: '', fechaVencimiento: '',
        }]);
    };
    const setEmpaque = (i, campo, valor) =>
        setEmpaques(prev => prev.map((e, j) => j === i ? { ...e, [campo]: valor } : e));
    // "En cava hoy": se envasó hace poco y sigue en el almacén. El vencimiento
    // se sugiere a 60 días del ENVASADO (decisión del dueño), y se recalcula si
    // cambia la fecha de envasado; se puede mover a mano.
    const toggleEnCava = (i) => setEmpaques(prev => prev.map((e, j) => {
        if (j !== i) return e;
        if (e.enCava) return { ...e, enCava: false };
        const env = e.fechaEnvasado || hoyInput();
        return { ...e, enCava: true, fechaEnvasado: env,
            fechaVencimiento: e.fechaVencimiento || sumarDiasInput(env, DIAS_VENCIMIENTO_ENVASADO) };
    }));
    const setEnvasado = (i, valor) => setEmpaques(prev => prev.map((e, j) => j === i
        ? { ...e, fechaEnvasado: valor, fechaVencimiento: sumarDiasInput(valor, DIAS_VENCIMIENTO_ENVASADO) || e.fechaVencimiento }
        : e));

    const puedeGuardar = fecha && ficha && totalRecibido > 0 && kilosNum > 0 && !guardando && ptExistente !== null;

    const setEntrega = (i, campo, valor) =>
        setEntregas(prev => prev.map((e, j) => j === i ? { ...e, [campo]: valor } : e));

    async function guardar() {
        if (!puedeGuardar) return;
        setGuardando(true); setError('');
        try {
            // Partes locales: `new Date('2026-07-22')` se lee como UTC y en
            // Venezuela retrocede un día.
            const fechaDate = fechaDesdeInput(fecha);
            if (!fechaDate) throw new Error('La fecha de la planilla no es válida.');
            const empresaId = kromaUser?.empresaId || 'lacteoca';
            const base = {
                empresaId,
                cargadaEnDiferido: true,
                origen: 'planilla_papel',
                operarioId:     kromaUser?.id || '',
                operarioNombre: kromaUser?.name || '',
            };

            // TODO en UN SOLO BATCH: o entra la planilla completa, o no entra
            // nada. Antes las recepciones se escribían de a una ANTES del log de
            // producción; si el log fallaba —y falló, por el `undefined` que
            // rechazaba Firestore— las recepciones ya creadas se quedaban. Cada
            // reintento del mismo papel volvía a crearlas: así aparecieron seis
            // recepciones de leche para una sola planilla de dos productores.
            const batch = writeBatch(db);
            // Al CORREGIR se escribe sobre el mismo registro: mismo id, así
            // todo lo que apunta a él (la pista del lote, el historial) sigue
            // encontrándolo.
            const logRef = editando
                ? doc(db, 'kroma_production_logs', logEditar.id)
                : doc(collection(db, 'kroma_production_logs'));

            // Las recepciones que tenía se dan de baja y se escriben las nuevas,
            // en el MISMO batch. Editarlas una por una exigiría emparejar cuál
            // productor era cuál, y la corrección puede justo cambiar eso
            // (agregar un productor, quitar otro, corregir los litros).
            if (editando) {
                (logEditar.recepcionIds || []).forEach(rid => {
                    batch.update(doc(db, 'kroma_milk_reception', rid), {
                        active: false,
                        deletedAt: serverTimestamp(),
                        deletedMotivo: 'Reemplazada al corregir la planilla.',
                    });
                });
            }

            // 1) Las recepciones de leche, ya PROCESADAS.
            const recepciones = [];
            for (const e of entregas) {
                const litros = num(e.litros);
                if (litros <= 0) continue;
                const prov = suppliers.find(s => s.id === e.proveedorId);
                const parametros = {};
                if (e.temperatura !== '') parametros.temperatura = num(e.temperatura);
                if (e.pH !== '')          parametros.pH          = num(e.pH);
                if (e.densidad !== '')    parametros.densidad    = num(e.densidad);

                const rec = {
                    ...base,
                    proveedorId:     e.proveedorId || '',
                    proveedorNombre: prov?.nombreComercial || prov?.nombre || 'Sin productor',
                    litros,
                    fecha: fechaDate,
                    ...(precioLecheNum > 0 && { costoUsdLitro: precioLecheNum }),
                    parametros,
                    enrutamiento: 'tanque',
                    status: 'completada',   // NO es leche disponible: ya se procesó
                    active: true,
                    createdAt: serverTimestamp(),
                };
                const ref = doc(collection(db, 'kroma_milk_reception'));
                // La recepción apunta a SU producción. Sin esto no hay forma de
                // distinguir una recepción buena de una que quedó suelta.
                batch.set(ref, sinUndefined({ ...rec, logId: logRef.id }));
                recepciones.push(sinUndefined({
                    recepcionId:     ref.id,
                    proveedorId:     rec.proveedorId,
                    proveedorNombre: rec.proveedorNombre,
                    litros,
                    rutaLeche:       'tanque',
                    // El $/L declarado viaja EN la recepción porque es ahí donde
                    // el costeo de gerencia lo busca (`recepciones[].costoUsdLitro`);
                    // si no se declara, cae al precio del Maestro de Materiales.
                    ...(precioLecheNum > 0 && { costoUsdLitro: precioLecheNum }),
                    // `parametros` solo trae lo que el papel anotó, así que estos
                    // tres pueden no existir — se van con el resto de vacíos.
                    temperatura:     parametros.temperatura,
                    densidad:        parametros.densidad,
                    pH:              parametros.pH,
                }));
            }

            // 2) La producción, ya cerrada.
            const insumosDeclarados = Object.fromEntries(
                Object.entries(insumos).filter(([, v]) => String(v).trim() !== ''));
            const curva = {};
            const limpia = (o) => Object.fromEntries(
                Object.entries(o).filter(([, v]) => String(v).trim() !== '').map(([k, v]) => [k, num(v)]));
            const ph = limpia(curvaPh); const tp = limpia(curvaTemp);
            if (Object.keys(ph).length) curva.pH = ph;
            if (Object.keys(tp).length) curva.temperatura = tp;

            // Todo lo que se envasó (vendido o en cava): kg envasados y costo de empaque.
            const productosFinalesPlanilla = empaques
                .filter(e => num(e.unidades) > 0 && num(e.kgPorUnidad) > 0)
                .map(e => ({
                    catalogId:     e.catalogId || null,
                    nombre:        e.nombre || 'Presentación',
                    pesoPorUnidad: redondear(num(e.kgPorUnidad), 3),
                    unidades:      Math.round(num(e.unidades)),
                    ...(e.enCava && {
                        enCava: true,
                        fechaEnvasado:    e.fechaEnvasado || null,
                        fechaVencimiento: e.fechaVencimiento || null,
                    }),
                }));

            const datosLog = sinUndefined({
                ...base,
                fichaId:        ficha.id,
                productoId:     ficha.productoId,
                productoNombre: ficha.productoNombre,
                lote:           loteHistorico(ficha.productoNombre, fechaDate),
                litrosIngresados: totalRecibido,
                litrosNetos:      litrosProcesoNum,
                merma,
                recepciones,
                recepcionIds:     recepciones.map(r => r.recepcionId),
                proveedorId:      recepciones[0]?.proveedorId || '',
                proveedorNombre:  [...new Set(recepciones.map(r => r.proveedorNombre))].join(', '),
                rutaLeche:        'tanque',
                parametrosLeche:  recepciones[0] ? {
                    temperatura: recepciones[0].temperatura,
                    pH:          recepciones[0].pH,
                    densidad:    recepciones[0].densidad,
                } : {},
                insumosDeclarados,     // tal como los anotó el papel, SIN descontar stock
                curvaMaduracion: curva,
                // ⚠️ Los nombres son los que usa TODA la app, no unos propios.
                // `totalKgProducido` son los KILOS y `rendimientoKg` es la razón
                // L/kg — al cargarlos con nombres cambiados, una planilla entraba
                // sin kilos para el resto del sistema: no salía el rendimiento,
                // ni el costo por kg, ni contaba en los promedios de la planta.
                totalKgProducido: kilosNum,
                rendimientoKg:    rendimiento,   // null si falta un dato, nunca undefined
                notas: notas.trim(),
                estado: 'completada',
                // Queso guardado sin envasar = trabajo PENDIENTE de verdad: entra
                // a cava y la producción queda "falta empacar" hasta que se
                // envase desde Producción → Pendiente de empacar. Sin eso, la
                // planilla queda cerrada (si quedara abierta, las 32 planillas
                // aparecerían como pendientes en el inicio del operario).
                ...(ptBloqueado
                    // Lo que hay en cava ya se tocó: el estado de empaque lo
                    // manda la operación real, no la planilla.
                    ? {}
                    : kgSinEnvasarNum > 0
                        ? { kgSinEnvasar: kgSinEnvasarNum, disposicion: productosFinalesPlanilla.length > 0 ? 'mixto' : 'guardar_todo', empaqueFinalizado: false }
                        : { kgSinEnvasar: 0, disposicion: 'historico', empaqueFinalizado: true }),
                // La ficha SÍ se guarda: es lo que le permite a gerencia costear
                // el lote (insumos teóricos por litro × litros). `bloquesData`
                // queda vacío porque el papel no trae la corrida bloque a bloque.
                bloquesSnapshot: ficha.bloques || [],
                bloquesData: {},
                // El empaque declarado. NO entra a cava —ese queso ya salió—
                // pero sin él no hay kg envasados ni costo de empaque del lote.
                productosFinales: productosFinalesPlanilla,
                fechaInicio: fechaDate,
                fechaCierre: fechaDate,
                active: true,
                createdAt: serverTimestamp(),
            });

            if (editando) {
                const { createdAt, ...resto } = datosLog;   // la fecha de alta no cambia
                batch.update(logRef, {
                    ...resto,
                    // Huella del esquema viejo: si quedara, `kgProducidos` la
                    // seguiría prefiriendo y la corrección de los kilos no se vería.
                    rendimientoLitrosPorKg: deleteField(),
                    corregidoPorId:     kromaUser?.id || null,
                    corregidoPorNombre: kromaUser?.name || null,
                    corregidoAt:        serverTimestamp(),
                });
            } else {
                batch.set(logRef, datosLog);
            }

            // 3) Lo que SIGUE en cava: los kg sin envasar y las filas "En cava
            // hoy". En el mismo batch, con su entrada en el libro de
            // movimientos (un almacén no gana existencias sin un evento que lo
            // explique). Sin `warehouseId` el Almacén lo ubica en la Cava.
            if (!ptBloqueado) {
                const lote = datosLog.lote;
                const actor = { creadoPorId: kromaUser?.id || null, creadoPorNombre: kromaUser?.name || null };
                const mov = (extra) => batch.set(doc(collection(db, 'kroma_warehouse_movements')), sinUndefined({
                    empresaId, productoNombre: ficha.productoNombre, lote, logId: logRef.id,
                    origenId: null, destinoId: null, ...actor, createdAt: serverTimestamp(), ...extra,
                }));
                // Al corregir: lo que la planilla había puesto (intacto) se
                // reemplaza por lo que dice el formulario ahora.
                for (const it of (ptExistente || [])) {
                    batch.update(doc(db, 'kroma_inventory_pt', it.id), {
                        active: false, deletedAt: serverTimestamp(),
                        deletedMotivo: 'Reemplazada al corregir la planilla.',
                    });
                    mov({
                        tipo: 'correccion_planilla', origenNombre: 'Cava', destinoNombre: 'Corrección de planilla',
                        presentacion: it.tipo === 'sin_envasar' ? 'Sin envasar' : it.presentacion,
                        fechaVencimiento: it.fechaVencimiento || null,
                        cantidad: -(it.tipo === 'sin_envasar' ? it.kgTotales : it.unidades),
                        unidad: it.tipo === 'sin_envasar' ? 'kg' : 'unidades',
                    });
                }
                // SIN costo congelado a propósito: con solo la leche del papel
                // quedaba subvaluado (sin insumos ni empaque). Sin costo, gerencia
                // lo costea con el cálculo completo del lote (leche + insumos de
                // la ficha + empaque), el mismo de cualquier otro lote.
                for (const pt of partidasDePlanilla({ empaques, kgSinEnvasar: kgSinEnvasarNum })) {
                    batch.set(doc(collection(db, 'kroma_inventory_pt')), sinUndefined({
                        empresaId,
                        productoId: ficha.productoId, productoNombre: ficha.productoNombre,
                        fichaId: ficha.id, logId: logRef.id,
                        lote, loteLabel: `${lote} — ${ficha.productoNombre}`,
                        operarioId: kromaUser?.id || '', operarioNombre: kromaUser?.name || '',
                        origen: 'planilla_papel',
                        ...pt,
                        active: true,
                        createdAt: serverTimestamp(),
                    }));
                    mov({
                        tipo: 'entrada_produccion', origenNombre: 'Producción (planilla)', destinoNombre: 'Cava',
                        presentacion: pt.tipo === 'sin_envasar' ? 'Sin envasar' : pt.presentacion,
                        fechaVencimiento: pt.fechaVencimiento || null,
                        cantidad: pt.tipo === 'sin_envasar' ? pt.kgTotales : pt.unidades,
                        unidad: pt.tipo === 'sin_envasar' ? 'kg' : 'unidades',
                    });
                }
            }

            // La única escritura de toda la operación.
            await batch.commit();
            onSaved?.();
        } catch (e) {
            console.error(e);
            setError(e.message || 'No se pudo guardar la planilla.');
            setGuardando(false);
        }
    }

    return (
        <div className="fixed inset-0 bg-slate-950 z-50 flex flex-col">
            <div className="flex items-center gap-3 px-5 py-3 bg-slate-900 border-b border-slate-800 shrink-0">
                <FileText size={17} className="text-emerald-400 shrink-0" />
                <div className="flex-1 min-w-0">
                    <p className="text-white font-bold text-sm">{editando ? 'Corregir planilla' : 'Cargar planilla anterior'}</p>
                    <p className="text-slate-500 text-xs">Una producción que ya ocurrió</p>
                </div>
                <button onClick={onClose} className="text-slate-400 hover:text-white p-1"><X size={20} /></button>
            </div>

            <div className="flex-1 overflow-y-auto px-5 py-5 space-y-6">
                <div className="bg-slate-900 border border-slate-800 rounded-xl p-3">
                    <p className="text-slate-400 text-xs leading-snug">
                        No mueve el inventario ni crea producto terminado: esos insumos ya se
                        consumieron y ese queso ya salió. Se guarda como histórico del lote.
                    </p>
                </div>

                {error && (
                    <div className="bg-rose-500/10 border border-rose-500/40 rounded-xl p-3 flex items-start gap-2">
                        <AlertCircle size={15} className="text-rose-400 shrink-0 mt-0.5" />
                        <p className="text-rose-200 text-xs">{error}</p>
                    </div>
                )}

                {/* ── Recepción de leche ── */}
                <section>
                    <p className="text-emerald-400 text-xs font-bold uppercase tracking-widest mb-3">Recepción de leche</p>

                    {/* Cada uno en su propia fila: el control nativo de fecha no
                        se encoge, y en media columna desbordaba la tarjeta. */}
                    <div className="space-y-3 mb-4">
                        <CampoFecha
                            label="Fecha de la planilla" value={fecha} onChange={setFecha}
                            acento="emerald" max={hoyInput()}
                        />
                        <div>
                            <Lbl>Producto</Lbl>
                            <select value={fichaId} onChange={e => setFichaId(e.target.value)}
                                className="block w-full min-w-0 min-h-[44px] bg-slate-800 border border-slate-700 rounded-xl px-3 py-2.5 text-white text-sm focus:outline-none focus:border-emerald-500">
                                <option value="">Seleccionar…</option>
                                {fichas.map(f => <option key={f.id} value={f.id}>{f.productoNombre}</option>)}
                            </select>
                        </div>
                    </div>

                    {entregas.map((e, i) => (
                        <div key={i} className="bg-slate-900 border border-slate-800 rounded-xl p-3 mb-2.5">
                            <div className="flex items-center gap-2 mb-2.5">
                                <span className="text-slate-500 text-xs font-semibold flex-1">Productor {i + 1}</span>
                                {entregas.length > 1 && (
                                    <button onClick={() => setEntregas(prev => prev.filter((_, j) => j !== i))}
                                        className="text-slate-600 hover:text-rose-400 p-1"><Trash2 size={13} /></button>
                                )}
                            </div>
                            <div className="grid grid-cols-2 gap-2.5 mb-2.5">
                                <select value={e.proveedorId} onChange={ev => setEntrega(i, 'proveedorId', ev.target.value)}
                                    className="bg-slate-800 border border-slate-700 rounded-xl px-3 py-2.5 text-white text-sm focus:outline-none focus:border-emerald-500">
                                    <option value="">Productor…</option>
                                    {suppliers.map(s => (
                                        <option key={s.id} value={s.id}>{s.nombreComercial || s.nombre}</option>
                                    ))}
                                </select>
                                <Inp inputMode="decimal" placeholder="Litros" value={e.litros}
                                    onChange={ev => setEntrega(i, 'litros', ev.target.value)} />
                            </div>
                            <div className="grid grid-cols-3 gap-2.5">
                                <Inp inputMode="decimal" placeholder="Temp." value={e.temperatura}
                                    onChange={ev => setEntrega(i, 'temperatura', ev.target.value)} />
                                <Inp inputMode="decimal" placeholder="pH" value={e.pH}
                                    onChange={ev => setEntrega(i, 'pH', ev.target.value)} />
                                <Inp inputMode="decimal" placeholder="Densidad" value={e.densidad}
                                    onChange={ev => setEntrega(i, 'densidad', ev.target.value)} />
                            </div>
                        </div>
                    ))}

                    <button
                        onClick={() => setEntregas(prev => [...prev, { proveedorId: '', litros: '', temperatura: '', pH: '', densidad: '' }])}
                        className="w-full flex items-center justify-center gap-1.5 border border-dashed border-slate-700 hover:border-emerald-500/50 text-slate-500 hover:text-emerald-400 rounded-xl py-2.5 text-xs font-semibold transition-colors">
                        <Plus size={13} /> Otro productor
                    </button>

                    {totalRecibido > 0 && (
                        <p className="text-slate-400 text-xs mt-2.5 text-right font-mono">
                            Total recibido: <span className="text-white font-bold">{fmtNum(totalRecibido)} L</span>
                        </p>
                    )}
                </section>

                {/* ── Proceso ── */}
                <section>
                    <p className="text-emerald-400 text-xs font-bold uppercase tracking-widest mb-3">Proceso</p>

                    <div className="grid grid-cols-2 gap-3 mb-4">
                        <div>
                            <Lbl>Litros a proceso</Lbl>
                            <Inp inputMode="decimal"
                                placeholder={totalRecibido > 0 ? fmtNum(totalRecibido - MERMA_SUGERIDA) : '—'}
                                value={litrosProceso} onChange={e => setLitrosProceso(e.target.value)} />
                        </div>
                        <div>
                            <Lbl>Merma</Lbl>
                            <div className="bg-slate-900 border border-slate-800 rounded-xl px-3 py-2.5">
                                <span className={`text-sm font-mono ${merma < 0 ? 'text-rose-400' : 'text-slate-300'}`}>
                                    {totalRecibido > 0 ? `${fmtNum(merma)} L` : '—'}
                                </span>
                            </div>
                        </div>
                    </div>

                    <Lbl>Insumos, como los anotó el papel</Lbl>
                    <div className="grid grid-cols-2 gap-2.5 mb-4">
                        {[
                            ['conservante', 'Conservante'], ['fermento', 'Fermento'],
                            ['calcio', 'Calcio'], ['cuajo', 'Cuajo'], ['sal', 'Sal'],
                        ].map(([k, label]) => (
                            <Inp key={k} placeholder={label} value={insumos[k]}
                                onChange={e => setInsumos(p => ({ ...p, [k]: e.target.value }))} />
                        ))}
                    </div>

                    {/* La curva casi nunca está completa en el papel; se deja opcional. */}
                    <Lbl>pH y temperatura (si la planilla los trae)</Lbl>
                    <div className="space-y-2 mb-4">
                        {[['pH', curvaPh, setCurvaPh], ['T°', curvaTemp, setCurvaTemp]].map(([label, val, set]) => (
                            <div key={label} className="flex items-center gap-2">
                                <span className="text-slate-500 text-xs w-7 shrink-0">{label}</span>
                                {['inicial', 'h24', 'h72'].map(k => (
                                    <Inp key={k} inputMode="decimal"
                                        placeholder={k === 'inicial' ? 'Inicial' : k === 'h24' ? '24 h' : '72 h'}
                                        value={val[k]} onChange={e => set(p => ({ ...p, [k]: e.target.value }))} />
                                ))}
                            </div>
                        ))}
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <Lbl>Kilos producidos</Lbl>
                            <Inp inputMode="decimal" placeholder="154.335" value={kilos}
                                onChange={e => setKilos(e.target.value)} />
                        </div>
                        <div>
                            <Lbl>Promedio L/kg</Lbl>
                            <div className="bg-slate-900 border border-slate-800 rounded-xl px-3 py-2.5">
                                <span className="text-sm font-mono text-emerald-400">
                                    {rendimiento ?? '—'}
                                </span>
                            </div>
                        </div>
                    </div>

                    <div className="mt-3">
                        <Lbl>Observaciones</Lbl>
                        <textarea value={notas} onChange={e => setNotas(e.target.value)} rows={2}
                            className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2.5 text-white text-sm placeholder-slate-600 focus:outline-none focus:border-emerald-500"
                            placeholder="Lo que diga la planilla" />
                    </div>
                </section>

                {/* ── Empaque ──
                    Lo envasado sirve para el rendimiento y el costo por kg. Solo
                    entra a cava lo que SIGUE ahí: las filas "En cava hoy" y los
                    kg sin envasar (ver ptPlanilla.js). */}
                <section>
                    <p className="text-emerald-400 text-xs font-bold uppercase tracking-widest mb-1">Empaque</p>
                    <p className="text-slate-500 text-xs leading-snug mb-3">
                        Lo que se envasó de este lote. Si esas unidades <strong className="text-slate-400">siguen
                        en la cava</strong>, márcalas "En cava hoy" y entran al almacén con su vencimiento.
                        Lo que ya se vendió queda solo como dato del lote.
                    </p>

                    {ptBloqueado && (
                        <div className="flex items-start gap-2 bg-amber-900/20 border border-amber-700/40 rounded-xl px-3 py-2.5 mb-3">
                            <AlertCircle size={14} className="text-amber-400 shrink-0 mt-0.5" />
                            <p className="text-amber-200 text-xs leading-snug">
                                Lo que esta planilla puso en cava ya se movió (despacho, envasado o ajuste).
                                Esta corrección <strong>no cambia la cava</strong>: ajústala desde Almacenes.
                            </p>
                        </div>
                    )}

                    {skus.length > 0 && (
                        <div className="flex flex-wrap gap-1.5 mb-3">
                            {skus.map(sku => (
                                <button key={sku.id} type="button" onClick={() => agregarSku(sku)}
                                    className="flex items-center gap-1.5 bg-slate-800 border border-slate-700 hover:border-emerald-500/50 text-slate-300 text-xs font-semibold px-3 py-2 rounded-xl transition-colors text-left">
                                    <Plus size={11} className="shrink-0" />
                                    {/* El PESO manda: en el catálogo todas suelen llamarse
                                        igual que el producto, y sin él no se distinguen. */}
                                    {pesoPresentacion(sku) && (
                                        <span className="text-white font-bold font-mono">{pesoPresentacion(sku)}</span>
                                    )}
                                    <span className="text-slate-400 font-normal">{sku.nombre || 'Presentación'}</span>
                                </button>
                            ))}
                        </div>
                    )}

                    {/* Queso guardado sin envasar: se envasa después. Solo kg. */}
                    <div className="mb-3">
                        <button type="button"
                            onClick={() => setSinEnvasar(v => v === null ? '' : null)}
                            className={`flex items-center gap-1.5 text-xs font-semibold px-3 py-2 rounded-xl border transition-colors ${
                                sinEnvasar !== null
                                    ? 'bg-amber-500/15 border-amber-500/50 text-amber-300'
                                    : 'bg-slate-800 border-slate-700 hover:border-amber-500/50 text-slate-300'}`}>
                            {sinEnvasar !== null ? <X size={11} /> : <Plus size={11} />} Sin envasar
                        </button>
                        {sinEnvasar !== null && (
                            <div className="bg-slate-900 border border-amber-500/30 rounded-xl p-3 mt-2">
                                <p className="text-slate-500 text-xs leading-snug mb-2">
                                    Kilos que siguen en cava sin envasar. Entran al almacén y la
                                    producción queda en "Pendiente de empacar" hasta que se envasen.
                                </p>
                                <Inp inputMode="decimal" placeholder="Kg sin envasar" value={sinEnvasar}
                                    onChange={ev => setSinEnvasar(ev.target.value)} />
                            </div>
                        )}
                    </div>

                    {empaques.map((e, i) => (
                        <div key={i} className="bg-slate-900 border border-slate-800 rounded-xl p-3 mb-2.5">
                            <div className="flex items-center gap-2 mb-2.5">
                                <Inp value={e.nombre} placeholder="Presentación (ej. Bolsa 1 Kg)"
                                    onChange={ev => setEmpaque(i, 'nombre', ev.target.value)} />
                                <button onClick={() => setEmpaques(prev => prev.filter((_, j) => j !== i))}
                                    className="text-slate-600 hover:text-rose-400 p-1 shrink-0"><Trash2 size={13} /></button>
                            </div>
                            <div className="grid grid-cols-2 gap-2.5">
                                <Inp inputMode="decimal" placeholder="Kg por unidad" value={e.kgPorUnidad}
                                    onChange={ev => setEmpaque(i, 'kgPorUnidad', ev.target.value)} />
                                <Inp inputMode="numeric" placeholder="Unidades" value={e.unidades}
                                    onChange={ev => setEmpaque(i, 'unidades', ev.target.value)} />
                            </div>
                            <button type="button" onClick={() => toggleEnCava(i)}
                                className={`mt-2.5 flex items-center gap-2 text-xs font-semibold ${e.enCava ? 'text-emerald-300' : 'text-slate-500'}`}>
                                <span className={`w-4 h-4 rounded border flex items-center justify-center ${
                                    e.enCava ? 'bg-emerald-600 border-emerald-500' : 'border-slate-600'}`}>
                                    {e.enCava && <span className="text-white text-[10px] leading-none">✓</span>}
                                </span>
                                En cava hoy
                            </button>
                            {e.enCava && (
                                <div className="grid grid-cols-2 gap-2.5 mt-2.5">
                                    <CampoFecha label="Envasado" acento="emerald" value={e.fechaEnvasado || ''}
                                        onChange={v => setEnvasado(i, v)} />
                                    <CampoFecha label="Vence" acento="emerald" value={e.fechaVencimiento || ''}
                                        onChange={v => setEmpaque(i, 'fechaVencimiento', v)} />
                                    <p className="col-span-2 text-slate-500 text-[11px] leading-snug -mt-1">
                                        Vence a {DIAS_VENCIMIENTO_ENVASADO} días del envasado; puedes cambiarlo.
                                    </p>
                                </div>
                            )}
                        </div>
                    ))}

                    <button
                        onClick={() => setEmpaques(prev => [...prev, { nombre: '', kgPorUnidad: '', unidades: '', enCava: false, fechaEnvasado: '', fechaVencimiento: '' }])}
                        className="w-full flex items-center justify-center gap-1.5 border border-dashed border-slate-700 hover:border-emerald-500/50 text-slate-500 hover:text-emerald-400 rounded-xl py-2.5 text-xs font-semibold transition-colors">
                        <Plus size={13} /> Otra presentación
                    </button>

                    {kgDeclarados > 0 && (
                        <p className="text-slate-400 text-xs mt-2.5 text-right font-mono">
                            Envasado: <span className="text-white font-bold">{fmtNum(kgEnvasados, 3)} kg</span>
                            {kgSinEnvasarNum > 0 && (
                                <> · Sin envasar: <span className="text-amber-300 font-bold">{fmtNum(kgSinEnvasarNum, 3)} kg</span></>
                            )}
                            {kilosNum > 0 && kgDeclarados > kilosNum && (
                                <span className="block text-amber-400 mt-1">
                                    Más de lo producido ({fmtNum(kilosNum, 3)} kg) — revisa las cantidades.
                                </span>
                            )}
                        </p>
                    )}
                </section>

                {/* ── Costo de la leche ──
                    Regla transversal: el operario NUNCA ve costos. Acá sirve para
                    que el histórico tenga costo por kg real en vez de heredar el
                    precio de hoy del Maestro de Materiales. */}
                {verCostos && (
                    <section>
                        <p className="text-emerald-400 text-xs font-bold uppercase tracking-widest mb-1">Costo de esa leche</p>
                        <p className="text-slate-500 text-xs leading-snug mb-3">
                            Opcional. Sin este dato el lote se costea con el precio de leche
                            que hoy tiene el Maestro de Materiales, que no es el que se pagó entonces.
                        </p>
                        <div className="grid grid-cols-2 gap-3">
                            <div>
                                <Lbl>USD por litro</Lbl>
                                <Inp inputMode="decimal" placeholder="0,55" value={precioLeche}
                                    onChange={e => setPrecioLeche(e.target.value)} />
                            </div>
                            <div>
                                <Lbl>Costo por kg</Lbl>
                                <div className="bg-slate-900 border border-slate-800 rounded-xl px-3 py-2.5">
                                    <span className="text-sm font-mono text-emerald-400">
                                        {costoPorKgHist != null ? `$${fmtNum(costoPorKgHist)}` : '—'}
                                    </span>
                                </div>
                            </div>
                        </div>
                        {costoLecheHist != null && (
                            <p className="text-slate-500 text-xs mt-2">
                                Leche del lote: ${fmtNum(costoLecheHist)} · solo leche, los insumos los
                                suma gerencia desde la ficha.
                            </p>
                        )}
                    </section>
                )}
            </div>

            <div className="px-5 py-4 bg-slate-900 border-t border-slate-800 shrink-0">
                <button onClick={guardar} disabled={!puedeGuardar}
                    className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-bold py-3.5 rounded-xl text-sm transition-colors disabled:opacity-40 flex items-center justify-center gap-2">
                    {guardando ? <><Loader size={16} className="animate-spin" /> Guardando…</> : (editando ? 'Guardar corrección' : 'Guardar planilla')}
                </button>
                {!puedeGuardar && !guardando && (
                    <p className="text-slate-600 text-xs text-center mt-2">
                        Hacen falta fecha, producto, litros y kilos producidos.
                    </p>
                )}
            </div>
        </div>
    );
}
