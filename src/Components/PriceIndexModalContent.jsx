// RUTA: src/Components/PriceIndexModalContent.jsx

import React, { useState, useMemo, useEffect } from 'react';
import { HelpCircle, ChevronDown, TrendingUp, TrendingDown, Store, AlertTriangle } from 'lucide-react';

const OUR_PRODUCT_WEIGHT_G = 250;

const PriceChangeIndicator = ({ change }) => {
    if (change === 0 || !change) return null;
    const isUp = change > 0;
    return (
        <span className={`flex items-center text-xs ml-2 ${isUp ? 'text-red-500' : 'text-green-500'}`}>
            {isUp ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
            <span className="ml-1">(${change.toFixed(2)})</span>
        </span>
    );
};

const CompetitorSummaryCard = ({ brand, data }) => {
    const [isOpen, setIsOpen] = useState(false);
    const avgDifference = data.reduce((acc, item) => acc + item.difference, 0) / data.length;
    const presenceCount = new Set(data.map(item => item.storeName)).size;
    const priceChanges = data.filter(d => d.priceChange !== 0).length;

    return (
        <div className="border border-slate-200 rounded-lg bg-white">
            <button onClick={() => setIsOpen(!isOpen)} className="w-full flex items-center justify-between p-3 text-left hover:bg-slate-50">
                <div>
                    <p className="font-bold text-lg text-slate-800">{brand}</p>
                    <div className="flex items-center gap-4 text-xs text-slate-500 mt-1">
                        <span className="flex items-center gap-1"><Store size={14}/> En {presenceCount} tienda(s)</span>
                        {priceChanges > 0 && <span className="flex items-center gap-1 font-bold text-orange-500"><AlertTriangle size={14}/> {priceChanges} cambio(s) de precio</span>}
                    </div>
                </div>
                <div className="flex items-center gap-4">
                     <span className={`px-2 py-1 text-sm font-bold rounded-full ${avgDifference > 5 ? 'text-red-600 bg-red-100' : avgDifference < -5 ? 'text-green-600 bg-green-100' : 'text-slate-600 bg-slate-100'}`}>{avgDifference > 0 ? '+' : ''}{avgDifference.toFixed(0)}%</span>
                    <ChevronDown className={`transition-transform ${isOpen ? 'rotate-180' : ''}`} />
                </div>
            </button>
            {isOpen && (
                <div className="p-0 animate-fade-in border-t">
                    <table className="w-full text-sm text-left">
                        <thead className="text-xs text-slate-500 bg-slate-50">
                            <tr>
                                <th className="px-2 py-1">Tienda</th>
                                <th className="px-2 py-1">Producto</th>
                                <th className="px-2 py-1 text-right">Precio/100g</th>
                                <th className="px-2 py-1 text-right">Diferencia</th>
                            </tr>
                        </thead>
                        <tbody>
                            {data.map((item, index) => (
                                <tr key={index} className="border-b last:border-b-0">
                                    <td className="px-2 py-2 text-slate-700">{item.storeName}</td>
                                    <td className="px-2 py-2 text-slate-500">{item.competitorProduct}</td>
                                    <td className="px-2 py-2 text-right font-semibold flex justify-end items-center">${item.competitorPricePer100g.toFixed(2)} <PriceChangeIndicator change={item.priceChange} /></td>
                                    <td className={`px-2 py-2 text-right font-bold ${item.difference > 5 ? 'text-red-600' : item.difference < -5 ? 'text-green-600' : 'text-slate-600'}`}>{item.difference.toFixed(0)}%</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    );
};

const PriceIndexModalContent = ({ reports }) => {
    const [storeFilter, setStoreFilter] = useState('Todos');
    const [brandFilter, setBrandFilter] = useState('Todos');
    const [productFilter, setProductFilter] = useState('Todos');

    const analysis = useMemo(() => {
        const flatData = [];
        const stores = new Set(['Todos']);
        const brands = new Set(['Todos']);
        const productsByBrand = { 'Todos': new Set(['Todos']) };

        (reports || []).forEach(r => {
            if (r.price && Array.isArray(r.competition)) {
                const ourPricePer100g = (Number(r.price) / OUR_PRODUCT_WEIGHT_G) * 100;
                stores.add(r.posName);
                r.competition.forEach(c => {
                    if (c.brand && c.price && c.weight_g && c.productName) {
                        brands.add(c.brand);
                        if (!productsByBrand[c.brand]) productsByBrand[c.brand] = new Set(['Todos']);
                        productsByBrand[c.brand].add(c.productName);

                        flatData.push({
                            storeName: r.posName, competitorBrand: c.brand, competitorProduct: c.productName,
                            competitorPricePer100g: (Number(c.price) / c.weight_g) * 100,
                            difference: ((((Number(c.price) / c.weight_g) * 100) - ourPricePer100g) / ourPricePer100g) * 100,
                        });
                    }
                });
            }
        });
        
        return { 
            hasData: flatData.length > 0, 
            flatData, 
            stores: [...stores].sort(), 
            brands: [...brands].sort(),
            productsByBrand: Object.fromEntries(Object.entries(productsByBrand).map(([brand, productSet]) => [brand, [...productSet].sort()]))
        };
    }, [reports]);

    const availableProducts = analysis.productsByBrand[brandFilter] || ['Todos'];

    useEffect(() => {
        if (!availableProducts.includes(productFilter)) {
            setProductFilter('Todos');
        }
    }, [brandFilter, productFilter, availableProducts]);

    const groupedAndFilteredData = useMemo(() => {
        const filtered = analysis.flatData.filter(item => 
            (storeFilter === 'Todos' || item.storeName === storeFilter) &&
            (brandFilter === 'Todos' || item.competitorBrand === brandFilter) &&
            (productFilter === 'Todos' || item.competitorProduct === productFilter)
        );
        const grouped = {};
        filtered.forEach(item => {
            if (!grouped[item.competitorBrand]) grouped[item.competitorBrand] = [];
            grouped[item.competitorBrand].push(item);
        });
        return grouped;
    }, [analysis.flatData, storeFilter, brandFilter, productFilter]);
    
    if (!analysis.hasData) {
        return (
            <div className="p-6 text-center">
                <HelpCircle className="mx-auto h-12 w-12 text-slate-400" />
                <h3 className="mt-2 text-lg font-semibold">Datos Insuficientes</h3>
                <p className="mt-1 text-sm text-slate-500">No se encontraron datos de precios de la competencia.</p>
            </div>
        );
    }

    return (
        <div className="p-4 bg-slate-50">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 p-3 mb-4 bg-white rounded-lg border">
                <div>
                    <label htmlFor="store-filter" className="block text-sm font-medium text-slate-700">Tienda</label>
                    <select id="store-filter" value={storeFilter} onChange={e => setStoreFilter(e.target.value)} className="mt-1 block w-full pl-3 pr-10 py-2 border-slate-300 rounded-md bg-white">
                        {analysis.stores.map(s => <option key={s}>{s}</option>)}
                    </select>
                </div>
                <div>
                    <label htmlFor="brand-filter" className="block text-sm font-medium text-slate-700">Marca Competidora</label>
                    <select id="brand-filter" value={brandFilter} onChange={e => setBrandFilter(e.target.value)} className="mt-1 block w-full pl-3 pr-10 py-2 border-slate-300 rounded-md bg-white">
                        {analysis.brands.map(b => <option key={b}>{b}</option>)}
                    </select>
                </div>
                <div>
                    <label htmlFor="product-filter" className="block text-sm font-medium text-slate-700">Producto</label>
                    <select id="product-filter" value={productFilter} onChange={e => setProductFilter(e.target.value)} disabled={brandFilter === 'Todos'} className="mt-1 block w-full pl-3 pr-10 py-2 border-slate-300 rounded-md disabled:bg-slate-100 bg-white">
                        {availableProducts.map(p => <option key={p}>{p}</option>)}
                    </select>
                </div>
            </div>

            <div className="space-y-3 max-h-[60vh] overflow-y-auto pr-2">
                 {Object.keys(groupedAndFilteredData).length > 0 ? (
                    Object.keys(groupedAndFilteredData).map(brand => (
                        <CompetitorSummaryCard key={brand} brand={brand} data={groupedAndFilteredData[brand]} />
                    ))
                ) : (
                    <div className="text-center py-8 text-slate-500">No hay datos que coincidan con los filtros.</div>
                )}
            </div>
        </div>
    );
};

export default PriceIndexModalContent;