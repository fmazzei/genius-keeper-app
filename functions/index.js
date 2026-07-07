// RUTA: functions/index.js
// VERSIÓN FINAL - CON EXPORTACIONES CORREGIDAS PARA FIREBASE

const admin = require("firebase-admin");

// Inicializamos Firebase Admin una sola vez.
admin.initializeApp();

// Cargamos todas las funciones desde sus archivos modulares.
const triggers       = require('./handlers/triggers');
const callable       = require('./handlers/callable');
const scheduled      = require('./handlers/scheduled');
const webhooks       = require('./handlers/webhooks');
const reports        = require('./handlers/reports');
const kromaNotifs    = require('./handlers/kromaNotifications');
const adminTools     = require('./handlers/adminTools');
const zohoReconcile  = require('./handlers/zohoReconcile');
const masterTools    = require('./handlers/masterTools');

Object.assign(exports, triggers, callable, scheduled, webhooks, reports, kromaNotifs, adminTools, zohoReconcile, masterTools);