// RUTA: functions/handlers/webhooks.js

const functions = require("firebase-functions");
const admin = require("firebase-admin");

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
 * ✅ FUNCIÓN ACTUALIZADA: Webhook para recibir PAGOS de facturas desde Zoho.
 * Ahora calcula la comisión por unidad según la lógica de negocio.
 */
exports.procesarComisionesDesdeZoho = functions.https.onRequest(async (req, res) => {
    try {
        const configRef = admin.firestore().doc('settings/appConfig');
        const configDoc = await configRef.get();

        if (!configDoc.exists() || configDoc.data().zohoCommissionsWebhookActive !== true) {
            functions.logger.log("Webhook de Comisiones de Zoho está desactivado. Ignorando la solicitud.");
            res.status(200).send("Webhook inactivo, solicitud ignorada.");
            return;
        }

        const ZOHO_SECRET = functions.config().genius.zoho_secret;
        if (req.header('X-Zoho-Secret') !== ZOHO_SECRET) {
            res.status(401).send("Unauthorized");
            return;
        }
        
        if (req.method !== 'POST') {
            res.status(405).send('Method Not Allowed');
            return;
        }

        const { payment } = req.body;
        if (!payment || !payment.invoices || !Array.isArray(payment.invoices)) {
            functions.logger.error("Payload de pago de Zoho inválido:", req.body);
            res.status(400).send("Payload de pago inválido.");
            return;
        }

        // --- INICIO DE LA NUEVA LÓGICA DE CÁLCULO ---
        let totalCommission = 0;
        const COMMISSION_RATE = 0.065;
        const invoiceNumbers = [];

        // Iteramos sobre cada factura cubierta por el pago
        for (const invoice of payment.invoices) {
            invoiceNumbers.push(invoice.invoice_number);
            if (invoice.line_items && Array.isArray(invoice.line_items)) {
                // Iteramos sobre cada producto dentro de la factura
                for (const item of invoice.line_items) {
                    const quantity = Number(item.quantity) || 0;
                    const salePrice = Number(item.rate) || 0;

                    // 1. Calculamos el Precio Planta
                    const factoryPrice = salePrice * (1 - COMMISSION_RATE);
                    // 2. Calculamos la comisión para este item
                    const itemCommission = quantity * factoryPrice * COMMISSION_RATE;
                    // 3. La sumamos al total
                    totalCommission += itemCommission;
                }
            }
        }
        // --- FIN DE LA NUEVA LÓGICA DE CÁLCULO ---

        // Guardamos el registro del pago con la comisión ya calculada
        await admin.firestore().collection('pagos_registrados').add({
            paymentId: payment.payment_id,
            invoiceNumbers: invoiceNumbers,
            customerName: payment.customer_name,
            paymentDate: payment.date,
            calculatedCommission: totalCommission, // Guardamos el valor calculado
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
            originalPayload: payment // Guardamos el payload original para auditoría
        });

        // Notificamos al Sales Manager con el monto de la comisión
        const salesManager = await admin.auth().getUserByEmail("carolina@lacteoca.com");
        const commissionFormatted = totalCommission.toLocaleString('es-VE', { style: 'currency', currency: 'USD' });
        const notificationBody = `¡Comisión generada de ${commissionFormatted} por el pago de la(s) factura(s) #${invoiceNumbers.join(', ')}!`;
        
        await sendNotificationToUser(
            salesManager.uid,
            { title: "🎉 ¡Nueva Comisión Registrada!", body: notificationBody },
            { link: `/commissions` }
        );

        functions.logger.log(`Comisión de ${commissionFormatted} registrada para factura(s) Zoho #${invoiceNumbers.join(', ')}`);
        res.status(200).send("Pago y comisión registrados con éxito.");

    } catch (error) {
        functions.logger.error("Error procesando webhook de Zoho (Comisiones):", error);
        res.status(500).send("Error interno del servidor.");
    }
});