// RUTA: src/App.tsx

import React, { useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { signOut } from 'firebase/auth';
import { onMessage, type MessagePayload } from "firebase/messaging";
import { auth, messaging } from '@/Firebase/config.js';
import { useAuth } from '@/context/AuthContext.tsx';
import { useReportView } from '@/context/ReportViewContext.jsx'; // <-- 1. Importar el hook del nuevo contexto
import LoginScreen from '@/Pages/LoginScreen.jsx';
import ManagerLayout from '@/Pages/ManagerLayout.jsx';
import AppShell from '@/Pages/AppShell.jsx';
import LoadingSpinner from '@/Components/LoadingSpinner.jsx';
import InAppNotification from '@/Components/InAppNotification.jsx';
import ReportDetailModalController from '@/Components/ReportDetailModalController.jsx';

interface AppNotification {
  title: string;
  body: string;
}

// El Layout principal. Su única responsabilidad es decidir qué pantalla principal mostrar.
const AppLayout: React.FC = () => {
    const { user, loading } = useAuth();
    const [role, setRole] = useState('');

    useEffect(() => {
        if (user) {
            let userRole = '';
            if (user.isAnonymous) { userRole = 'merchandiser'; }
            else if (user.email === 'lacteoca@lacteoca.com') { userRole = 'master'; }
            else if (user.email === 'carolina@lacteoca.com') { userRole = 'sales_manager'; }
            setRole(userRole);
        } else {
            setRole('');
        }
    }, [user]);

    if (loading || (user && !role)) {
        return <div className="flex justify-center items-center h-screen"><LoadingSpinner /></div>;
    }

    if (!user) {
        return <LoginScreen />;
    }
    if (role === 'master' || role === 'sales_manager') {
        return <ManagerLayout user={user} role={role} onLogout={() => signOut(auth)} />;
    }
    return <AppShell user={user} role={role} onLogout={() => signOut(auth)} />;
};

// --- NUEVO: Controlador Global de Modal de Reporte ---
// Este componente escucha el contexto y decide si muestra el modal.
const GlobalReportModal: React.FC = () => {
    const { viewedReportId, setViewedReportId } = useReportView();

    // Si no hay un ID en el contexto, no renderizamos nada.
    if (!viewedReportId) {
        return null;
    }

    const handleClose = () => {
        // Limpiar el contexto para cerrar el modal
        setViewedReportId(null);
    };

    // Si hay un ID, renderizamos el controlador del modal, pasándole el ID y la función de cierre.
    return <ReportDetailModalController reportId={viewedReportId} onClose={handleClose} />;
};

// --- Componente Principal Actualizado ---
const App: React.FC = () => {
    const [activeNotification, setActiveNotification] = useState<AppNotification | null>(null);

    useEffect(() => {
        if (messaging) {
            const unsubscribe = onMessage(messaging, (payload: MessagePayload) => {
                if (payload.notification) {
                    setActiveNotification({
                        title: payload.notification.title || "Nueva Notificación",
                        body: payload.notification.body || "Has recibido un nuevo mensaje.",
                    });
                }
            });
            return () => unsubscribe();
        }
    }, []);

    return (
        <Router>
            {/* Componentes globales que viven fuera de las rutas para mostrarse siempre */}
            <InAppNotification
                notification={activeNotification}
                onDismiss={() => setActiveNotification(null)}
            />
            <GlobalReportModal /> {/* <-- 2. El controlador de modal vive aquí */}
            
            <Routes>
                {/* 3. El enrutamiento se simplifica a una sola ruta que renderiza el layout principal.
                    El modal aparecerá "encima" de lo que sea que esté renderizando AppLayout. */}
                <Route path="*" element={<AppLayout />} />
            </Routes>
        </Router>
    );
}

export default App;