/**
 * Limpieza de visit_reports y notifications duplicados.
 *
 * Causa original: un permission-denied al crear notificaciones de "Nuevo
 * Entrante" hacía que el reporte (ya guardado en visit_reports) se
 * encolara también en pending_reports y se re-enviara por
 * useOfflineSync, generando un segundo documento idéntico. Esto ya fue
 * corregido (commit ea61c6f); este script limpia los documentos
 * duplicados que ya existen en Firestore desde antes del fix.
 *
 * Uso:
 *   cd functions
 *   GOOGLE_APPLICATION_CREDENTIALS=/ruta/a/serviceAccount.json node scripts/cleanupDuplicateReports.mjs           # dry-run (no borra nada)
 *   GOOGLE_APPLICATION_CREDENTIALS=/ruta/a/serviceAccount.json node scripts/cleanupDuplicateReports.mjs --execute # borra los duplicados detectados
 */

import admin from 'firebase-admin';

admin.initializeApp();
const db = admin.firestore();

const EXECUTE = process.argv.includes('--execute');

// Campos que no deben influir en la comparación de "mismo reporte".
const IGNORED_FIELDS = new Set(['id', 'createdAt', 'reportId']);

function toMillis(value) {
    if (!value) return 0;
    if (typeof value.toMillis === 'function') return value.toMillis();
    if (value instanceof Date) return value.getTime();
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? 0 : parsed.getTime();
}

function dayKey(value) {
    const ms = toMillis(value);
    if (!ms) return 'sin-fecha';
    return new Date(ms).toISOString().slice(0, 10); // YYYY-MM-DD
}

function normalizedContentKey(data) {
    const entries = Object.entries(data)
        .filter(([key]) => !IGNORED_FIELDS.has(key))
        .sort(([a], [b]) => a.localeCompare(b));
    return JSON.stringify(entries);
}

async function findDuplicateGroups(collectionName, groupKeyFn) {
    const snap = await db.collection(collectionName).get();
    const groups = new Map();

    snap.forEach((doc) => {
        const data = doc.data();
        const key = groupKeyFn(doc, data);
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key).push({ id: doc.id, data, createdAtMillis: toMillis(data.createdAt) });
    });

    // Solo nos interesan los grupos con más de un documento.
    return [...groups.values()].filter((group) => group.length > 1);
}

async function cleanupVisitReports() {
    console.log('\n=== visit_reports ===');

    const groups = await findDuplicateGroups('visit_reports', (doc, data) => {
        const userId = data.userId || 'sin-usuario';
        const posId = data.posId || data.posName || 'sin-pos';
        return `${userId}__${posId}__${dayKey(data.createdAt)}__${normalizedContentKey(data)}`;
    });

    let toDelete = [];

    for (const group of groups) {
        // Ordenar por fecha de creación (más antiguo primero) y conservar el primero.
        group.sort((a, b) => a.createdAtMillis - b.createdAtMillis);
        const [keep, ...dupes] = group;

        console.log(`Duplicado detectado: posName="${keep.data.posName}" userName="${keep.data.userName}" fecha=${dayKey(keep.data.createdAt)}`);
        console.log(`  Conservar: ${keep.id} (createdAt=${new Date(keep.createdAtMillis).toISOString()})`);
        dupes.forEach((d) => console.log(`  Eliminar:  ${d.id} (createdAt=${new Date(d.createdAtMillis).toISOString()})`));

        toDelete.push(...dupes.map((d) => ({ collection: 'visit_reports', id: d.id })));
    }

    if (groups.length === 0) {
        console.log('No se encontraron reportes duplicados.');
    }

    return toDelete;
}

async function cleanupNotifications() {
    console.log('\n=== notifications (tipo "new_entrant") ===');

    const groups = await findDuplicateGroups('notifications', (doc, data) => {
        if (data.type !== 'new_entrant') return `__skip__${doc.id}`; // grupo de un solo elemento, no se considera duplicado
        const userId = data.userId || 'sin-usuario';
        return `${userId}__${data.posName || 'sin-pos'}__${dayKey(data.createdAt)}__${data.body || ''}`;
    });

    let toDelete = [];

    for (const group of groups) {
        group.sort((a, b) => a.createdAtMillis - b.createdAtMillis);
        const [keep, ...dupes] = group;

        console.log(`Duplicado detectado: posName="${keep.data.posName}" userId="${keep.data.userId}" fecha=${dayKey(keep.data.createdAt)}`);
        console.log(`  Conservar: ${keep.id} (createdAt=${new Date(keep.createdAtMillis).toISOString()})`);
        dupes.forEach((d) => console.log(`  Eliminar:  ${d.id} (createdAt=${new Date(d.createdAtMillis).toISOString()})`));

        toDelete.push(...dupes.map((d) => ({ collection: 'notifications', id: d.id })));
    }

    if (groups.length === 0) {
        console.log('No se encontraron notificaciones duplicadas.');
    }

    return toDelete;
}

async function main() {
    const reportDeletes = await cleanupVisitReports();
    const notificationDeletes = await cleanupNotifications();
    const allDeletes = [...reportDeletes, ...notificationDeletes];

    console.log(`\nTotal de documentos duplicados a eliminar: ${allDeletes.length}`);

    if (!EXECUTE) {
        console.log('\nModo dry-run: no se eliminó nada. Ejecuta con --execute para borrar los duplicados listados arriba.');
        return;
    }

    if (allDeletes.length === 0) return;

    const batchSize = 400; // límite de Firestore es 500 por batch
    for (let i = 0; i < allDeletes.length; i += batchSize) {
        const batch = db.batch();
        for (const item of allDeletes.slice(i, i + batchSize)) {
            batch.delete(db.collection(item.collection).doc(item.id));
        }
        await batch.commit();
    }

    console.log('Duplicados eliminados.');
}

main().catch((err) => {
    console.error('Error ejecutando el script de limpieza:', err);
    process.exit(1);
});
