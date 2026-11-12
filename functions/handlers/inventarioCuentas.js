// RUTA: functions/handlers/inventarioCuentas.js
//
// Cuentas de Zoho Books (org 793482918) en las que el inventario de Kroma puede
// escribir, y a cuál va cada categoría del libro. Es la ÚNICA lista: el asiento
// mensual (sección 7) aborta si una línea apunta a una cuenta que no está aquí.
//
// Decisiones del dueño:
//   · 2026-11-12: consumo interno en dos cuentas — consumo de personal a "Otros
//     gastos de personal" y muestras y degustaciones a "Publicidad, promoción y
//     material publicitario". Las donaciones van con las muestras.

const CUENTAS = {
    inventarioPT:       { id: "3576378000007389634", nombre: "Inventario de productos terminados" },
    inventarioMP:       { id: "3576378000007389035", nombre: "Inventario de materia prima" },
    costoVentas:        { id: "3576378000000034003", nombre: "Costo de producto vendido" },
    reposicionesMermas: { id: "3576378000007389766", nombre: "Reposiciones, mermas y producto vencido" },
    ajustes:            { id: "3576378000008440003", nombre: "Ajustes de inventario" },
    consumoPersonal:    { id: "3576378000007389858", nombre: "Otros gastos de personal (transporte, formación, celebraciones)" },
    muestras:           { id: "3576378000007389918", nombre: "Publicidad, promoción y material publicitario" },
    // Nómina de planta (mano de obra aplicada, sección 6).
    sueldosProduccion:  { id: "3576378000007389798", nombre: "Sueldos y salarios producción" },
    destajo:            { id: "3576378000007596056", nombre: "Trabajos adicionales-destajo" },
    aportes:            { id: "3576378000007389802", nombre: "Aportes (nómina de planta)" },
    beneficios:         { id: "3576378000007389806", nombre: "Beneficios (nómina de planta)" },
    bonoUniformes:      { id: "3576378000007389810", nombre: "Bono y uniformes (nómina de planta)" },
};

const PERMITIDAS = new Set(Object.values(CUENTAS).map(c => c.id));

/**
 * Cuenta de resultado (la contrapartida del inventario de producto terminado)
 * de un asiento del libro, o null si la categoría no genera línea (traslado,
 * envasado, apertura, producción: la producción se arma con sus componentes).
 */
function cuentaDeAsiento(a) {
    switch (a?.categoria) {
        case "venta": return CUENTAS.costoVentas.id;
        case "reposicion":
        case "merma": return CUENTAS.reposicionesMermas.id;
        case "consumo_interno": return a.subcategoria === "muestras" ? CUENTAS.muestras.id : CUENTAS.consumoPersonal.id;
        case "ajuste":
        case "revaluacion": return CUENTAS.ajustes.id;
        default: return null;
    }
}

/** Lanza si alguna línea usa una cuenta que no está en la lista. */
function verificarCuentas(lineas) {
    const malas = (lineas || []).filter(l => !PERMITIDAS.has(String(l.account_id || "")));
    if (malas.length) {
        throw new Error(`El asiento usa cuentas no permitidas: ${[...new Set(malas.map(l => l.account_id || "(vacía)"))].join(", ")}`);
    }
}

module.exports = { CUENTAS, PERMITIDAS, cuentaDeAsiento, verificarCuentas };
