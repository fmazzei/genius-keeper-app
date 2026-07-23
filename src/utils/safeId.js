// RUTA: src/utils/safeId.js
//
// UUID seguro para Android WebView / Chrome < 92, donde `crypto.randomUUID` no
// existe (o falla fuera de contexto seguro). Sin él, crear un reporte de visita
// lanzaba TypeError → pantalla de error. Se usa crypto.randomUUID si está, si no
// se genera un id v4 con crypto.getRandomValues, y como último recurso Math.random.

export function safeUUID() {
    try {
        if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
            return crypto.randomUUID();
        }
        if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
            const b = crypto.getRandomValues(new Uint8Array(16));
            b[6] = (b[6] & 0x0f) | 0x40; // versión 4
            b[8] = (b[8] & 0x3f) | 0x80; // variante
            const h = [...b].map(x => x.toString(16).padStart(2, '0'));
            return `${h[0]}${h[1]}${h[2]}${h[3]}-${h[4]}${h[5]}-${h[6]}${h[7]}-${h[8]}${h[9]}-${h[10]}${h[11]}${h[12]}${h[13]}${h[14]}${h[15]}`;
        }
    } catch { /* cae al respaldo */ }
    // Último recurso (no criptográfico, pero suficiente para un id de intento).
    return 'id-' + Date.now().toString(16) + '-' + Math.random().toString(16).slice(2, 10);
}
