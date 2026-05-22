import React from 'react';
import { DollarSign, TrendingUp, ShieldCheck, Construction, BarChart3 } from 'lucide-react';

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
                    <div className="w-2 h-2 rounded-full bg-amber-500 mt-1.5 shrink-0" />
                    <div>
                        <p className="text-slate-200 font-medium text-sm">{item.title}</p>
                        <p className="text-slate-500 text-xs mt-0.5">{item.desc}</p>
                    </div>
                </div>
            ))}
        </div>
    </div>
);

export const ManagerHome = () => (
    <div className="p-6 md:p-8">
        <h2 className="text-2xl font-bold text-white mb-1">Dashboard Gerencial</h2>
        <p className="text-slate-400 mb-8">Inteligencia de negocio en tiempo real para la toma de decisiones.</p>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            {[
                { label: 'Capital en Inventario', value: '$ —', color: 'emerald', Icon: DollarSign },
                { label: 'Rendimiento L/Kg', value: '— L/Kg', color: 'blue', Icon: TrendingUp },
                { label: 'Score Proveedores', value: '—', color: 'amber', Icon: ShieldCheck },
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

export const FinancialBoard = () => (
    <ComingSoon
        title="Tablero Financiero"
        description="Capital inmovilizado, costeo de lotes y rentabilidad estimada por SKU."
        items={[
            { title: 'Capital inmovilizado', desc: 'Valor USD de todo el inventario: MP, insumos, empaques, PT.' },
            { title: 'Costo teórico vs. real', desc: 'Comparativa gráfica entre costo de receta y costo real de producción.' },
            { title: 'Rentabilidad por SKU', desc: 'Margen bruto estimado por tipo de producto según costos y precios de venta.' },
            { title: 'Histórico de costos', desc: 'Evolución del costo por lote mes a mes.' },
        ]}
    />
);

export const ProductionKPIsPage = () => (
    <ComingSoon
        title="KPIs de Producción"
        description="Métricas de rendimiento, mermas y eficiencia de la planta."
        items={[
            { title: 'Rendimiento L/Kg histórico', desc: 'Litros de leche utilizados vs. Kg de queso obtenidos por proceso.' },
            { title: 'Control de mermas', desc: 'Desviaciones en pasteurizador y sala de procesos, comparadas mes a mes.' },
            { title: 'Volumen de producción', desc: 'Unidades y Kg producidos por SKU y período.' },
            { title: 'Edición de históricos', desc: 'Solo el perfil Gerencial puede editar registros de procesos pasados.' },
        ]}
    />
);

export const QualityBoard = () => (
    <ComingSoon
        title="Calidad y Proveedores"
        description="Consistencia de materia prima y ranking de productores de leche."
        items={[
            { title: 'Parámetros históricos de leche', desc: 'Temperatura, Densidad, Brix, pH por proveedor y fecha.' },
            { title: 'Score de productores', desc: 'Escala numérica y visual (colores) según calidad y rechazos.' },
            { title: 'Ranking de proveedores', desc: 'Clasificación por volumen de litros entregados e índice de calidad.' },
            { title: 'Alertas de calidad', desc: 'Notificaciones cuando los parámetros de recepción estén fuera de rango.' },
        ]}
    />
);
