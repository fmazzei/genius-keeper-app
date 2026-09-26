// RUTA: src/utils/commissionDefaults.js
//
// La configuración de comisiones POR DEFECTO, como dato puro.
//
// Vivía dentro de `CommissionConstructor.jsx`, que es una pantalla y arrastra
// React y Firebase. Eso obligaba a cualquier módulo de cálculo que necesitara
// un precio de lista a importar una interfaz entera — y hacía imposible
// verificar esos cálculos fuera del navegador. La pantalla la sigue
// re-exportando, así que nada de lo que ya la importaba cambia.

export const DEFAULT_COMMISSION_CONFIG = {
    metaMensual:        2400,
    precioUnidad:        5.6,   // precio de venta por unidad — convierte metas uds↔$ y alimenta la propuesta
    salarioFijo:        300,
    viaticosSemanales:  25,
    tiers: [
        { label: 'Plus',   minPct: 120, rate: 4.5 },
        { label: 'Óptima', minPct: 100, rate: 4.0 },
        { label: 'Básica', minPct: 90,  rate: 3.5 },
    ],
    bajaRate:            3.0,
    bajaLabel:           'Baja',   // nombre editable del nivel más bajo
    bajaActiva:          true,     // false = sin comisión por debajo del nivel más bajo
    // "Bono Cobranza" (reusa la clave bonusPuntualidad): TASA del bono. Modelo
    // PROPORCIONAL — se gana sobre CADA factura cobrada a tiempo (dentro de
    // vencimiento + cobranzaGraciaDias). Ya NO hay umbral/gate.
    bonusPuntualidad:    2.5,
    bonusActivacion:     1.0,
    activacionThreshold: 80,
    activacionMinUnits:  24,
    bonusAnaquel:        1.0,
    anaquelThreshold:    80,
    anaquelMinUnits:     12,
    arranque:            [],
    // Cobranza por PUNTUALIDAD (proporcional). "A tiempo" = cobrar dentro de
    // vencimiento + cobranzaGraciaDias; el Bono Cobranza se paga sobre lo cobrado
    // a tiempo, factura por factura.
    cobranzaGraciaDias:  5,     // días de gracia tras el vencimiento que aún cuentan a tiempo
    // Cuentas Recuperadas: facturas heredadas de la cartera que el vendedor cobra
    comisionRecuperadas: 5.0,   // % flat sobre lo cobrado de esas facturas adoptadas
    facturaMaxDias:      45,    // >45 días sin cobrar → la comisión se anula
    // FOODSERVICE: canal aparte (clientes marcados 'foodservice'). Sus unidades
    // CUENTAN a la meta (a su propio precio), pero la comisión es FLAT (no la del
    // nivel). Precio y % editables aquí.
    precioUnidadFoodservice: 4.8,  // precio de venta por unidad foodservice
    comisionFoodservice:     5.0,  // % flat sobre lo cobrado de facturas foodservice
};
