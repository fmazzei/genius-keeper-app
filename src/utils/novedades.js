// RUTA: src/utils/novedades.js — NOVEDADES DE LA APP (pedido del dueño, 27-oct-2026).
//
// Cada cambio que se publica deja aquí una entrada corta, en lenguaje de quien
// usa la app. El servidor la anuncia UNA vez por teléfono (✨ Novedades) y la
// app la muestra en su tarjeta dorada hasta que la persona la ve.
//
// Reglas para escribir una novedad:
//   · `id` único y fijo (nunca se reutiliza): fecha + palabra.
//   · `roles`: a quién le sirve (vacío = a todos). Roles: master, gerencia,
//     vendedor, merchandiser, administrador.
//   · `titulo` de pocas palabras; `resumen` de una o dos frases: qué cambia para
//     esa persona, no cómo se hizo.
//   · Las más nuevas van ARRIBA.
//
// Se empaqueta para el servidor en `functions/handlers/generado/novedades.cjs`.

export const NOVEDADES = [
    {
        id: '2026-10-29-planilla-fecha',
        fecha: '2026-10-29',
        roles: ['master'],
        titulo: 'Fecha de la planilla',
        resumen: 'Al cargar una planilla en Kroma, la fecha se lee en palabras ("29 de septiembre de 2026") y no se puede guardar una fecha posterior a hoy. Si corriges la fecha, el lote y el vencimiento de su queso en cava cambian con ella.',
    },
    {
        id: '2026-10-29-rotacion-sin-vencido',
        fecha: '2026-10-29',
        roles: ['master', 'gerencia', 'vendedor'],
        titulo: 'Rotación sin vencidos',
        resumen: 'La rotación ya no cuenta como venta el producto vencido que desapareció del anaquel, las devoluciones ni una entrega anotada dos veces. El reporte dice cuántas unidades se descontaron y por qué.',
    },
    {
        id: '2026-10-29-entrega-repetida',
        fecha: '2026-10-29',
        roles: ['merchandiser'],
        titulo: 'Entregas sin repetir',
        resumen: 'Si anotaste una entrada "sin factura", el teléfono ya no te vuelve a pedir esa misma factura en la visita siguiente. Y si ves producto vencido, declara el retiro en la visita.',
    },
    {
        id: '2026-10-27-centro-notificaciones',
        fecha: '2026-10-27',
        roles: [],
        titulo: 'Notificaciones por tipo',
        resumen: 'Cada notificación empieza con su tipo: 🔴 Anaquel bajo, 📋 Reporte, 🤖 Agente, 📦 Operación y ✨ Novedades. Ya no llegan repetidas.',
    },
    {
        id: '2026-10-27-centro-notificaciones-master',
        fecha: '2026-10-27',
        roles: ['master'],
        titulo: 'Centro de notificaciones',
        resumen: 'En Configuraciones → Sistema eliges qué tipo de notificación recibe cada rol y cada persona.',
    },
    {
        id: '2026-10-24-anaquel-bajo',
        fecha: '2026-10-24',
        roles: ['master', 'gerencia', 'vendedor', 'merchandiser'],
        titulo: 'Alerta de anaquel bajo',
        resumen: 'Si un punto queda con 6 unidades o menos y no se repone en la visita, verás un renglón rojo arriba hasta que se reponga (o 72 h).',
    },
];

// Las novedades que le tocan a un rol ('sales_manager' y 'director' = gerencia).
export const novedadesDelRol = (role, lista = NOVEDADES) => {
    const r = (role === 'sales_manager' || role === 'director') ? 'gerencia' : role;
    return lista.filter(n => !n.roles?.length || n.roles.includes(r));
};
