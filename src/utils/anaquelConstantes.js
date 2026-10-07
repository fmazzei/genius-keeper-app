// RUTA: src/utils/anaquelConstantes.js
//
// UMBRALES DEL MAPA DE CALOR DEL ANAQUEL (versión 2) — archivo ÚNICO.
//
// Todo número que decide si un dato cuenta, si una celda se pinta o qué
// veredicto lleva una tabla vive aquí, no disperso en el código. Cambiar un
// umbral = cambiar este archivo.
//
// Lo que NO está aquí a propósito:
//  · `DIAS_POR_VENCER` (src/utils/retiros.js, 7 días): es del módulo
//    Devoluciones y NO se toca desde aquí. La alerta de vencimiento de la
//    cobertura (M5) tiene su PROPIA constante, `UMBRAL_ALERTA_VENCIMIENTO_DIAS`,
//    desacoplada a propósito (decisión del dueño): cambiar una no mueve la otra.

// ── Intervalos de visitas (tiempo entre dos visitas seguidas al mismo PDV) ──────────────────
export const MIN_DIAS_TRAMO = 5;        // menos: se une con el siguiente (si nada cambió) o se descarta
export const MAX_DIAS_TRAMO = 21;       // más: "intervalo de visitas largo", fuera de las métricas

// ── Ventanas ────────────────────────────────────────────────────────────────
export const VENTANA_INDICE_DIAS = 90;  // índice del PDV (M3) y capa B del mapa
export const VENTANA_EFECTO_DIAS = 90;  // tabla de efecto y mapa de calor
export const VENTANA_MERMA_DIAS = 90;   // merma por vencimiento y deterioro (= vida útil)
export const PERIODOS_DIAS = [30, 60, 90];
export const PERIODO_DEFECTO_DIAS = 30;

// ── Índice del PDV (M3) ─────────────────────────────────────────────────────
export const MIN_TRAMOS_INDICE = 3;     // intervalos de visitas válidos del PDV en la ventana para tener índice

// ── Mapa de calor ───────────────────────────────────────────────────────────
export const MIN_PDV_CELDA = 3;         // menos: celda gris, sin cifra, "pocos datos"
export const MIN_CELDAS_CAPA_B = 2;     // celdas distintas en las que estuvo un PDV para entrar a la capa B

// ── Tabla de efecto (M7) ────────────────────────────────────────────────────
export const MIN_TRAMOS_LADO = 2;       // intervalos de visitas válidos antes y después del cambio
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
// Alerta de cobertura: el lote más viejo vence en menos de esto. Valor inicial 7
// (por confirmar con la práctica del equipo). Independiente de DIAS_POR_VENCER.
export const UMBRAL_ALERTA_VENCIMIENTO_DIAS = 7;
export const UMBRAL_COBERTURA_ORIENTATIVA_DIAS = 60;

// ── Calidad de datos ────────────────────────────────────────────────────────
export const MIN_VISITAS_PERIODO = 2;   // menos: "PDV con pocas visitas"
export const FACTOR_ATIPICO = 3;        // la rotación cambia más de 3 veces entre intervalos de visitas seguidos
export const MIN_ROT_ATIPICO = 0.05;    // por debajo, la razón entre intervalos de visitas no significa nada

// ── Diagnóstico de "Comparar métodos" (solo lectura) ────────────────────────
// Un intervalo negativo tiene un vecino "anormalmente alto" si ese vecino rota
// al menos FACTOR_VECINO_ALTO veces la mediana del PDV y compensa al menos
// PCT_VECINO_COMPENSA del negativo. Es la huella de un desfase entre lo
// facturado y lo despachado (la mercancía cuenta en una visita y aparece en la
// siguiente). Sin vecino así, el negativo es aislado: producto que entró sin
// registrarse.
export const FACTOR_VECINO_ALTO = 2;
export const PCT_VECINO_COMPENSA = 0.5;
// Posibles PDV duplicados: nombres a esta distancia de edición o menos (tras
// quitar acentos, signos y la forma jurídica) y de al menos este largo.
export const MAX_DISTANCIA_DUPLICADO = 2;
export const MIN_LARGO_DUPLICADO = 8;
// Fecha desde la que existe el registro de traslados (Fase 2). Mientras sea null,
// NO se reporta "retiro Por vencer sin destino confirmado": antes de la función
// ningún traslado estaba registrado y la lista saldría llena de falsos avisos.
export const FECHA_INICIO_TRASLADOS = null;   // 'AAAA-MM-DD'
