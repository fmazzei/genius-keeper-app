// RUTA: src/utils/anaquelConstantes.js
//
// UMBRALES DEL MAPA DE CALOR DEL ANAQUEL (versión 2) — archivo ÚNICO.
//
// Todo número que decide si un dato cuenta, si una celda se pinta o qué
// veredicto lleva una tabla vive aquí, no disperso en el código. Cambiar un
// umbral = cambiar este archivo.
//
// Lo que NO está aquí a propósito:
//  · Los días para considerar un lote "por vencer": salen de `DIAS_POR_VENCER`
//    en `src/utils/retiros.js`, el MISMO número que usa el módulo Devoluciones.
//    La alerta de vencimiento de la cobertura (M5) usa ese umbral (decisión del
//    dueño), para que la app no tenga dos definiciones de "por vencer".

import { DIAS_POR_VENCER } from './retiros.js';

// ── Tramos (tiempo entre dos visitas seguidas al mismo PDV) ──────────────────
export const MIN_DIAS_TRAMO = 5;        // menos: se une con el siguiente (si nada cambió) o se descarta
export const MAX_DIAS_TRAMO = 21;       // más: "tramo largo", fuera de las métricas

// ── Ventanas ────────────────────────────────────────────────────────────────
export const VENTANA_INDICE_DIAS = 90;  // índice del PDV (M3) y capa B del mapa
export const VENTANA_EFECTO_DIAS = 90;  // tabla de efecto y mapa de calor
export const VENTANA_MERMA_DIAS = 90;   // merma por vencimiento y deterioro (= vida útil)
export const PERIODOS_DIAS = [30, 60, 90];
export const PERIODO_DEFECTO_DIAS = 30;

// ── Índice del PDV (M3) ─────────────────────────────────────────────────────
export const MIN_TRAMOS_INDICE = 3;     // tramos válidos del PDV en la ventana para tener índice

// ── Mapa de calor ───────────────────────────────────────────────────────────
export const MIN_PDV_CELDA = 3;         // menos: celda gris, sin cifra, "pocos datos"
export const MIN_CELDAS_CAPA_B = 2;     // celdas distintas en las que estuvo un PDV para entrar a la capa B

// ── Tabla de efecto (M7) ────────────────────────────────────────────────────
export const MIN_TRAMOS_LADO = 2;       // tramos válidos antes y después del cambio
export const MIN_PDV_INDICIO = 5;
export const MIN_PDV_CONFIRMADO = 8;
export const PCT_MISMA_DIRECCION_INDICIO = 70;
export const PCT_MISMA_DIRECCION_CONFIRMADO = 75;
export const REVERSION_DIAS = 14;       // un cambio que vuelve atrás en menos de esto = posible error de registro
export const BOOTSTRAP_N = 2000;
export const SEMILLA_BOOTSTRAP = 20261007;  // fija: el intervalo sale igual cada vez

// ── Semáforo por PDV ────────────────────────────────────────────────────────
export const UMBRAL_CAIDA = 0.70;       // rotación del periodo < 70 % de la del periodo anterior
export const UMBRAL_QUIEBRE = 0.20;     // ≥ 20 % de las visitas encontraron el anaquel vacío
export const CUARTIL_DESTACA = 0.75;    // cuartil superior de rotación
// Merma por vencimiento y deterioro: se calculan y se muestran, SIN umbral de
// alerta todavía (decisión del dueño: se fija con los datos reales).
export const UMBRAL_MERMA_VENCIMIENTO = null;
export const UMBRAL_DETERIORO = null;

// ── Cobertura y vencimiento (M5) ────────────────────────────────────────────
export const VIDA_UTIL_DIAS = 90;
export const UMBRAL_VIDA_RESTANTE_DIAS = DIAS_POR_VENCER;   // ver nota arriba
export const UMBRAL_COBERTURA_ORIENTATIVA_DIAS = 60;

// ── Calidad de datos ────────────────────────────────────────────────────────
export const MIN_VISITAS_PERIODO = 2;   // menos: "PDV con pocas visitas"
export const FACTOR_ATIPICO = 3;        // la rotación cambia más de 3 veces entre tramos seguidos
export const MIN_ROT_ATIPICO = 0.05;    // por debajo, la razón entre tramos no significa nada
// Fecha desde la que existe el registro de traslados (Fase 2). Mientras sea null,
// NO se reporta "retiro Por vencer sin destino confirmado": antes de la función
// ningún traslado estaba registrado y la lista saldría llena de falsos avisos.
export const FECHA_INICIO_TRASLADOS = null;   // 'AAAA-MM-DD'
