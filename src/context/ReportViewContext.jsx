// RUTA: src/context/ReportViewContext.jsx

import React, { createContext, useState, useContext } from 'react';

const ReportViewContext = createContext();

export const useReportView = () => useContext(ReportViewContext);

export const ReportViewProvider = ({ children }) => {
    const [viewedReportId, setViewedReportId] = useState(null);

    return (
        <ReportViewContext.Provider value={{ viewedReportId, setViewedReportId }}>
            {children}
        </ReportViewContext.Provider>
    );
};