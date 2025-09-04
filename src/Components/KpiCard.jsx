// RUTA: src/Components/KpiCard.jsx

import React from 'react';

const KpiCard = ({ icon, title, value, unit, onClick, sentiment = 'neutral' }) => {
  const sentimentStyles = {
    good: {
      borderColor: 'border-green-400',
      bgColor: 'hover:bg-green-50',
      iconBgColor: 'bg-green-100',
      iconTextColor: 'text-green-600',
    },
    bad: {
      borderColor: 'border-red-400',
      bgColor: 'hover:bg-red-50',
      iconBgColor: 'bg-red-100',
      iconTextColor: 'text-red-600',
    },
    neutral: {
      borderColor: 'border-slate-300',
      bgColor: 'hover:bg-slate-50',
      iconBgColor: 'bg-slate-100',
      iconTextColor: 'text-brand-blue',
    }
  };

  const styles = sentimentStyles[sentiment] || sentimentStyles.neutral;

  return (
    <div
      onClick={onClick}
      className={`bg-white rounded-lg shadow-md p-3 sm:p-4 flex items-center cursor-pointer transition-all duration-300 border-l-4 ${styles.borderColor} ${styles.bgColor} hover:shadow-xl hover:scale-105`}
    >
      <div className="mr-4">
        <div className={`p-3 rounded-lg ${styles.iconBgColor} ${styles.iconTextColor}`}>
          {icon}
        </div>
      </div>
      <div className="flex-1">
        <h4 className="text-sm font-semibold text-slate-500">{title}</h4>
        <p className="text-2xl font-bold text-slate-800">
          {value} <span className="text-base font-medium text-slate-500">{unit}</span>
        </p>
      </div>
    </div>
  );
};

export default KpiCard;
