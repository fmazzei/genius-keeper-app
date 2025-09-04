// --- CONFIGURACIÓN PRINCIPAL DE LA SIMULACIÓN ---
const SIMULATION_DAYS = 90; // Generaremos 3 meses de datos
const MONTHLY_GOAL = 2000;
const DAILY_GOAL = MONTHLY_GOAL / 30;

// --- "BASE DE DATOS" INCRUSTADA CON DATOS REALES ---
const DEPOTS_DATABASE = [
    { id: 'depot-barinas', name: 'Depósito Barinas (Producción)', type: 'primario', city: 'Barinas' },
    { id: 'depot-frimaca', name: 'Depósito Frimaca (Carga)', type: 'secundario', city: 'Caracas' },
    { id: 'depot-carolina', name: 'Depósito Carolina (Carga)', type: 'secundario', city: 'Caracas' }
];

const OUR_PRODUCTS = [
    { id: "CHEVRE_ORIGINAL_250G", name: "Lacteoca Chèvre Original 250g", price: 10.25, weight_g: 250 },
    { id: "CHEVRE_FOOD_SERVICE_3KG", name: "Lacteoca Chèvre Food Service 3Kg", price: 120.00, weight_g: 3000 }
];

const COMPETITORS_DATABASE = [
    { brand: 'Ananke', productName: 'Ananke Artesanal Natural 200g', weight_g: 200, basePrice: 8.50 },
    { brand: 'Ananke', productName: 'Ananke Natural Extra Cremoso 150g', weight_g: 150, basePrice: 6.50 },
    { brand: 'Ananke', productName: 'Ananke Natural Extra Cremoso 225g', weight_g: 225, basePrice: 7.75 },
    { brand: 'Cheva', productName: 'Cheva Capri 180g', weight_g: 180, basePrice: 7.50 },
    { brand: 'Las Cumbres', productName: 'Las Cumbres Natural 200g', weight_g: 200, basePrice: 8.25 },
    { brand: 'Capri Cream', productName: 'Capri Cream Natural 170g', weight_g: 170, basePrice: 7.00 },
];

const realPointsOfSaleData = [
    // Excelsior Gama
    { name: 'Gama Express - San Bernardino', chain: 'Excelsior Gama', zone: 'San Bernardino', location: null },
    { name: 'Gama Express - Chuao', chain: 'Excelsior Gama', zone: 'Chuao', location: null },
    { name: 'Gama Express - Las Mercedes', chain: 'Excelsior Gama', zone: 'Las Mercedes', location: { lat: 10.4680201, lng: -66.85968 } },
    { name: 'Gama Express - La Urbina', chain: 'Excelsior Gama', zone: 'La Urbina', location: null },
    { name: 'Gama Express - Caurimare', chain: 'Excelsior Gama', zone: 'Caurimare', location: { lat: 10.4690313, lng: -66.821412 } },
    { name: 'Gama Express - La Trinidad', chain: 'Excelsior Gama', zone: 'La Trinidad', location: null },
    { name: 'Gama Express - Santa Mónica', chain: 'Excelsior Gama', zone: 'Santa Mónica', location: null },
    { name: 'Gama Express - Los Ruices', chain: 'Excelsior Gama', zone: 'Los Ruices', location: null },
    { name: 'Gama Express - Santa Fe', chain: 'Excelsior Gama', zone: 'Santa Fe', location: null },
    { name: 'Gama Express - Los Palos Grandes', chain: 'Excelsior Gama', zone: 'Los Palos Grandes', location: null },
    { name: 'Gama Express - La Castellana', chain: 'Excelsior Gama', zone: 'La Castellana', location: null },
    { name: 'Gama - Los Palos Grandes', chain: 'Excelsior Gama', zone: 'Los Palos Grandes', location: null },
    { name: 'Gama - La Tahona', chain: 'Excelsior Gama', zone: 'La Tahona', location: { lat: 10.4294644, lng: -66.8314623 } },
    { name: 'Gama - Macaracuay', chain: 'Excelsior Gama', zone: 'Macaracuay', location: { lat: 10.4632342, lng: -66.8114467 } },
    { name: 'Gama - Vizcaya', chain: 'Excelsior Gama', zone: 'Vizcaya', location: { lat: 10.4633175, lng: -66.8411283 } },
    { name: 'Gama - Santa Fe', chain: 'Excelsior Gama', zone: 'Santa Fe', location: null },
    { name: 'Gama - Santa Eduvigis', chain: 'Excelsior Gama', zone: 'Santa Eduvigis', location: null },
    { name: 'Gama - La Trinidad', chain: 'Excelsior Gama', zone: 'La Trinidad', location: null },
    { name: 'Gama - La India', chain: 'Excelsior Gama', zone: 'La India', location: null },
    { name: 'Gama - La Panamericana', chain: 'Excelsior Gama', zone: 'La Panamericana', location: null },
    // Central Madeirense
    { name: 'Central Madeirense - Macaracuay', chain: 'Central Madeirense', zone: 'Macaracuay', location: null },
    { name: 'Central Madeirense - Santa Marta', chain: 'Central Madeirense', zone: 'Santa Marta', location: null },
    { name: 'Central Madeirense - La Boyera', chain: 'Central Madeirense', zone: 'La Boyera', location: null },
    { name: 'Central Madeirense - Bello Campo', chain: 'Central Madeirense', zone: 'Bello Campo', location: { lat: 10.4977395, lng: -66.8750152 } },
    { name: 'Central Madeirense - La Alameda', chain: 'Central Madeirense', zone: 'La Alameda', location: null },
    { name: 'Central Madeirense - Manzanares', chain: 'Central Madeirense', zone: 'Manzanares', location: null },
    { name: 'Central Madeirense - Bodegón La Boyera', chain: 'Central Madeirense', zone: 'La Boyera', location: null },
    // Automercados Plaza's
    { name: 'Plaza - El Cafetal', chain: 'Automercados Plaza\'s', zone: 'El Cafetal', location: { lat: 10.4533726, lng: -66.83109 } },
    { name: 'Plaza - Santa Eduvigis', chain: 'Automercados Plaza\'s', zone: 'Santa Eduvigis', location: null },
    { name: 'Plaza - Los Samanes', chain: 'Automercados Plaza\'s', zone: 'Los Samanes', location: null },
    { name: 'Plaza - El Rosal', chain: 'Automercados Plaza\'s', zone: 'El Rosal', location: null },
    { name: 'Plaza - Los Chaguaramos', chain: 'Automercados Plaza\'s', zone: 'Los Chaguaramos', location: null },
    { name: 'Plaza - Alto Prado', chain: 'Automercados Plaza\'s', zone: 'Alto Prado', location: null },
    { name: 'Plaza - Galería Prados del Este', chain: 'Automercados Plaza\'s', zone: 'Prados del Este', location: null },
    { name: 'Plaza - Los Naranjos', chain: 'Automercados Plaza\'s', zone: 'Los Naranjos', location: null },
    { name: 'Plaza - La Lagunita', chain: 'Automercados Plaza\'s', zone: 'La Lagunita', location: null },
    { name: 'Plaza - Valle Arriba', chain: 'Automercados Plaza\'s', zone: 'Valle Arriba', location: null },
    { name: 'Plaza - Centro Plaza', chain: 'Automercados Plaza\'s', zone: 'Centro Plaza', location: null },
    { name: 'Plaza - San Bernardino', chain: 'Automercados Plaza\'s', zone: 'San Bernardino', location: { lat: 10.511012, lng: -66.8683146 } },
    { name: 'Plaza - Vista Alegre', chain: 'Automercados Plaza\'s', zone: 'Vista Alegre', location: null },
    { name: 'Plaza - El Paraíso', chain: 'Automercados Plaza\'s', zone: 'El Paraíso', location: null },
    { name: 'Plaza - San Antonio', chain: 'Automercados Plaza\'s', zone: 'San Antonio', location: null },
    { name: 'Plaza - Baruta', chain: 'Automercados Plaza\'s', zone: 'Baruta', location: null },
    { name: 'Plaza - Los Cedros', chain: 'Automercados Plaza\'s', zone: 'Los Cedros', location: null },
    { name: 'Plaza - Terraza del Ávila', chain: 'Automercados Plaza\'s', zone: 'Terraza del Ávila', location: null },
    { name: 'Plaza - Guatire', chain: 'Automercados Plaza\'s', zone: 'Guatire', location: null },
    // Páramo
    { name: 'Páramo (Piedra Azul)', chain: 'Páramo', zone: 'Piedra Azul', location: null },
    { name: 'Páramo (Libertador)', chain: 'Páramo', zone: 'Libertador', location: null },
    { name: 'Páramo (Chacao)', chain: 'Páramo', zone: 'Chacao', location: null },
    // Automercados Individuales
    { name: 'Mercato Market - Sta Paula', chain: 'Automercados Individuales', zone: 'Santa Paula', location: null },
    { name: 'Frutería Los Pomelos - Los Naranjos', chain: 'Automercados Individuales', zone: 'Los Naranjos', location: null },
    { name: 'Automercado Santa Rosa de Lima', chain: 'Automercados Individuales', zone: 'Santa Rosa de Lima', location: null },
    { name: 'La Muralla - El Hatillo', chain: 'Automercados Individuales', zone: 'El Hatillo', location: null },
    { name: 'Mi Negocio - La Florida', chain: 'Automercados Individuales', zone: 'La Florida', location: null },
    { name: 'Mi Negocio - San Luis', chain: 'Automercados Individuales', zone: 'San Luis', location: null },
    { name: 'Maxi Quesos', chain: 'Automercados Individuales', zone: 'N/A', location: null },
    { name: 'Supermercado Supernova', chain: 'Automercados Individuales', zone: 'N/A', location: null },
    { name: 'Express Market Chacao', chain: 'Automercados Individuales', zone: 'Chacao', location: null },
    { name: 'Pan de Yuca', chain: 'Automercados Individuales', zone: 'N/A', location: null },
    { name: 'Vibra Verde', chain: 'Automercados Individuales', zone: 'N/A', location: null },
    { name: 'Fit Eco Market', chain: 'Automercados Individuales', zone: 'N/A', location: null },
    { name: 'Gourmand 2022', chain: 'Automercados Individuales', zone: 'N/A', location: null },
    { name: 'Fresh Fish - La Castellana', chain: 'Automercados Individuales', zone: 'La Castellana', location: null },
    { name: 'Quesería Aurora', chain: 'Automercados Individuales', zone: 'N/A', location: null },
    { name: 'Bodegon La Canaima - La Urbina', chain: 'Automercados Individuales', zone: 'La Urbina', location: null },
    { name: 'Bodegon La Canaima - Caurimare', chain: 'Automercados Individuales', zone: 'Caurimare', location: null },
    { name: 'Automercado Santa Paula', chain: 'Automercados Individuales', zone: 'Santa Paula', location: { lat: 10.4633175, lng: -66.8411283 } },
    { name: 'Fruteria Ananas - San Luis', chain: 'Automercados Individuales', zone: 'San Luis', location: null },
    // Puntos de Venta en Barinas
    { name: 'Toscana Market', chain: 'Automercados Individuales', zone: 'Barinas', location: { lat: 8.608806, lng: -70.243611 } },
    { name: 'Casa Italia - Palma de Oro', chain: 'Automercados Individuales', zone: 'Barinas', location: { lat: 8.605500, lng: -70.256500 } },
];

// --- FUNCIONES DE AYUDA ---
const getRandomElement = (arr) => arr[Math.floor(Math.random() * arr.length)];
const getRandomInt = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;
const addDays = (date, days) => { const newDate = new Date(date); newDate.setDate(date.getDate() + days); return newDate; };

// --- EL MOTOR DE SIMULACIÓN PRINCIPAL ---
export const runSimulation = () => {
    console.log("🚀 Iniciando Motor de Simulación 'Gemelo Digital' v2.1 (Enriquecido)...");
    
    const posList = realPointsOfSaleData.map((pos, i) => ({ 
        ...pos, 
        id: `real-pos-${i}`, 
        active: true, 
        visitInterval: getRandomInt(6, 9),
        inventory: getRandomInt(10, 30)
    }));
    
    const inventory = {};
    DEPOTS_DATABASE.forEach(d => { inventory[d.id] = { lotes: [] }; });
    inventory['depot-barinas'].lotes.push({ lote: addDays(new Date(), 60).toISOString().split('T')[0], cantidad: 3000 });

    const reports = [];
    const transfers = [];
    let lastVisitDates = {};

    for (let i = SIMULATION_DAYS; i >= 0; i--) {
        const currentDate = addDays(new Date(), -i);
        let dailySales = 0;

        if (currentDate.getDay() % 3 === 0) {
            const productionQty = Math.floor(DAILY_GOAL * 3);
            inventory['depot-barinas'].lotes.push({ lote: addDays(currentDate, 90).toISOString().split('T')[0], cantidad: productionQty });
        }

        const caracasDepots = ['depot-frimaca', 'depot-carolina'];
        caracasDepots.forEach(depotId => {
            const stock = inventory[depotId].lotes.reduce((sum, l) => sum + l.cantidad, 0);
            if (stock < 200 && inventory['depot-barinas'].lotes.length > 0) {
                const transferQty = 400;
                const oldestLote = inventory['depot-barinas'].lotes[0];
                if (oldestLote.cantidad >= transferQty) {
                    oldestLote.cantidad -= transferQty;
                    if (oldestLote.cantidad <= 0) inventory['depot-barinas'].lotes.shift();
                    
                    transfers.push({
                        id: `sim-transfer-${i}-${depotId}`, status: 'distribuido', fromName: 'Depósito Barinas', toName: DEPOTS_DATABASE.find(d=>d.id===depotId).name,
                        totalQuantity: transferQty, lotes: [{ lote: oldestLote.lote, cantidad: transferQty }],
                        createdAt: { seconds: Math.floor(addDays(currentDate, -2).getTime() / 1000) },
                        receivedAt: { seconds: Math.floor(addDays(currentDate, -1).getTime() / 1000) },
                        distributedAt: { seconds: Math.floor(currentDate.getTime() / 1000) },
                    });
                    inventory[depotId].lotes.push({ lote: oldestLote.lote, cantidad: transferQty });
                }
            }
        });
        
        posList.forEach(pos => {
            const daysSinceLastVisit = lastVisitDates[pos.id] ? (currentDate - new Date(lastVisitDates[pos.id])) / (1000 * 3600 * 24) : Infinity;
            if (daysSinceLastVisit >= pos.visitInterval && dailySales < DAILY_GOAL * 1.5) {
                const plannedVisitDate = new Date(lastVisitDates[pos.id] || currentDate);
                plannedVisitDate.setDate(plannedVisitDate.getDate() + pos.visitInterval);
                const delay = Math.random() > 0.8 ? getRandomInt(1, 3) : 0; // 20% de visitas tienen retraso
                const visitDate = addDays(currentDate, delay);

                lastVisitDates[pos.id] = visitDate;
                
                const isStockout = pos.inventory <= 0;
                const orderQuantity = isStockout ? getRandomInt(12, 24) : (Math.random() < 0.6 ? getRandomInt(6, 12) : 0);
                dailySales += orderQuantity;
                pos.inventory += orderQuantity;
                const salesSinceLastVisit = getRandomInt(5, pos.inventory > 15 ? 15 : pos.inventory);
                pos.inventory -= salesSinceLastVisit;

                const startTime = visitDate.getTime();
                const endTime = startTime + getRandomInt(15, 50) * 60000;

                reports.push({
                    id: `sim-report-${pos.id}-${i}`, posId: pos.id, posName: pos.name, posZone: pos.zone,
                    createdAt: { seconds: Math.floor(visitDate.getTime() / 1000) },
                    visitDate: visitDate.toISOString().split('T')[0],
                    plannedVisitDate: plannedVisitDate.toISOString().split('T')[0],
                    merchandiserName: 'Simulación Genius',
                    stockout: isStockout,
                    inventoryLevel: pos.inventory,
                    price: OUR_PRODUCTS[0].price,
                    orderQuantity,
                    batches: [{ expiryDate: addDays(visitDate, getRandomInt(20, 80)).toISOString().split('T')[0], quantity: pos.inventory }],
                    startTime: new Date(startTime).toISOString(),
                    endTime: new Date(endTime).toISOString(),
                    newEntrants: Math.random() < 0.05 ? [{ brand: 'Quesos Nómada', presentation: 'Untable de Cabra 150g', price: '9.80'}] : [],
                    competition: COMPETITORS_DATABASE.filter(() => Math.random() < 0.5).map(c => ({
                        // CORRECCIÓN: Usar 'productName' para coincidir con el modal de precios
                        productName: c.productName,
                        brand: c.brand,
                        weight_g: c.weight_g,
                        price: parseFloat((c.basePrice * (1 + (Math.random() - 0.1) * 0.15)).toFixed(2)),
                        hasPop: Math.random() < 0.3,
                        hasTasting: Math.random() < 0.15,
                    })),
                    shelfLocation: getRandomElement(['ojos', 'manos', 'superior', 'inferior']),
                    // NUEVO CAMPO: Añadido para el modal de efectividad en anaquel
                    adjacentCategory: getRandomElement(['Quesos crema', 'Quesos de Cabra', 'Delicatessen', 'Nevera Charcutería']),
                    facing: getRandomInt(2, 8),
                    popStatus: getRandomElement(['Exhibido correctamente', 'Dañado', 'Ausente', 'Sin Campaña Activa']),
                });
            }
        });
    }

    const stockByDepot = {};
    DEPOTS_DATABASE.forEach(depot => {
        stockByDepot[depot.id] = {
            products: [{ id: OUR_PRODUCTS[0].id, productName: OUR_PRODUCTS[0].name, lotes: inventory[depot.id].lotes }],
            totalQuantity: inventory[depot.id].lotes.reduce((sum, l) => sum + l.cantidad, 0)
        };
    });
    
    console.log("✅ Simulación v2.1 (Final) completada.", { reports: reports.length, posList: posList.length, transfers: transfers.length });

    return {
        posList,
        reports: reports.sort((a,b) => b.createdAt.seconds - a.createdAt.seconds),
        depots: DEPOTS_DATABASE,
        stockByDepot,
        transfers,
        agenda: { name: 'Agenda Semanal (Demo)', days: { 'lunes': posList.slice(0,5), 'martes': posList.slice(5,10) } }
    };
};