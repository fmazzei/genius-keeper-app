// GENERADO por tools/generarMotorFunciones.mjs desde src/utils/novedades.js — NO EDITAR A MANO.
"use strict";
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/utils/novedades.js
var novedades_exports = {};
__export(novedades_exports, {
  NOVEDADES: () => NOVEDADES,
  novedadesDelRol: () => novedadesDelRol
});
module.exports = __toCommonJS(novedades_exports);
var NOVEDADES = [
  {
    id: "2026-10-29-planilla-fecha",
    fecha: "2026-10-29",
    roles: ["master"],
    titulo: "Fecha de la planilla",
    resumen: 'Al cargar una planilla en Kroma, la fecha se lee en palabras ("29 de septiembre de 2026") y no se puede guardar una fecha posterior a hoy. Si corriges la fecha, el lote y el vencimiento de su queso en cava cambian con ella.'
  },
  {
    id: "2026-10-29-rotacion-sin-vencido",
    fecha: "2026-10-29",
    roles: ["master", "gerencia", "vendedor"],
    titulo: "Rotaci\xF3n sin vencidos",
    resumen: "La rotaci\xF3n ya no cuenta como venta el producto vencido que desapareci\xF3 del anaquel, las devoluciones ni una entrega anotada dos veces. El reporte dice cu\xE1ntas unidades se descontaron y por qu\xE9."
  },
  {
    id: "2026-10-29-entrega-repetida",
    fecha: "2026-10-29",
    roles: ["merchandiser"],
    titulo: "Entregas sin repetir",
    resumen: 'Si anotaste una entrada "sin factura", el tel\xE9fono ya no te vuelve a pedir esa misma factura en la visita siguiente. Y si ves producto vencido, declara el retiro en la visita.'
  },
  {
    id: "2026-10-27-centro-notificaciones",
    fecha: "2026-10-27",
    roles: [],
    titulo: "Notificaciones por tipo",
    resumen: "Cada notificaci\xF3n empieza con su tipo: \u{1F534} Anaquel bajo, \u{1F4CB} Reporte, \u{1F916} Agente, \u{1F4E6} Operaci\xF3n y \u2728 Novedades. Ya no llegan repetidas."
  },
  {
    id: "2026-10-27-centro-notificaciones-master",
    fecha: "2026-10-27",
    roles: ["master"],
    titulo: "Centro de notificaciones",
    resumen: "En Configuraciones \u2192 Sistema eliges qu\xE9 tipo de notificaci\xF3n recibe cada rol y cada persona."
  },
  {
    id: "2026-10-24-anaquel-bajo",
    fecha: "2026-10-24",
    roles: ["master", "gerencia", "vendedor", "merchandiser"],
    titulo: "Alerta de anaquel bajo",
    resumen: "Si un punto queda con 6 unidades o menos y no se repone en la visita, ver\xE1s un rengl\xF3n rojo arriba hasta que se reponga (o 72 h)."
  }
];
var novedadesDelRol = (role, lista = NOVEDADES) => {
  const r = role === "sales_manager" || role === "director" ? "gerencia" : role;
  return lista.filter((n) => !n.roles?.length || n.roles.includes(r));
};
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  NOVEDADES,
  novedadesDelRol
});
