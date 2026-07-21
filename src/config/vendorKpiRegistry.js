// RUTA: src/config/vendorKpiRegistry.js
//
// Catálogo de KPIs que puede ver el VENDEDOR en la 2ª vista (deslizable) de su
// Home. El máster elige cuáles se muestran desde AdminPanel → Comercial → "KPIs
// del Vendedor" (config por ROL, guardada en settings/vendorKpiConfig). Los
// valores se derivan del `stats`/`estados` que el Home del vendedor ya calcula.

export const VENDOR_KPI_REGISTRY = [
    { id: 'comision_periodo', label: 'Comisión del período', cat: 'Dinero',    desc: 'Devengado del período en curso' },
    { id: 'meta_nivel',       label: 'Meta del mes y Nivel', cat: 'Dinero',    desc: 'Unidades facturadas vs meta + nivel de comisión' },
    { id: 'velocidad',        label: 'Velocidad de venta',   cat: 'Dinero',    desc: 'Ritmo actual vs el necesario para la meta' },
    { id: 'por_cobrar',       label: 'Por cobrar',           cat: 'Cobranza',  desc: 'Facturas por vencer y monto abierto' },
    { id: 'cobranza',         label: 'Cobranza a tiempo',    cat: 'Cobranza',  desc: '% de facturas cobradas dentro de plazo' },
    { id: 'vencidas',         label: 'Facturas vencidas',    cat: 'Cobranza',  desc: 'Nº y monto vencido de la cartera' },
    { id: 'despachos',        label: 'Despachos hoy',        cat: 'Operación', desc: 'Unidades despachadas en el día' },
    { id: 'activacion',       label: 'Bono Activación',      cat: 'Bonos',     desc: 'Cobertura de cartera facturada por semana' },
    { id: 'anaquel',          label: 'Bono Anaquel',         cat: 'Bonos',     desc: 'Disponibilidad en anaquel (cuentas de régimen anaquel)' },
    { id: 'radar',            label: 'Radar de acción',      cat: 'Operación', desc: 'Alertas de visita/quiebre de tu cartera' },
];

export const VENDOR_KPI_IDS = VENDOR_KPI_REGISTRY.map(w => w.id);
export const VENDOR_KPI_MAP = Object.fromEntries(VENDOR_KPI_REGISTRY.map(w => [w.id, w]));
export const VENDOR_KPI_CATS = [...new Set(VENDOR_KPI_REGISTRY.map(w => w.cat))];
