// GENERADO por tools/generarMotorFunciones.mjs desde src/utils/centroNotificaciones.js — NO EDITAR A MANO.
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

// src/utils/centroNotificaciones.js
var centroNotificaciones_exports = {};
__export(centroNotificaciones_exports, {
  CATEGORIAS: () => CATEGORIAS,
  CATEGORIA_POR_ID: () => CATEGORIA_POR_ID,
  DEFAULT_ROLES: () => DEFAULT_ROLES,
  ROLES_NOTIF: () => ROLES_NOTIF,
  categoriaDeTipo: () => categoriaDeTipo,
  esPropio: () => esPropio,
  etiquetaPush: () => etiquetaPush,
  hashCorto: () => hashCorto,
  recibe: () => recibe,
  recibeRol: () => recibeRol,
  rolDeConfig: () => rolDeConfig,
  tituloPush: () => tituloPush
});
module.exports = __toCommonJS(centroNotificaciones_exports);
var CATEGORIAS = [
  {
    id: "anaquel",
    emoji: "\u{1F534}",
    nombre: "Anaquel bajo",
    que: "Un punto de venta qued\xF3 con 6 unidades o menos y no se repuso en la visita.",
    color: "red"
  },
  {
    id: "reporte",
    emoji: "\u{1F4CB}",
    nombre: "Reporte",
    que: "El mercaderista envi\xF3 el reporte de una visita.",
    color: "blue"
  },
  {
    id: "agente",
    emoji: "\u{1F916}",
    nombre: "Agente",
    que: "El vigilante encontr\xF3 algo que revisar (PDV sin visita, meta, comisiones, fallas).",
    color: "violet"
  },
  {
    id: "operacion",
    emoji: "\u{1F4E6}",
    nombre: "Operaci\xF3n",
    que: "Pedidos, despachos, recepciones, ajustes de inventario, cartera y facturas.",
    color: "emerald"
  },
  {
    id: "novedades",
    emoji: "\u2728",
    nombre: "Novedades",
    que: "Resumen de los cambios que se le hacen a la app.",
    color: "amber"
  }
];
var CATEGORIA_POR_ID = Object.fromEntries(CATEGORIAS.map((c) => [c.id, c]));
var ROLES_NOTIF = [
  { id: "master", nombre: "M\xE1ster" },
  { id: "gerencia", nombre: "Gerencia", tambien: ["sales_manager", "director"] },
  { id: "vendedor", nombre: "Vendedor" },
  { id: "merchandiser", nombre: "Mercaderista" },
  { id: "administrador", nombre: "Administraci\xF3n" }
];
var rolDeConfig = (role) => role === "sales_manager" || role === "director" ? "gerencia" : role;
var DEFAULT_ROLES = {
  master: { anaquel: true, reporte: true, agente: true, operacion: true, novedades: true },
  gerencia: { anaquel: true, reporte: true, agente: true, operacion: true, novedades: true },
  vendedor: { anaquel: true, reporte: false, agente: true, operacion: true, novedades: true },
  merchandiser: { anaquel: true, reporte: false, agente: false, operacion: true, novedades: true },
  administrador: { anaquel: false, reporte: false, agente: true, operacion: true, novedades: true }
};
var categoriaDeTipo = (tipo) => {
  const t = String(tipo || "");
  if (t.startsWith("anaquel_bajo")) return "anaquel";
  if (t === "nuevo_reporte" || t === "reporte") return "reporte";
  if (t === "vigilante" || t.startsWith("aviso")) return "agente";
  if (t === "novedades") return "novedades";
  return "operacion";
};
var recibeRol = (cfg, role, categoria) => {
  const r = rolDeConfig(role);
  const explicito = cfg?.roles?.[r]?.[categoria];
  if (typeof explicito === "boolean") return explicito;
  return DEFAULT_ROLES[r]?.[categoria] === true;
};
var recibe = (cfg, user, categoria) => {
  if (!user || user.active === false) return false;
  const uid = user.uid || user.id;
  const propio = uid ? cfg?.usuarios?.[uid]?.[categoria] : void 0;
  if (typeof propio === "boolean") return propio;
  if (categoria === "anaquel" && user.alertaAnaquelBajo === false) return false;
  return recibeRol(cfg, user.role, categoria);
};
var esPropio = (cfg, uid, categoria) => typeof cfg?.usuarios?.[uid]?.[categoria] === "boolean";
var tituloPush = (categoria, titulo) => {
  const c = CATEGORIA_POR_ID[categoria] || CATEGORIA_POR_ID.operacion;
  const t = String(titulo || "").trim();
  const prefijo = `${c.emoji} ${c.nombre}`;
  if (t.startsWith(c.emoji)) return t;
  return t ? `${prefijo} \xB7 ${t}` : prefijo;
};
var hashCorto = (s) => {
  let h = 0;
  const x = String(s);
  for (let i = 0; i < x.length; i++) h = (h << 5) - h + x.charCodeAt(i) | 0;
  return Math.abs(h).toString(36);
};
var etiquetaPush = (categoria, clave) => `gk-${categoria}-${hashCorto(clave)}`;
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  CATEGORIAS,
  CATEGORIA_POR_ID,
  DEFAULT_ROLES,
  ROLES_NOTIF,
  categoriaDeTipo,
  esPropio,
  etiquetaPush,
  hashCorto,
  recibe,
  recibeRol,
  rolDeConfig,
  tituloPush
});
