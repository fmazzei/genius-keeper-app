// RUTA: functions/handlers/webhooks.js

const functions = require("firebase-functions");
const admin = require("firebase-admin");
const { mesCohorteFromDate, diffDias } = require('./commissionEngine');
const { congelarTasaCohorte, procesarPagoFactura } = require('./facturaCommissionOps');

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
 * ✅ FUNCIÓN ACTUALIZADA: Webhook para recibir PAGOS de facturas desde Zoho.
 * Ahora calcula la comisión por unidad según la lógica de negocio.
 */
exports.procesarComisionesDesdeZoho = withZohoSecret(async (req, res) => {
    try {
        const configRef = admin.firestore().doc('settings/appConfig');
        const configDoc = await configRef.get();

        if (!configDoc.exists || configDoc.data().zohoCommissionsWebhookActive !== true) {
            functions.logger.log("Webhook de Comisiones de Zoho está desactivado. Ignorando la solicitud.");
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

/**
 * Resuelve el vendedor de GK correspondiente a un `salesperson_name` de Zoho.
 * Se busca en `users_metadata` (role == 'vendedor') un documento cuyo
 * `zohoSalespersonName` (o, si no está configurado, `name`) coincida sin
 * distinguir mayúsculas/espacios con el nombre enviado por Zoho.
 *
 * @returns {Promise<{id: string, data: object} | null>}
 */
async function resolveVendedor(salespersonName) {
    const name = (salespersonName || '').trim().toLowerCase();
    if (!name) return null;
    const vendedoresSnap = await admin.firestore()
        .collection('users_metadata')
        .where('role', '==', 'vendedor')
        .get();
    const match = vendedoresSnap.docs.find(d => {
        const data = d.data();
        const zohoName = (data.zohoSalespersonName || data.name || '').trim().toLowerCase();
        return zohoName && zohoName === name;
    });
    return match ? { id: match.id, data: match.data() } : null;
}

const toDate = (value) => {
    if (!value) return null;
    const d = new Date(value);
    return isNaN(d.getTime()) ? null : d;
};

/**
 * Verifica que la factura pertenezca a la organización de Zoho Books de
 * Lacteoca. Si `settings/appConfig.zohoOrgIdLacteoca` no está configurado,
 * o el payload no incluye `organization_id`, no se bloquea (no se puede
 * validar) — pero se deja registro en logs para auditoría.
 */
function esOrganizacionLacteoca(appConfig, body, invoice) {
    const orgIdEsperado = appConfig.zohoOrgIdLacteoca;
    if (!orgIdEsperado) return true; // sin filtro configurado
    const orgId = body?.organization_id || invoice?.organization_id || null;
    if (!orgId) return true; // payload sin organization_id, no se puede validar
    return String(orgId) === String(orgIdEsperado);
}

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
        if (!invoice || !invoice.invoice_number) {
            functions.logger.error("Payload de factura de Zoho inválido:", req.body);
            res.status(400).send("Payload de factura inválido.");
            return;
        }

        if (!esOrganizacionLacteoca(appConfig, req.body, invoice)) {
            functions.logger.log(`Factura #${invoice.invoice_number} de organización Zoho ajena, ignorada.`);
            res.status(200).send("Organización ajena, ignorada.");
            return;
        }

        const vendedor = await resolveVendedor(invoice.salesperson_name);
        if (!vendedor) {
            functions.logger.warn(`No se encontró vendedor para salesperson_name "${invoice.salesperson_name}" (factura #${invoice.invoice_number}). Configura "Nombre en Zoho" en Administración.`);
        }

        const estado = invoice.status === 'paid' ? 'pagada'
            : invoice.status === 'overdue' ? 'vencida'
            : 'pendiente';

        const fechaFactura  = toDate(invoice.date);
        const vencimiento   = toDate(invoice.due_date);
        const diasCredito   = diffDias(fechaFactura, vencimiento);
        const mesCohorte    = mesCohorteFromDate(fechaFactura);
        const unidades = Array.isArray(invoice.line_items)
            ? invoice.line_items.reduce((sum, item) => sum + (Number(item.quantity) || 0), 0)
            : 0;

        // Fase 3.1 — Identidad del cliente en Zoho. Es la llave para atribuir la
        // factura por CARTERA (no por salesperson): más adelante se mapeará
        // `zohoCustomerId` → vendor_clients → vendedor. Por ahora solo se captura
        // y se loguea para verificar que Zoho lo envía en el payload real.
        const zohoCustomerId = invoice.customer_id != null ? String(invoice.customer_id)
            : (invoice.contact_id != null ? String(invoice.contact_id) : null);

        // DIAGNÓSTICO (temporal): imprime la estructura real del payload de Zoho
        // para ubicar el identificador del cliente. Quitar una vez confirmado el
        // nombre/ubicación del campo customer_id.
        functions.logger.log(`[DIAG customer_id] factura #${invoice.invoice_number} — body keys: [${Object.keys(req.body || {}).join(', ')}] | invoice keys: [${Object.keys(invoice || {}).join(', ')}] | customer_id=${invoice.customer_id} | contact_id=${invoice.contact_id} | customer_name=${invoice.customer_name}`);

        const facturasRef = admin.firestore().collection('facturas_vendedor');
        const existingSnap = await facturasRef.where('numero', '==', invoice.invoice_number).limit(1).get();
        const existing     = existingSnap.empty ? null : existingSnap.docs[0];
        const existingData = existing ? existing.data() : null;

        const facturaData = {
            numero:       invoice.invoice_number,
            clienteName:  invoice.customer_name || '',
            zohoCustomerId,
            monto:        Number(invoice.total) || 0,
            fecha:        fechaFactura ? admin.firestore.Timestamp.fromDate(fechaFactura) : null,
            vencimiento:  vencimiento ? admin.firestore.Timestamp.fromDate(vencimiento) : null,
            diasCredito,
            unidades,
            estado,
            vendedorId:   vendedor?.id || null,
            reporterId:   vendedor?.data?.reporterId || null,
            mesCohorte,
            updatedAt:    admin.firestore.FieldValue.serverTimestamp(),
        };

        // Tasa-cohorte: se congela UNA sola vez, cuando se contabilizan por
        // primera vez las unidades de esta factura en el acumulado mensual
        // del vendedor. Actualizaciones posteriores (overdue/paid) conservan
        // la tasa ya congelada.
        const yaContabilizada = existingData?.unidadesContabilizadas === true;
        if (vendedor && mesCohorte && unidades > 0 && !yaContabilizada) {
            const tier = await congelarTasaCohorte(vendedor, mesCohorte, unidades);
            facturaData.tasaCohorte = tier.rate * 100;
            facturaData.tierCohorte = tier.label;
            facturaData.unidadesContabilizadas = true;
        } else if (existingData) {
            facturaData.tasaCohorte = existingData.tasaCohorte ?? null;
            facturaData.tierCohorte = existingData.tierCohorte ?? null;
            facturaData.unidadesContabilizadas = existingData.unidadesContabilizadas === true;
        }

        // invoice.paid (primera vez que se reporta como pagada): calcular comisión.
        if (estado === 'pagada' && existingData?.estado !== 'pagada') {
            await procesarPagoFactura({ vendedor, facturaData, fechaFactura, vencimiento });
        }

        if (existing) {
            await existing.ref.update(facturaData);
        } else {
            await facturasRef.add({ ...facturaData, createdAt: admin.firestore.FieldValue.serverTimestamp() });
        }

        functions.logger.log(`Factura Zoho #${invoice.invoice_number} sincronizada (vendedorId: ${vendedor?.id || 'sin asignar'}, zohoCustomerId: ${zohoCustomerId || 'AUSENTE'}, cliente: "${invoice.customer_name || ''}", estado: ${estado}).`);
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