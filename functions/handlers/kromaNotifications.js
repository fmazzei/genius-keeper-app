// Cloud Function: Kroma hold-timer push notifications
// Se ejecuta cada 2 minutos y envía FCM a los dispositivos Android del operario
// cuando el temporizador de un bloque está por finalizar.

const { onSchedule } = require("firebase-functions/v2/scheduler");
const { logger }     = require("firebase-functions");
const admin          = require("firebase-admin");

exports.kromaHoldNotifier = onSchedule({
    schedule:  "*/2 * * * *",      // cada 2 minutos
    timeZone:  "America/Caracas",
    region:    "us-central1",
}, async () => {
    const db  = admin.firestore();
    const now = Date.now();

    // Traer todos los documentos activos y filtrar en memoria (evita índice compuesto)
    const snap = await db.collection("kroma_scheduled_notifs")
        .where("active", "==", true)
        .get();

    const due = snap.docs.filter(d => {
        const data = d.data();
        const ts = data.scheduledFor;
        const msScheduled = ts?.toMillis ? ts.toMillis() : new Date(ts).getTime();
        return !data.fired && msScheduled <= now;
    });

    if (due.length === 0) {
        logger.log(`kromaHoldNotifier: 0 notificaciones pendientes.`);
        return;
    }

    logger.log(`kromaHoldNotifier: ${due.length} notificación(es) a enviar.`);

    await Promise.all(due.map(async (docSnap) => {
        const d = docSnap.data();
        const { logId, userId, productoNombre, lote, holdBloque, minutoAntes } = d;

        // Obtener tokens FCM del operario
        const tokensSnap = await db
            .collection("users_metadata").doc(userId)
            .collection("tokens").get();

        // Marcar como disparada aunque no haya tokens (evitar re-intentos)
        await docSnap.ref.update({
            fired:   true,
            firedAt: admin.firestore.FieldValue.serverTimestamp(),
        });

        if (tokensSnap.empty) {
            logger.warn(`kromaHoldNotifier: sin tokens para usuario ${userId} (log ${logId})`);
            return;
        }

        const tokens = tokensSnap.docs.map(t => t.id);
        const minLabel = (minutoAntes ?? 60) >= 60
            ? `${(minutoAntes ?? 60) / 60}h`
            : `${minutoAntes ?? 60} min`;

        const title = `⏰ ${holdBloque} — finaliza en ${minLabel}`;
        const body  = `${productoNombre}${lote ? ` · Lote ${lote}` : ""}`;

        const message = {
            tokens,
            notification: { title, body },
            android: {
                priority: "high",
                notification: {
                    channelId:             "kroma_production",
                    sound:                 "default",
                    priority:              "high",
                    defaultVibrateTimings: true,
                    tag:                   `kroma-hold-${logId}`,
                },
            },
            webpush: {
                notification: {
                    title,
                    body,
                    icon:              "/icon.svg",
                    requireInteraction: true,
                    tag:               `kroma-hold-${logId}`,
                },
                fcmOptions: { link: "/" },
            },
            data: {
                logId:  logId  || "",
                type:   "kroma_hold",
                userId: userId || "",
            },
        };

        try {
            const result = await admin.messaging().sendEachForMulticast(message);
            logger.log(`kromaHoldNotifier: log ${logId} — ${result.successCount} ok, ${result.failureCount} err`);

            // Limpiar tokens inválidos
            const invalidos = [];
            result.responses.forEach((r, i) => {
                if (r.error && [
                    "messaging/invalid-registration-token",
                    "messaging/registration-token-not-registered",
                ].includes(r.error.code)) {
                    invalidos.push(
                        db.collection("users_metadata").doc(userId)
                          .collection("tokens").doc(tokens[i]).delete()
                    );
                }
            });
            if (invalidos.length) await Promise.all(invalidos);
        } catch (err) {
            logger.error(`kromaHoldNotifier: error enviando log ${logId}:`, err);
        }
    }));
});
