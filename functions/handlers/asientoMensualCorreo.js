// RUTA: functions/handlers/asientoMensualCorreo.js
//
// Correo del asiento mensual de inventario (sección 8). Funciones PURAS: arman
// el asunto, el HTML y el texto. asientoMensual.js las manda por SMTP.
//
// - correoAprobacion: el asiento quedó en Zoho en borrador. Dice el mes y la
//   referencia, las líneas del asiento, el inventario final de Kroma por
//   ubicación y presentación, cuánto queda de diferencia con Zoho después de
//   aprobarlo y el enlace al asiento.
// - correoAborto: el asiento NO se creó. Dice por qué y qué hacer.
// Lo lee administración: lenguaje de negocio, sin términos técnicos.

"use strict";

const { NOMBRE } = require("./asientoMensualReglas");

const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
const UBICACIONES = [
    ["planta", "Planta (cava)"],
    ["transito", "En camino a Caracas"],
    ["frimaca", "Caracas · almacén ACC"],
    ["ruta", "Caracas · en ruta"],
];

function esc(s) {
    return String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
/** 1234.5 → "1.234,50" (formato venezolano, sin depender del ICU del servidor). */
function num(n, dec = 2) {
    const v = Number(n) || 0;
    const [ent, fr] = Math.abs(v).toFixed(dec).split(".");
    const miles = ent.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
    return `${v < 0 && Number(Math.abs(v).toFixed(dec)) !== 0 ? "−" : ""}${miles}${dec ? "," + fr : ""}`;
}
const usd = (n) => `$${num(n)}`;
function mesEnPalabras(mes) {
    const [y, m] = String(mes).split("-").map(Number);
    return `${MESES[(m || 1) - 1]} de ${y}`;
}
function fechaCorta(f) {
    const [y, m, d] = String(f || "").split("-");
    return d ? `${d}/${m}/${y}` : String(f || "");
}

/** Líneas del asiento con el concepto y la cuenta por separado. */
function filasAsiento(lineas = []) {
    return lineas.map(l => {
        const desc = String(l.description || "");
        const concepto = desc.includes(" · ") ? desc.split(" · ")[0] : desc;
        const cuenta = NOMBRE[String(l.account_id)] || (desc.includes(" · ") ? desc.split(" · ").slice(1).join(" · ") : String(l.account_id));
        const debe = l.debit_or_credit === "debit" ? Number(l.amount) || 0 : 0;
        const haber = l.debit_or_credit === "credit" ? Number(l.amount) || 0 : 0;
        return { concepto, cuenta, debe, haber };
    });
}

/** Inventario final por ubicación y presentación (del reporte diario del último día). */
function inventarioPorUbicacion(saldos = []) {
    const orden = new Map(UBICACIONES.map(([k], i) => [k, i]));
    const grupos = new Map();
    for (const s of saldos) {
        if (Math.abs(Number(s.cantidad) || 0) < 0.0005 && Math.abs(Number(s.valorCosto) || 0) < 0.005) continue;
        const u = s.ubicacion || "otra";
        const g = grupos.get(u) || { ubicacion: u, nombre: (UBICACIONES.find(x => x[0] === u) || [u, u])[1], filas: [], valor: 0 };
        g.filas.push({
            presentacion: s.presentacion || s.productoNombre || "Producto",
            cantidad: Number(s.cantidad) || 0,
            unidad: s.unidad === "kg" ? "kg" : "ud",
            valor: Number(s.valorCosto) || 0,
        });
        g.valor += Number(s.valorCosto) || 0;
        grupos.set(u, g);
    }
    const lista = [...grupos.values()].sort((a, b) => (orden.get(a.ubicacion) ?? 99) - (orden.get(b.ubicacion) ?? 99));
    for (const g of lista) { g.filas.sort((a, b) => a.presentacion.localeCompare(b.presentacion, "es")); g.valor = Math.round(g.valor * 100) / 100; }
    const total = Math.round(lista.reduce((t, g) => t + g.valor, 0) * 100) / 100;
    const hayNegativos = lista.some(g => g.filas.some(f => f.cantidad < -0.0005));
    return { grupos: lista, total, hayNegativos };
}

/** Diferencia con Zoho después de aprobar el asiento, en palabras. */
function lineaDiferencia(nombre, c) {
    if (!c) return { nombre, texto: "No se pudo leer el saldo en Zoho.", cuadra: false, c: null };
    const dif = Number(c.diferencia) || 0;
    const cuadra = Math.abs(dif) < 0.01;
    return {
        nombre, c, cuadra,
        texto: cuadra
            ? `Cuadra: Zoho queda en ${usd(c.zohoDespues)}, igual que Kroma.`
            : `Zoho queda en ${usd(c.zohoDespues)} y Kroma dice ${usd(c.kroma)}: ${dif > 0 ? "Zoho queda por encima" : "Zoho queda por debajo"} en ${usd(Math.abs(dif))}.`,
    };
}

const ESTILO = {
    cuerpo: "font-family:Arial,Helvetica,sans-serif;font-size:15px;color:#1f2937;line-height:1.5;max-width:720px",
    h2: "font-size:17px;margin:22px 0 8px;color:#0f172a",
    tabla: "border-collapse:collapse;width:100%;font-size:14px",
    th: "text-align:left;padding:6px 8px;border-bottom:2px solid #cbd5e1;background:#f1f5f9",
    thN: "text-align:right;padding:6px 8px;border-bottom:2px solid #cbd5e1;background:#f1f5f9",
    td: "padding:5px 8px;border-bottom:1px solid #e2e8f0",
    tdN: "padding:5px 8px;border-bottom:1px solid #e2e8f0;text-align:right;white-space:nowrap",
    total: "padding:6px 8px;font-weight:bold;text-align:right;border-top:2px solid #94a3b8;white-space:nowrap",
    boton: "display:inline-block;background:#15803d;color:#ffffff;text-decoration:none;padding:10px 18px;border-radius:6px;font-weight:bold",
    nota: "font-size:13px;color:#64748b",
};

/**
 * Correo de "asiento listo para aprobar".
 *  reg: el registro de kroma_inv_zoho/{mes} (con lineas, bloques, totales, control, avisos).
 *  inventario: { fecha, saldos } del reporte diario del último día del mes.
 *  url: enlace al asiento en Zoho. aprobacion: { estado: "enviado" | "sin_aprobaciones" | ... }.
 */
function correoAprobacion({ reg, inventario = {}, url = null, aprobacion = null } = {}) {
    const mes = mesEnPalabras(reg.mes);
    const filas = filasAsiento(reg.lineas);
    const inv = inventarioPorUbicacion(inventario.saldos || []);
    const pt = lineaDiferencia("Inventario de producto terminado", reg.control?.pt);
    const mp = lineaDiferencia("Inventario de materia prima", reg.control?.mp);
    const pendienteAprobar = aprobacion?.estado === "enviado";
    const asunto = `Inventario de ${mes}: asiento listo para aprobar (${reg.referencia})`;

    const intro = `Kroma dejó en Zoho Books el asiento de cierre de inventario de ${mes}, en borrador${pendienteAprobar ? " y enviado a aprobación" : ""}. `
        + `Referencia ${reg.referencia}, fecha ${fechaCorta(reg.fecha)}. Mientras no se apruebe no cambia ningún saldo.`;
    const notaBorrador = aprobacion && !pendienteAprobar
        ? "No se mandó a aprobación porque las aprobaciones de asientos todavía no están activas en Zoho. Para aprobarlo, ábrelo en Zoho y publícalo."
        : null;

    const h = [];
    h.push(`<div style="${ESTILO.cuerpo}">`);
    h.push(`<p>${esc(intro)}</p>`);
    if (notaBorrador) h.push(`<p><b>${esc(notaBorrador)}</b></p>`);
    if (url) h.push(`<p><a href="${esc(url)}" style="${ESTILO.boton}">Abrir el asiento en Zoho</a></p>`);

    // Qué registra
    h.push(`<h2 style="${ESTILO.h2}">Qué registra</h2><table style="${ESTILO.tabla}">`);
    for (const b of reg.bloques || []) {
        h.push(`<tr><td style="${ESTILO.td}">${esc(b.titulo)}</td><td style="${ESTILO.tdN}">${usd(Math.abs(Number(b.neto) || 0))}</td></tr>`);
    }
    h.push("</table>");

    // Líneas
    h.push(`<h2 style="${ESTILO.h2}">Las líneas del asiento</h2><table style="${ESTILO.tabla}">`);
    h.push(`<tr><th style="${ESTILO.th}">Concepto</th><th style="${ESTILO.th}">Cuenta</th><th style="${ESTILO.thN}">Debe</th><th style="${ESTILO.thN}">Haber</th></tr>`);
    for (const f of filas) {
        h.push(`<tr><td style="${ESTILO.td}">${esc(f.concepto)}</td><td style="${ESTILO.td}">${esc(f.cuenta)}</td>`
            + `<td style="${ESTILO.tdN}">${f.debe ? usd(f.debe) : ""}</td><td style="${ESTILO.tdN}">${f.haber ? usd(f.haber) : ""}</td></tr>`);
    }
    h.push(`<tr><td colspan="2" style="${ESTILO.total}">Total</td><td style="${ESTILO.total}">${usd(reg.totales?.debe)}</td><td style="${ESTILO.total}">${usd(reg.totales?.haber)}</td></tr></table>`);

    // Inventario final
    h.push(`<h2 style="${ESTILO.h2}">Inventario final según Kroma${inventario.fecha ? ` (al ${fechaCorta(inventario.fecha)})` : ""}</h2>`);
    if (!inv.grupos.length) h.push(`<p>No hay producto terminado en existencia.</p>`);
    else {
        h.push(`<table style="${ESTILO.tabla}"><tr><th style="${ESTILO.th}">Dónde</th><th style="${ESTILO.th}">Presentación</th><th style="${ESTILO.thN}">Cantidad</th><th style="${ESTILO.thN}">Valor a costo</th></tr>`);
        for (const g of inv.grupos) {
            g.filas.forEach((f, i) => {
                h.push(`<tr><td style="${ESTILO.td}">${i === 0 ? `<b>${esc(g.nombre)}</b>` : ""}</td><td style="${ESTILO.td}">${esc(f.presentacion)}</td>`
                    + `<td style="${ESTILO.tdN}">${num(f.cantidad, f.unidad === "kg" ? 2 : 0)} ${f.unidad}</td><td style="${ESTILO.tdN}">${usd(f.valor)}</td></tr>`);
            });
            h.push(`<tr><td colspan="3" style="${ESTILO.tdN}"><i>Subtotal ${esc(g.nombre)}</i></td><td style="${ESTILO.tdN}"><i>${usd(g.valor)}</i></td></tr>`);
        }
        h.push(`<tr><td colspan="3" style="${ESTILO.total}">Total producto terminado</td><td style="${ESTILO.total}">${usd(inv.total)}</td></tr></table>`);
        if (inv.hayNegativos) h.push(`<p style="${ESTILO.nota}">Una cantidad negativa en ruta es producto facturado que todavía no se anotó como retirado de ACC; se compensa con el conteo de ACC.</p>`);
    }
    if (reg.cuadreMP) {
        const leche = Number(reg.lecheEnProceso?.total) || 0;
        h.push(`<p>Materia prima según Kroma: <b>${usd(reg.cuadreMP.mpKromaFin)}</b>`
            + (leche ? ` (materiales ${usd(reg.cuadreMP.materialesKroma)} + leche en proceso ${usd(leche)})` : "") + ".</p>");
    }

    // Diferencia con Zoho
    h.push(`<h2 style="${ESTILO.h2}">Diferencia con Zoho después de aprobarlo</h2><ul>`);
    for (const x of [pt, mp]) h.push(`<li><b>${esc(x.nombre)}:</b> ${esc(x.texto)}</li>`);
    h.push("</ul>");

    if ((reg.avisos || []).length) {
        h.push(`<h2 style="${ESTILO.h2}">Para tener en cuenta</h2><ul>`);
        for (const a of reg.avisos) h.push(`<li>${esc(a)}</li>`);
        h.push("</ul>");
    }
    h.push(`<p style="${ESTILO.nota}">Si algo no cuadra, no lo apruebes: avísale a Francisco. Este correo lo manda Kroma solo, una vez por mes.</p>`);
    h.push("</div>");

    const t = [];
    t.push(intro, "");
    if (notaBorrador) t.push(notaBorrador, "");
    if (url) t.push(`Abrir el asiento en Zoho: ${url}`, "");
    t.push("Qué registra:");
    for (const b of reg.bloques || []) t.push(`  - ${b.titulo}: ${usd(Math.abs(Number(b.neto) || 0))}`);
    t.push("", "Las líneas del asiento:");
    for (const f of filas) t.push(`  - ${f.concepto} · ${f.cuenta}: ${f.debe ? "debe " + usd(f.debe) : "haber " + usd(f.haber)}`);
    t.push(`  Total: ${usd(reg.totales?.debe)}`, "", `Inventario final según Kroma: ${usd(inv.total)}`);
    for (const g of inv.grupos) t.push(`  - ${g.nombre}: ${usd(g.valor)}`);
    t.push("", "Diferencia con Zoho después de aprobarlo:", `  - ${pt.nombre}: ${pt.texto}`, `  - ${mp.nombre}: ${mp.texto}`);
    for (const a of reg.avisos || []) t.push(`  * ${a}`);

    return { asunto, html: h.join(""), texto: t.join("\n"), cuadra: pt.cuadra && mp.cuadra, inventario: inv };
}

/** Correo de "el asiento no se creó". */
function correoAborto({ reg } = {}) {
    const mes = mesEnPalabras(reg.mes);
    const asunto = `Inventario de ${mes}: el asiento no se creó`;
    const motivos = [...(reg.errores || [])];
    const controles = (reg.controlesFallidos || []).map(k => `Control ${k.n}${k.nombre ? ` (${k.nombre})` : ""} con diferencias el ${fechaCorta(k.fecha)}${k.nota ? `: ${k.nota}` : ""}`);
    const intro = `Kroma no creó en Zoho el asiento de cierre de inventario de ${mes} (${reg.referencia}). No hay nada que aprobar todavía.`;
    const cierre = "Kroma lo intenta otra vez cada noche. Cuando se corrija lo de arriba, llegará el correo para aprobarlo.";
    const h = [`<div style="${ESTILO.cuerpo}">`, `<p>${esc(intro)}</p>`, `<h2 style="${ESTILO.h2}">Por qué</h2><ul>`];
    for (const m of motivos) h.push(`<li>${esc(m)}</li>`);
    h.push("</ul>");
    if (controles.length) {
        h.push(`<h2 style="${ESTILO.h2}">Controles diarios con diferencias</h2><ul>`);
        for (const c of controles) h.push(`<li>${esc(c)}</li>`);
        h.push("</ul>");
    }
    h.push(`<p>${esc(cierre)}</p></div>`);
    const texto = [intro, "", "Por qué:", ...motivos.map(m => `  - ${m}`),
        ...(controles.length ? ["", "Controles diarios con diferencias:", ...controles.map(c => `  - ${c}`)] : []), "", cierre].join("\n");
    return { asunto, html: h.join(""), texto };
}

/** Firma de los motivos de un aborto: el mismo aborto no se manda dos veces. */
function firmaAborto(reg) {
    const s = JSON.stringify([...(reg.errores || [])].sort().concat((reg.controlesFallidos || []).map(k => `${k.fecha}|${k.n}`).sort()));
    let h = 2166136261;
    for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
    return h.toString(16);
}

module.exports = { correoAprobacion, correoAborto, firmaAborto, filasAsiento, inventarioPorUbicacion, mesEnPalabras, num };
