import React from 'react';
import { Droplets, Package, FlaskConical, Workflow, Factory, Construction } from 'lucide-react';
import ProcessBuilderPageImpl from './operator/ProcessBuilderPage';
import RecipeBuilderPageImpl from './operator/RecipeBuilderPage';
import FichaBuilderPageImpl from './operator/FichaBuilderPage';
import MaterialsInventoryPageImpl from './operator/MaterialsInventoryPage';
import MilkInventoryPageImpl from './operator/MilkInventoryPage';
import DailyProductionPageImpl from './operator/DailyProductionPage';

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
                    <div className="w-2 h-2 rounded-full bg-blue-500 mt-1.5 shrink-0" />
                    <div>
                        <p className="text-slate-200 font-medium text-sm">{item.title}</p>
                        <p className="text-slate-500 text-xs mt-0.5">{item.desc}</p>
                    </div>
                </div>
            ))}
        </div>
    </div>
);

export const OperatorHome = () => (
    <div className="p-6 md:p-8">
        <h2 className="text-2xl font-bold text-white mb-1">Panel Operario</h2>
        <p className="text-slate-400 mb-8">Acceso rápido a tus herramientas de producción.</p>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            {[
                { label: 'Leche en Tanque', value: '— L', color: 'blue', Icon: Droplets },
                { label: 'Insumos Activos', value: '—', color: 'emerald', Icon: Package },
                { label: 'Recetas Creadas', value: '—', color: 'violet', Icon: FlaskConical },
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

export const MilkInventoryPage = () => <MilkInventoryPageImpl />;

export const MaterialsInventoryPage = () => <MaterialsInventoryPageImpl />;

export const FichaBuilderPage = () => <FichaBuilderPageImpl />;

export const RecipeBuilderPage = () => <RecipeBuilderPageImpl />;

export const ProcessBuilderPage = () => <ProcessBuilderPageImpl />;

export const DailyProductionPage = () => <DailyProductionPageImpl />;
