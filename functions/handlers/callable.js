// RUTA: functions/handlers/callable.js

const functions = require("firebase-functions");
const admin = require("firebase-admin");
const axios = require("axios");
const {
  generateRegistrationOptions,
  verifyRegistrationResponse,
  generateAuthenticationOptions,
  verifyAuthenticationResponse,
} = require("@simplewebauthn/server");

// --- Helper de Distancia (Haversine) ---
const haversineDistance = (coords1, coords2) => {
    if (!coords1?.lat || !coords1?.lng || !coords2?.lat || !coords2?.lng) return Infinity;
    const toRad = (x) => (x * Math.PI) / 180;
    const R = 6371; // Radio de la Tierra en km
    const dLat = toRad(coords2.lat - coords1.lat);
    const dLon = toRad(coords2.lng - coords1.lng);
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
              Math.cos(toRad(coords1.lat)) * Math.cos(toRad(coords2.lat)) *
              Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
};

// Configuración de WebAuthn (Relying Party)
const rpName = "Genius Keeper";
const rpID = "geniuskeeper-36553.web.app";
const origin = `https://${rpID}`;


// --- Helper de Auditoría ---
const logInventoryMovement = (transaction, movementData) => {
    const logRef = admin.firestore().collection("movimientos_inventario").doc();
    transaction.set(logRef, {
        ...movementData,
        timestamp: admin.firestore.FieldValue.serverTimestamp()
    });
};

// --- Helper de Notificaciones ---
const sendNotificationToUser = async (userId, notificationPayload, dataPayload) => {
    if (!userId) return;
    await admin.firestore().collection("notifications").add({
        userId,
        title: notificationPayload.title,
        body: notificationPayload.body,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        read: false,
        link: dataPayload.link || ''
    });
    const tokensRef = admin.firestore().collection("users_metadata").doc(userId).collection("tokens");
    const tokensSnap = await tokensRef.get();
    if (tokensSnap.empty) return;
    const tokens = tokensSnap.docs.map(doc => doc.id);
    const payload = { notification: notificationPayload, data: dataPayload };
    await admin.messaging().sendEachForMulticast({ tokens, ...payload });
};


// ==========================================================
// --- Funciones de Utilidad General ---
// ==========================================================

exports.geocodeAddress = functions.https.onCall(async (data, context) => {
    if (!context.auth) throw new functions.https.HttpsError("unauthenticated", "El usuario debe estar autenticado.");
    const { address, location: userLocation } = data;
    if (!address) throw new functions.https.HttpsError("invalid-argument", "Se debe proporcionar una dirección.");
    const API_KEY_GEOCODING = functions.config().genius.maps_api_key;
    if (!API_KEY_GEOCODING) throw new functions.https.HttpsError("internal", "La clave de API de Maps no está configurada.");
    let url = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(address)}&region=ve&key=${API_KEY_GEOCODING}`;
    if (userLocation?.lat && userLocation?.lng) url += `&locationbias=${encodeURIComponent(`circle:50000@${userLocation.lat},${userLocation.lng}`)}`;
    try {
        const response = await axios.get(url);
        if (response.data.status === "OK" && response.data.results.length > 0) return response.data.results[0].geometry.location;
        throw new functions.https.HttpsError("not-found", `No se encontraron coordenadas. Estado: ${response.data.status}`);
    } catch (error) {
        functions.logger.error("Error en API de Geocoding:", error);
        throw new functions.https.HttpsError("internal", "Error al contactar el servicio de geocodificación.");
    }
});

exports.processImageForDate = functions.runWith({ minInstances: 1 }).https.onCall(async (data, context) => {
    if (!context.auth) throw new functions.https.HttpsError("unauthenticated", "El usuario debe estar autenticado.");
    if (!data.imageBase64) throw new functions.https.HttpsError("invalid-argument", "Se debe proporcionar una imagen en formato base64.");
    const API_KEY_VISION = functions.config().genius.vision_api_key;
    if (!API_KEY_VISION) throw new functions.https.HttpsError("internal", "La clave de API de Vision no está configurada.");
    const url = `https://vision.googleapis.com/v1/images:annotate?key=${API_KEY_VISION}`;
    try {
        const response = await axios.post(url, { requests: [{ image: { content: data.imageBase64 }, features: [{ type: "TEXT_DETECTION" }] }] });
        const detection = response.data.responses[0]?.fullTextAnnotation;
        if (detection) {
            const dateRegex = /(\d{1,2}[\s\.\/-]\d{1,2}[\s\.\/-]\d{2,4})|(\d{4}[\s\.\/-]\d{1,2}[\s\.\/-]\d{1,2})/g;
            const matches = detection.text.match(dateRegex);
            if (matches && matches.length > 0) return { date: matches[0] };
            throw new functions.https.HttpsError("not-found", "No se encontró un formato de fecha válido.");
        }
        throw new functions.https.HttpsError("not-found", "No se detectó texto en la imagen.");
    } catch (error) {
        functions.logger.error("Error en la API de Vision:", error.response?.data || error.message);
        throw new functions.https.HttpsError("internal", "Error al procesar la imagen.");
    }
});

exports.reverseGeocode = functions.https.onCall(async (data, context) => {
    if (!context.auth) {
        throw new functions.https.HttpsError("unauthenticated", "El usuario debe estar autenticado.");
    }
    const { lat, lng } = data;
    if (!lat || !lng) {
        throw new functions.https.HttpsError("invalid-argument", "Se deben proporcionar latitud y longitud.");
    }
    const API_KEY_GEOCODING = functions.config().genius.maps_api_key;
    if (!API_KEY_GEOCODING) {
      throw new functions.https.HttpsError("internal", "La clave de API de Maps no está configurada.");
    }
    const url = `https://maps.googleapis.com/maps/api/geocode/json?latlng=${lat},${lng}&key=${API_KEY_GEOCODING}`;
    try {
        const response = await axios.get(url);
        if (response.data.status === "OK" && response.data.results.length > 0) {
            return { address: response.data.results[0].formatted_address };
        } else {
            throw new functions.https.HttpsError("not-found", `No se encontró una dirección para las coordenadas. Estado: ${response.data.status}`);
        }
    } catch (error) {
        functions.logger.error("Error en la llamada a la API de Reverse Geocoding:", error);
        throw new functions.https.HttpsError("internal", "Ocurrió un error al contactar el servicio de geocodificación.");
    }
});

// ==========================================================
// --- El Cerebro del Planificador Inteligente (Versión Final) ---
// ==========================================================
exports.generateSmartAgenda = functions.runWith({timeoutSeconds: 300, memory: '1GB'}).https.onCall(async (data, context) => {
    if (!context.auth) {
        throw new functions.https.HttpsError("unauthenticated", "El usuario debe estar autenticado.");
    }

    const { city, visitCount, dailyHours, anchorPoint, startMode = 'fixed', excludeIds = [], depotVisits = {}, isContinuation = false } = data;
    
    functions.logger.info("SMART AGENDA DEBUG (INICIO): Datos recibidos", { dataRecibida: data });
    
    const API_KEY_MAPS = functions.config().genius.maps_api_key;

    if (!anchorPoint) throw new functions.https.HttpsError("invalid-argument", "Se requiere un punto de anclaje.");
    if (!visitCount || visitCount <= 0) throw new functions.https.HttpsError("invalid-argument", "Se debe especificar un número de visitas.");

    let anchorPointCoords;
    try {
        const geocodeUrl = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(anchorPoint)}&region=ve&key=${API_KEY_MAPS}`;
        functions.logger.info("SMART AGENDA DEBUG: URL de Geocodificación", { url: geocodeUrl });
        
        const geocodeResponse = await axios.get(geocodeUrl);
        
        functions.logger.info("SMART AGENDA DEBUG: Respuesta de Geocodificación", { status: geocodeResponse.data.status, results: geocodeResponse.data.results.length });

        if (geocodeResponse.data.status !== 'OK' || geocodeResponse.data.results.length === 0) {
            throw new functions.https.HttpsError("not-found", `No se pudo geocodificar el punto de partida: ${anchorPoint}`);
        }
        anchorPointCoords = geocodeResponse.data.results[0].geometry.location;
        
        functions.logger.info("SMART AGENDA DEBUG: Coordenadas del Punto de Partida obtenidas", { coords: anchorPointCoords });

    } catch (error) {
        functions.logger.error("Error geocodificando anchorPoint:", error);
        throw new functions.https.HttpsError("internal", "Error al buscar la ubicación del punto de partida.");
    }

    const posQuery = admin.firestore().collection('pos').where('active', '==', true).where('city', '==', city);
    const depotsQuery = admin.firestore().collection('depots').where('city', '==', city);
    
    const [posSnapshot, depotsSnapshot] = await Promise.all([posQuery.get(), depotsQuery.get()]);
    
    const posData = posSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    const depotsData = depotsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

    if (posData.length === 0) {
        return { name: `Agenda para ${city}`, days: {}, anchorPoint: data.anchorPoint, anchorPointCoords: anchorPointCoords };
    }
    
    let posWithDistance = posData
        .map(p => {
            const coords = p.coordinates;
            if (!coords || typeof coords.lat !== 'number' || typeof coords.lng !== 'number') return null;
            return { ...p, coords, distance: haversineDistance(anchorPointCoords, coords) };
        })
        .filter(p => p !== null);

    if (excludeIds && excludeIds.length > 0) {
        const excludedSet = new Set(excludeIds);
        posWithDistance = posWithDistance.filter(p => !excludedSet.has(p.id));
    }

    posWithDistance.sort((a, b) => a.distance - b.distance);
    
    const maxStopsForApi = 9;
    const selectedPos = posWithDistance.slice(0, Math.min(visitCount, maxStopsForApi));
    
    if (selectedPos.length === 0 && Object.keys(depotVisits).length === 0) {
        return { name: `Agenda para ${city}`, days: {}, anchorPoint: data.anchorPoint, anchorPointCoords: anchorPointCoords };
    }

    const locationsToMatrix = [{ ...anchorPointCoords, id: 'anchor' }, ...selectedPos.map(p => ({ ...p.coordinates, id: p.id }))];
    const origins = locationsToMatrix.map(l => `${l.lat},${l.lng}`).join('|');
    const matrixUrl = `https://maps.googleapis.com/maps/api/distancematrix/json?origins=${origins}&destinations=${origins}&key=${API_KEY_MAPS}`;
    
    try {
        const matrixResponse = await axios.get(matrixUrl);
        if (matrixResponse.data.status !== 'OK') {
             throw new functions.https.HttpsError("internal", `Google Maps API falló con el estado: ${matrixResponse.data.status}`);
        }
        
        const timeMatrix = {};
        matrixResponse.data.rows.forEach((row, i) => {
            const fromId = locationsToMatrix[i].id;
            timeMatrix[fromId] = {};
            row.elements.forEach((element, j) => {
                const toId = locationsToMatrix[j].id;
                if (element.status === 'OK') {
                    timeMatrix[fromId][toId] = Math.ceil((element.duration.value / 60));
                }
            });
        });
    
        const settingsRef = admin.firestore().collection('settings');
        const appConfigDoc = await settingsRef.doc('appConfig').get();
        const DEFAULT_VISIT_DURATION_MINS = appConfigDoc.data()?.averageVisitDurationMins || 20;
    
        const agenda = {};
        let unvisitedPosIds = new Set(selectedPos.map(p => p.id));
        const daysWithHours = Object.keys(dailyHours).filter(day => Number(dailyHours[day]) > 0);
        if (daysWithHours.length === 0) {
             throw new functions.https.HttpsError("invalid-argument", "Debes asignar horas de trabajo a al menos un día.");
        }
    
        const visitsPerDay = Math.ceil(selectedPos.length / daysWithHours.length);
        let lastDayPosId = 'anchor';
    
        for (const day of daysWithHours) {
            agenda[day] = [];
            let timeSpent = 0;
            const dailyTimeLimit = Number(dailyHours[day]) * 60;
            let currentPosId = (startMode === 'variable' && day !== daysWithHours[0]) ? lastDayPosId : 'anchor';
    
            while (unvisitedPosIds.size > 0 && agenda[day].length < visitsPerDay) {
                let nearestPosId = null;
                let minTime = Infinity;
                unvisitedPosIds.forEach(posId => {
                    const travelTime = timeMatrix[currentPosId]?.[posId];
                    if (travelTime !== undefined && travelTime < minTime) { minTime = travelTime; nearestPosId = posId; }
                });
                if (!nearestPosId) break;
    
                const nextPosData = selectedPos.find(p => p.id === nearestPosId);
                const visitDuration = nextPosData?.avgVisitDurationMins || DEFAULT_VISIT_DURATION_MINS;
                const timeToAnchor = (startMode === 'fixed' || unvisitedPosIds.size === 1) ? (timeMatrix[nearestPosId]?.['anchor'] || 0) : 0;
                
                if (timeSpent + minTime + visitDuration + timeToAnchor <= dailyTimeLimit) {
                    agenda[day].push(nextPosData);
                    timeSpent += minTime + visitDuration;
                    currentPosId = nearestPosId;
                    unvisitedPosIds.delete(nearestPosId);
                } else { break; }
            }
            if (agenda[day].length > 0) {
                lastDayPosId = agenda[day][agenda[day].length - 1].id;
            }
        }
        
        if (!isContinuation) {
            for (const depotId in depotVisits) {
                const daysToVisit = depotVisits[depotId];
                const depotData = depotsData.find(p => p.id === depotId);
                if (depotData) {
                    for (const day in daysToVisit) {
                        if (daysToVisit[day] === true) {
                            if (!agenda[day]) {
                                agenda[day] = [];
                            }
                            agenda[day].unshift(depotData);
                        }
                    }
                }
            }
        }

        return { name: `Agenda Generada para ${city}`, days: agenda, anchorPoint: data.anchorPoint, anchorPointCoords: anchorPointCoords };

    } catch (error) {
        functions.logger.error("Error obteniendo matriz de distancias:", error);
        throw new functions.https.HttpsError("internal", "No se pudo obtener la matriz de distancias.");
    }
});

// ==========================================================
// --- Funciones de Gestión de Inventario ---
// ==========================================================

exports.adjustInventory = functions.https.onCall(async (data, context) => { /* ...código original... */ });
exports.requestPositiveAdjustment = functions.https.onCall(async (data, context) => { /* ...código original... */ });
exports.approvePositiveAdjustment = functions.https.onCall(async (data, context) => { /* ...código original... */ });
exports.rejectPositiveAdjustment = functions.https.onCall(async (data, context) => { /* ...código original... */ });
exports.fulfillSale = functions.https.onCall(async (data, context) => { /* ...código original... */ });

// ==========================================================
// --- Funciones de Autenticación Biométrica (WebAuthn) ---
// ==========================================================

exports.generateRegistrationOptions = functions.runWith({ memory: '512MB' }).https.onCall(async (data, context) => { /* ...código original... */ });
exports.verifyRegistration = functions.runWith({ memory: '512MB' }).https.onCall(async (data, context) => { /* ...código original... */ });
exports.generateAuthenticationOptions = functions.runWith({ memory: '512MB' }).https.onCall(async (data) => { /* ...código original... */ });
exports.verifyAuthentication = functions.runWith({ memory: '512MB' }).https.onCall(async (data) => { /* ...código original... */ });


// ==========================================================
// --- Función de Delegación de Visitas ---
// ==========================================================
exports.delegateVisit = functions.https.onCall(async (data, context) => {
    if (!context.auth) {
        throw new functions.https.HttpsError("unauthenticated", "El usuario debe estar autenticado.");
    }

    const { targetUserId, stopData } = data;
    if (!targetUserId || !stopData) {
        throw new functions.https.HttpsError("invalid-argument", "Faltan los datos del usuario objetivo o de la parada.");
    }

    const delegatorId = context.auth.uid;
    const delegatorUserRecord = await admin.auth().getUser(delegatorId);
    const delegatorName = delegatorUserRecord.displayName || delegatorUserRecord.email;

    const task = {
        targetUserId,
        delegatedByUserId: delegatorId,
        delegatedByName: delegatorName,
        stopData,
        status: 'pending',
        createdAt: admin.firestore.FieldValue.serverTimestamp()
    };

    await admin.firestore().collection('delegated_tasks').add(task);

    const notificationPayload = {
        title: 'Nueva Visita Delegada',
        body: `${delegatorName} te ha asignado una visita a: ${stopData.name}.`
    };
    
    const dataPayload = { link: '/tasks' }; 

    await sendNotificationToUser(targetUserId, notificationPayload, dataPayload);

    return { success: true, message: "La visita ha sido delegada con éxito." };
});

// =========================================================================================
// --- Funciones para el Sistema de Delegación de PDV ---
// =========================================================================================

exports.requestDelegation = functions.https.onCall(async (data, context) => {
    if (!context.auth) {
        throw new functions.https.HttpsError("unauthenticated", "El usuario debe estar autenticado.");
    }

    const { requesterId, requesterName, ownerId, pdvId, pdvName } = data;
    if (!requesterId || !requesterName || !ownerId || !pdvId || !pdvName) {
        throw new functions.https.HttpsError("invalid-argument", "Faltan datos para crear la solicitud de delegación.");
    }

    const requestData = {
        requesterId,
        requesterName,
        ownerId,
        pdvId,
        pdvName,
        status: 'pending', 
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
    };

    const requestRef = await admin.firestore().collection('delegation_requests').add(requestData);

    const task = {
        targetReporterId: ownerId,
        type: 'delegation_request',
        title: `Solicitud de Delegación`,
        details: `${requesterName} te ha solicitado la visita a ${pdvName}.`,
        relatedRequestId: requestRef.id, 
        status: 'pending',
        createdAt: admin.firestore.FieldValue.serverTimestamp()
    };
    
    await admin.firestore().collection('delegated_tasks').add(task);
    
    return { success: true, message: "Solicitud enviada." };
});

exports.resolveDelegation = functions.https.onCall(async (data, context) => {
    if (!context.auth) {
        throw new functions.https.HttpsError("unauthenticated", "El usuario debe estar autenticado.");
    }

    const { requestId, resolution } = data;
    if (!requestId || !resolution) {
        throw new functions.https.HttpsError("invalid-argument", "Falta el ID de la solicitud y la resolución.");
    }

    const db = admin.firestore();
    const requestRef = db.doc(`delegation_requests/${requestId}`);

    if (resolution === 'rejected') {
        await requestRef.update({ status: 'rejected' });
        return { success: true, message: "Solicitud rechazada." };
    }

    if (resolution === 'approved') {
        try {
            await db.runTransaction(async (transaction) => {
                const requestDoc = await transaction.get(requestRef);
                if (!requestDoc.exists) {
                    throw new functions.https.HttpsError("not-found", "La solicitud no existe.");
                }
                if (requestDoc.data().status !== 'pending') {
                    throw new functions.https.HttpsError("already-exists", "Esta solicitud ya ha sido resuelta.");
                }

                const { ownerId, requesterId, requesterName, pdvId, pdvName } = requestDoc.data();

                const ownerAgendaRef = db.doc(`agendas/${ownerId}`);
                const requesterAgendaRef = db.doc(`agendas/${requesterId}`);
                const [ownerAgendaDoc, requesterAgendaDoc] = await Promise.all([
                    transaction.get(ownerAgendaRef),
                    transaction.get(requesterAgendaRef)
                ]);

                if (!ownerAgendaDoc.exists) {
                    throw new functions.https.HttpsError("not-found", "La agenda del dueño original no fue encontrada.");
                }

                const ownerAgendaData = ownerAgendaDoc.data();
                const requesterAgendaData = requesterAgendaDoc.exists ? requesterAgendaDoc.data() : { name: `Agenda de ${requesterName}`, days: {} };
                
                let stopToMove = null;
                let originalDay = null;

                for (const [day, stops] of Object.entries(ownerAgendaData.days)) {
                    const stopIndex = stops.findIndex(s => s.id === pdvId);
                    if (stopIndex > -1) {
                        [stopToMove] = ownerAgendaData.days[day].splice(stopIndex, 1);
                        originalDay = day;
                        break;
                    }
                }

                if (!stopToMove) {
                    functions.logger.warn(`El PDV ${pdvId} no se encontró en la agenda de ${ownerId}, pero se procederá con la reasignación.`);
                    stopToMove = { id: pdvId, name: pdvName };
                }
                
                const targetDay = originalDay || 'lunes';
                if (!requesterAgendaData.days[targetDay]) {
                    requesterAgendaData.days[targetDay] = [];
                }
                requesterAgendaData.days[targetDay].push(stopToMove);

                transaction.set(ownerAgendaRef, ownerAgendaData);
                transaction.set(requesterAgendaRef, requesterAgendaData, { merge: true });

                const assignmentRef = db.doc(`pdv_assignments/${pdvId}`);
                transaction.update(assignmentRef, {
                    reporterId: requesterId,
                    reporterName: requesterName
                });

                transaction.update(requestRef, { status: 'approved' });
            });

            return { success: true, message: "PDV delegado con éxito." };

        } catch (error) {
            functions.logger.error(`Error al resolver delegación ${requestId}:`, error);
            throw new functions.https.HttpsError("internal", "No se pudo completar la transferencia del PDV.");
        }
    }

    return { success: false, message: "Resolución no válida." };
});


// =========================================================================================
// ✅ INICIO: NUEVAS FUNCIONES PARA DELEGACIÓN POR WHATSAPP
// =========================================================================================

/**
 * Crea una invitación de ruta compartible en la base de datos.
 * Devuelve un ID único para ser usado en un Dynamic Link.
 */
exports.createShareableRoute = functions.https.onCall(async (data, context) => {
    if (!context.auth) {
        throw new functions.https.HttpsError("unauthenticated", "Debes estar autenticado.");
    }
    const { day, stops } = data;
    if (!day || !stops || stops.length === 0) {
        throw new functions.https.HttpsError("invalid-argument", "Faltan datos de la ruta para compartir.");
    }

    const userRecord = await admin.auth().getUser(context.auth.uid);
    const userName = userRecord.displayName || userRecord.email || "Un colega";

    const inviteData = {
        fromUserId: context.auth.uid,
        fromUserName: userName,
        day,
        stops,
        status: 'pending', // pending, accepted-merged, accepted-replaced, rejected
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
    };

    const inviteRef = await admin.firestore().collection('delegation_invites').add(inviteData);
    return { inviteId: inviteRef.id };
});

/**
 * Resuelve una invitación de ruta (la rechaza o acepta).
 * Si se rechaza, notifica al emisor original.
 */
exports.resolveShareableRoute = functions.https.onCall(async (data, context) => {
    if (!context.auth) {
        throw new functions.https.HttpsError("unauthenticated", "Debes estar autenticado.");
    }
    const { inviteId, resolution } = data; // resolution puede ser 'rejected', 'accepted'
    if (!inviteId || !resolution) {
        throw new functions.https.HttpsError("invalid-argument", "Faltan datos de la resolución.");
    }

    const inviteRef = admin.firestore().collection('delegation_invites').doc(inviteId);
    const inviteDoc = await inviteRef.get();

    if (!inviteDoc.exists) {
        throw new functions.https.HttpsError("not-found", "La invitación de ruta no existe o ha expirado.");
    }

    const inviteData = inviteDoc.data();
    const recipientRecord = await admin.auth().getUser(context.auth.uid);
    const recipientName = recipientRecord.displayName || recipientRecord.email || "Tu colega";

    // Si la invitación ya fue resuelta, no hacer nada.
    if (inviteData.status !== 'pending') {
        return { success: true, message: "Esta invitación ya fue resuelta." };
    }

    await inviteRef.update({ 
        status: resolution,
        resolvedByUserId: context.auth.uid,
        resolvedByUserName: recipientName,
        resolvedAt: admin.firestore.FieldValue.serverTimestamp()
    });

    // Si se rechaza, notifica al emisor original.
    if (resolution === 'rejected') {
        const notificationPayload = {
            title: 'Ruta Rechazada',
            body: `${recipientName} ha rechazado la ruta que le enviaste para el día ${inviteData.day}.`
        };
        await sendNotificationToUser(inviteData.fromUserId, notificationPayload, {});
        return { success: true, message: "La ruta ha sido rechazada." };
    }
    
    // Para cualquier otro caso de aceptación.
    if (resolution.startsWith('accepted')) {
        return { success: true, message: "La ruta ha sido aceptada." };
    }

    return { success: false, message: "Resolución no válida." };
});