// RUTA: functions/handlers/triggers.js

const functions = require("firebase-functions");
const admin = require("firebase-admin");

// --- Helper de Notificaciones ---
const sendNotificationToUser = async (userId, notificationPayload, dataPayload) => {
    if (!userId) return;

    // 1. Crear notificación en la base de datos (para el centro de notificaciones interno)
    await admin.firestore().collection("notifications").add({
        userId,
        title: notificationPayload.title,
        body: notificationPayload.body,
        tipo: dataPayload.tipo || 'general',
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        read: false,
        link: dataPayload.link || ''
    });

    // 2. Enviar notificación push
    const tokensRef = admin.firestore().collection("users_metadata").doc(userId).collection("tokens");
    const tokensSnap = await tokensRef.get();
    if (tokensSnap.empty) {
        console.log(`No se encontraron tokens para el usuario ${userId}`);
        return;
    }

    const tokens = tokensSnap.docs.map(doc => doc.id);
    const payload = { 
        notification: notificationPayload, 
        data: dataPayload 
    };

    await admin.messaging().sendEachForMulticast({ tokens, ...payload });
    console.log(`Notificación push enviada a ${tokens.length} dispositivo(s) del usuario ${userId}`);
};

// --- Helpers de configuración y enrutamiento de notificaciones ---

const getNotifConfig = async () => {
    try {
        const snap = await admin.firestore().doc("settings/notificationsConfig").get();
        return snap.exists ? snap.data() : {};
    } catch { return {}; }
};

const sendKromaNotif = async ({ tipo, mensaje, logId, lote, productoNombre, destinatarios }) => {
    await admin.firestore().collection("kroma_notifications").add({
        tipo,
        mensaje,
        logId: logId || null,
        lote: lote || null,
        productoNombre: productoNombre || null,
        destinatarios: destinatarios || [],
        leidaPor: [],
        leida: false,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });
};

// Routes notification to GK push OR Kroma internal depending on destination roles
const notifyByDestinations = async (destinations, notifPayload, dataPayload) => {
    const db = admin.firestore();
    const GK_ROLES    = ["master", "sales_manager", "merchandiser"];
    const KROMA_ROLES = ["kroma_admin", "kroma_gerencial"];

    const gkDests    = destinations.filter(d => GK_ROLES.includes(d));
    const kromaDests = destinations.filter(d => KROMA_ROLES.includes(d));

    if (gkDests.length > 0) {
        try {
            const usersSnap = await db.collection("users_metadata").where("role", "in", gkDests).get();
            const active = usersSnap.docs.filter(d => d.data().active !== false);
            await Promise.all(active.map(d => sendNotificationToUser(d.id, notifPayload, dataPayload)));
        } catch (err) {
            functions.logger.error("notifyByDestinations GK error:", err);
        }
    }

    if (kromaDests.length > 0) {
        try {
            await sendKromaNotif({
                tipo: dataPayload.tipo || "general",
                mensaje: `${notifPayload.title}: ${notifPayload.body}`,
                destinatarios: kromaDests,
            });
        } catch (err) {
            functions.logger.error("notifyByDestinations Kroma error:", err);
        }
    }
};

// =========================================================================================
// ✅ INICIO DE NUEVAS FUNCIONES PARA EL PLANIFICADOR COLABORATIVO
// =========================================================================================

/**
 * El Sincronizador Automático (Cerebro Central).
 * Se activa cuando se escribe en cualquier agenda y mantiene la colección 'pdv_assignments'
 * actualizada para saber qué PDV está asignado a qué reporter.
 */
exports.onAgendaWrite = functions.firestore
    .document('agendas/{reporterId}')
    .onWrite(async (change, context) => {
        const { reporterId } = context.params;
        const db = admin.firestore();
        const batch = db.batch();

        let reporterName = 'Reporter';
        try {
            const reporterDoc = await db.doc(`reporters/${reporterId}`).get();
            if (reporterDoc.exists) {
                reporterName = reporterDoc.data().name;
            }
        } catch (error) {
            functions.logger.error(`No se pudo obtener el nombre para el reporterId: ${reporterId}`, error);
        }

        const getPdvIdsFromAgenda = (agendaData) => {
            if (!agendaData || !agendaData.days) return new Set();
            const allStops = Object.values(agendaData.days).flat();
            return new Set(allStops.map(stop => stop.id));
        };

        const beforeData = change.before.data();
        const afterData = change.after.data();

        const pdvIdsBefore = getPdvIdsFromAgenda(beforeData);
        const pdvIdsAfter = getPdvIdsFromAgenda(afterData);

        const removedPdvIds = new Set([...pdvIdsBefore].filter(id => !pdvIdsAfter.has(id)));
        if (removedPdvIds.size > 0) {
            functions.logger.log(`Detectados ${removedPdvIds.size} PDV eliminados de la agenda de ${reporterName}.`);
            removedPdvIds.forEach(pdvId => {
                const assignmentRef = db.doc(`pdv_assignments/${pdvId}`);
                batch.delete(assignmentRef);
            });
        }

        const addedPdvIds = new Set([...pdvIdsAfter].filter(id => !pdvIdsBefore.has(id)));
        if (addedPdvIds.size > 0) {
            functions.logger.log(`Detectados ${addedPdvIds.size} PDV añadidos a la agenda de ${reporterName}.`);
            addedPdvIds.forEach(pdvId => {
                let dayAssigned = 'desconocido';
                if (afterData && afterData.days) {
                    for (const [day, stops] of Object.entries(afterData.days)) {
                        if (stops.some(stop => stop.id === pdvId)) {
                            dayAssigned = day;
                            break;
                        }
                    }
                }
                const assignmentRef = db.doc(`pdv_assignments/${pdvId}`);
                batch.set(assignmentRef, {
                    reporterId: reporterId,
                    reporterName: reporterName,
                    day: dayAssigned,
                    assignedAt: admin.firestore.FieldValue.serverTimestamp()
                });
            });
        }
        
        if (removedPdvIds.size === 0 && addedPdvIds.size === 0) {
            functions.logger.log("onAgendaWrite: No se detectaron cambios en las asignaciones de PDV.");
            return null;
        }

        try {
            await batch.commit();
            functions.logger.log(`pdv_assignments actualizado correctamente para la agenda de ${reporterName}.`);
            return null;
        } catch (error) {
            functions.logger.error(`Error al actualizar pdv_assignments para el reporter ${reporterId}:`, error);
            return null;
        }
    });

/**
 * El Guardián de Limpieza.
 * Se activa al eliminar un reporter y limpia todos sus datos asociados.
 */
exports.onDeleteReporter = functions.firestore
    .document('reporters/{reporterId}')
    .onDelete(async (snap, context) => {
        const { reporterId } = context.params;
        const deletedReporterData = snap.data();
        const reporterName = deletedReporterData.name || 'desconocido';

        functions.logger.log(`Iniciando limpieza para el reporter eliminado: ${reporterName} (ID: ${reporterId})`);

        const db = admin.firestore();
        const batch = db.batch();

        const assignmentsQuery = db.collection('pdv_assignments').where('reporterId', '==', reporterId);
        
        try {
            const assignmentsSnapshot = await assignmentsQuery.get();
            if (!assignmentsSnapshot.empty) {
                functions.logger.log(`Encontrados ${assignmentsSnapshot.size} PDV asignados a ${reporterName}. Desasignando...`);
                assignmentsSnapshot.docs.forEach(doc => {
                    batch.delete(doc.ref);
                });
            }

            const agendaRef = db.doc(`agendas/${reporterId}`);
            batch.delete(agendaRef);
            functions.logger.log(`Agenda para ${reporterName} marcada para eliminación.`);

            await batch.commit();
            
            functions.logger.log(`Limpieza completada exitosamente para el reporter ${reporterName}.`);
            return null;

        } catch (error) {
            functions.logger.error(`Error durante la limpieza del reporter ${reporterId}:`, error);
            return null;
        }
    });

// =========================================================================================
// FIN DE NUEVAS FUNCIONES
// =========================================================================================


// --- Triggers de Notificaciones (EXISTENTES) ---

exports.onReportCreated = functions.firestore
    .document("visit_reports/{reportId}")
    .onCreate(async (snap, context) => {
        const reportData = snap.data();
        const { reportId } = context.params;

        if (!reportData) {
            functions.logger.error("No se encontraron datos en el reporte creado.");
            return null;
        }

        const reporterName = reportData.userName || "un reporter";
        const posName = reportData.posName || "un PDV";

        functions.logger.log(`Nuevo reporte creado por ${reporterName}. Buscando usuarios 'master' para notificar.`);

        try {
            const mastersQuery = admin.firestore().collection('users_metadata').where('role', '==', 'master');
            const mastersSnapshot = await mastersQuery.get();

            if (mastersSnapshot.empty) {
                functions.logger.warn("No se encontraron usuarios 'master' para notificar.");
                return null;
            }

            const notificationPayload = {
                title: 'Nuevo Reporte de Visita',
                body: `${reporterName} ha enviado un nuevo reporte desde ${posName}.`
            };

            const dataPayload = {
                link: `/reports/${reportId}` // Enlace para abrir el detalle del reporte en la app
            };

            const promises = mastersSnapshot.docs.map(doc => {
                const masterUserId = doc.id;
                return sendNotificationToUser(masterUserId, notificationPayload, dataPayload);
            });

            await Promise.all(promises);
            functions.logger.log(`Notificaciones enviadas a ${mastersSnapshot.size} usuario(s) master.`);
            return null;

        } catch (error) {
            functions.logger.error("Error al buscar usuarios master o enviar notificaciones:", error);
            return null;
        }
    });

exports.onTaskDelegated = functions.firestore
    .document("delegated_tasks/{taskId}")
    .onCreate(async (snap, context) => {
        // ... (código existente sin cambios)
    });

exports.onTransferCreated = functions.firestore.document("transfers/{transferId}").onCreate(async (snap) => {
    // ... (código existente sin cambios)
});

// --- Triggers de Mantenimiento de Datos (EXISTENTES) ---

exports.checkAndCreateReporter = functions.firestore
    .document("visit_reports/{reportId}")
    .onCreate(async (snap) => {
        // ... (código existente sin cambios)
    });

exports.onReportDeleted = functions.firestore
    .document("visit_reports/{reportId}")
    .onDelete(async (snap, context) => {
        // ... (código existente sin cambios)
    });

// =========================================================================================
// TRIGGER: Nuevo Pedido — notifica a master/sales_manager y envía correos
// =========================================================================================
exports.onPedidoCreated = functions.firestore
    .document("pedidos/{pedidoId}")
    .onCreate(async (snap) => {
        const pedido = snap.data();
        const db = admin.firestore();

        // 1. Notificaciones push a master y sales_manager (nunca a merchandiser/produccion)
        try {
            const usersSnap = await db.collection("users_metadata")
                .where("role", "in", ["master", "sales_manager"])
                .get();

            const activeUsers = usersSnap.docs.filter(d => d.data().active !== false);

            const notifPayload = {
                title: "Nuevo Pedido Registrado",
                body: `${pedido.reporterName || "Un merchandiser"} tomó un pedido de ${pedido.cantidad} uds. para ${pedido.posName || "un cliente"}${pedido.sucursal ? ` (${pedido.sucursal})` : ""}`,
            };

            await Promise.all(activeUsers.map(d =>
                sendNotificationToUser(d.id, notifPayload, { link: "/pedidos" })
            ));
            functions.logger.log(`Notificaciones de pedido enviadas a ${activeUsers.length} usuario(s).`);
        } catch (err) {
            functions.logger.error("Error enviando notificaciones de pedido:", err);
        }

        // 2. Envío de correo a destinatarios habilitados
        try {
            const [recipientsSnap, smtpSnap] = await Promise.all([
                db.doc("settings/emailRecipients").get(),
                db.doc("settings/smtpConfig").get(),
            ]);

            if (!smtpSnap.exists || !recipientsSnap.exists) {
                functions.logger.warn("SMTP o destinatarios no configurados. Saltando envío de correo.");
                return null;
            }

            const { recipients = [] } = recipientsSnap.data();
            const enabledEmails = recipients
                .filter(r => r.enabled !== false && r.email)
                .map(r => r.email);

            if (enabledEmails.length === 0) {
                functions.logger.info("No hay destinatarios de correo habilitados.");
                return null;
            }

            const { host, port, secure, user, password, fromName } = smtpSnap.data();
            if (!user || !password) {
                functions.logger.warn("Credenciales SMTP incompletas.");
                return null;
            }

            const nodemailer = require("nodemailer");
            const transporter = nodemailer.createTransport({
                host: host || "smtp.gmail.com",
                port: port || 587,
                secure: secure || false,
                auth: { user, pass: password },
            });

            const fecha = pedido.createdAt && pedido.createdAt.toDate
                ? pedido.createdAt.toDate().toLocaleString("es-VE", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" })
                : new Date().toLocaleString("es-VE", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });

            const htmlBody = `<!DOCTYPE html>
<html><body style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px;">
  <div style="background:#1e3a5f;color:white;padding:20px;border-radius:8px 8px 0 0;">
    <h1 style="margin:0;font-size:22px;">Nuevo Pedido Registrado</h1>
    <p style="margin:4px 0 0;opacity:.8;font-size:14px;">Genius Keeper — Lacteoca</p>
  </div>
  <div style="background:#f8f9fa;padding:20px;border-radius:0 0 8px 8px;border:1px solid #dee2e6;">
    <table style="width:100%;border-collapse:collapse;">
      <tr style="border-bottom:1px solid #dee2e6;"><td style="padding:10px;font-weight:bold;color:#495057;width:40%;">Cliente</td><td style="padding:10px;">${pedido.posName || "-"}</td></tr>
      ${pedido.sucursal ? `<tr style="border-bottom:1px solid #dee2e6;"><td style="padding:10px;font-weight:bold;color:#495057;">Sucursal</td><td style="padding:10px;">${pedido.sucursal}</td></tr>` : ""}
      <tr style="border-bottom:1px solid #dee2e6;"><td style="padding:10px;font-weight:bold;color:#495057;">Fecha y Hora</td><td style="padding:10px;">${fecha}</td></tr>
      <tr style="border-bottom:1px solid #dee2e6;"><td style="padding:10px;font-weight:bold;color:#495057;">Cantidad</td><td style="padding:10px;font-size:18px;font-weight:bold;">${pedido.cantidad} unidades</td></tr>
      <tr style="border-bottom:1px solid #dee2e6;"><td style="padding:10px;font-weight:bold;color:#495057;">N° Orden de Compra</td><td style="padding:10px;">${pedido.numeroOC || "-"}</td></tr>
      <tr><td style="padding:10px;font-weight:bold;color:#495057;">Tomado por</td><td style="padding:10px;">${pedido.reporterName || "-"}</td></tr>
    </table>
  </div>
  <p style="text-align:center;color:#6c757d;font-size:12px;margin-top:16px;">Generado automáticamente por Genius Keeper</p>
</body></html>`;

            await transporter.sendMail({
                from: `"${fromName || "Genius Keeper"}" <${user}>`,
                to: enabledEmails.join(", "),
                subject: `Pedido: ${pedido.posName || "Cliente"}${pedido.sucursal ? ` - ${pedido.sucursal}` : ""} | ${pedido.cantidad} uds. | OC: ${pedido.numeroOC || "-"}`,
                html: htmlBody,
            });

            functions.logger.log(`Correo de pedido enviado a: ${enabledEmails.join(", ")}`);
        } catch (err) {
            functions.logger.error("Error enviando correo de pedido:", err);
        }

        return null;
    });

// =========================================================================================
// TRIGGERS: Cadena de suministro Kroma ↔ Genius Keeper
// =========================================================================================

exports.onDespachoCreated = functions.firestore
    .document("kroma_despachos/{despachoId}")
    .onCreate(async (snap) => {
        const despacho = snap.data();

        const config = await getNotifConfig();
        const eventConfig = (config.events || {}).nuevo_despacho;
        if (eventConfig && eventConfig.enabled === false) return null;

        const destinations = (eventConfig && eventConfig.destinations) ||
            ["master", "sales_manager", "kroma_gerencial", "kroma_admin"];

        const lineas     = despacho.lineas || [];
        const totalItems = lineas.reduce((s, l) => s + (l.cantidad || 0), 0);

        await notifyByDestinations(destinations, {
            title: "Nuevo Despacho desde Barinas",
            body: `${despacho.responsable?.nombre || "Kroma"} despachó ${totalItems} unidades (${lineas.length} línea${lineas.length !== 1 ? "s" : ""}) — en tránsito.`,
        }, { link: "/supply_chain", tipo: "nuevo_despacho" });

        return null;
    });

exports.onDespachoUpdated = functions.firestore
    .document("kroma_despachos/{despachoId}")
    .onUpdate(async (change) => {
        const before = change.before.data();
        const after  = change.after.data();

        if (before.estado === after.estado) return null;
        if (after.estado !== "entregado") return null;

        const config = await getNotifConfig();
        const eventConfig = (config.events || {}).despacho_entregado;
        if (eventConfig && eventConfig.enabled === false) return null;

        const destinations = (eventConfig && eventConfig.destinations) ||
            ["master", "sales_manager", "kroma_gerencial", "kroma_admin"];

        const lineas     = after.lineas || [];
        const totalItems = lineas.reduce((s, l) => s + (l.cantidad || 0), 0);

        await notifyByDestinations(destinations, {
            title: "Despacho Entregado en Destino",
            body: `El despacho de ${totalItems} unidades ha sido confirmado como entregado.`,
        }, { link: "/supply_chain", tipo: "despacho_entregado" });

        return null;
    });

// =========================================================================================
// TRIGGER: Nueva alerta de vendedor → push notification
// =========================================================================================
exports.onVendedorAlertaCreated = functions.firestore
    .document("vendedor_alertas/{docId}")
    .onCreate(async (snap) => {
        const data = snap.data();
        const { uid, title, body } = data;
        if (!uid || !title) return null;

        try {
            await sendNotificationToUser(
                uid,
                { title, body: body || '' },
                { tipo: 'vendedor_alerta', link: '/alertas' }
            );
        } catch (err) {
            functions.logger.error("Error enviando push de alerta de vendedor:", err);
        }
        return null;
    });

exports.onTransferReceived = functions.firestore
    .document("transfers/{transferId}")
    .onUpdate(async (change) => {
        const before = change.before.data();
        const after  = change.after.data();

        if (before.status === after.status) return null;
        if (!["recibido", "recibida", "received"].includes(after.status)) return null;

        const config = await getNotifConfig();
        const eventConfig = (config.events || {}).transfer_recibida;
        if (eventConfig && eventConfig.enabled === false) return null;

        const destinations = (eventConfig && eventConfig.destinations) ||
            ["master", "sales_manager"];

        await notifyByDestinations(destinations, {
            title: "Mercancía Recibida en Caracas",
            body: `La transferencia de ${after.totalQuantity || 0} unidades fue confirmada en el almacén de Caracas.`,
        }, { link: "/logistics", tipo: "transfer_recibida" });

        return null;
    });