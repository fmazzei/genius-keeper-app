// RUTA: functions/handlers/reports.js
// Generación y envío automático de reportes diarios, semanales y mensuales por email.

const { onSchedule } = require("firebase-functions/v2/scheduler");
const { onCall }     = require("firebase-functions/v2/https");
const { logger }     = require("firebase-functions");
const admin          = require("firebase-admin");
const nodemailer     = require("nodemailer");

// ── Config helpers ─────────────────────────────────────────────────────────────

async function getSmtpTransporter() {
    const snap = await admin.firestore().doc("settings/smtpConfig").get();
    if (!snap.exists()) throw new Error("SMTP no configurado en settings/smtpConfig");
    const c = snap.data();
    return {
        transporter: nodemailer.createTransport({
            host: c.host, port: c.port, secure: c.secure || false,
            auth: { user: c.user, pass: c.password },
        }),
        from: `"${c.fromName || 'Genius Keeper'}" <${c.user}>`,
    };
}

async function getReportsConfig() {
    const snap = await admin.firestore().doc("settings/reportsConfig").get();
    return snap.exists() ? snap.data() : null;
}

async function getActiveRecipients(config) {
    return (config?.recipients || []).filter(r => r.enabled !== false);
}

// ── Data helpers ───────────────────────────────────────────────────────────────

async function getVisitReports(start, end) {
    const snap = await admin.firestore()
        .collection("visit_reports")
        .where("createdAt", ">=", admin.firestore.Timestamp.fromDate(start))
        .where("createdAt", "<",  admin.firestore.Timestamp.fromDate(end))
        .orderBy("createdAt", "desc")
        .get();
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

// Meta general de la empresa para el reporte mensual: el número fijado en
// settings/appConfig.metaVentasGeneral; si es 0, se aproxima con la suma de las
// metas de los vendedores activos (misma regla que Ventas / Rendimiento).
async function getSalesGoal() {
    const db = admin.firestore();
    const cfg = await db.doc("settings/appConfig").get();
    const manual = Number(cfg.data()?.metaVentasGeneral) || 0;
    if (manual > 0) return manual;

    const vends = await db.collection("users_metadata").where("role", "==", "vendedor").get();
    let sum = 0;
    vends.forEach((d) => {
        const v = d.data();
        if (v.active === false) return;
        sum += Number(v.metaMensual ?? v.commissionConfig?.metaMensual ?? 0) || 0;
    });
    return sum;
}

function fmtDate(d) {
    return d.toLocaleDateString("es-VE", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
}
function fmtDateShort(d) {
    return d.toLocaleDateString("es-VE", { day: "numeric", month: "long", year: "numeric" });
}
function daysUntil(dateStr) {
    const today = new Date(); today.setHours(0, 0, 0, 0);
    return Math.ceil((new Date(dateStr + "T00:00:00") - today) / 86400000);
}

// ── HTML base styles ───────────────────────────────────────────────────────────

function baseCSS() {
    return `
        *{box-sizing:border-box;margin:0;padding:0}
        body{font-family:'Segoe UI',Arial,sans-serif;background:#f1f5f9;color:#1e293b;padding:20px}
        .wrap{max-width:660px;margin:0 auto;background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,.10)}
        .hdr{background:linear-gradient(135deg,#0D2B4C 0%,#1a4480 100%);color:#fff;padding:32px 36px}
        .hdr h1{font-size:22px;font-weight:800;margin-bottom:4px}
        .hdr p{opacity:.7;font-size:13px}
        .hdr .chip{display:inline-block;background:#F5C100;color:#1e293b;font-size:12px;font-weight:700;padding:3px 12px;border-radius:20px;margin-top:10px}
        .sec{padding:24px 36px;border-bottom:1px solid #e2e8f0}
        .sec:last-of-type{border-bottom:none}
        .sec-title{font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:#0D2B4C;margin-bottom:14px}
        .kpis{display:grid;grid-template-columns:repeat(3,1fr);gap:10px}
        .kpi{background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;padding:14px;text-align:center}
        .kpi .v{font-size:26px;font-weight:800;color:#0D2B4C;line-height:1}
        .kpi .l{font-size:11px;color:#64748b;text-transform:uppercase;margin-top:4px}
        table{width:100%;border-collapse:collapse;font-size:13px}
        th{background:#f8fafc;text-align:left;padding:8px 10px;font-size:10px;text-transform:uppercase;color:#94a3b8;font-weight:700;border-bottom:1px solid #e2e8f0}
        td{padding:8px 10px;border-bottom:1px solid #f1f5f9;vertical-align:middle}
        tr:last-child td{border-bottom:none}
        .tag{display:inline-block;padding:2px 8px;border-radius:20px;font-size:11px;font-weight:700}
        .red{background:#fee2e2;color:#b91c1c} .amber{background:#fef3c7;color:#92400e}
        .green{background:#dcfce7;color:#166534} .blue{background:#dbeafe;color:#1e40af}
        .alert-banner{background:#fff7ed;border-left:4px solid #f59e0b;padding:12px 16px;border-radius:0 8px 8px 0;margin:10px 0;font-size:13px}
        .progress-wrap{height:10px;background:#e2e8f0;border-radius:5px;overflow:hidden;margin:8px 0}
        .progress-bar{height:10px;border-radius:5px;transition:width .5s}
        .compare-delta-up{color:#16a34a;font-weight:700} .compare-delta-down{color:#dc2626;font-weight:700}
        .footer{background:#0D2B4C;color:rgba(255,255,255,.45);font-size:11px;text-align:center;padding:18px}
        @media(max-width:480px){.kpis{grid-template-columns:repeat(2,1fr)}.hdr,.sec{padding:20px 18px}}
    `;
}

function htmlWrap(headerContent, sections, timestamp) {
    return `<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8">
    <meta name="viewport" content="width=device-width,initial-scale=1">
    <style>${baseCSS()}</style></head><body>
    <div class="wrap">
        <div class="hdr">${headerContent}</div>
        ${sections}
        <div class="footer">Generado automáticamente por Genius Keeper &middot; ${timestamp}</div>
    </div></body></html>`;
}

// ── Daily report ───────────────────────────────────────────────────────────────

function buildDailyHTML(reports, dateLabel) {
    const totalVisits = reports.length;
    const stockouts   = reports.filter(r => r.stockout).length;
    const totalUnits  = reports.reduce((s, r) => s + (r.orderQuantity || 0), 0);

    const rows = reports.map(r => {
        const time = r.createdAt?.toDate
            ? r.createdAt.toDate().toLocaleTimeString("es-VE", { hour: "2-digit", minute: "2-digit" })
            : "–";
        const tag = r.stockout
            ? '<span class="tag red">Quiebre</span>'
            : '<span class="tag green">OK</span>';
        return `<tr>
            <td>${r.userName || "–"}</td>
            <td>${r.posName || "–"}</td>
            <td>${r.posZone || "–"}</td>
            <td>${time}</td>
            <td>${tag}</td>
            <td style="text-align:right;font-weight:700">${r.orderQuantity || 0}</td>
        </tr>`;
    }).join("");

    const noData = `<div style="text-align:center;padding:32px;color:#94a3b8">
        <p style="font-size:28px">📋</p>
        <p style="margin-top:8px">No se registraron visitas en este período.</p></div>`;

    const sections = `
        <div class="sec">
            <div class="kpis">
                <div class="kpi"><div class="v">${totalVisits}</div><div class="l">Visitas</div></div>
                <div class="kpi"><div class="v">${totalUnits}</div><div class="l">Unid. Repuestas</div></div>
                <div class="kpi"><div class="v" style="color:${stockouts > 0 ? "#b91c1c" : "#16a34a"}">${stockouts}</div><div class="l">Quiebres</div></div>
            </div>
        </div>
        <div class="sec">
            <div class="sec-title">Detalle de Visitas</div>
            ${totalVisits > 0
                ? `<table><thead><tr><th>Reporter</th><th>PDV</th><th>Zona</th><th>Hora</th><th>Estado</th><th style="text-align:right">Unid.</th></tr></thead><tbody>${rows}</tbody></table>`
                : noData}
        </div>`;

    const header = `<h1>Reporte Diario de Campo</h1><p>Genius Keeper · Lacteoca</p><span class="chip">${dateLabel}</span>`;
    return htmlWrap(header, sections, new Date().toLocaleString("es-VE"));
}

// ── Weekly report ──────────────────────────────────────────────────────────────

function buildWeeklyHTML(reports, prevReports, dateLabel) {
    const totalVisits = reports.length;
    const prevVisits  = prevReports.length;
    const totalUnits  = reports.reduce((s, r) => s + (r.orderQuantity || 0), 0);
    const prevUnits   = prevReports.reduce((s, r) => s + (r.orderQuantity || 0), 0);
    const uniquePdvs  = new Set(reports.map(r => r.posId)).size;
    const stockouts   = reports.filter(r => r.stockout).length;
    const rotation    = (totalUnits / 7).toFixed(1);

    // POP
    const popReports = reports.filter(r => r.popStatus);
    const popOk  = popReports.filter(r => r.popStatus === "Exhibido correctamente").length;
    const popPct = popReports.length > 0 ? Math.round((popOk / popReports.length) * 100) : null;

    // Freshness alerts ≤ 15 days
    const latestByPdv = {};
    reports.forEach(r => {
        if (!latestByPdv[r.posId] || r.createdAt.toDate() > latestByPdv[r.posId].createdAt.toDate())
            latestByPdv[r.posId] = r;
    });
    const alerts = [];
    Object.values(latestByPdv).forEach(r => {
        (r.batches || []).forEach(b => {
            const d = daysUntil(b.expiryDate);
            if (d <= 15) alerts.push({ posName: r.posName, expiryDate: b.expiryDate, quantity: b.quantity, days: d });
        });
    });
    alerts.sort((a, b) => a.days - b.days);

    // Rotation by PDV
    const rotByPdv = {};
    reports.forEach(r => { rotByPdv[r.posName] = (rotByPdv[r.posName] || 0) + (r.orderQuantity || 0); });
    const rotRows = Object.entries(rotByPdv).sort((a, b) => b[1] - a[1]).map(([name, u]) =>
        `<tr><td>${name}</td><td style="text-align:right">${u}</td><td style="text-align:right">${(u / 7).toFixed(1)}</td></tr>`
    ).join("");

    const delta = (curr, prev) => {
        const d = curr - prev;
        return d === 0
            ? `<span style="color:#64748b">= sin cambio</span>`
            : `<span class="${d > 0 ? "compare-delta-up" : "compare-delta-down"}">${d > 0 ? "▲" : "▼"} ${Math.abs(d)}</span>`;
    };

    const sections = `
        <div class="sec">
            <div class="kpis">
                <div class="kpi"><div class="v">${totalVisits}</div><div class="l">Visitas</div></div>
                <div class="kpi"><div class="v">${uniquePdvs}</div><div class="l">PDVs Cubiertos</div></div>
                <div class="kpi"><div class="v">${rotation}</div><div class="l">Rotación unid/día</div></div>
            </div>
        </div>
        <div class="sec">
            <div class="sec-title">Comparativa vs Semana Anterior</div>
            <table>
                <thead><tr><th>Métrica</th><th>Esta semana</th><th>Sem. anterior</th><th>Variación</th></tr></thead>
                <tbody>
                    <tr><td>Visitas</td><td>${totalVisits}</td><td>${prevVisits}</td><td>${delta(totalVisits, prevVisits)}</td></tr>
                    <tr><td>Unidades Repuestas</td><td>${totalUnits}</td><td>${prevUnits}</td><td>${delta(totalUnits, prevUnits)}</td></tr>
                    <tr><td>Quiebres de Stock</td><td>${stockouts}</td><td>${prevReports.filter(r => r.stockout).length}</td><td>–</td></tr>
                </tbody>
            </table>
        </div>
        <div class="sec">
            <div class="sec-title">Rotación por PDV</div>
            <table>
                <thead><tr><th>Punto de Venta</th><th style="text-align:right">Unidades</th><th style="text-align:right">Unid/día</th></tr></thead>
                <tbody>${rotRows || '<tr><td colspan="3" style="text-align:center;color:#94a3b8;padding:16px">Sin datos esta semana</td></tr>'}</tbody>
            </table>
        </div>
        ${popPct !== null ? `
        <div class="sec">
            <div class="sec-title">Calidad Material POP · ${popPct}% Óptimo</div>
            <div class="progress-wrap"><div class="progress-bar" style="width:${popPct}%;background:${popPct > 75 ? "#22c55e" : "#f59e0b"}"></div></div>
            <p style="font-size:13px;color:#64748b;margin-top:6px">${popOk} de ${popReports.length} visitas con POP en estado óptimo.</p>
        </div>` : ""}
        ${alerts.length > 0 ? `
        <div class="sec">
            <div class="sec-title">⚠ Alertas de Frescura — Vencen en ≤ 15 Días</div>
            <div class="alert-banner" style="margin-bottom:12px">${alerts.length} lote(s) con riesgo de vencimiento requieren atención inmediata.</div>
            <table>
                <thead><tr><th>PDV</th><th>Fecha Vencimiento</th><th style="text-align:right">Unidades</th><th style="text-align:right">Días</th></tr></thead>
                <tbody>${alerts.map(a => `<tr>
                    <td>${a.posName}</td>
                    <td>${a.expiryDate}</td>
                    <td style="text-align:right">${a.quantity}</td>
                    <td style="text-align:right"><span class="tag ${a.days <= 7 ? "red" : "amber"}">${a.days}d</span></td>
                </tr>`).join("")}</tbody>
            </table>
        </div>` : ""}`;

    const header = `<h1>Reporte Semanal de Campo</h1><p>Genius Keeper · Lacteoca</p><span class="chip">${dateLabel}</span>`;
    return htmlWrap(header, sections, new Date().toLocaleString("es-VE"));
}

// ── Monthly report ─────────────────────────────────────────────────────────────

function buildMonthlyHTML(reports, prevReports, dateLabel, salesGoal) {
    const totalUnits  = reports.reduce((s, r) => s + (r.orderQuantity || 0), 0);
    const prevUnits   = prevReports.reduce((s, r) => s + (r.orderQuantity || 0), 0);
    const totalVisits = reports.length;
    const prevVisits  = prevReports.length;
    const uniquePdvs  = new Set(reports.map(r => r.posId)).size;
    const rotation    = (totalUnits / 30).toFixed(1);
    const goalPct     = salesGoal > 0 ? Math.min(100, Math.round((totalUnits / salesGoal) * 100)) : null;

    // POP
    const popReports = reports.filter(r => r.popStatus);
    const popOk  = popReports.filter(r => r.popStatus === "Exhibido correctamente").length;
    const popPct = popReports.length > 0 ? Math.round((popOk / popReports.length) * 100) : null;

    // Competition
    const allComp     = reports.flatMap(r => r.competition || []);
    const allEntrants = reports.flatMap(r => r.newEntrants || []);
    const tastings    = reports.filter(r => (r.competition || []).some(c => c.hasTasting === true)).length;

    const compCounts = {};
    allComp.forEach(c => { compCounts[c.product] = (compCounts[c.product] || 0) + 1; });
    const topComp = Object.entries(compCounts).sort((a, b) => b[1] - a[1]).slice(0, 5);

    const ourPrices  = reports.filter(r => Number(r.price) > 0).map(r => Number(r.price));
    const compPrices = allComp.filter(c => Number(c.price) > 0).map(c => Number(c.price));
    const avgOur  = ourPrices.length  > 0 ? (ourPrices.reduce((s, p) => s + p, 0)  / ourPrices.length).toFixed(2)  : null;
    const avgComp = compPrices.length > 0 ? (compPrices.reduce((s, p) => s + p, 0) / compPrices.length).toFixed(2) : null;

    const delta = (curr, prev) => {
        const d = curr - prev;
        return d === 0
            ? '<span style="color:#64748b">= sin cambio</span>'
            : `<span style="color:${d > 0 ? "#16a34a" : "#dc2626"};font-weight:700">${d > 0 ? "▲" : "▼"} ${Math.abs(d)}</span>`;
    };

    const sections = `
        <div class="sec">
            <div class="kpis">
                <div class="kpi"><div class="v">${totalVisits}</div><div class="l">Visitas</div></div>
                <div class="kpi"><div class="v">${uniquePdvs}</div><div class="l">PDVs</div></div>
                <div class="kpi"><div class="v">${rotation}</div><div class="l">Rotación unid/día</div></div>
            </div>
        </div>
        ${goalPct !== null ? `
        <div class="sec">
            <div class="sec-title">Meta de Facturación</div>
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">
                <span style="font-size:13px;color:#64748b">${totalUnits.toLocaleString()} / ${salesGoal.toLocaleString()} unidades</span>
                <span style="font-size:22px;font-weight:800;color:${goalPct >= 85 ? "#16a34a" : goalPct >= 60 ? "#d97706" : "#dc2626"}">${goalPct}%</span>
            </div>
            <div class="progress-wrap">
                <div class="progress-bar" style="width:${goalPct}%;background:${goalPct >= 85 ? "#22c55e" : goalPct >= 60 ? "#f59e0b" : "#ef4444"}"></div>
            </div>
        </div>` : ""}
        <div class="sec">
            <div class="sec-title">Comparativa vs Mes Anterior</div>
            <table>
                <thead><tr><th>Métrica</th><th>Este mes</th><th>Mes anterior</th><th>Variación</th></tr></thead>
                <tbody>
                    <tr><td>Visitas</td><td>${totalVisits}</td><td>${prevVisits}</td><td>${delta(totalVisits, prevVisits)}</td></tr>
                    <tr><td>Unidades Repuestas</td><td>${totalUnits}</td><td>${prevUnits}</td><td>${delta(totalUnits, prevUnits)}</td></tr>
                    <tr><td>PDVs Cubiertos</td><td>${uniquePdvs}</td><td>${new Set(prevReports.map(r => r.posId)).size}</td><td>–</td></tr>
                    ${popPct !== null ? `<tr><td>Calidad POP</td><td>${popPct}%</td><td>–</td><td>–</td></tr>` : ""}
                </tbody>
            </table>
        </div>
        <div class="sec">
            <div class="sec-title">Inteligencia Competitiva</div>
            <div class="kpis" style="margin-bottom:16px">
                <div class="kpi"><div class="v" style="font-size:20px">${allEntrants.length}</div><div class="l">Nuevos Entrantes</div></div>
                <div class="kpi"><div class="v" style="font-size:20px">${tastings}</div><div class="l">Degustaciones detectadas</div></div>
                <div class="kpi"><div class="v" style="font-size:14px;line-height:1.3">${avgOur && avgComp ? `Nuestro $${avgOur}<br>Comp. $${avgComp}` : "Sin datos"}</div><div class="l">PVP Promedio</div></div>
            </div>
            ${topComp.length > 0 ? `
            <div class="sec-title" style="margin-bottom:8px">Competidores más vistos</div>
            <table>
                <thead><tr><th>Producto</th><th style="text-align:right">Veces reportado</th></tr></thead>
                <tbody>${topComp.map(([p, c]) => `<tr><td>${p}</td><td style="text-align:right">${c}</td></tr>`).join("")}</tbody>
            </table>` : ""}
            ${allEntrants.length > 0 ? `
            <div class="sec-title" style="margin:16px 0 8px">Nuevos entrantes detectados</div>
            <table>
                <thead><tr><th>Marca</th><th>Presentación</th></tr></thead>
                <tbody>${allEntrants.slice(0, 6).map(e => `<tr><td>${e.brand || "–"}</td><td>${e.presentation || "–"}</td></tr>`).join("")}</tbody>
            </table>` : ""}
        </div>`;

    const header = `<h1>Reporte Mensual de Campo</h1><p>Genius Keeper · Lacteoca</p><span class="chip">${dateLabel}</span>`;
    return htmlWrap(header, sections, new Date().toLocaleString("es-VE"));
}

// ── Email dispatcher ───────────────────────────────────────────────────────────

async function dispatchReport(recipients, subject, html) {
    if (!recipients?.length) { logger.log("Sin destinatarios, omitiendo envío."); return; }
    let smtp;
    try { smtp = await getSmtpTransporter(); }
    catch (e) { logger.error("SMTP no disponible:", e.message); return; }

    for (const r of recipients) {
        try {
            await smtp.transporter.sendMail({ from: smtp.from, to: r.email, subject, html });
            logger.log(`✅ Reporte enviado a ${r.email}`);
        } catch (e) {
            logger.error(`❌ Error enviando a ${r.email}:`, e.message);
        }
    }
}

// ── Report builder by type ─────────────────────────────────────────────────────

async function buildAndSend(type, recipients) {
    const now = new Date();

    if (type === "daily") {
        const start = new Date(now); start.setDate(start.getDate() - 1); start.setHours(0, 0, 0, 0);
        const end   = new Date(now); end.setHours(0, 0, 0, 0);
        const reports = await getVisitReports(start, end);
        const label   = fmtDate(start);
        const html    = buildDailyHTML(reports, label);
        await dispatchReport(recipients, `📊 Reporte Diario · ${label}`, html);
        return { reportCount: reports.length };
    }

    if (type === "weekly") {
        const thisMonday = new Date(now); thisMonday.setHours(0, 0, 0, 0);
        const lastMonday = new Date(thisMonday); lastMonday.setDate(thisMonday.getDate() - 7);
        const prevMonday = new Date(lastMonday); prevMonday.setDate(lastMonday.getDate() - 7);
        const [reports, prevReports] = await Promise.all([
            getVisitReports(lastMonday, thisMonday),
            getVisitReports(prevMonday, lastMonday),
        ]);
        const label = `${fmtDateShort(lastMonday)} – ${fmtDateShort(new Date(thisMonday - 1))}`;
        const html  = buildWeeklyHTML(reports, prevReports, label);
        await dispatchReport(recipients, `📅 Reporte Semanal · ${label}`, html);
        return { reportCount: reports.length };
    }

    if (type === "monthly") {
        const firstThisMonth = new Date(now.getFullYear(), now.getMonth(), 1);
        const firstLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
        const firstPrevMonth = new Date(now.getFullYear(), now.getMonth() - 2, 1);
        const salesGoal = await getSalesGoal();
        const [reports, prevReports] = await Promise.all([
            getVisitReports(firstLastMonth, firstThisMonth),
            getVisitReports(firstPrevMonth, firstLastMonth),
        ]);
        const label = firstLastMonth.toLocaleDateString("es-VE", { month: "long", year: "numeric" });
        const html  = buildMonthlyHTML(reports, prevReports, label, salesGoal);
        await dispatchReport(recipients, `📈 Reporte Mensual · ${label}`, html);
        return { reportCount: reports.length };
    }

    throw new Error(`Tipo desconocido: ${type}`);
}

// ── Scheduled functions ────────────────────────────────────────────────────────

exports.sendDailyReport = onSchedule({
    schedule: "0 8 * * *",
    timeZone: "America/Caracas",
    region: "us-central1",
}, async () => {
    const config = await getReportsConfig();
    if (!config?.daily?.enabled) { logger.log("Reporte diario deshabilitado."); return; }
    const recipients = await getActiveRecipients(config);
    await buildAndSend("daily", recipients);
});

exports.sendWeeklyReport = onSchedule({
    schedule: "0 8 * * 1",
    timeZone: "America/Caracas",
    region: "us-central1",
}, async () => {
    const config = await getReportsConfig();
    if (!config?.weekly?.enabled) { logger.log("Reporte semanal deshabilitado."); return; }
    const recipients = await getActiveRecipients(config);
    await buildAndSend("weekly", recipients);
});

exports.sendMonthlyReport = onSchedule({
    schedule: "0 8 1 * *",
    timeZone: "America/Caracas",
    region: "us-central1",
}, async () => {
    const config = await getReportsConfig();
    if (!config?.monthly?.enabled) { logger.log("Reporte mensual deshabilitado."); return; }
    const recipients = await getActiveRecipients(config);
    await buildAndSend("monthly", recipients);
});

// ── Manual trigger (callable) ──────────────────────────────────────────────────

exports.sendManualReport = onCall({ region: "us-central1" }, async (request) => {
    if (!request.auth) throw new Error("No autorizado");

    const userSnap = await admin.firestore().doc(`users_metadata/${request.auth.uid}`).get();
    const role = userSnap.data()?.role;
    if (!["master", "sales_manager", "gerencia"].includes(role)) throw new Error("Permisos insuficientes");

    const { type, recipients: customRecipients } = request.data || {};
    if (!["daily", "weekly", "monthly"].includes(type)) throw new Error("Tipo inválido");

    const config     = await getReportsConfig();
    const recipients = customRecipients?.length
        ? customRecipients
        : await getActiveRecipients(config);

    const result = await buildAndSend(type, recipients);
    return { success: true, ...result, recipientCount: recipients.length };
});

// ── Tomar Pedido — save + email to ventas@lacteoca.com ────────────────────────

exports.sendPedidoEmail = onCall({ region: "us-central1" }, async (request) => {
    const { posId, posName, chain, cantidad, reporterId, reporterName } = request.data || {};
    if (!posId || !cantidad) throw new Error("Datos incompletos");

    // 1. Save to Firestore
    const docRef = await admin.firestore().collection("pedidos").add({
        posId,
        posName:      posName      || '',
        chain:        chain        || '',
        cantidad:     Number(cantidad),
        reporterId:   reporterId   || '',
        reporterName: reporterName || '',
        emailSent:    false,
        createdAt:    admin.firestore.FieldValue.serverTimestamp(),
    });

    // 2. Send email
    try {
        const { transporter, from } = await getSmtpTransporter();
        const fechaHora = new Date().toLocaleString("es-VE", {
            weekday: "long", day: "numeric", month: "long", year: "numeric",
            hour: "2-digit", minute: "2-digit",
        });
        await transporter.sendMail({
            from,
            to: "ventas@lacteoca.com",
            subject: `📦 Nuevo Pedido — ${reporterName} en ${posName}`,
            html: `
                <div style="font-family:sans-serif;max-width:480px;margin:auto;border:1px solid #e2e8f0;border-radius:12px;overflow:hidden;">
                    <div style="background:#0D2B4C;padding:24px;text-align:center;">
                        <h1 style="color:white;margin:0;font-size:22px;">Nuevo Pedido Verbal</h1>
                        <p style="color:rgba(255,255,255,0.6);margin:4px 0 0">Genius Keeper · Pedidos de Campo</p>
                    </div>
                    <div style="padding:24px;background:#f8fafc;">
                        <table style="width:100%;border-collapse:collapse;">
                            <tr><td style="padding:10px 0;color:#64748b;font-size:14px;">Mercaderista</td><td style="padding:10px 0;font-weight:700;color:#1e293b;">${reporterName}</td></tr>
                            <tr><td style="padding:10px 0;color:#64748b;font-size:14px;">Cliente</td><td style="padding:10px 0;font-weight:700;color:#1e293b;">${posName}${chain ? ' (' + chain + ')' : ''}</td></tr>
                            <tr><td style="padding:10px 0;color:#64748b;font-size:14px;">Cantidad</td><td style="padding:10px 0;font-weight:900;color:#0D2B4C;font-size:20px;">${cantidad} ${Number(cantidad) === 1 ? 'docena' : 'docenas'}</td></tr>
                            <tr><td style="padding:10px 0;color:#64748b;font-size:14px;">Fecha y Hora</td><td style="padding:10px 0;font-weight:600;color:#1e293b;">${fechaHora}</td></tr>
                        </table>
                    </div>
                </div>`,
        });
        await docRef.update({ emailSent: true });
        return { ok: true, id: docRef.id, emailSent: true };
    } catch (err) {
        logger.error("Error enviando email de pedido:", err);
        return { ok: true, id: docRef.id, emailSent: false };
    }
});
