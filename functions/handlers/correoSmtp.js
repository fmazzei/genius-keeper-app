// RUTA: functions/handlers/correoSmtp.js
// Transporte de correo (SMTP de settings/smtpConfig). Lo usan los reportes por
// correo y el correo de aprobación del asiento mensual de inventario.

"use strict";

const admin = require("firebase-admin");
const nodemailer = require("nodemailer");

async function getSmtpTransporter() {
    const snap = await admin.firestore().doc("settings/smtpConfig").get();
    // Admin SDK: `exists` es PROPIEDAD, no método.
    if (!snap.exists) throw new Error("SMTP no configurado en settings/smtpConfig");
    const c = snap.data();
    return {
        transporter: nodemailer.createTransport({
            host: c.host, port: c.port, secure: c.secure || false,
            auth: { user: c.user, pass: c.password },
        }),
        from: `"${c.fromName || 'Genius Keeper'}" <${c.user}>`,
    };
}

module.exports = { getSmtpTransporter };
