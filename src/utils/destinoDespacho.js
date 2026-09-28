// RUTA: src/utils/destinoDespacho.js
//
// ÚNICA definición de "¿esta línea de despacho va a Caracas?", compartida por
// Kroma (DespachoPage: descuenta la planta al despachar y no deja "Marcar como
// Entregado") y GK (Almacén Comercial: qué despachos y qué líneas se reciben en
// Frimaca). Si cada lado tuviera su copia, un despacho podría salir de la planta
// como "a Caracas" y no aparecer nunca para recibirse, o al revés.

export const esDestinoCaracas = (destino) =>
    destino?.ciudad === 'Caracas' ||
    destino?.estado === 'Distrito Capital' ||
    (destino?.tipo === 'otro' && /caracas/i.test(destino?.texto || ''));

/** Líneas de un despacho que se reciben en Caracas. */
export const lineasACaracas = (despacho) =>
    (despacho?.lineas || []).filter(l => esDestinoCaracas(l.destino));
