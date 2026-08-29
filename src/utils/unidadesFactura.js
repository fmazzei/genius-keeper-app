// RUTA: src/utils/unidadesFactura.js
//
// UNIDADES DE VENTA REALES de una factura de Zoho.
//
// La "unidad" de GK es la presentación de venta al detal (bolsa de 250 g). Pero
// Zoho factura algunos artículos POR KILO — foodservice compra "Chèvre Bolsa
// 1 Kg" y la factura dice `50.00 kg`. Guardar esa cantidad tal cual cuenta 50
// unidades cuando en realidad son 200 (50 kg ÷ 0,25 kg).
//
// El servidor ya normaliza esto al sincronizar (`facturaSync.factorUnidadZoho`) y
// marca la factura con `unidadesNormalizadas: true`. Pero las facturas que
// entraron ANTES de esa corrección siguen guardadas con la cantidad cruda, y esa
// corrección solo llega cuando alguien corre la conciliación. Este helper repara
// la LECTURA para que los tableros digan la verdad sin depender de eso.
//
// Cómo lo detecta: si el importe por unidad guardada es un MÚLTIPLO LIMPIO (≥2)
// del precio de lista del canal, esa cantidad venía en otra unidad. Alberca:
// $912 ÷ 50 = $18,24 ≈ 4 × $4,80 ⇒ factor 4 ⇒ 200 unidades.
//
// Se multiplica la CANTIDAD por el factor (en vez de dividir el monto entre el
// precio) para que los DESCUENTOS no distorsionen: el 5% de descuento de esa
// factura mueve el ratio de 4,00 a 3,80, que sigue redondeando a 4. Dividir el
// monto habría dado 190 unidades en vez de 200.
//
// El CANAL debe venir del registro de clientes (`clientes_zoho`), no del campo
// `categoria` de la factura: ese quedó congelado cuando se sincronizó y puede ser
// anterior a que se marcara el cliente como foodservice.

import { DEFAULT_COMMISSION_CONFIG } from '@/Components/CommissionConstructor.jsx';

// Un múltiplo se acepta solo si es "limpio": a lo sumo 12% de desviación
// respecto al entero. Deja pasar descuentos comerciales normales y descarta un
// SKU que sencillamente sea más caro (no un empaque de varias unidades).
const TOLERANCIA = 0.12;
const UMBRAL     = 1.5;   // por debajo de 1,5× el precio de lista no se toca

/**
 * Unidades de venta reales de una factura de `facturas_vendedor`.
 * Idempotente: sobre una factura ya normalizada devuelve lo mismo (el importe
 * por unidad vuelve a quedar en ~1× el precio de lista).
 *
 * @param {object} f      factura ({ unidades, monto, categoria, unidadesNormalizadas })
 * @param {object} [opts] { canal: 'retail'|'foodservice' (el VIGENTE del cliente), cfg: commissionConfig }
 * @returns {number} unidades de venta
 */
export function unidadesReales(f, opts = {}) {
    const u = Number(f?.unidades) || 0;
    if (u <= 0) return 0;
    // Ya convertida por el servidor: no se vuelve a tocar.
    if (f.unidadesNormalizadas === true) return u;

    const monto = Number(f.monto) || 0;
    if (monto <= 0) return u;

    const c = { ...DEFAULT_COMMISSION_CONFIG, ...(opts.cfg || {}) };
    const canal  = opts.canal || f.categoria || 'retail';
    const precio = canal === 'foodservice'
        ? (Number(c.precioUnidadFoodservice) || DEFAULT_COMMISSION_CONFIG.precioUnidadFoodservice)
        : (Number(c.precioUnidad) || DEFAULT_COMMISSION_CONFIG.precioUnidad);
    if (!(precio > 0)) return u;

    const ratio = (monto / u) / precio;
    if (ratio <= UMBRAL) return u;
    const factor = Math.round(ratio);
    if (factor < 2) return u;
    if (Math.abs(ratio - factor) / factor > TOLERANCIA) return u;
    return u * factor;
}

/**
 * Construye el resolutor de canal VIGENTE por factura a partir del registro de
 * clientes (`clientes_zoho`). Se cruza por carnet (`zohoCustomerId`) y, como
 * respaldo, por razón social.
 * @param {Array} clientes documentos de `clientes_zoho`
 * @returns {(f:object) => 'retail'|'foodservice'}
 */
export function buildCanalResolver(clientes) {
    const porCarnet = new Map();
    const porNombre = new Map();
    (clientes || []).forEach(c => {
        const cat = c.categoria === 'foodservice' ? 'foodservice' : 'retail';
        if (c.customerId) porCarnet.set(String(c.customerId), cat);
        const n = String(c.customerName || '').trim().toLowerCase();
        if (n) porNombre.set(n, cat);
    });
    return (f) => {
        const cid = f?.zohoCustomerId != null ? String(f.zohoCustomerId) : null;
        if (cid && porCarnet.has(cid)) return porCarnet.get(cid);
        const n = String(f?.clienteName || '').trim().toLowerCase();
        if (n && porNombre.has(n)) return porNombre.get(n);
        return f?.categoria === 'foodservice' ? 'foodservice' : 'retail';
    };
}
