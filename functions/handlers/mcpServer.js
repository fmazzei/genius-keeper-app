// RUTA: functions/handlers/mcpServer.js
//
// CONECTOR MCP para GK y Kroma (comparten el proyecto Firebase). Claude
// (claude.ai) lo agrega como "conector personalizado": consulta cualquier
// colección de Firestore y los usuarios de Firebase Auth, y ESCRIBE en
// Firestore (crear, editar, borrar, lotes) con copia previa y deshacer.
// Firebase Auth es solo lectura.
//
// - Transporte Streamable HTTP SIN ESTADO: un servidor y un transporte nuevos
//   por solicitud (Cloud Functions no garantiza que dos solicitudes caigan en
//   la misma instancia).
// - Autenticación por clave (variable MCP_API_KEY), SOLO en el encabezado
//   `X-API-Key` (claude.ai lo configura en "Encabezados de solicitud"). Sin
//   clave o con una incorrecta la conexión se atiende (nunca 401: claude.ai lo
//   toma como "reconectar") pero ninguna herramienta lee ni escribe.
//   GET /estado = diagnóstico sin secretos.
// - Cada llamada queda en `mcp_auditoria`; cada documento escrito, con su
//   versión anterior exacta, en `mcp_cambios`.
// - Redacta lo sensible (contraseñas, PIN, tokens, credenciales, secretos) y
//   reemplaza las imágenes en base64 por un marcador con su tamaño. Algunas
//   colecciones son secretas ENTERAS (el secreto es el id del documento o el
//   documento completo) y no se leen nunca.

const admin = require("firebase-admin");
const crypto = require("crypto");
const { onRequest } = require("firebase-functions/v2/https");
const { McpServer } = require("@modelcontextprotocol/sdk/server/mcp.js");
const { StreamableHTTPServerTransport } = require("@modelcontextprotocol/sdk/server/streamableHttp.js");
const { z } = require("zod");

// La clave llega como variable de entorno: GitHub Actions la escribe en el
// `.env` del deploy desde el secreto MCP_API_KEY, igual que ZOHO_SECRET. NO se
// usa Secret Manager porque la cuenta de servicio del deploy recibe 403 ahí, y
// eso tumbaría el deploy de TODAS las funciones (ver CLAUDE.md). Si la variable
// falta o está vacía, ninguna herramienta funciona: falla cerrado.
const claveEsperada = () => process.env.MCP_API_KEY || "";

const TAM_MAX = 200 * 1024;          // ~200 KB por respuesta
const LIMITE_MAX = 500;

// Colecciones que NO se leen nunca, en ningún nivel de la ruta:
//   tokens            → users_metadata/{uid}/tokens: el id del doc ES el token FCM
//                       (y los desafíos de WebAuthn).
//   authenticators    → credenciales de huella / passkeys.
//   zoho_secure       → client id/secret y refresh token de Zoho.
//   kroma_empresa_pins→ el id del doc ES el PIN de acceso de cada empresa.
const COLECCIONES_SECRETAS = new Set(["tokens", "authenticators", "zoho_secure", "kroma_empresa_pins"]);

// Campos que se redactan siempre (por nombre, sin distinguir mayúsculas).
const PATRON_SENSIBLE = /(password|passwd|contrase|^pass$|hash|token|secret|api_?key|credential|public_?key|private_?key|refresh|authenticator|^pin$|^pin_)/i;

const REDACTADO = "[redactado]";

// ── Utilidades ──────────────────────────────────────────────────────────────

/** 8 caracteres del SHA-256: sirve para comparar dos claves sin mostrarlas. */
const huella = (v) => crypto.createHash("sha256").update(String(v)).digest("hex").slice(0, 8);

function claveValida(recibida, esperada) {
    if (!recibida || !esperada) return false;
    const a = Buffer.from(String(recibida));
    const b = Buffer.from(String(esperada));
    return a.length === b.length && crypto.timingSafeEqual(a, b);
}

const segmentosColeccion = (ruta) =>
    String(ruta || "").split("/").filter(Boolean).filter((_, i) => i % 2 === 0);

function rutaSecreta(ruta) {
    return segmentosColeccion(ruta).some(c => COLECCIONES_SECRETAS.has(c));
}

const kb = (n) => Math.max(1, Math.round(n / 1024));

function esBase64Largo(s) {
    if (s.length < 1500) return false;
    const muestra = s.slice(0, 2000).replace(/\s/g, "");
    return /^[A-Za-z0-9+/=_-]+$/.test(muestra);
}

/** Convierte un valor de Firestore en algo legible y seguro. */
function limpiar(valor, nombreCampo = "", redactados = null) {
    if (nombreCampo && PATRON_SENSIBLE.test(nombreCampo)) {
        if (redactados) redactados.add(nombreCampo);
        return REDACTADO;
    }
    if (valor === null || valor === undefined) return valor ?? null;
    if (valor instanceof admin.firestore.Timestamp) return valor.toDate().toISOString();
    if (valor instanceof Date) return valor.toISOString();
    if (valor instanceof admin.firestore.GeoPoint) return `GeoPoint(${valor.latitude}, ${valor.longitude})`;
    if (valor instanceof admin.firestore.DocumentReference) return `ref:${valor.path}`;
    if (Buffer.isBuffer(valor) || valor instanceof Uint8Array) return `[binario, ${kb(valor.length)} KB]`;
    if (typeof valor === "string") {
        if (/^data:[^;]+;base64,/i.test(valor)) return `[imagen base64, ${kb(valor.length * 0.75)} KB]`;
        if (esBase64Largo(valor)) return `[imagen base64, ${kb(valor.length * 0.75)} KB]`;
        return valor;
    }
    if (Array.isArray(valor)) return valor.map(v => limpiar(v, "", redactados));
    if (typeof valor === "object") {
        const out = {};
        for (const [k, v] of Object.entries(valor)) out[k] = limpiar(v, k, redactados);
        return out;
    }
    return valor;
}

function docSalida(snap, redactados) {
    return { id: snap.id, ruta: snap.ref.path, datos: limpiar(snap.data() || {}, "", redactados) };
}

function tipoDe(v) {
    if (v === null) return "null";
    if (v instanceof admin.firestore.Timestamp) return "timestamp";
    if (v instanceof admin.firestore.GeoPoint) return "geopoint";
    if (v instanceof admin.firestore.DocumentReference) return "referencia";
    if (Array.isArray(v)) return "arreglo";
    return typeof v === "object" ? "mapa" : typeof v;
}

/** Valor de un filtro: `tipo:'fecha'` convierte una fecha ISO en Timestamp. */
function valorFiltro(f) {
    const conv = (v) => (f.tipo === "fecha" && typeof v === "string") ? admin.firestore.Timestamp.fromDate(new Date(v)) : v;
    return Array.isArray(f.valor) ? f.valor.map(conv) : conv(f.valor);
}

function aplicarFiltros(q, filtros) {
    for (const f of filtros || []) q = q.where(f.campo, f.operador, valorFiltro(f));
    return q;
}

/** Respuesta MCP: JSON en texto, recortada a ~200 KB. */
function respuesta(obj) {
    return { content: [{ type: "text", text: JSON.stringify(obj, null, 1) }] };
}

function error(msg) {
    return { content: [{ type: "text", text: msg }], isError: true };
}

async function auditar(herramienta, parametros, documentos, contexto = {}) {
    try {
        await admin.firestore().collection("mcp_auditoria").add({
            fecha: admin.firestore.FieldValue.serverTimestamp(),
            herramienta,
            // Por dónde llegó la clave ("encabezado" o "url"). Nunca la clave.
            via: contexto.via || null,
            // Los datos de una escritura pueden traer fotos: se recortan (la copia
            // completa vive en mcp_cambios).
            parametros: (() => {
                const txt = JSON.stringify(parametros ?? {});
                return txt.length > 20000 ? { recortado: true, vista: txt.slice(0, 20000) } : JSON.parse(txt);
            })(),
            documentos: documentos ?? 0,
        });
    } catch (e) { /* la bitácora no puede tumbar la consulta */ }
}

async function registrarRechazo(r = {}) {
    try {
        await admin.firestore().collection("mcp_rechazos").add({
            fecha: admin.firestore.FieldValue.serverTimestamp(),
            motivo: r.motivo || "desconocido",
            metodo: r.metodo || null,
            herramienta: r.herramienta || null,
            huellaRecibida: r.huellaRecibida || null,
            largoRecibido: r.largoRecibido || 0,
            cliente: r.cliente || "",
        });
    } catch (e) { /* diagnóstico */ }
}

/** Ejecuta una herramienta con auditoría y manejo de errores uniformes. */
function herramienta(nombre, fn, contexto = {}) {
    return async (args) => {
        // Sin clave válida la conexión se mantiene (ver la función HTTP), pero
        // ninguna herramienta lee ni escribe: devuelve el motivo y queda anotado.
        if (!contexto.autenticado) {
            await registrarRechazo({ ...contexto.rechazo, herramienta: nombre });
            return error(contexto.rechazo?.motivo === "servidor_sin_clave"
                ? "El servidor del conector no tiene la clave configurada (MCP_API_KEY). Avísale al administrador."
                : contexto.rechazo?.motivo === "clave_incorrecta"
                    ? "La clave X-API-Key del conector no coincide con la del servidor. Hay que eliminar el conector en claude.ai y crearlo de nuevo con la clave vigente."
                    : "Esta llamada llegó sin el encabezado X-API-Key. Vuelve a intentarlo; si se repite, desconecta y reconecta el conector GK y Kroma en claude.ai.");
        }
        try {
            const { salida, documentos } = await fn(args || {});
            await auditar(nombre, args, documentos, contexto);
            return respuesta(salida);
        } catch (e) {
            await auditar(nombre, { ...args, error: String(e?.message || e).slice(0, 300) }, 0, contexto);
            return error(`Error: ${String(e?.message || e).slice(0, 500)}`);
        }
    };
}

// ── Escritura ──────────────────────────────────────────────────────────────
//
// Toda escritura pasa por `aplicarOperaciones`: una transacción que lee cada
// documento, guarda en `mcp_cambios` una copia EXACTA de cómo estaba (tipos de
// Firestore incluidos) y luego escribe. `deshacer_cambio` restaura esa copia.
//
// Lo que el conector no deja ver tampoco lo deja escribir: colecciones
// secretas, campos sensibles (contraseñas, PIN, tokens…) y sus propias
// bitácoras. Los marcadores que devuelve la lectura ("[redactado]",
// "[imagen base64, N KB]") se reemplazan por el valor real guardado, para que
// leer → editar → guardar no destruya una foto ni un PIN.

const COLECCIONES_PROPIAS = new Set(["mcp_auditoria", "mcp_cambios", "mcp_rechazos"]);
// Partidas que alimentan el inventario perpetuo (functions/handlers/inventarioPerpetuo.js).
const COLECCIONES_INVENTARIO = new Set(["kroma_inventory_pt", "inventario_comercial"]);
const MARCADOR = /^\[(redactado|imagen base64, \d+ KB|binario, \d+ KB)\]$/;
const MAX_OPERACIONES = 100;

function validarRutaEscritura(ruta, { esDocumento = true } = {}) {
    const seg = String(ruta || "").split("/").filter(Boolean);
    if (!seg.length) throw new Error("Ruta vacía.");
    if (esDocumento && seg.length % 2 !== 0) throw new Error(`"${ruta}" no es la ruta de un documento (colección/id).`);
    if (!esDocumento && seg.length % 2 !== 1) throw new Error(`"${ruta}" no es la ruta de una colección.`);
    if (rutaSecreta(ruta)) throw new Error("Colección secreta: no se escribe desde el conector.");
    if (segmentosColeccion(ruta).some(c => COLECCIONES_PROPIAS.has(c))) throw new Error("Las bitácoras del conector no se escriben a mano.");
    return seg.join("/");
}

/** Valor guardado en `antes` en la ruta de campos dada, o undefined. */
function valorEn(obj, camino) {
    let v = obj;
    for (const k of camino) {
        if (v === null || v === undefined || typeof v !== "object") return undefined;
        v = v[k];
    }
    return v;
}

/**
 * Convierte los valores que manda Claude en valores de Firestore:
 *   {"$fecha":"ISO"} → Timestamp · {"$ahora":true} → hora del servidor
 *   {"$ref":"col/id"} → referencia · {"$geo":[lat,lng]} → GeoPoint
 *   {"$incrementar":n} · {"$agregarALista":[..]} · {"$quitarDeLista":[..]}
 *   {"$borrar":true} → elimina el campo (solo al combinar)
 * y los marcadores de lectura por el valor real que había.
 */
function aFirestore(valor, camino, antes, opciones) {
    const FV = admin.firestore.FieldValue;
    const nombre = camino[camino.length - 1];
    if (typeof valor === "string" && MARCADOR.test(valor)) {
        const real = valorEn(antes, camino);
        if (real === undefined) throw new Error(`"${camino.join(".")}" trae el marcador ${valor} pero el documento no tiene ese campo: no hay valor real que conservar.`);
        return real;
    }
    if (nombre && PATRON_SENSIBLE.test(String(nombre))) {
        throw new Error(`"${camino.join(".")}" es un campo sensible (contraseña, PIN, token…): no se escribe desde el conector.`);
    }
    if (valor === null || typeof valor !== "object") return valor;
    if (Array.isArray(valor)) return valor.map((v, i) => aFirestore(v, [...camino, i], antes, opciones));
    const claves = Object.keys(valor);
    if (claves.length === 1 && claves[0].startsWith("$")) {
        const [k] = claves; const v = valor[k];
        switch (k) {
            case "$fecha": {
                const d = new Date(v);
                if (isNaN(d)) throw new Error(`"${camino.join(".")}": fecha inválida (${v}).`);
                return admin.firestore.Timestamp.fromDate(d);
            }
            case "$ahora": return FV.serverTimestamp();
            case "$ref": return admin.firestore().doc(validarRutaEscritura(v));
            case "$geo": return new admin.firestore.GeoPoint(Number(v[0]), Number(v[1]));
            case "$incrementar": return FV.increment(Number(v));
            case "$agregarALista": return FV.arrayUnion(...(Array.isArray(v) ? v : [v]));
            case "$quitarDeLista": return FV.arrayRemove(...(Array.isArray(v) ? v : [v]));
            case "$borrar":
                if (!opciones.permiteBorrarCampo) throw new Error(`"${camino.join(".")}": $borrar solo se usa en actualizar con modo "combinar".`);
                return FV.delete();
            default: throw new Error(`"${camino.join(".")}": operador desconocido ${k}.`);
        }
    }
    const out = {};
    for (const [k, v] of Object.entries(valor)) out[k] = aFirestore(v, [...camino, k], antes, opciones);
    return out;
}

/** Al reemplazar, los campos sensibles que había (y Claude no ve) se conservan. */
function conservarSensibles(nuevo, antes) {
    if (!antes || typeof antes !== "object" || Array.isArray(antes)) return nuevo;
    if (!nuevo || typeof nuevo !== "object" || Array.isArray(nuevo)) return nuevo;
    const out = { ...nuevo };
    for (const [k, v] of Object.entries(antes)) {
        if (PATRON_SENSIBLE.test(k)) { if (!(k in out)) out[k] = v; }
        else if (k in out && v && typeof v === "object" && !Array.isArray(v) && Object.getPrototypeOf(v) === Object.prototype) {
            out[k] = conservarSensibles(out[k], v);
        }
    }
    return out;
}

/** Serialización estable para saber si un documento cambió desde una escritura. */
function firma(datos) {
    const s = (v) => {
        if (v === null || v === undefined) return "null";
        if (v instanceof admin.firestore.Timestamp) return `T${v.seconds}.${v.nanoseconds}`;
        if (v instanceof admin.firestore.GeoPoint) return `G${v.latitude},${v.longitude}`;
        if (v instanceof admin.firestore.DocumentReference) return `R${v.path}`;
        if (Buffer.isBuffer(v) || v instanceof Uint8Array) return `B${Buffer.from(v).toString("base64")}`;
        if (Array.isArray(v)) return `[${v.map(s).join(",")}]`;
        if (typeof v === "object") return `{${Object.keys(v).sort().map(k => `${JSON.stringify(k)}:${s(v[k])}`).join(",")}}`;
        return JSON.stringify(v);
    };
    return datos === null ? "inexistente" : crypto.createHash("sha256").update(s(datos)).digest("hex");
}

/**
 * Aplica operaciones {accion: crear|actualizar|reemplazar|borrar, ruta, datos}
 * en UNA transacción (todo o nada), con copia previa de cada documento.
 */
async function aplicarOperaciones(operaciones, { motivo = null } = {}) {
    const db = admin.firestore();
    if (!operaciones.length) throw new Error("No hay operaciones.");
    if (operaciones.length > MAX_OPERACIONES) throw new Error(`Máximo ${MAX_OPERACIONES} operaciones por llamada.`);
    const ops = operaciones.map(o => ({ ...o, ruta: validarRutaEscritura(o.ruta) }));
    const rutas = ops.map(o => o.ruta);
    if (new Set(rutas).size !== rutas.length) throw new Error("Hay dos operaciones sobre el mismo documento: júntalas en una.");
    const lote = db.collection("mcp_cambios").doc().id;
    const cambiosRefs = ops.map(() => db.collection("mcp_cambios").doc());

    await db.runTransaction(async (tx) => {
        const snaps = await Promise.all(ops.map(o => tx.get(db.doc(o.ruta))));
        const escrituras = ops.map((o, i) => {
            const snap = snaps[i];
            const antes = snap.exists ? snap.data() : null;
            if (o.accion === "crear" && snap.exists) throw new Error(`${o.ruta} ya existe: usa actualizar.`);
            if ((o.accion === "actualizar" || o.accion === "borrar") && !snap.exists) throw new Error(`${o.ruta} no existe.`);
            let datos = null;
            if (o.accion !== "borrar") {
                if (!o.datos || typeof o.datos !== "object" || Array.isArray(o.datos)) throw new Error(`${o.ruta}: faltan los datos (un objeto).`);
                if (o.accion === "actualizar") {
                    // Las claves con punto ("a.b") editan un campo anidado.
                    datos = {};
                    for (const [k, v] of Object.entries(o.datos)) datos[k] = aFirestore(v, k.split("."), antes, { permiteBorrarCampo: true });
                } else {
                    datos = aFirestore(o.datos, [], antes, { permiteBorrarCampo: false });
                    if (o.accion === "reemplazar") datos = conservarSensibles(datos, antes);
                }
            }
            return { o, antes, datos };
        });
        escrituras.forEach(({ o, antes, datos }, i) => {
            const ref = db.doc(o.ruta);
            if (o.accion === "borrar") tx.delete(ref);
            else if (o.accion === "actualizar") tx.update(ref, datos);
            else tx.set(ref, datos);
            tx.set(cambiosRefs[i], {
                fecha: admin.firestore.FieldValue.serverTimestamp(),
                lote, accion: o.accion, ruta: o.ruta, motivo,
                existiaAntes: antes !== null,
                antes,
                deshecho: false,
            });
        });
    });

    // Huella de cómo quedó cada documento: deshacer la usa para no pisar un
    // cambio hecho después por la app o por una persona.
    const despues = await Promise.all(ops.map(o => db.doc(o.ruta).get()));
    await Promise.all(despues.map((s, i) => cambiosRefs[i].update({ firmaDespues: firma(s.exists ? s.data() : null) })));
    return ops.map((o, i) => ({ accion: o.accion, ruta: o.ruta, cambioId: cambiosRefs[i].id, existe: despues[i].exists }));
}

async function deshacer(cambioId, forzar) {
    const db = admin.firestore();
    const cref = db.collection("mcp_cambios").doc(String(cambioId));
    let ruta = null;
    const nuevoCambio = db.collection("mcp_cambios").doc();
    await db.runTransaction(async (tx) => {
        const c = await tx.get(cref);
        if (!c.exists) throw new Error("No existe ese cambio.");
        const cambio = c.data();
        if (cambio.deshecho) throw new Error("Ese cambio ya se deshizo.");
        ruta = cambio.ruta;
        const ref = db.doc(validarRutaEscritura(ruta));
        const actual = await tx.get(ref);
        const datosActuales = actual.exists ? actual.data() : null;
        if (!forzar && cambio.firmaDespues && firma(datosActuales) !== cambio.firmaDespues) {
            throw new Error(`${ruta} cambió después de ese cambio (lo tocó la app u otra persona). Revísalo con leer_documento; si igual quieres volver a la versión anterior, repite con forzar=true.`);
        }
        // Partidas de inventario (cava de planta o Frimaca): el libro valorado
        // lee la marca `_mov` de cada cambio. Restaurar la versión anterior tal
        // cual repetiría la marca VIEJA (p.ej. deshacer un picking se anotaba
        // como otra recepción del camión). Se estampa una REVERSA del
        // movimiento que se deshace, y una creación se deja en cero en vez de
        // borrarla, para que el libro registre la salida con su tipo.
        const esPartida = COLECCIONES_INVENTARIO.has(segmentosColeccion(ruta)[0]);
        const movDeshecho = datosActuales?._mov || null;
        const reversa = esPartida ? { _mov: {
            id: `mcp_${nuevoCambio.id}`, tipo: "reversa", revierte: movDeshecho?.tipo || "sin_tipo",
            motivo: `Deshacer ${cref.id} (conector)${movDeshecho?.motivo ? ` · ${String(movDeshecho.motivo).slice(0, 200)}` : ""}`,
            ref: movDeshecho?.ref || null, revierteMovId: movDeshecho?.id || null,
            usuario: { id: null, nombre: "Conector Claude" }, at: new Date().toISOString(),
        } } : null;
        if (cambio.existiaAntes) tx.set(ref, reversa ? { ...cambio.antes, ...reversa } : cambio.antes);
        else if (actual.exists && esPartida) {
            const campo = segmentosColeccion(ruta)[0] === "kroma_inventory_pt" && datosActuales?.tipo === "sin_envasar" ? "kgTotales" : "unidades";
            tx.set(ref, { ...datosActuales, [campo]: 0, active: false, ...reversa });
        } else if (actual.exists) tx.delete(ref);
        tx.update(cref, { deshecho: true, deshechoEn: admin.firestore.FieldValue.serverTimestamp() });
        tx.set(nuevoCambio, {
            fecha: admin.firestore.FieldValue.serverTimestamp(),
            lote: nuevoCambio.id, accion: "deshacer", deshaceA: cref.id, ruta,
            motivo: `Deshace ${cref.id}`, existiaAntes: actual.exists, antes: datosActuales, deshecho: false,
        });
    });
    const s = await db.doc(ruta).get();
    await nuevoCambio.update({ firmaDespues: firma(s.exists ? s.data() : null) });
    return { ruta, restaurado: true, existe: s.exists, cambioId: nuevoCambio.id };
}

// ── Servidor MCP ───────────────────────────────────────────────────────────

const FILTRO = z.object({
    campo: z.string(),
    operador: z.enum(["==", "!=", "<", "<=", ">", ">=", "in", "not-in", "array-contains", "array-contains-any"]),
    valor: z.any(),
    tipo: z.enum(["fecha"]).optional().describe("'fecha' convierte un valor ISO 8601 en Timestamp antes de filtrar"),
});

function crearServidor(contexto = {}) {
    const h = (nombre, fn) => herramienta(nombre, fn, contexto);
    const db = admin.firestore();
    const server = new McpServer({ name: "gk-kroma-firestore", version: "2.0.0" });
    const lectura = (nombre, cfg, cb) =>
        server.registerTool(nombre, { ...cfg, annotations: { readOnlyHint: true, openWorldHint: false } }, cb);
    const escritura = (nombre, cfg, cb, destructiva = false) =>
        server.registerTool(nombre, { ...cfg, annotations: { readOnlyHint: false, destructiveHint: destructiva, openWorldHint: false } }, cb);

    lectura("listar_colecciones", {
        description: "Lista las colecciones raíz de Firestore (GK y Kroma comparten el proyecto). Con `rutaDocumento` lista las subcolecciones de ese documento.",
        inputSchema: { rutaDocumento: z.string().optional().describe("p. ej. users_metadata/abc123") },
    }, h("listar_colecciones", async ({ rutaDocumento }) => {
        if (rutaDocumento && rutaSecreta(rutaDocumento)) throw new Error("Ruta no disponible.");
        const cols = rutaDocumento ? await db.doc(rutaDocumento).listCollections() : await db.listCollections();
        const lista = cols.map(c => ({ id: c.id, ruta: c.path, ...(COLECCIONES_SECRETAS.has(c.id) ? { nota: "secreta: no se lee" } : {}) }))
            .sort((a, b) => a.id.localeCompare(b.id));
        return { salida: { colecciones: lista }, documentos: 0 };
    }));

    lectura("esquema_coleccion", {
        description: "Lee una muestra de documentos y devuelve los campos encontrados, su tipo y un valor de ejemplo.",
        inputSchema: {
            coleccion: z.string().describe("Nombre o ruta de la colección (p. ej. kroma_despachos o users_metadata/abc/tokens)"),
            muestra: z.number().int().min(1).max(200).optional().default(20),
        },
    }, h("esquema_coleccion", async ({ coleccion, muestra = 20 }) => {
        if (rutaSecreta(coleccion)) throw new Error("Colección no disponible.");
        const snap = await db.collection(coleccion).limit(muestra).get();
        const campos = {};
        const redactados = new Set();
        const recorrer = (obj, prefijo) => {
            for (const [k, v] of Object.entries(obj || {})) {
                const nombre = prefijo ? `${prefijo}.${k}` : k;
                const c = campos[nombre] || (campos[nombre] = { tipos: new Set(), presenteEn: 0, ejemplo: undefined });
                c.tipos.add(tipoDe(v));
                c.presenteEn++;
                if (c.ejemplo === undefined && v !== null) {
                    const ej = limpiar(v, k, redactados);
                    const txt = JSON.stringify(ej);
                    c.ejemplo = txt && txt.length > 300 ? `${txt.slice(0, 300)}…` : ej;
                }
                if (tipoDe(v) === "mapa" && !PATRON_SENSIBLE.test(k)) recorrer(v, nombre);
            }
        };
        snap.docs.forEach(d => recorrer(d.data(), ""));
        const salida = {
            coleccion, documentosLeidos: snap.size,
            campos: Object.fromEntries(Object.entries(campos).sort(([a], [b]) => a.localeCompare(b))
                .map(([k, c]) => [k, { tipos: [...c.tipos], presenteEn: c.presenteEn, ejemplo: c.ejemplo }])),
            redactados: [...redactados],
        };
        return { salida, documentos: snap.size };
    }));

    lectura("contar", {
        description: "Cuenta los documentos de una colección (agregación count() de Firestore), con filtros opcionales.",
        inputSchema: {
            coleccion: z.string(),
            filtros: z.array(FILTRO).optional(),
            grupo: z.boolean().optional().describe("true = collectionGroup (todas las colecciones con ese nombre)"),
        },
    }, h("contar", async ({ coleccion, filtros, grupo }) => {
        if (rutaSecreta(coleccion)) throw new Error("Colección no disponible.");
        const base = grupo ? db.collectionGroup(coleccion) : db.collection(coleccion);
        const agg = await aplicarFiltros(base, filtros).count().get();
        return { salida: { coleccion, grupo: !!grupo, total: agg.data().count }, documentos: 0 };
    }));

    lectura("consultar_coleccion", {
        description: "Consulta documentos con filtros, orden y paginación. Devuelve {id, ruta, datos} y el `cursor` siguiente (ruta del último documento).",
        inputSchema: {
            coleccion: z.string(),
            filtros: z.array(FILTRO).optional(),
            ordenarPor: z.string().optional(),
            direccion: z.enum(["asc", "desc"]).optional().default("asc"),
            limite: z.number().int().min(1).max(LIMITE_MAX).optional().default(100),
            cursor: z.string().optional().describe("Ruta del último documento devuelto en la página anterior"),
            grupo: z.boolean().optional().describe("true = collectionGroup"),
        },
    }, h("consultar_coleccion", async ({ coleccion, filtros, ordenarPor, direccion = "asc", limite = 100, cursor, grupo }) => {
        if (rutaSecreta(coleccion)) throw new Error("Colección no disponible.");
        let q = aplicarFiltros(grupo ? db.collectionGroup(coleccion) : db.collection(coleccion), filtros);
        if (ordenarPor) q = q.orderBy(ordenarPor, direccion);
        if (cursor) {
            const ruta = cursor.includes("/") ? cursor : `${coleccion}/${cursor}`;
            const ult = await db.doc(ruta).get();
            if (!ult.exists) throw new Error("El cursor no corresponde a un documento existente.");
            q = q.startAfter(ult);
        }
        const snap = await q.limit(limite).get();
        const redactados = new Set();
        let docs = snap.docs.filter(d => !rutaSecreta(d.ref.path)).map(d => docSalida(d, redactados));
        let truncado = false;
        const medir = () => Buffer.byteLength(JSON.stringify(docs));
        while (docs.length > 1 && medir() > TAM_MAX) { docs = docs.slice(0, Math.max(1, Math.floor(docs.length * 0.8))); truncado = true; }
        const hayMas = truncado || snap.size === limite;
        const salida = {
            coleccion, grupo: !!grupo, devueltos: docs.length,
            cursor: hayMas && docs.length ? docs[docs.length - 1].ruta : null,
            ...(truncado ? { aviso: "Respuesta recortada a ~200 KB: sigue con `cursor` o usa un `limite` menor." } : {}),
            ...(redactados.size ? { redactados: [...redactados] } : {}),
            documentos: docs,
        };
        return { salida, documentos: docs.length };
    }));

    lectura("leer_documento", {
        description: "Lee un documento por su ruta completa, p. ej. kroma_despachos/abc123.",
        inputSchema: { ruta: z.string() },
    }, h("leer_documento", async ({ ruta }) => {
        if (rutaSecreta(ruta)) throw new Error("Documento no disponible.");
        const snap = await db.doc(ruta).get();
        if (!snap.exists) return { salida: { ruta, existe: false }, documentos: 0 };
        const redactados = new Set();
        const salida = { existe: true, ...docSalida(snap, redactados), ...(redactados.size ? { redactados: [...redactados] } : {}) };
        let txt = JSON.stringify(salida);
        if (Buffer.byteLength(txt) > TAM_MAX) {
            return { salida: { ruta, existe: true, aviso: "Documento mayor a ~200 KB: usa esquema_coleccion o consulta campos concretos.", vista: txt.slice(0, TAM_MAX) }, documentos: 1 };
        }
        return { salida, documentos: 1 };
    }));

    lectura("listar_usuarios", {
        description: "Usuarios de Firebase Auth: uid, email, displayName, fecha de creación, último acceso y custom claims (rol).",
        inputSchema: {
            limite: z.number().int().min(1).max(1000).optional().default(100),
            cursor: z.string().optional().describe("Token de página devuelto en la llamada anterior"),
        },
    }, h("listar_usuarios", async ({ limite = 100, cursor }) => {
        const r = await admin.auth().listUsers(limite, cursor || undefined);
        const usuarios = r.users.map(u => ({
            uid: u.uid,
            email: u.email || null,
            displayName: u.displayName || null,
            creado: u.metadata?.creationTime ? new Date(u.metadata.creationTime).toISOString() : null,
            ultimoAcceso: u.metadata?.lastSignInTime ? new Date(u.metadata.lastSignInTime).toISOString() : null,
            claims: u.customClaims ? limpiar(u.customClaims) : {},
        }));
        return { salida: { devueltos: usuarios.length, cursor: r.pageToken || null, usuarios }, documentos: usuarios.length };
    }));

    // ── Escritura (con copia previa y deshacer) ────────────────────────────
    const AYUDA_VALORES = "Valores especiales: {\"$fecha\":\"2026-10-05T12:00:00-04:00\"} (Timestamp), {\"$ahora\":true}, {\"$ref\":\"coleccion/id\"}, {\"$geo\":[lat,lng]}, {\"$incrementar\":n}, {\"$agregarALista\":[…]}, {\"$quitarDeLista\":[…]}. Un texto con forma de fecha se guarda como TEXTO, no como fecha. Los marcadores \"[redactado]\" e \"[imagen base64, N KB]\" conservan el valor real. Campos sensibles (contraseñas, PIN, tokens) y colecciones secretas no se escriben.";
    const MOTIVO = z.string().max(300).optional().describe("Por qué se hace el cambio (queda en mcp_cambios)");
    const resultado = (cambios) => ({
        salida: { aplicado: true, cambios, nota: "Cada cambio se puede revertir con deshacer_cambio(cambioId)." },
        documentos: cambios.length,
    });

    escritura("crear_documento", {
        description: `Crea un documento nuevo. Sin \`id\` se genera uno. Falla si ya existe. ${AYUDA_VALORES}`,
        inputSchema: {
            coleccion: z.string().describe("Ruta de la colección, p. ej. kroma_suppliers o users_metadata/abc/notas"),
            id: z.string().optional(),
            datos: z.record(z.any()),
            motivo: MOTIVO,
        },
    }, h("crear_documento", async ({ coleccion, id, datos, motivo }) => {
        const col = validarRutaEscritura(coleccion, { esDocumento: false });
        const docId = id || admin.firestore().collection(col).doc().id;
        return resultado(await aplicarOperaciones([{ accion: "crear", ruta: `${col}/${docId}`, datos }], { motivo }));
    }));

    escritura("actualizar_documento", {
        description: `Edita un documento existente. modo "combinar" (por defecto) cambia SOLO los campos enviados; las claves con punto ("a.b") editan un campo anidado y {"$borrar":true} elimina un campo. modo "reemplazar" deja el documento EXACTAMENTE como \`datos\` (conserva los campos sensibles que no ves). En los datos de negocio, la regla del proyecto es dar de baja con active:false en vez de borrar. ${AYUDA_VALORES}`,
        inputSchema: {
            ruta: z.string(),
            datos: z.record(z.any()),
            modo: z.enum(["combinar", "reemplazar"]).optional().default("combinar"),
            motivo: MOTIVO,
        },
    }, h("actualizar_documento", async ({ ruta, datos, modo = "combinar", motivo }) =>
        resultado(await aplicarOperaciones([{ accion: modo === "reemplazar" ? "reemplazar" : "actualizar", ruta, datos }], { motivo }))));

    escritura("borrar_documento", {
        description: "Borra un documento (sus subcolecciones NO se borran). Antes guarda una copia exacta: se recupera con deshacer_cambio. Para datos de negocio, prefiere actualizar con active:false (regla del proyecto: soft-delete).",
        inputSchema: { ruta: z.string(), motivo: MOTIVO },
    }, h("borrar_documento", async ({ ruta, motivo }) =>
        resultado(await aplicarOperaciones([{ accion: "borrar", ruta }], { motivo }))), true);

    escritura("escribir_lote", {
        description: `Hasta ${MAX_OPERACIONES} operaciones en UNA transacción: se aplican todas o ninguna. Cada una es {accion: "crear"|"actualizar"|"reemplazar"|"borrar", ruta: "coleccion/id", datos}. "actualizar" combina como actualizar_documento. Cada documento queda con su copia previa. ${AYUDA_VALORES}`,
        inputSchema: {
            operaciones: z.array(z.object({
                accion: z.enum(["crear", "actualizar", "reemplazar", "borrar"]),
                ruta: z.string(),
                datos: z.record(z.any()).optional(),
            })).min(1).max(MAX_OPERACIONES),
            motivo: MOTIVO,
        },
    }, h("escribir_lote", async ({ operaciones, motivo }) =>
        resultado(await aplicarOperaciones(operaciones, { motivo }))), true);

    escritura("deshacer_cambio", {
        description: "Devuelve un documento a como estaba antes de un cambio hecho por este conector (el `cambioId` lo devuelve cada escritura; el historial está en la colección mcp_cambios). Si el documento cambió después por otra vía, se detiene y avisa; forzar=true lo restaura igual. Deshacer también queda registrado y se puede deshacer.",
        inputSchema: { cambioId: z.string(), forzar: z.boolean().optional().default(false) },
    }, h("deshacer_cambio", async ({ cambioId, forzar = false }) => {
        const r = await deshacer(cambioId, forzar);
        return { salida: r, documentos: 1 };
    }));

    return server;
}

// ── Función HTTP ───────────────────────────────────────────────────────────

exports.mcp = onRequest({
    region: "us-central1",
    memory: "512MiB",
    timeoutSeconds: 300,
    // Una instancia siempre encendida: sin ella, la primera llamada tras un rato
    // quieto paga el arranque en frío (cargar el SDK y Firebase Admin, varios
    // segundos) y claude.ai puede darla por fallida.
    minInstances: 1,
    invoker: "public",
    cors: false,
}, async (req, res) => {
    const ruta = String(req.path || "/").replace(/\/+$/, "") || "/";

    // Diagnóstico público (no exige clave y no revela nada usable): dice si la
    // clave está configurada, una HUELLA de ella (8 caracteres de su SHA-256,
    // irreversible) y los últimos rechazos con su motivo. Sirve para saber, desde
    // el navegador, si la clave que se pegó en claude.ai es la que tiene el
    // servidor, sin tener que mostrar ninguna de las dos.
    if (ruta === "/estado" && req.method === "GET") {
        const esperada = claveEsperada();
        let rechazos = [];
        try {
            const snap = await admin.firestore().collection("mcp_rechazos").orderBy("fecha", "desc").limit(10).get();
            rechazos = snap.docs.map(d => limpiar(d.data()));
        } catch (e) { rechazos = [{ error: "no se pudieron leer" }]; }
        res.status(200).json({
            claveConfigurada: esperada.length >= 40,
            huellaClaveServidor: esperada ? huella(esperada) : null,
            ultimosRechazos: rechazos,
        });
        return;
    }
    // Cualquier otra ruta (p. ej. /.well-known/oauth-*) no existe: 404 ANTES de
    // pedir clave. Si respondiera 401, claude.ai creería que el conector usa
    // OAuth e intentaría registrarse, que es el error "No se pudo registrar con
    // el servicio de inicio de sesión".
    if (ruta !== "/") { res.status(404).send("Not found"); return; }
    // Sin estado: no hay sesiones que abrir (GET/SSE) ni cerrar (DELETE). Va
    // antes de la clave por la misma razón: un sondeo GET no debe ver un 401.
    if (req.method !== "POST") {
        res.status(405).set("Allow", "POST").json({ jsonrpc: "2.0", error: { code: -32000, message: "Method not allowed." }, id: null });
        return;
    }

    // La clave llega SOLO por el encabezado X-API-Key (en la URL quedaba a la
    // vista en la configuración del conector y en los registros de Cloud Run).
    //
    // NUNCA se responde 401 aquí. claude.ai, al recibir un 401, da el conector
    // por caído ("needs_reconnect") o intenta OAuth, y hay que abrir un chat
    // nuevo. Algunas de sus llamadas de fondo (iniciar, listar herramientas,
    // sondeos) a veces llegan SIN el encabezado. Por eso la conexión se atiende
    // siempre (initialize, tools/list, ping) y la clave se exige en cada
    // HERRAMIENTA: sin clave válida no se lee ni se escribe nada, se devuelve el
    // motivo y queda anotado en `mcp_rechazos`.
    const recibida = req.get("x-api-key") || "";
    const esperada = claveEsperada();
    const autenticado = esperada.length >= 40 && claveValida(recibida, esperada);
    const metodos = (Array.isArray(req.body) ? req.body : [req.body]).map(m => m?.method).filter(Boolean);
    const rechazo = autenticado ? null : {
        motivo: esperada.length < 40 ? "servidor_sin_clave"
            : !recibida ? (typeof req.query?.key === "string" ? "clave_en_url_ya_no_se_acepta" : "sin_encabezado")
            : "clave_incorrecta",
        metodo: metodos.join(",").slice(0, 80) || null,
        huellaRecibida: recibida ? huella(recibida) : null,
        largoRecibido: recibida.length,
        cliente: String(req.get("user-agent") || "").slice(0, 80),
    };
    // Las llamadas a herramientas sin clave se anotan dentro de `herramienta`
    // (con su nombre); el resto de lo que llega sin clave, aquí.
    if (rechazo && !metodos.includes("tools/call")) await registrarRechazo(rechazo);
    const server = crearServidor({ via: autenticado ? "encabezado" : null, autenticado, rechazo });
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
    res.on("close", () => { transport.close(); server.close(); });
    try {
        await server.connect(transport);
        await transport.handleRequest(req, res, req.body);
    } catch (e) {
        console.error("MCP:", e);
        if (!res.headersSent) res.status(500).json({ jsonrpc: "2.0", error: { code: -32603, message: "Error interno." }, id: null });
    }
});

// Para pruebas locales.
exports._internos = { huella, limpiar, rutaSecreta, PATRON_SENSIBLE, crearServidor, claveValida, firma, aplicarOperaciones, deshacer };
