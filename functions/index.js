// RUTA: functions/index.js
// VERSIÓN FINAL - CON EXPORTACIONES CORREGIDAS PARA FIREBASE

const admin = require("firebase-admin");

// Inicializamos Firebase Admin una sola vez.
admin.initializeApp();

// Cargamos todas las funciones desde sus archivos modulares.
const triggers = require('./handlers/triggers');
const callable = require('./handlers/callable');
const scheduled = require('./handlers/scheduled');
const webhooks = require('./handlers/webhooks');

// Usamos Object.assign para fusionar todas las funciones 
// de los archivos modulares en el objeto 'exports' principal.
// Esto permite que Firebase las descubra individualmente con sus nombres originales.
Object.assign(exports, triggers, callable, scheduled, webhooks);