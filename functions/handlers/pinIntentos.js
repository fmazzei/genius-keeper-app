// RUTA: functions/handlers/pinIntentos.js
//
// Freno a la adivinanza del PIN de empresa de Kroma (11-oct). El PIN tiene 4
// dígitos (10.000 combinaciones) y `loginConPinEmpresa` no pide nada antes:
// sin freno, un programa podía probarlos todos en minutos.
//
//   · Por conexión (IP, guardada solo como huella SHA-256): 5 PIN equivocados
//     en 15 min ⇒ esa conexión espera 15 min. Un PIN correcto borra la cuenta.
//   · De toda la plataforma: 100 equivocados en 1 hora (alguien rotando
//     conexiones) ⇒ se pausan los intentos 30 min para todos. Quien ya entró
//     sigue adentro: la sesión de Firebase no se cierra.
//
// Una persona que se equivoca dos o tres veces no lo nota nunca.

const crypto = require("crypto");

const CFG = {
    maxPorIp: 5, ventanaIpMs: 15 * 60000, bloqueoIpMs: 15 * 60000,
    maxGlobal: 100, ventanaGlobalMs: 60 * 60000, bloqueoGlobalMs: 30 * 60000,
};

/** Pura: estado {fallos:[ms], bloqueadoHasta} → ¿bloqueado ahora? */
function bloqueo(estado, ahora) {
    const hasta = Number(estado?.bloqueadoHasta) || 0;
    return hasta > ahora ? hasta : 0;
}

/** Pura: registra un fallo y decide si bloquear. */
function registrarFallo(estado, ahora, max, ventanaMs, bloqueoMs) {
    const fallos = (estado?.fallos || []).filter(t => ahora - t < ventanaMs).concat(ahora).slice(-max * 3);
    const bloqueadoHasta = fallos.length >= max ? ahora + bloqueoMs : (Number(estado?.bloqueadoHasta) || 0);
    return { fallos, bloqueadoHasta };
}

const huellaIp = (ip) => crypto.createHash("sha256").update(String(ip || "sin_ip")).digest("hex").slice(0, 32);

function ipDe(rawRequest) {
    const xff = rawRequest?.headers?.["x-forwarded-for"];
    return (typeof xff === "string" && xff.split(",")[0].trim()) || rawRequest?.ip || "sin_ip";
}

const minutos = (ms) => Math.max(1, Math.ceil(ms / 60000));

/**
 * Antes de mirar el PIN. Lanza un error con `minutos` si hay que esperar.
 * Devuelve las referencias para `despues`.
 */
async function antes(db, rawRequest, ahora = Date.now()) {
    const ipRef = db.doc(`kroma_pin_intentos/ip_${huellaIp(ipDe(rawRequest))}`);
    const globRef = db.doc("kroma_pin_intentos/_global");
    const [ip, glob] = await Promise.all([ipRef.get(), globRef.get()]);
    const bIp = bloqueo(ip.data(), ahora), bGl = bloqueo(glob.data(), ahora);
    if (bIp || bGl) {
        const espera = Math.max(bIp, bGl) - ahora;
        const err = new Error("bloqueado");
        err.minutos = minutos(espera);
        err.global = !bIp;
        throw err;
    }
    return { ipRef, globRef };
}

/** Después de mirar el PIN: cuenta el fallo o limpia la cuenta de la conexión. */
async function despues(db, refs, correcto, ahora = Date.now()) {
    if (correcto) { await refs.ipRef.delete().catch(() => {}); return; }
    await db.runTransaction(async (tx) => {
        const [ip, glob] = await Promise.all([tx.get(refs.ipRef), tx.get(refs.globRef)]);
        tx.set(refs.ipRef, { ...registrarFallo(ip.data(), ahora, CFG.maxPorIp, CFG.ventanaIpMs, CFG.bloqueoIpMs), ultimo: ahora });
        tx.set(refs.globRef, { ...registrarFallo(glob.data(), ahora, CFG.maxGlobal, CFG.ventanaGlobalMs, CFG.bloqueoGlobalMs), ultimo: ahora });
    });
}

module.exports = { CFG, bloqueo, registrarFallo, huellaIp, ipDe, antes, despues };
