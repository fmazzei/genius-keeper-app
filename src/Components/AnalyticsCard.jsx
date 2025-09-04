import React from 'react';
import { ArrowUpRight, ArrowDownRight } from 'lucide-react';

const AnalyticsCard = ({ icon, title, value, change, trend }) => {
    const trendColor = trend === 'up' ? 'text-emerald-500' : trend === 'down' ? 'text-red-500' : 'text-slate-500';
    const TrendIcon = trend === 'up' ? ArrowUpRight : ArrowDownRight;

    return (
        <div className="bg-white p-4 rounded-lg shadow-sm border border-slate-200">
            <div className="flex items-center">
                <div className="p-3 bg-slate-100 rounded-lg mr-4">
                    {icon}
                </div>
                <div>
                    <p className="text-sm font-medium text-slate-500">{title}</p>
                    <p className="text-2xl font-bold text-slate-800">{value}</p>
                </div>
            </div>
            {change && (
                <div className="mt-3 flex items-center text-xs">
                    {trend !== 'neutral' && <TrendIcon className={`w-4 h-4 ${trendColor}`} />}
                    <span className={`ml-1 font-semibold ${trendColor}`}>{change}</span>
                </div>
            )}
        </div>
    );
};

export default AnalyticsCard;