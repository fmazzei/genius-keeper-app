// RUTA: src/Kroma/permisos.js
//
// QUIÉN VE QUÉ Y QUIÉN PUEDE TOCARLO — una sola fuente para toda Kroma.
//
// Antes esto vivía duplicado: `DEFAULT_MODULES` en KromaShell.jsx y una copia
// "espejo" en ControlSistemaPage.jsx. Dos copias del mismo reparto de oficios
// se separan solas, y cuando se separan el panel de permisos muestra una cosa
// y la app hace otra — que es justo lo que no puede pasar en el tablero donde
// se reparten los oficios.
//
// Hay DOS capas, y son distintas a propósito:
//   · MÓDULOS  — qué pantallas VE la persona (el menú lateral).
//   · EDICIÓN  — qué puede CARGAR o CORREGIR dentro de las que ve.
//
// La segunda capa existía en el panel de Control del Sistema pero no mandaba:
// `canEdit`/`canDelete` solo se consultaban en DOS botones de Almacenes, así
// que apagar "Editar" en cualquier otro módulo no impedía nada. Al hacerla
// mandar de verdad hubo que darle DEFAULTS POR ROL: `permisos.editar` está
// vacío en casi todos los perfiles, y sin defaults el primer día con la regla
// activa el operario no habría podido ni abrir una planilla.

// ── Capa 1: qué VE cada rol ────────────────────────────────────────────────
export const DEFAULT_MODULES = {
    kroma_operario:  { puestaEnMarcha: true, produccionDiaria: true,  leche: true,  inventarioMateriales: true,  constructores: true,  despachos: true,  almacenes: false, historialProduccion: false, catalogos: false, usuarios: false, controlSistema: false, dashboardsGerenciales: false },
    kroma_admin:     { puestaEnMarcha: true, produccionDiaria: false, leche: false, inventarioMateriales: true,  constructores: false, despachos: true,  almacenes: true,  historialProduccion: true,  catalogos: true,  usuarios: true,  controlSistema: true,  dashboardsGerenciales: false },
    kroma_gerencial: { puestaEnMarcha: true, produccionDiaria: false, leche: false, inventarioMateriales: false, constructores: false, despachos: false, almacenes: true,  historialProduccion: true,  catalogos: true,  usuarios: true,  controlSistema: false, dashboardsGerenciales: true  },
    master:          { puestaEnMarcha: true, produccionDiaria: true,  leche: true,  inventarioMateriales: true,  constructores: true,  despachos: true,  almacenes: true,  historialProduccion: true,  catalogos: true,  usuarios: true,  controlSistema: true,  dashboardsGerenciales: true  },
};

// ── Capa 2: qué puede CARGAR o CORREGIR cada rol ───────────────────────────
// Decisión del dueño (2026-09): las compras de insumos y materiales las carga
// el ADMINISTRADOR. El operario no carga existencias — se descuentan solas con
// el consumo de cada proceso —, pero SÍ ve el stock, porque necesita saber si
// le queda cuajo antes de arrancar una producción. De ahí que el operario
// tenga `inventarioMateriales` en la capa 1 (ve) y NO en la capa 2 (no carga).
export const DEFAULT_EDIT = {
    kroma_operario:  { produccionDiaria: true,  leche: true,  inventarioMateriales: false, constructores: true,  despachos: true,  almacenes: false, historialProduccion: false, catalogos: false, usuarios: false, controlSistema: false, dashboardsGerenciales: false },
    // "Administrador: solo lectura en históricos" (regla de negocio) → historialProduccion en false.
    kroma_admin:     { produccionDiaria: false, leche: false, inventarioMateriales: true,  constructores: false, despachos: true,  almacenes: true,  historialProduccion: false, catalogos: true,  usuarios: true,  controlSistema: true,  dashboardsGerenciales: false },
    // "Gerencia: puede editar históricos" (regla de negocio) → historialProduccion en true.
    kroma_gerencial: { produccionDiaria: false, leche: false, inventarioMateriales: false, constructores: false, despachos: false, almacenes: true,  historialProduccion: true,  catalogos: false, usuarios: false, controlSistema: false, dashboardsGerenciales: false },
    master:          { produccionDiaria: true,  leche: true,  inventarioMateriales: true,  constructores: true,  despachos: true,  almacenes: true,  historialProduccion: true,  catalogos: true,  usuarios: true,  controlSistema: true,  dashboardsGerenciales: true  },
};

/** Lo que el rol trae de fábrica, antes de los toggles por persona. */
export const defaultModulos = (role) => DEFAULT_MODULES[role] || {};
export const defaultEditar  = (role) => DEFAULT_EDIT[role]    || {};

/**
 * Valor EFECTIVO de un permiso: el toggle explícito de la persona manda sobre
 * el default de su rol. Se usa `??` y no `||` a propósito — con `||`, un
 * "apagado" puesto a mano por el máster se perdería contra un default en true.
 */
export const efectivo = (explicito, porDefecto) =>
    (explicito === true || explicito === false) ? explicito : !!porDefecto;

/**
 * COSTOS — regla de negocio transversal, no un permiso configurable:
 * «El maestro quesero / operario NUNCA debe ver costos», ni en recetas, ni en
 * procesos, ni en recepción de leche, ni en la planilla, ni en inventarios.
 * Por eso no sale del panel de permisos: no es algo que se le pueda conceder.
 */
export const puedeVerCostos = (role) =>
    role === 'master' || role === 'kroma_owner' || role === 'kroma_admin' || role === 'kroma_gerencial';

/**
 * ¿Este rol VE este módulo? Mismo criterio que usa el menú lateral: el toggle
 * explícito del usuario manda, y lo que no está declarado se muestra (por eso
 * `!== false` y no `=== true`). Vive acá para que la navegación y el menú no
 * puedan discrepar — un botón que lleva a una pantalla que el menú esconde
 * simplemente no hace nada, y eso se ve como una app rota.
 */
export const moduloVisible = (role, modulosUsuario, modulo) => {
    if (role === 'master' || role === 'kroma_owner') return true;
    const explicito = (modulosUsuario || {})[modulo];
    const porDefecto = defaultModulos(role)[modulo];
    return (explicito === undefined ? porDefecto : explicito) !== false;
};
