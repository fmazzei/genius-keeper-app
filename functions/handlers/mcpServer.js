// RUTA: functions/handlers/mcpServer.js
//
// CONECTOR MCP DE SOLO LECTURA para GK y Kroma (comparten el proyecto Firebase).
// Claude (claude.ai) lo agrega como "conector personalizado" y puede consultar
// cualquier colección de Firestore y los usuarios de Firebase Auth.
//
// - Transporte Streamable HTTP SIN ESTADO: un servidor y un transporte nuevos
//   por solicitud (Cloud Functions no garantiza que dos solicitudes caigan en
//   la misma instancia).
// - Autenticación por clave (variable MCP_API_KEY): encabezado `X-API-Key`. claude.ai no deja poner
//   encabezados propios en un conector personalizado, así que también se acepta
//   en la URL (`?key=…`). Sin clave o con una incorrecta: 401, sin más detalle.
// - NO escribe en Firestore, salvo la bitácora `mcp_auditoria`.
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
// falta o está vacía, todo responde 401: falla cerrado.
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
            parametros: JSON.parse(JSON.stringify(parametros ?? {})),
            documentos: documentos ?? 0,
        });
    } catch (e) { /* la bitácora no puede tumbar la consulta */ }
}

/** Ejecuta una herramienta con auditoría y manejo de errores uniformes. */
function herramienta(nombre, fn, contexto = {}) {
    return async (args) => {
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
    const server = new McpServer({ name: "gk-kroma-firestore", version: "1.0.0" });

    server.registerTool("listar_colecciones", {
        description: "Lista las colecciones raíz de Firestore (GK y Kroma comparten el proyecto). Con `rutaDocumento` lista las subcolecciones de ese documento.",
        inputSchema: { rutaDocumento: z.string().optional().describe("p. ej. users_metadata/abc123") },
    }, h("listar_colecciones", async ({ rutaDocumento }) => {
        if (rutaDocumento && rutaSecreta(rutaDocumento)) throw new Error("Ruta no disponible.");
        const cols = rutaDocumento ? await db.doc(rutaDocumento).listCollections() : await db.listCollections();
        const lista = cols.map(c => ({ id: c.id, ruta: c.path, ...(COLECCIONES_SECRETAS.has(c.id) ? { nota: "secreta: no se lee" } : {}) }))
            .sort((a, b) => a.id.localeCompare(b.id));
        return { salida: { colecciones: lista }, documentos: 0 };
    }));

    server.registerTool("esquema_coleccion", {
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

    server.registerTool("contar", {
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

    server.registerTool("consultar_coleccion", {
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

    server.registerTool("leer_documento", {
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

    server.registerTool("listar_usuarios", {
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

    return server;
}

// ── Función HTTP ───────────────────────────────────────────────────────────

exports.mcp = onRequest({
    region: "us-central1",
    memory: "512MiB",
    timeoutSeconds: 120,
    invoker: "public",
    cors: false,
}, async (req, res) => {
    const porEncabezado = req.get("x-api-key") || "";
    const recibida = porEncabezado || (typeof req.query?.key === "string" ? req.query.key : "");
    const esperada = claveEsperada();
    if (esperada.length < 40 || !claveValida(recibida, esperada)) {
        res.status(401).send("Unauthorized");
        return;
    }
    // Sin estado: no hay sesiones que abrir (GET/SSE) ni cerrar (DELETE).
    if (req.method !== "POST") {
        res.status(405).set("Allow", "POST").json({ jsonrpc: "2.0", error: { code: -32000, message: "Method not allowed." }, id: null });
        return;
    }
    const server = crearServidor({ via: porEncabezado ? "encabezado" : "url" });
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
exports._internos = { limpiar, rutaSecreta, PATRON_SENSIBLE, crearServidor, claveValida };
