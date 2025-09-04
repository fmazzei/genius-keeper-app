// RUTA: src/Components/LoadingSpinner.jsx

import React from 'react';

const LoadingSpinner = ({ size = 'default' }) => {
    const sizeClasses = {
        sm: 'h-5 w-5 border-2',
        default: 'h-12 w-12 border-4',
        lg: 'h-24 w-24 border-8',
    };

    return (
        <div className="flex items-center justify-center p-4">
            <div 
                className={`animate-spin rounded-full border-slate-200 border-t-brand-blue ${sizeClasses[size] || sizeClasses.default}`}
            ></div>
        </div>
    );
};

export default LoadingSpinner;