import React from 'react';
import { Warehouse, Truck, Package, Archive, ClipboardList, Users, Construction } from 'lucide-react';
import SuppliersPageImpl from './admin/SuppliersPage';
import MaterialsMasterPageImpl from './admin/MaterialsMasterPage';

const ComingSoon = ({ title, description, items = [] }) => (
    <div className="p-6 md:p-8 max-w-3xl">
        <div className="flex items-center gap-3 mb-2">
            <Construction size={18} className="text-amber-400" />
            <span className="text-amber-400 text-xs font-semibold uppercase tracking-widest">En Construcción</span>
        </div>
        <h2 className="text-2xl font-bold text-white mb-2">{title}</h2>
        <p className="text-slate-400 mb-8">{description}</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {items.map((item, i) => (
                <div key={i} className="bg-slate-800 border border-slate-700 rounded-xl p-4 flex items-start gap-3">
                    <div className="w-2 h-2 rounded-full bg-emerald-500 mt-1.5 shrink-0" />
                    <div>
                        <p className="text-slate-200 font-medium text-sm">{item.title}</p>
                        <p className="text-slate-500 text-xs mt-0.5">{item.desc}</p>
                    </div>
                </div>
            ))}
        </div>
    </div>
);

export const AdminHome = () => (
    <div className="p-6 md:p-8">
        <h2 className="text-2xl font-bold text-white mb-1">Panel de Administración</h2>
        <p className="text-slate-400 mb-8">Bienvenido al control maestro de Kroma.</p>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[
                { label: 'Almacenes', value: '—', color: 'emerald', Icon: Warehouse },
                { label: 'Proveedores', value: '—', color: 'blue', Icon: Truck },
                { label: 'Materiales', value: '—', color: 'amber', Icon: Package },
                { label: 'Usuarios Kroma', value: '—', color: 'violet', Icon: Users },
            ].map(({ label, value, color, Icon }) => (
                <div key={label} className="bg-slate-800 border border-slate-700 rounded-xl p-5">
                    <Icon size={20} className={`text-${color}-400 mb-3`} />
                    <p className="text-2xl font-bold text-white">{value}</p>
                    <p className="text-slate-400 text-sm mt-1">{label}</p>
                </div>
            ))}
        </div>
    </div>
);

export const WarehousesPage = () => (
    <ComingSoon
        title="Almacenes y Depósitos"
        description="Gestiona todas las ubicaciones físicas de la planta y sus inventarios."
        items={[
            { title: 'Crear almacén', desc: 'Bodega de insumos, tanque de enfriamiento, cava cuarto planta, depósito Caracas.' },
            { title: 'Inventario por almacén', desc: 'Visualizar stock por ubicación con movimientos históricos.' },
            { title: 'Gestión de lotes', desc: 'Todo movimiento vinculado a número de lote y fecha de caducidad.' },
            { title: 'Transferencias internas', desc: 'Registro de traslados entre cavas con usuario y fecha.' },
        ]}
    />
);

export const SuppliersPage = () => <SuppliersPageImpl />;

export const MaterialsMasterPage = () => <MaterialsMasterPageImpl />;

export const InventoryPTPage = () => (
    <ComingSoon
        title="Inventario de Producto Terminado"
        description="Control del inventario listo para distribución y venta."
        items={[
            { title: 'Stock por producto y almacén', desc: 'Visualización en tiempo real por lote, SKU y ubicación.' },
            { title: 'Movimientos históricos', desc: 'Todo ingreso o salida queda registrado permanentemente.' },
            { title: 'Trazabilidad de lote', desc: 'Cada unidad vinculada a su proceso de producción y fecha de caducidad.' },
            { title: 'Transferencias', desc: 'Mover producto entre cava cuarto planta y depósito Caracas.' },
        ]}
    />
);

export const ProductionHistoryPage = () => (
    <ComingSoon
        title="Historial de Producción"
        description="Registro histórico de todos los procesos. Solo lectura — edición exclusiva del perfil Gerencial."
        items={[
            { title: 'Filtro por fecha y calendario', desc: 'Días con proceso resaltados en el calendario mensual.' },
            { title: 'Balance de masa (leche)', desc: 'Litros pasteurizados, merma, litros netos a proceso.' },
            { title: 'Consumo de insumos y empaques', desc: 'Desglose por producto procesado.' },
            { title: 'Rendimiento y unidades finales', desc: 'Kg obtenidos, unidades por SKU, trazabilidad de personal.' },
        ]}
    />
);

export const KromaUsersPage = ({ onUserCreated }) => (
    <ComingSoon
        title="Usuarios Kroma"
        description="Gestión de perfiles internos de Kroma. La creación requiere autorización de la gerencia."
        items={[
            { title: 'Crear usuario operario', desc: 'Maestros queseros con acceso a constructores y producción diaria.' },
            { title: 'Crear usuario administrador', desc: 'Acceso a maestro de materiales, proveedores y almacenes.' },
            { title: 'Crear usuario gerencial', desc: 'Acceso solo lectura a dashboards y KPIs. Puede editar históricos.' },
            { title: 'Activar / desactivar', desc: 'Control de acceso por usuario sin eliminar su historial.' },
        ]}
    />
);
