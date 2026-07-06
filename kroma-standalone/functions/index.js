// Cloud Functions — KROMA standalone
//
// Estas funciones son OPCIONALES: la app funciona sin ellas. Solo se necesitan
// para notificaciones (push de temporizadores de producción y avisos de
// despacho). Requieren el plan Blaze de Firebase para desplegarse.

const admin = require("firebase-admin");
admin.initializeApp();

const kromaNotifs   = require("./handlers/kromaNotifications");
const kromaTriggers = require("./handlers/kromaTriggers");

Object.assign(exports, kromaNotifs, kromaTriggers);
