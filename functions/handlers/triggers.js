// RUTA: functions/handlers/triggers.js

const functions = require("firebase-functions");
const admin = require("firebase-admin");

// --- Helper de Notificaciones ---
// (Esta función no cambia, pero es usada por los triggers)
const sendNotificationToUser = async (userId, notificationPayload, dataPayload) => {
    // ... (código existente sin cambios)
};

// =========================================================================================
// ✅ INICIO DE NUEVAS FUNCIONES PARA EL PLANIFICADOR COLABORATIVO
// =========================================================================================

/**
 * El Sincronizador Automático (Cerebro Central).
 * Se activa cuando se escribe en cualquier agenda y mantiene la colección 'pdv_assignments'
 * actualizada para saber qué PDV está asignado a qué reporter.
 */
exports.onAgendaWrite = functions.firestore
    .document('agendas/{reporterId}')
    .onWrite(async (change, context) => {
        const { reporterId } = context.params;
        const db = admin.firestore();
        const batch = db.batch();

        // Obtener el nombre del reporter para almacenarlo en la asignación
        let reporterName = 'Reporter'; // Valor por defecto
        try {
            const reporterDoc = await db.doc(`reporters/${reporterId}`).get();
            if (reporterDoc.exists) {
                reporterName = reporterDoc.data().name;
            }
        } catch (error) {
            functions.logger.error(`No se pudo obtener el nombre para el reporterId: ${reporterId}`, error);
        }

        // Función de ayuda para extraer todos los IDs de PDV de un objeto de agenda
        const getPdvIdsFromAgenda = (agendaData) => {
            if (!agendaData || !agendaData.days) return new Set();
            const allStops = Object.values(agendaData.days).flat();
            return new Set(allStops.map(stop => stop.id));
        };

        const beforeData = change.before.data();
        const afterData = change.after.data();

        const pdvIdsBefore = getPdvIdsFromAgenda(beforeData);
        const pdvIdsAfter = getPdvIdsFromAgenda(afterData);

        // 1. Encontrar PDVs eliminados (estaban antes pero ya no están)
        const removedPdvIds = new Set([...pdvIdsBefore].filter(id => !pdvIdsAfter.has(id)));
        if (removedPdvIds.size > 0) {
            functions.logger.log(`Detectados ${removedPdvIds.size} PDV eliminados de la agenda de ${reporterName}.`);
            removedPdvIds.forEach(pdvId => {
                const assignmentRef = db.doc(`pdv_assignments/${pdvId}`);
                batch.delete(assignmentRef);
            });
        }

        // 2. Encontrar PDVs añadidos (no estaban antes pero ahora sí)
        const addedPdvIds = new Set([...pdvIdsAfter].filter(id => !pdvIdsBefore.has(id)));
        if (addedPdvIds.size > 0) {
            functions.logger.log(`Detectados ${addedPdvIds.size} PDV añadidos a la agenda de ${reporterName}.`);
            addedPdvIds.forEach(pdvId => {
                // Encontrar el día para un contexto más rico (opcional pero útil)
                let dayAssigned = 'desconocido';
                if (afterData && afterData.days) {
                    for (const [day, stops] of Object.entries(afterData.days)) {
                        if (stops.some(stop => stop.id === pdvId)) {
                            dayAssigned = day;
                            break;
                        }
                    }
                }
                const assignmentRef = db.doc(`pdv_assignments/${pdvId}`);
                batch.set(assignmentRef, {
                    reporterId: reporterId,
                    reporterName: reporterName,
                    day: dayAssigned,
                    assignedAt: admin.firestore.FieldValue.serverTimestamp()
                });
            });
        }
        
        // 3. Si no hay cambios, no hacer nada. Si los hay, ejecutar el lote.
        if (removedPdvIds.size === 0 && addedPdvIds.size === 0) {
            functions.logger.log("onAgendaWrite: No se detectaron cambios en las asignaciones de PDV.");
            return null;
        }

        try {
            await batch.commit();
            functions.logger.log(`pdv_assignments actualizado correctamente para la agenda de ${reporterName}.`);
            return null;
        } catch (error) {
            functions.logger.error(`Error al actualizar pdv_assignments para el reporter ${reporterId}:`, error);
            return null;
        }
    });

/**
 * El Guardián de Limpieza.
 * Se activa al eliminar un reporter y limpia todos sus datos asociados.
 */
exports.onDeleteReporter = functions.firestore
    .document('reporters/{reporterId}')
    .onDelete(async (snap, context) => {
        const { reporterId } = context.params;
        const deletedReporterData = snap.data();
        const reporterName = deletedReporterData.name || 'desconocido';

        functions.logger.log(`Iniciando limpieza para el reporter eliminado: ${reporterName} (ID: ${reporterId})`);

        const db = admin.firestore();
        const batch = db.batch();

        // ACCIÓN 1: Desasignar todos los PDV del reporter
        const assignmentsQuery = db.collection('pdv_assignments').where('reporterId', '==', reporterId);
        
        try {
            const assignmentsSnapshot = await assignmentsQuery.get();
            if (!assignmentsSnapshot.empty) {
                functions.logger.log(`Encontrados ${assignmentsSnapshot.size} PDV asignados a ${reporterName}. Desasignando...`);
                assignmentsSnapshot.docs.forEach(doc => {
                    batch.delete(doc.ref);
                });
            }

            // ACCIÓN 2: Eliminar la agenda del reporter
            const agendaRef = db.doc(`agendas/${reporterId}`);
            batch.delete(agendaRef);
            functions.logger.log(`Agenda para ${reporterName} marcada para eliminación.`);

            await batch.commit();
            
            functions.logger.log(`Limpieza completada exitosamente para el reporter ${reporterName}.`);
            return null;

        } catch (error) {
            functions.logger.error(`Error durante la limpieza del reporter ${reporterId}:`, error);
            return null;
        }
    });

// =========================================================================================
// FIN DE NUEVAS FUNCIONES
// =========================================================================================


// --- Triggers de Notificaciones (EXISTENTES) ---

exports.onReportCreated = functions.firestore
    .document("visit_reports/{reportId}")
    .onCreate(async (snap, context) => {
        // ... (código existente sin cambios)
    });

exports.onTaskDelegated = functions.firestore
    .document("delegated_tasks/{taskId}")
    .onCreate(async (snap, context) => {
        // ... (código existente sin cambios)
    });

exports.onTransferCreated = functions.firestore.document("transfers/{transferId}").onCreate(async (snap) => {
    // ... (código existente sin cambios)
});

// --- Triggers de Mantenimiento de Datos (EXISTENTES) ---

exports.checkAndCreateReporter = functions.firestore
    .document("visit_reports/{reportId}")
    .onCreate(async (snap) => {
        // ... (código existente sin cambios)
    });

exports.onReportDeleted = functions.firestore
    .document("visit_reports/{reportId}")
    .onDelete(async (snap, context) => {
        // ... (código existente sin cambios)
    });