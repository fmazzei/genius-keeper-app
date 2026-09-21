// RUTA: src/utils/facturaEstado.js
//
// UNA sola definición de "esto es una cuenta por cobrar de verdad".
//
// Motivo (bug real, 2026-09): las cuentas por cobrar de GK no cuadraban con las
// de Zoho — GK listaba como VENCIDAS facturas que en Zoho ya no existían. Cada
// pantalla tenía su propio filtro (`estado !== 'pagada'`, `estado !== 'anulada'`)
// y ninguna miraba las banderas que la conciliación YA escribía:
//
//   · `ausenteEnZoho: true`  — la factura se borró en Zoho. La conciliación la
//     marca (nunca la borra, para que el admin la revise) pero NINGÚN consumidor
//     la excluía: seguía sumando a la cartera por cobrar para siempre.
//   · `estado: 'borrador'`   — volvió a borrador en Zoho: no es una venta.
//   · saldo cero             — abonada/compensada por completo (nota de crédito);
//     Zoho no la cobra aunque su estatus no diga 'paid'.
//
// Regla: el dinero por cobrar de GK tiene que ser el mismo que el de Zoho. Una
// factura que Zoho no cobra, GK no la cobra.

/** Anulada por el admin o por un `void` de Zoho. */
export const esAnulada = (f) => f?.estado === 'anulada';

/**
 * "Fantasma": el documento existe en GK pero Zoho ya no lo reconoce como
 * factura emitida. Se conserva para auditoría, no cuenta como cartera.
 */
export const esFantasma = (f) => f?.ausenteEnZoho === true || f?.estado === 'borrador';

/**
 * ¿Cuenta este documento para la gestión comercial (facturación, cobranza,
 * unidades, comisión)? Excluye anuladas y fantasmas.
 */
export const cuentaEnCartera = (f) => !!f && !esAnulada(f) && !esFantasma(f);

/**
 * Saldo REAL por cobrar. Zoho reporta `balance` (total − abonado); si falta, se
 * cae al monto total (factura abierta sin abonos).
 */
export const saldoAbierto = (f) => {
    const b = Number(f?.balance);
    return (f?.balance != null && Number.isFinite(b)) ? b : (Number(f?.monto) || 0);
};

/**
 * ¿Es una cuenta por cobrar viva? Cartera válida + no pagada + con saldo.
 * Esta es la definición que debe usar TODA pantalla de cobranza.
 */
export const esPorCobrar = (f) =>
    cuentaEnCartera(f) && f.estado !== 'pagada' && saldoAbierto(f) > 0.005;

/** Motivo por el que una factura quedó fuera de la cartera (para explicarlo). */
export const motivoFuera = (f) => {
    if (esAnulada(f)) return 'Anulada';
    if (f?.ausenteEnZoho === true) return 'Ya no existe en Zoho';
    if (f?.estado === 'borrador') return 'Volvió a borrador en Zoho';
    return null;
};
