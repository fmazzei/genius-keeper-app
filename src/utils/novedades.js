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
//   · Decisión del dueño (3-nov-2026): lo que es de administración —usuarios y
//     accesos, configuración, correcciones de datos, Kroma, comisiones y
//     pagos— va SOLO a `['master']`. Otros roles solo reciben una novedad si
//     cambia algo que ellos mismos ven o hacen en su pantalla. Ante la duda,
//     `['master']`.
//   · `titulo` de pocas palabras; `resumen` de una o dos frases: qué cambia para
//     esa persona, no cómo se hizo.
//   · Las más nuevas van ARRIBA.
//
// Se empaqueta para el servidor en `functions/handlers/generado/novedades.cjs`.

export const NOVEDADES = [
    {
        id: '2026-11-12-bodega-caracas',
        fecha: '2026-11-12',
        roles: ['master'],
        titulo: 'Bodega Caracas y consumo interno',
        resumen: 'El inventario valorado junta lo que va en camino, lo de ACC y lo entregado sin factura en una sola bodega Caracas. El picking ya no es venta: la venta será la factura. El autoconsumo y las muestras salen como consumo interno, cada uno a su cuenta.',
    },
    {
        id: '2026-11-12-presentacion-con-tamano',
        fecha: '2026-11-12',
        roles: ['master'],
        titulo: 'Envasados con su tamaño',
        resumen: 'Al envasar, cada partida se guarda como «… · 250 g» o «… · 1 kg». El inventario valorado ya no mezcla las bolsas de 1 kg con las de 250 g. Se corrigieron los envasados del 5, 10 y 11 de noviembre.',
    },
    {
        id: '2026-11-12-inventario-caracas-admin',
        fecha: '2026-11-12',
        roles: ['administrador', 'master'],
        titulo: 'Almacén en Administración',
        resumen: 'Administración tiene la pestaña «Almacén», como el máster, gerencia y el vendedor: recibe el camión, da entradas, descuenta, corrige (también lotes cerrados) y registra pickings, igual que el máster. Corregir o borrar el historial de movimientos sigue siendo solo del máster, desde la pista del lote.',
    },
    {
        id: '2026-11-04-liquidacion-verificada',
        fecha: '2026-11-04',
        roles: ['master'],
        titulo: 'Pagar comisiones y bonos con cruces de verificación',
        resumen: 'Antes de pagar, Liquidaciones vuelve a sumar cada cifra por otro camino: lo que ve el vendedor, factura por factura, escalones, semanas y pagos. Si algo no cuadra no deja pagar, y el comprobante guarda la foto del cálculo con su firma.',
    },
    {
        id: '2026-11-04-vendedor-ordenado',
        fecha: '2026-11-04',
        roles: ['vendedor', 'master'],
        titulo: 'Tu página, más ordenada',
        resumen: 'Mi Semana es tu gestión, la segunda pestaña es lo que ganas (se llama «Mis bonos», «Mis comisiones» o «Comisión y bonos» según tu plan) y Mis KPIs son tus indicadores. El botón Nuevo pedido está ahora en la pestaña Pedidos.',
    },
    {
        id: '2026-11-04-plan-vendedor',
        fecha: '2026-11-04',
        roles: ['vendedor', 'master'],
        titulo: 'Tu plan de comisiones, en tu inicio',
        resumen: 'Tu inicio muestra ahora tu plan tal como es: lo que llevas ganado este mes, lo que ganas al cumplir tu meta y una tarjeta por cada forma en que ganas, con lo que te falta para el siguiente premio.',
    },
    {
        id: '2026-11-04-constructor-piezas',
        fecha: '2026-11-04',
        roles: ['master'],
        titulo: 'Constructor de comisiones por piezas',
        resumen: 'El esquema de cada vendedor se arma con piezas que agregas y quitas (sueldo, comisión, premios en dólares, foodservice…), con tres preguntas para empezar, un simulador que muestra de dónde sale cada dólar y avisos que no dejan guardar un error como un bono de 80 %. La propuesta en PDF muestra solo lo que el vendedor tiene.',
    },
    {
        id: '2026-11-03-remuneracion-bloques',
        fecha: '2026-11-03',
        roles: ['master'],
        titulo: 'Comisiones por bloques y traspaso de cartera',
        resumen: 'El esquema de cada vendedor se arma por bloques: fijo, comisión %, bono por nivel en USD, Activación (en % o en dólares) y crecimiento, y foodservice con sus propios bonos y su meta en kg, con plantillas y vista previa. Nuevo en Comercial: "Traspasar cartera" (toda o algunos clientes) sin duplicados, y al desactivar un vendedor se pide su fecha de cese.',
    },
    {
        id: '2026-11-03-kroma-hold-consumibles',
        fecha: '2026-11-03',
        roles: ['master'],
        titulo: 'Kroma: hold con un botón y consumibles en ml y g',
        resumen: 'El cuajado se cierra con el botón naranja "Hold": eliges la fecha, OK, y el botón dice hasta cuándo. En el cierre del día los consumibles se anotan en ml o g (o L y kg) y se pueden escribir.',
    },
    {
        id: '2026-11-03-entrada-sin-lectura',
        fecha: '2026-11-03',
        roles: ['master'],
        titulo: 'Entrar con señal lenta ya no dice "sin rol"',
        resumen: 'Si al entrar no se puede leer el perfil, GK lo intenta tres veces y, si no lo logra, dice que fue la conexión y ofrece Reintentar, en vez de decir que la cuenta no tiene rol.',
    },
    {
        id: '2026-11-03-liberar-correo',
        fecha: '2026-11-03',
        roles: ['master'],
        titulo: 'Reusar el correo de quien se fue',
        resumen: 'Si un correo ya está en uso, GK dice de quién es y, si esa persona está inactiva, lo libera para la cuenta nueva. Sus comisiones y pagos quedan para liquidarle.',
    },
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
