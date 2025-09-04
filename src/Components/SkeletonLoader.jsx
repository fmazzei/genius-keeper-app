import React from 'react';

// Componente base para todos los skeletons, con la animación de pulso.
const SkeletonBase = ({ className = '' }) => (
    <div className={`bg-slate-200 rounded animate-pulse ${className}`}></div>
);

// --- Skeletons para el Dashboard Gerencial ---

const SkeletonCard = () => (
    <div className="bg-white rounded-lg shadow-md p-3 sm:p-4 flex items-center border-l-4 border-slate-200">
        <div className="mr-4">
            <SkeletonBase className="w-12 h-12 rounded-lg" />
        </div>
        <div className="flex-1 space-y-2">
            <SkeletonBase className="h-4 w-3/4 rounded" />
            <SkeletonBase className="h-6 w-1/2 rounded" />
        </div>
    </div>
);

const SkeletonGeniusIndex = () => (
     <div className="bg-white rounded-lg shadow-2xl p-4 md:p-6 mb-8 flex flex-col md:flex-row items-center gap-6 border-t-4 border-slate-200">
        <SkeletonBase className="w-40 h-40 sm:w-48 sm:h-48 rounded-full flex-shrink-0" />
        <div className="flex-1 w-full space-y-3">
            <SkeletonBase className="h-8 w-1/3 rounded mx-auto md:mx-0" />
            <SkeletonBase className="h-4 w-full rounded" />
            <SkeletonBase className="h-4 w-2/3 rounded" />
            <SkeletonBase className="h-6 w-1/4 rounded mt-2" />
        </div>
    </div>
);

export const ManagerDashboardSkeleton = () => {
    return (
        <div className="w-full">
            <div className="max-w-7xl mx-auto">
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 gap-4">
                    <SkeletonBase className="h-8 w-1/2 rounded" />
                    <SkeletonBase className="h-10 w-64 rounded-lg" />
                </div>
                
                <SkeletonGeniusIndex />

                <div className="space-y-8">
                    <div>
                        <SkeletonBase className="h-7 w-1/4 mb-4 rounded" />
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                            <SkeletonCard /><SkeletonCard /><SkeletonCard /><SkeletonCard />
                        </div>
                    </div>
                     <div>
                        <SkeletonBase className="h-7 w-1/4 mb-4 rounded" />
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                            <SkeletonCard /><SkeletonCard /><SkeletonCard /><SkeletonCard /><SkeletonCard />
                        </div>
                    </div>
                     <div>
                        <SkeletonBase className="h-7 w-1/4 mb-4 rounded" />
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                            <SkeletonCard /><SkeletonCard /><SkeletonCard />
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

// --- Skeletons para la Lista de Tareas del Vendedor ---

const SkeletonTaskCard = () => (
    <div className="bg-white p-4 rounded-lg shadow-md border border-slate-200">
        <div className="flex justify-between items-start">
            <div className="w-2/3 space-y-2">
                <SkeletonBase className="h-5 w-3/4 rounded" />
                <SkeletonBase className="h-4 w-full rounded" />
            </div>
            <SkeletonBase className="h-10 w-28 rounded-lg" />
        </div>
        <div className="mt-3 pt-3 border-t">
            <SkeletonBase className="h-4 w-1/3 rounded" />
        </div>
    </div>
);

export const TaskListSkeleton = () => (
    <div className="p-4 md:p-8">
        <SkeletonBase className="h-8 w-1/2 md:w-1/3 mb-6 rounded" />
        <div className="space-y-4">
            <SkeletonTaskCard />
            <SkeletonTaskCard />
            <SkeletonTaskCard />
        </div>
    </div>
);

// --- NUEVO: Skeletons para la Lista de Puntos de Venta ---

const SkeletonPosListItem = () => (
    <div className="bg-white p-4 border-b border-slate-200">
        <SkeletonBase className="h-5 w-3/4 rounded" />
        <SkeletonBase className="h-4 w-1/2 mt-2 rounded" />
    </div>
);

export const PosListSkeleton = () => (
    <div className="min-h-full w-full bg-slate-50 p-4 md:p-6">
        <div className="max-w-4xl mx-auto">
            <div className="flex justify-between items-center mb-6">
                <SkeletonBase className="h-9 w-1/3 rounded" />
                <SkeletonBase className="h-10 w-36 rounded-lg" />
            </div>
            <SkeletonBase className="h-12 w-full mb-6 rounded-lg" />
            <div className="space-y-2">
                <div className="bg-white rounded-lg shadow-md overflow-hidden border border-slate-200">
                    <SkeletonBase className="h-16 w-full" />
                    <SkeletonPosListItem />
                    <SkeletonPosListItem />
                    <SkeletonPosListItem />
                </div>
                <div className="bg-white rounded-lg shadow-md overflow-hidden border border-slate-200">
                    <SkeletonBase className="h-16 w-full" />
                </div>
            </div>
        </div>
    </div>
);