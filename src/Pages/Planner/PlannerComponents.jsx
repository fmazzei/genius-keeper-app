import React, { useState, useEffect, memo, useCallback } from 'react';
import { useMap } from 'react-leaflet';
import { ChevronDown, CheckSquare, Square, Store, Building, Sparkles, Share2, Lock, Plus } from 'lucide-react';

export const FloatingActionButton = ({ isMenu = true, actions = [], onClick, icon, tooltip }) => {
    const [isOpen, setIsOpen] = useState(false);

    const handleMainClick = () => {
        if (isMenu) {
            setIsOpen(!isOpen);
        } else if (onClick) {
            onClick();
        }
    };

    const handleActionClick = (action) => {
        if (action) {
            action();
        }
        setIsOpen(false);
    };

    useEffect(() => {
        const originalStyle = window.getComputedStyle(document.body).overflow;
        if (isOpen && isMenu) {
            document.body.style.overflow = 'hidden';
        } else {
            document.body.style.overflow = originalStyle;
        }
        return () => {
            document.body.style.overflow = originalStyle;
        };
    }, [isOpen, isMenu]);

    return (
        <>
            {isOpen && isMenu && (
                <div 
                    className="fixed inset-0 bg-black/40 backdrop-blur-sm z-10 animate-fade-in"
                    onClick={() => setIsOpen(false)}
                ></div>
            )}
            <div className="absolute bottom-20 right-6 z-20 group">
                {isOpen && isMenu && (
                    <div className="flex flex-col items-end gap-3 mb-3">
                        {actions.map((item, index) => (
                            <button 
                                key={index}
                                onClick={() => handleActionClick(item.action)} 
                                className="bg-white p-3 rounded-full shadow-lg text-slate-700 flex items-center gap-3 text-sm w-max animate-fade-in-up"
                                style={{ animationDelay: `${(actions.length - index - 1) * 50}ms` }}
                            >
                                <span className="font-semibold pr-2">{item.label}</span>{item.icon}
                            </button>
                        ))}
                    </div>
                )}
                
                {!isMenu && tooltip && (
                    <div className="absolute bottom-full right-0 mb-2 whitespace-nowrap bg-slate-800 text-white text-xs font-semibold py-1.5 px-3 rounded-md opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none">
                        {tooltip}
                    </div>
                )}

                <button
                    onClick={handleMainClick}
                    className={`bg-brand-yellow text-black rounded-full p-4 shadow-xl transition-all duration-300 transform hover:scale-110 ${isOpen && isMenu ? 'rotate-45' : 'rotate-0'}`}
                    aria-label={tooltip || "Abrir menú de acciones"}
                >
                    {isMenu ? <Plus size={28} /> : icon}
                </button>
            </div>
        </>
    );
};

export const MapResizer = ({ activeTab }) => {
    const map = useMap();
    useEffect(() => {
        if (activeTab === 'mapa' || activeTab === 'Mapa') {
            setTimeout(() => {
                map.invalidateSize();
            }, 100);
        }
    }, [activeTab, map]);
    return null;
};

export const NavTab = ({ icon, label, isActive, onClick }) => (
    <button onClick={onClick} className={`flex flex-col items-center justify-center w-full pt-2 pb-1 transition-colors ${isActive ? 'text-brand-blue' : 'text-slate-500'}`}>
        {icon}
        <span className="text-xs font-semibold">{label}</span>
    </button>
);

export const Accordion = memo(({ title, children, icon, isOpen, onToggle, itemKey }) => {
    const handleToggle = useCallback(() => onToggle(itemKey), [onToggle, itemKey]);

    return (
        <div className="border rounded-lg overflow-hidden bg-white shadow-sm">
            <button onClick={handleToggle} className="w-full text-left p-3 font-semibold bg-slate-50 flex justify-between items-center text-slate-700 hover:bg-slate-100">
                <span className="flex items-center gap-2 text-sm">{icon}{title}</span>
                <ChevronDown className={`transition-transform duration-300 ${isOpen ? 'rotate-180' : ''}`} />
            </button>
            {isOpen && !!children && <div className="p-1">{children}</div>}
        </div>
    );
});

export const StopBankItem = memo(({ stop, isSelected, onToggle, onDelegate, isAgendaView, assignment, currentReporterId }) => {
    const isLockedByOther = assignment && assignment.reporterId !== currentReporterId;
    const ownerName = assignment?.reporterName || 'otro reporter';
    const handleToggle = useCallback(() => {
        if (!isLockedByOther) {
            onToggle(stop);
        }
    }, [onToggle, stop, isLockedByOther]);
    const handleDelegate = useCallback((e) => {
        e.stopPropagation();
        onDelegate(stop);
    }, [onDelegate, stop]);
    const isAssignedToMeElsewhere = isAgendaView && assignment?.reporterId === currentReporterId && !isSelected;

    return (
        <div 
            className={`p-2.5 border-b last:border-b-0 rounded-md flex items-center gap-3 group transition-colors ${isLockedByOther ? 'bg-slate-100 opacity-60 cursor-not-allowed' : (isSelected ? 'bg-blue-50' : '')}`}
            title={isLockedByOther ? `Asignado a: ${ownerName}` : ''}
        >
            <div onClick={handleToggle} className={`flex-1 flex items-center gap-3 ${isLockedByOther ? '' : 'cursor-pointer'}`}>
                {isLockedByOther 
                    ? <Lock className="text-slate-500 flex-shrink-0 w-5 h-5" /> 
                    : (isSelected 
                        ? <CheckSquare className="text-blue-600 flex-shrink-0 w-5 h-5" /> 
                        : <Square className="text-slate-400 flex-shrink-0 w-5 h-5" />)
                }
                <div>
                    <p className={`text-sm font-semibold flex items-center gap-2 ${isLockedByOther ? 'text-slate-500' : ''}`}>
                        {stop.type === 'depot' ? <Building size={14}/> : <Store size={14}/>}
                        {stop.name}
                        {isAssignedToMeElsewhere && (<span className="w-2 h-2 bg-blue-500 rounded-full" title="Ya asignado en tu agenda semanal"></span>)}
                    </p>
                    {stop.isSuggested && <p className="text-xs text-amber-600 flex items-center gap-1"><Sparkles size={12}/>{stop.reason}</p>}
                </div>
            </div>
            {!isLockedByOther && (
                <button onClick={handleDelegate} className="p-1 text-slate-400 hover:text-blue-600 opacity-0 group-hover:opacity-100 transition-opacity" title="Delegar parada">
                    <Share2 size={16} />
                </button>
            )}
        </div>
    );
});

export const MoveStopModal = ({ isOpen, onClose, onMove, fromDay }) => {
    if (!isOpen) return null; 
    const daysOfWeek = ['lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado', 'domingo']; 
    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex justify-center items-center z-50 p-4">
            <div className="bg-white rounded-lg p-4 w-full max-w-sm">
                <h3 className="font-bold text-center mb-4">Mover a otro día</h3>
                <div className="grid grid-cols-3 gap-2">
                    {daysOfWeek.filter(d => d !== fromDay).map(day => (
                        <button key={day} onClick={() => onMove(day)} className="capitalize p-3 bg-slate-100 rounded-md font-semibold">{day}</button>
                    ))}
                </div>
                <button onClick={onClose} className="w-full mt-4 bg-slate-200 p-2 rounded-md">Cancelar</button>
            </div>
        </div>
    );
};

// ✅ COMPONENTE ACTUALIZADO PARA DELEGACIÓN DINÁMICA
export const DelegateModal = ({ isOpen, onClose, onDelegate, stop, reporters = [], currentUserId }) => {
    // El estado ahora guardará el ID del usuario seleccionado
    const [targetUserId, setTargetUserId] = useState('');

    // Reinicia el estado cuando el modal se abre
    useEffect(() => {
        if (isOpen) {
            // Selecciona el primer usuario de la lista por defecto (que no sea el actual)
            const defaultUser = reporters.find(r => r.id !== currentUserId);
            if (defaultUser) {
                setTargetUserId(defaultUser.id);
            }
        }
    }, [isOpen, reporters, currentUserId]);

    if (!isOpen) return null;

    // Filtra la lista para no poder delegarse a uno mismo
    const delegableReporters = reporters.filter(r => r.id !== currentUserId);

    const handleConfirm = () => {
        if (targetUserId) {
            onDelegate(targetUserId);
        } else {
            alert("Por favor, selecciona un usuario a quien delegar la visita.");
        }
    };

    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex justify-center items-center z-50 p-4">
            <div className="bg-white rounded-lg p-6 w-full max-w-sm animate-fade-in-up">
                <h3 className="font-bold text-center text-xl mb-2">Delegar Parada</h3>
                <p className="text-center text-sm text-slate-600 mb-4">
                    Vas a asignar la visita a <strong>{stop?.name}</strong> a otro usuario.
                </p>
                <label htmlFor="delegate-user" className="font-semibold">Delegar a:</label>
                <select 
                    id="delegate-user" 
                    value={targetUserId} 
                    onChange={e => setTargetUserId(e.target.value)} 
                    className="w-full p-3 border-2 border-slate-200 rounded-lg mt-1 bg-white"
                >
                    <option value="">-- Selecciona un Reporter --</option>
                    {delegableReporters.map(reporter => (
                        <option key={reporter.id} value={reporter.id}>
                            {reporter.name}
                        </option>
                    ))}
                </select>
                <div className="flex gap-2 mt-4">
                    <button onClick={onClose} className="w-full text-sm text-slate-600 bg-slate-200 py-3 rounded-lg font-semibold">Cancelar</button>
                    <button onClick={handleConfirm} className="w-full bg-brand-blue text-white font-bold py-3 rounded-lg">Confirmar</button>
                </div>
            </div>
        </div>
    );
};