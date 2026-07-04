// RUTA: functions/handlers/webhooks.js

const functions = require("firebase-functions");
const admin = require("firebase-admin");
const { esOrganizacionLacteoca, upsertFacturaFromZoho } = require('./facturaSync');

// Secreto compartido para validar los webhooks de Zoho Books, inyectado como
// variable de entorno desde functions/.env.<project-id> (generado por CI a
// partir del secreto ZOHO_SECRET de GitHub Actions). Reemplaza al antiguo
// `functions.config().genius.zoho_secret`, que está deprecado.
const ZOHO_SECRET_PARAM = "ZOHO_SECRET";
const withZohoSecret = (handler) =>
    functions.https.onRequest(handler);

// --- Helper de Notificaciones ---
const sendNotificationToUser = async (userId, notificationPayload, dataPayload) => {
    if (!userId) return;
    await admin.firestore().collection("notifications").add({
        userId,
        title: notificationPayload.title,
        body: notificationPayload.body,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        read: false,
        link: dataPayload.link || ''
    });
    const tokensRef = admin.firestore().collection("users_metadata").doc(userId).collection("tokens");
    const tokensSnap = await tokensRef.get();
    if (tokensSnap.empty) return;
    const tokens = tokensSnap.docs.map(doc => doc.id);
    const payload = { notification: notificationPayload, data: dataPayload };
    const response = await admin.messaging().sendEachForMulticast({ tokens, ...payload });
    const tokensToRemove = [];
    response.responses.forEach((result, index) => {
        if (result.error && ["messaging/invalid-registration-token", "messaging/registration-token-not-registered"].includes(result.error.code)) {
            tokensToRemove.push(tokensRef.doc(tokens[index]).delete());
        }
    });
    if (tokensToRemove.length > 0) await Promise.all(tokensToRemove);
};

// ===================================================================
// --- ENDPOINTS DE WEBHOOKS ---
// ===================================================================

/**
 * Webhook para recibir facturas de Zoho Books y crear una venta pendiente.
 */
exports.createPendingSaleFromZoho = functions.https.onRequest(async (req, res) => {
    // ... (Esta función no necesita cambios y permanece como está)
});


/**
 * ⛔ RETIRADO (legacy). Antes calculaba una comisión de "margen de planta" con
 * una tasa fija (6.5%) y SIN vendedorId, en paralelo al motor real de comisiones
 * por vendedor. Se decidió retirarlo: la comisión del vendedor vive por completo
 * en `sincronizarFacturaDesdeZoho` → `procesarPagoFactura` (tasa por nivel + Bono
 * Cobranza proporcional + Activación + Cuentas Recuperadas). Este endpoint queda
 * como no-op para no romper cualquier webhook viejo que aún lo apunte: no escribe
 * datos, solo responde 200 con aviso. Puede borrarse cuando se confirme que Zoho
 * ya no lo invoca.
 */
exports.procesarComisionesDesdeZoho = withZohoSecret(async (req, res) => {
    functions.logger.warn('procesarComisionesDesdeZoho está RETIRADO (no-op). La comisión del vendedor se calcula en sincronizarFacturaDesdeZoho/procesarPagoFactura.');
    res.status(200).send('Endpoint retirado: la comisión del vendedor se calcula en el webhook de facturas.');
});

// La resolución del vendedor (por cartera / salesperson), el filtro de
// organización y el upsert idempotente de la factura viven en `facturaSync.js`
// — compartidos con la conciliación bajo demanda (`zohoReconcile.js`) para que
// ambos caminos hagan EXACTAMENTE lo mismo (una sola fuente de verdad).

/**
 * Webhook para recibir eventos de FACTURAS de Zoho Books (invoice.created,
 * invoice.overdue, invoice.paid) y:
 *  1. Mantener sincronizada `facturas_vendedor` (alimenta "Mis Facturas" y
 *     el semáforo de vencimientos del vendedor).
 *  2. Acumular las unidades facturadas del mes por vendedor y congelar la
 *     tasa-cohorte de cada factura (`comisiones_mensuales`).
 *  3. En `invoice.paid`, calcular y registrar la comisión generada
 *     (`pagos_registrados`), aplicando la regla de 45 días y el bono de
 *     puntualidad.
 *
 * Formato esperado del payload (payload "default" de Zoho Books — todos los
 * parámetros del módulo Invoice como JSON): `req.body.invoice` (o
 * `req.body.data` / `req.body` directamente) con, al menos,
 * `invoice_number`, `customer_name`, `total`, `date`, `due_date`, `status`,
 * `salesperson_name` y `line_items: [{ quantity, ... }]`. Si Zoho se
 * configura con un payload personalizado, debe incluir esos mismos nombres
 * de campo (o ajustar este handler).
 *
 * Mapeo factura → vendedor: ver `resolveVendedor`. Si no hay match, la
 * factura se guarda igual (para auditoría/admin, visible en AdminPanel →
 * Integraciones como "sin vendedor asignado") pero sin `vendedorId`/comisión.
 */
exports.sincronizarFacturaDesdeZoho = withZohoSecret(async (req, res) => {
    try {
        const configRef = admin.firestore().doc('settings/appConfig');
        const configDoc = await configRef.get();
        const appConfig = configDoc.exists ? configDoc.data() : {};

        if (appConfig.zohoSalesWebhookActive !== true) {
            functions.logger.log("Webhook de Facturas de Zoho está desactivado. Ignorando la solicitud.");
            res.status(200).send("Webhook inactivo, solicitud ignorada.");
            return;
        }

        if (req.header('X-Zoho-Secret') !== process.env[ZOHO_SECRET_PARAM]) {
            res.status(401).send("Unauthorized");
            return;
        }

        if (req.method !== 'POST') {
            res.status(405).send('Method Not Allowed');
            return;
        }

        const invoice = req.body?.invoice || req.body?.data || req.body;

        // DIAGNÓSTICO (temporal, a prueba de caché): guarda el payload COMPLETO
        // del último evento de Zoho en un doc fijo, visible desde AdminPanel →
        // Integraciones. Permite ver el JSON entero sin depender de logs ni de
        // que el frontend esté fresco. Se elimina al confirmar el campo customer_id.
        try {
            await admin.firestore().doc('settings/zohoLastPayload').set({
                receivedAt:    admin.firestore.FieldValue.serverTimestamp(),
                invoiceNumber: invoice?.invoice_number || null,
                raw:           JSON.stringify(req.body || {}).slice(0, 9000),
            });
        } catch (e) { /* diagnóstico, no crítico */ }

        if (!invoice || !invoice.invoice_number) {
            functions.logger.error("Payload de factura de Zoho inválido:", req.body);
            res.status(400).send("Payload de factura inválido.");
            return;
        }

        // Sincronización idempotente compartida (misma lógica que la conciliación
        // bajo demanda): filtro de organización, tombstone, resolución de vendedor
        // (cartera → salesperson), período/recuperada, tasa-cohorte y comisión al
        // pagar. Ver facturaSync.js.
        const r = await upsertFacturaFromZoho(invoice, appConfig, { body: req.body });

        if (r.status === 'foreign') {
            functions.logger.log(`Factura #${invoice.invoice_number} de organización Zoho ajena, ignorada.`);
            res.status(200).send("Organización ajena, ignorada.");
            return;
        }
        if (r.status === 'blocked') {
            functions.logger.log(`Factura #${invoice.invoice_number} BLOQUEADA (eliminada/anulada por admin). Ignorada.`);
            res.status(200).send("Factura bloqueada, ignorada.");
            return;
        }

        functions.logger.log(`Factura Zoho #${invoice.invoice_number} sincronizada (doc: ${r.facturaId}, vendedorId: ${r.vendedorId || 'sin asignar'}, estado: ${r.estado}${r.becamePaid ? ', PAGADA (comisión calculada)' : ''}).`);
        res.status(200).send("Factura sincronizada con éxito.");

    } catch (error) {
        functions.logger.error("Error procesando webhook de Zoho (Facturas):", error);
        res.status(500).send("Error interno del servidor.");
    }
});

/**
 * Webhook para `creditnote.applied`: ajusta (reduce) la comisión generada
 * por las facturas afectadas por una nota de crédito, aplicando la misma
 * tasa-cohorte que ya tenía congelada cada factura. Escribe un registro
 * negativo en `pagos_registrados` (origen `creditnote.applied`).
 *
 * Arquitectura preparada según CLAUDE.md punto 9 — requiere activar el
 * evento `creditnote.applied` en Zoho Books apuntando a esta función,
 * además del webhook de facturas (`zohoSalesWebhookActive`).
 *
 * Formato esperado del payload (payload "default" de Zoho Books — módulo
 * Credit Note): `req.body.creditnote` (o `req.body.data` / `req.body`) con
 * `total` y la lista de facturas asociadas en `invoices` (o
 * `associated_invoices`), cada una con `invoice_number`. Si Zoho no incluye
 * esa relación en el payload por defecto, debe configurarse un payload
 * personalizado que la incluya.
 */
exports.procesarNotaCreditoDesdeZoho = withZohoSecret(async (req, res) => {
    try {
        const configRef = admin.firestore().doc('settings/appConfig');
        const configDoc = await configRef.get();
        const appConfig = configDoc.exists ? configDoc.data() : {};

        if (appConfig.zohoSalesWebhookActive !== true) {
            functions.logger.log("Webhook de Facturas de Zoho está desactivado. Ignorando nota de crédito.");
            res.status(200).send("Webhook inactivo, solicitud ignorada.");
            return;
        }

        if (req.header('X-Zoho-Secret') !== process.env[ZOHO_SECRET_PARAM]) {
            res.status(401).send("Unauthorized");
            return;
        }

        if (req.method !== 'POST') {
            res.status(405).send('Method Not Allowed');
            return;
        }

        const creditnote = req.body?.creditnote || req.body?.data || req.body;
        if (!creditnote) {
            res.status(400).send("Payload de nota de crédito inválido.");
            return;
        }

        if (!esOrganizacionLacteoca(appConfig, req.body, creditnote)) {
            functions.logger.log(`Nota de crédito #${creditnote.creditnote_number || ''} de organización Zoho ajena, ignorada.`);
            res.status(200).send("Organización ajena, ignorada.");
            return;
        }

        const facturasAsociadas = (creditnote.invoices || creditnote.associated_invoices || [])
            .map(i => i.invoice_number)
            .filter(Boolean);
        if (facturasAsociadas.length === 0 && creditnote.reference_number) {
            facturasAsociadas.push(creditnote.reference_number);
        }

        const montoTotal = Number(creditnote.total) || 0;
        const facturasRef = admin.firestore().collection('facturas_vendedor');

        for (const numero of facturasAsociadas) {
            const snap = await facturasRef.where('numero', '==', numero).limit(1).get();
            if (snap.empty) {
                functions.logger.warn(`Nota de crédito: no se encontró factura #${numero}.`);
                continue;
            }
            const factura = snap.docs[0].data();
            if (!factura.vendedorId || !factura.comisionGenerada) {
                continue; // factura sin comisión generada — nada que ajustar
            }

            const tasaCohorte = factura.tasaCohorte || 0;
            // Monto de la nota de crédito prorrateado entre las facturas asociadas.
            const montoAsociado = facturasAsociadas.length > 1 ? montoTotal / facturasAsociadas.length : montoTotal;
            const ajusteComision = montoAsociado * (tasaCohorte / 100);

            await admin.firestore().collection('pagos_registrados').add({
                vendedorId:           factura.vendedorId,
                reporterId:           factura.reporterId || null,
                facturaNumero:        numero,
                clienteName:          factura.clienteName || '',
                montoUSD:             -montoAsociado,
                tasaCohorte,
                mesCohorte:           factura.mesCohorte || null,
                calculatedCommission: -ajusteComision,
                invoiceNumbers:       [numero],
                createdAt:            admin.firestore.FieldValue.serverTimestamp(),
                origen:               'creditnote.applied',
            });

            functions.logger.log(`Nota de crédito aplicada a factura #${numero}: ajuste de comisión -${ajusteComision.toFixed(2)} USD.`);
        }

        res.status(200).send("Nota de crédito procesada.");

    } catch (error) {
        functions.logger.error("Error procesando webhook de Zoho (Nota de Crédito):", error);
        res.status(500).send("Error interno del servidor.");
    }
});