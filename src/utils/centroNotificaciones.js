// RUTA: src/utils/centroNotificaciones.js — CENTRO DE NOTIFICACIONES (pedido del
// dueño, 27-oct-2026).
//
// Cada notificación pertenece a UNA categoría, y cada categoría se ve distinta en
// el teléfono (emoji y nombre al inicio del título) y en la app (color propio).
// El máster decide qué categorías recibe cada rol y, dentro del rol, cada
// usuario (`settings/centroNotificaciones`).
//
// La misma regla la usan la app y el servidor: este archivo se empaqueta a
// `functions/handlers/generado/centroNotificaciones.cjs` (tools/generarMotorFunciones.mjs).

export const CATEGORIAS = [
    {
        id: 'anaquel', emoji: '🔴', nombre: 'Anaquel bajo',
        que: 'Un punto de venta quedó con 6 unidades o menos y no se repuso en la visita.',
        color: 'red',
    },
    {
        id: 'reporte', emoji: '📋', nombre: 'Reporte',
        que: 'El mercaderista envió el reporte de una visita.',
        color: 'blue',
    },
    {
        id: 'agente', emoji: '🤖', nombre: 'Agente',
        que: 'El vigilante encontró algo que revisar (PDV sin visita, meta, comisiones, fallas).',
        color: 'violet',
    },
    {
        id: 'operacion', emoji: '📦', nombre: 'Operación',
        que: 'Pedidos, despachos, recepciones, ajustes de inventario, cartera y facturas.',
        color: 'emerald',
    },
    {
        id: 'novedades', emoji: '✨', nombre: 'Novedades',
        que: 'Resumen de los cambios que se le hacen a la app.',
        color: 'amber',
    },
];

export const CATEGORIA_POR_ID = Object.fromEntries(CATEGORIAS.map(c => [c.id, c]));

// Roles de GK que pueden recibir notificaciones, con su nombre en pantalla.
export const ROLES_NOTIF = [
    { id: 'master', nombre: 'Máster' },
    { id: 'gerencia', nombre: 'Gerencia', tambien: ['sales_manager', 'director'] },
    { id: 'vendedor', nombre: 'Vendedor' },
    { id: 'merchandiser', nombre: 'Mercaderista' },
    { id: 'administrador', nombre: 'Administración' },
];

// 'sales_manager' y 'director' se configuran como gerencia.
export const rolDeConfig = (role) => (role === 'sales_manager' || role === 'director') ? 'gerencia' : role;

// Lo que recibe cada rol si el máster no ha dicho otra cosa. Es lo que ya
// llegaba antes del centro, para que nadie pierda ni gane avisos al publicarlo.
export const DEFAULT_ROLES = {
    master:        { anaquel: true,  reporte: true,  agente: true,  operacion: true,  novedades: true },
    gerencia:      { anaquel: true,  reporte: true,  agente: true,  operacion: true,  novedades: true },
    vendedor:      { anaquel: true,  reporte: false, agente: true,  operacion: true,  novedades: true },
    merchandiser:  { anaquel: true,  reporte: false, agente: false, operacion: true,  novedades: true },
    administrador: { anaquel: false, reporte: false, agente: true,  operacion: true,  novedades: true },
};

// De qué categoría es una notificación vieja que no la trae escrita.
export const categoriaDeTipo = (tipo) => {
    const t = String(tipo || '');
    if (t.startsWith('anaquel_bajo')) return 'anaquel';
    if (t === 'nuevo_reporte' || t === 'reporte') return 'reporte';
    if (t === 'vigilante' || t.startsWith('aviso')) return 'agente';
    if (t === 'novedades') return 'novedades';
    return 'operacion';
};

// Lo que dice el ROL (sin mirar a la persona).
export const recibeRol = (cfg, role, categoria) => {
    const r = rolDeConfig(role);
    const explicito = cfg?.roles?.[r]?.[categoria];
    if (typeof explicito === 'boolean') return explicito;
    return DEFAULT_ROLES[r]?.[categoria] === true;
};

// ¿Recibe esta PERSONA esta categoría? Manda lo que el máster puso para ella;
// si no puso nada, lo de su rol. `alertaAnaquelBajo:false` (el interruptor
// anterior al centro) sigue valiendo para el anaquel mientras no se toque aquí.
export const recibe = (cfg, user, categoria) => {
    if (!user || user.active === false) return false;
    const uid = user.uid || user.id;
    const propio = uid ? cfg?.usuarios?.[uid]?.[categoria] : undefined;
    if (typeof propio === 'boolean') return propio;
    if (categoria === 'anaquel' && user.alertaAnaquelBajo === false) return false;
    return recibeRol(cfg, user.role, categoria);
};

// ¿La persona tiene algo propio, distinto de su rol?
export const esPropio = (cfg, uid, categoria) => typeof cfg?.usuarios?.[uid]?.[categoria] === 'boolean';

// Título del teléfono: "🔴 Anaquel bajo · Los Pomelos". El emoji y el nombre van
// SIEMPRE al inicio, para decidir sin abrirla si se ve ya o después.
export const tituloPush = (categoria, titulo) => {
    const c = CATEGORIA_POR_ID[categoria] || CATEGORIA_POR_ID.operacion;
    const t = String(titulo || '').trim();
    const prefijo = `${c.emoji} ${c.nombre}`;
    if (t.startsWith(c.emoji)) return t;
    return t ? `${prefijo} · ${t}` : prefijo;
};

// Hash corto y estable (para la etiqueta del aviso).
export const hashCorto = (s) => {
    let h = 0;
    const x = String(s);
    for (let i = 0; i < x.length; i++) h = ((h << 5) - h + x.charCodeAt(i)) | 0;
    return Math.abs(h).toString(36);
};

// Etiqueta del aviso en el teléfono: dos avisos con la misma etiqueta no se
// apilan, el nuevo reemplaza al anterior.
export const etiquetaPush = (categoria, clave) => `gk-${categoria}-${hashCorto(clave)}`;
