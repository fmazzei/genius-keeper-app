import React from 'react';
import { Check } from 'lucide-react';

/**
 * Un contenedor visual para agrupar campos de un formulario.
 * @param {object} props - Propiedades del componente.
 * @param {string} props.title - El título de la sección.
 * @param {React.ReactNode} props.icon - El ícono a mostrar junto al título.
 * @param {React.ReactNode} props.children - Los elementos hijos a renderizar dentro de la sección.
 */
export const FormSection = ({ title, icon, children }) => (
    <div className="bg-white p-4 sm:p-6 rounded-lg shadow-md border border-slate-200">
        {icon && <h3 className="text-lg sm:text-xl font-bold text-slate-800 flex items-center mb-4">{icon}{title}</h3>}
        {children}
    </div>
);

/**
 * Un campo de entrada de texto genérico con etiqueta.
 */
export const FormInput = ({ label, type, value, onChange, placeholder, disabled = false }) => (
    <div>
        <label className="block text-sm font-medium text-slate-700 mb-1">{label}</label>
        <input 
            type={type} 
            value={value} 
            onChange={onChange} 
            placeholder={placeholder} 
            disabled={disabled} 
            className="w-full p-3 border border-slate-300 rounded-md focus:ring-brand-yellow focus:border-brand-yellow disabled:bg-slate-100 disabled:text-slate-500"
        />
    </div>
);

/**
 * Un botón de tipo 'toggle' que muestra un estado seleccionado.
 */
export const ToggleButton = ({ label, isSelected, onClick, disabled = false }) => (
    <button 
        type="button" 
        onClick={onClick} 
        disabled={disabled} 
        className={`flex items-center justify-center gap-2 p-3 text-sm font-semibold rounded-lg border-2 w-full transition-colors ${
            isSelected 
                ? 'bg-brand-blue text-white border-brand-blue' 
                : 'bg-slate-50 text-slate-700'
        } disabled:opacity-70 disabled:cursor-not-allowed`}
    >
        {isSelected && <Check size={16}/>}
        {label}
    </button>
);