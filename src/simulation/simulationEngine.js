// RUTA: src/simulation/simulationEngine.js

// --- INICIO: Lógica de generación de datos ---
// Estas funciones nos ayudan a crear un historial de reportes realista.
const getRandomElement = (arr) => arr[Math.floor(Math.random() * arr.length)];
const getRandomInt = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;
const addDays = (date, days) => { const newDate = new Date(date); newDate.setDate(date.getDate() + days); return newDate; };

const generateSimulatedReportsAndPos = () => {
    const posList = [
        { name: 'Gama Express - Las Mercedes (SIM)', chain: 'Excelsior Gama', zone: 'Las Mercedes', location: { lat: 10.4680201, lng: -66.85968 } },
        { name: 'Plaza - El Cafetal (SIM)', chain: 'Automercados Plaza\'s', zone: 'El Cafetal', location: { lat: 10.4533726, lng: -66.83109 } },
        { name: 'Central Madeirense - Bello Campo (SIM)', chain: 'Central Madeirense', zone: 'Bello Campo', location: { lat: 10.4977395, lng: -66.8750152 } },
        { name: 'Automercado Santa Paula (SIM)', chain: 'Automercados Individuales', zone: 'Santa Paula', location: { lat: 10.4633175, lng: -66.8411283 } },
        { name: 'Gama - Macaracuay (SIM)', chain: 'Excelsior Gama', zone: 'Macaracuay', location: { lat: 10.4632342, lng: -66.8114467 } },
        { name: 'Toscana Market (SIM)', chain: 'Automercados Individuales', zone: 'Barinas', location: { lat: 8.608806, lng: -70.243611 } }
    ].map((pos, i) => ({ 
        ...pos, id: `sim-pos-${i}`, active: true, visitInterval: 7, inventory: getRandomInt(10, 30) 
    }));

    const reports = [];
    const today = new Date();
    for(let i = 0; i < 30; i++) { // Generar 30 reportes de ejemplo
        const pos = getRandomElement(posList);
        const visitDate = addDays(today, -i);
        const isStockout = pos.inventory <= 0 || Math.random() < 0.1;
        const orderQuantity = isStockout ? getRandomInt(12, 24) : (Math.random() < 0.6 ? getRandomInt(6, 12) : 0);
        
        reports.push({
            id: `sim-report-${pos.id}-${i}`, posId: pos.id, posName: pos.name,
            createdAt: { seconds: Math.floor(visitDate.getTime() / 1000) },
            userName: "Vendedor Simulado",
            stockout: isStockout,
            orderQuantity,
            inventoryLevel: pos.inventory,
            price: (10.25 * (1 + (Math.random() - 0.5) * 0.1)).toFixed(2),
            facing: getRandomInt(2, 8),
            shelfLocation: getRandomElement(['ojos', 'manos', 'superior', 'inferior']),
            popStatus: getRandomElement(['Exhibido correctamente', 'Dañado', 'Ausente']),
        });
        pos.inventory = pos.inventory + orderQuantity - getRandomInt(5, 15);
        if (pos.inventory < 0) pos.inventory = 0;
    }
    return { posList, reports };
};
// --- FIN: Lógica de generación de datos ---


const getInitialState = () => {
    // Generamos un set de datos frescos cada vez que se inicia la simulación.
    const { posList, reports } = generateSimulatedReportsAndPos();

    return {
        // Datos de PDV y Reportes
        posList,
        reports,

        // Datos de Inventario
        depots: [
            { id: 'sim-depot-barinas', name: 'Lácteos La Toñera (SIM)', type: 'primario', city: 'Barinas' },
            { id: 'sim-depot-frimaca', name: 'Depósito Frimaca (SIM)', type: 'secundario', city: 'Caracas' },
            { id: 'sim-depot-carolina', name: 'Depósito Carolina (SIM)', type: 'secundario', city: 'Caracas' },
        ],
        stockByDepot: {
            'sim-depot-barinas': { products: [{ id: 'CHEVRE_ORIGINAL_250G', productName: 'Chèvre Original 250g', lotes: [{ lote: '2025-12-15', cantidad: 1000 }] }] },
            'sim-depot-frimaca': { products: [{ id: 'CHEVRE_ORIGINAL_250G', productName: 'Chèvre Original 250g', lotes: [{ lote: '2025-11-20', cantidad: 150 }, { lote: '2025-12-05', cantidad: 200 }] }] },
            'sim-depot-carolina': { products: [{ id: 'CHEVRE_ORIGINAL_250G', productName: 'Chèvre Original 250g', lotes: [{ lote: '2025-11-28', cantidad: 180 }] }] },
        },
        pendingSales: [],
        pendingAdjustments: [],
        movimientos: [], 
        
        // Agenda de ejemplo para el merchandiser
        agenda: {
            name: 'Agenda Semanal (SIM)',
            days: {
                lunes: posList.slice(0, 2),
                martes: posList.slice(2, 4),
            }
        },
        
        // Tareas delegadas de ejemplo para el merchandiser
        delegatedTasks: [
            { id: 'sim-task-1', posName: 'Gama Express - Las Mercedes (SIM)', details: 'Verificar exhibición especial del nuevo producto.', status: 'pending', delegatedByName: 'Carolina Ramírez' },
            { id: 'sim-task-2', posName: 'Plaza - El Cafetal (SIM)', details: 'Negociar un espacio adicional en la nevera de lácteos.', status: 'pending', delegatedByName: 'Francisco Mazzei' }
        ],

        nextInvoiceId: 1234,
    };
};

class SimulationEngine {
    constructor() {
        this.state = getInitialState();
        this.listeners = []; // Para notificar a React de los cambios
    }

    // Notifica a los componentes que el estado ha cambiado
    _notifyListeners() {
        this.listeners.forEach(listener => listener(this.getState()));
    }

    // Permite a los componentes de React suscribirse a los cambios
    subscribe(listener) {
        this.listeners.push(listener);
        return () => {
            this.listeners = this.listeners.filter(l => l !== listener);
        };
    }

    // Devuelve una copia del estado actual para evitar mutaciones directas
    getState() {
        return JSON.parse(JSON.stringify(this.state));
    }

    // --- ACCIONES DE SIMULACIÓN ---
    
    simulateCompleteTask(taskId) {
        const taskIndex = this.state.delegatedTasks.findIndex(t => t.id === taskId);
        if (taskIndex > -1) {
            this.state.delegatedTasks.splice(taskIndex, 1); // La eliminamos de la lista de pendientes
            this._notifyListeners();
            console.log(`SIMULACIÓN: Tarea ${taskId} completada.`);
        }
    }

    simulateNewZohoInvoice() {
        const randomQuantity = Math.floor(Math.random() * 20) + 10;
        const newSale = {
            id: `sim-sale-${Date.now()}`,
            invoice_number: this.state.nextInvoiceId++,
            productId: 'CHEVRE_ORIGINAL_250G',
            quantity: randomQuantity,
            customerName: 'Cliente Simulado',
            status: 'pending',
            createdAt: new Date().toISOString(),
            stockInsuficiente: false
        };
        this.state.pendingSales.push(newSale);
        this._notifyListeners();
        console.log("SIMULACIÓN: Nueva factura de Zoho recibida.", newSale);
    }

    simulateFulfillSale(saleId, depotId, lote) {
        const sale = this.state.pendingSales.find(s => s.id === saleId);
        if (!sale) return;
        const depotStock = this.state.stockByDepot[depotId]?.products[0]?.lotes;
        if (!depotStock) return;
        const loteIndex = depotStock.findIndex(l => l.lote === lote.lote);
        if (loteIndex === -1 || depotStock[loteIndex].cantidad < sale.quantity) return;
        depotStock[loteIndex].cantidad -= sale.quantity;
        this.state.pendingSales = this.state.pendingSales.filter(s => s.id !== saleId);
        this.state.movimientos.push({ type: 'VENTA', quantity: -sale.quantity, depotId, reason: `Factura #${sale.invoice_number}`});
        this._notifyListeners();
        console.log(`SIMULACIÓN: Venta #${sale.invoice_number} despachada desde ${depotId}`);
    }
    
    simulateApproveAdjustment(adjustmentId) {
        const adj = this.state.pendingAdjustments.find(a => a.id === adjustmentId);
        if (!adj || adj.status !== 'pending') return;
        const depotStock = this.state.stockByDepot[adj.depotId]?.products[0]?.lotes;
        if (!depotStock) return;
        depotStock.push({ lote: `AJUSTE-${adj.id.slice(0, 5)}`, cantidad: adj.quantity });
        this.state.pendingAdjustments = this.state.pendingAdjustments.filter(a => a.id !== adjustmentId);
        this.state.movimientos.push({ type: 'AJUSTE_POSITIVO', quantity: adj.quantity, depotId: adj.depotId, reason: adj.notes });
        this._notifyListeners();
        console.log(`SIMULACIÓN: Ajuste ${adjustmentId} aprobado.`);
    }

    simulateRejectAdjustment(adjustmentId) {
        const adj = this.state.pendingAdjustments.find(a => a.id === adjustmentId);
        if (!adj) return;
        this.state.pendingAdjustments = this.state.pendingAdjustments.filter(a => a.id !== adjustmentId);
        this._notifyListeners();
        console.log(`SIMULACIÓN: Ajuste ${adjustmentId} rechazado.`);
    }

    simulateRequestAdjustment(depotId, depotName, quantity, notes) {
        if (quantity <= 0) return;
        const newAdjustment = {
            id: `sim-adj-${Date.now()}`,
            depotId, depotName,
            quantity,
            notes,
            requesterName: 'Gerente (SIM)',
            status: 'pending'
        };
        this.state.pendingAdjustments.push(newAdjustment);
        this._notifyListeners();
        console.log("SIMULACIÓN: Nueva solicitud de ajuste positivo creada.", newAdjustment);
    }
}

// Creamos una única instancia del motor para que toda la app la comparta.
export const simulationEngine = new SimulationEngine();