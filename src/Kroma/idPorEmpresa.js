// RUTA: src/Kroma/idPorEmpresa.js
//
// Documentos de configuración con id FIJO (`kroma_config/milk_params`,
// `kroma_fixed_costs/{YYYY-MM}`) — uno por empresa. Lacteoca conserva sus ids
// históricos (no se migra nada: su configuración y sus meses guardados siguen
// donde estaban); cualquier otra empresa recibe el suyo con prefijo. Antes el id
// era el mismo para todas, así que una empresa nueva chocaba con el documento de
// Lacteoca y las reglas le negaban leerlo y guardarlo: esas pantallas no le
// servían. Mismo criterio que `rotacionDocId` de Rotación de Cava.
export const idPorEmpresa = (id, empresaId) =>
    (!empresaId || empresaId === 'lacteoca') ? id : `${empresaId}__${id}`;
