// RUTA: src/utils/anaquelCatalogo.js
//
// CATÁLOGO DEL ANAQUEL — los valores que el mercaderista elige en el reporte de
// visita. No existe un catálogo en la base de datos: estos `id` son EXACTAMENTE
// los que se guardan en `visit_reports` (`shelfLocation`, `adjacentCategory`,
// `popStatus`), así que no se pueden cambiar sin migrar datos. Las etiquetas sí.
//
// Es la fuente única para el análisis v2 y, en la Fase 2, para el formulario.

export const ALTURAS = [
    { id: 'ojos', label: 'Nivel ojos' },
    { id: 'manos', label: 'Nivel manos' },
    { id: 'superior', label: 'Nivel superior' },
    { id: 'inferior', label: 'Nivel inferior' },
];

export const CATEGORIAS_VECINAS = [
    { id: 'Quesos crema', label: 'Quesos crema' },
    { id: 'Quesos de Cabra', label: 'Quesos de cabra' },
    { id: 'Delicatessen', label: 'Delicatessen' },
    { id: 'Nevera Charcutería', label: 'Charcutería' },
];

export const ESTADOS_POP = [
    { id: 'Exhibido correctamente', label: 'Exhibido OK' },
    { id: 'Dañado', label: 'Dañado' },
    { id: 'Ausente', label: 'Ausente' },
    { id: 'Sin Campaña Activa', label: 'Sin campaña' },
];

const porId = (lista) => Object.fromEntries(lista.map(x => [x.id, x.label]));
const LBL_ALTURA = porId(ALTURAS);
const LBL_CATEGORIA = porId(CATEGORIAS_VECINAS);

export const etiquetaAltura = (id) => LBL_ALTURA[id] || id || '—';
export const etiquetaCategoria = (id) => LBL_CATEGORIA[id] || id || '—';
