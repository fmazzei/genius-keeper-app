import React from 'react';

const KpiCard = ({ icon, title, value, unit, onClick }) => (
    <div onClick={onClick} className={`bg-white p-5 rounded-2xl shadow-lg flex items-center cursor-pointer hover:shadow-xl hover:scale-105 transition-all`}>
        <div className="p-3 bg-blue-100 rounded-xl mr-4 text-blue-600">
            {React.cloneElement(icon, { size: 28 })}
        </div>
        <div>
            <p className="text-gray-500 text-sm font-medium">{title}</p>
            <p className="text-2xl font-bold text-gray-800">
                {value} <span className="text-lg font-medium text-gray-500">{unit}</span>
            </p>
        </div>
    </div>
);

export default KpiCard;