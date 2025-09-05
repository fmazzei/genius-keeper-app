import React, { useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { signOut } from 'firebase/auth';
import { onMessage, MessagePayload } from "firebase/messaging";
import { auth, messaging } from '@/Firebase/config.js';
import { useAuth } from '@/context/AuthContext.jsx';
import LoginScreen from '@/Pages/LoginScreen.jsx';
import ManagerLayout from '@/Pages/ManagerLayout.jsx';
import AppShell from '@/Pages/AppShell.jsx';
import LoadingSpinner from '@/Components/LoadingSpinner.jsx';
import InAppNotification from '@/Components/InAppNotification.jsx';
import ReportDetailModalController from '@/Components/ReportDetailModalController.jsx';

// La interfaz para la estructura de la notificación en la app
interface AppNotification {
  title: string;
  body: string;
}

// Este componente contiene la lógica principal de tu aplicación para decidir qué vista mostrar.
const AppContent: React.FC = () => {
    const { user, loading } = useAuth();
    const [role, setRole] = useState('');
    const [activeNotification, setActiveNotification] = useState<AppNotification | null>(null);

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

    useEffect(() => {
        // Asegurarse de que 'messaging' está inicializado antes de usarlo.
        if (messaging) {
            const unsubscribe = onMessage(messaging, (payload: MessagePayload) => {
                console.log("Notificación recibida en primer plano: ", payload);
                
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

    if (loading || (user && !role)) {
        return <div className="flex justify-center items-center h-screen"><LoadingSpinner /></div>;
    }

    const renderAppContent = () => {
        if (!user) {
            return <LoginScreen />;
        }
        if (role === 'master' || role === 'sales_manager') {
            return <ManagerLayout user={user} role={role} onLogout={() => signOut(auth)} />;
        }
        return <AppShell user={user} role={role} onLogout={() => signOut(auth)} />;
    };

    return (
        <>
            <InAppNotification 
                notification={activeNotification} 
                onDismiss={() => setActiveNotification(null)}
            />
            {renderAppContent()}
        </>
    );
};

// El componente App principal ahora se encarga de la estructura del enrutamiento.
const App: React.FC = () => {
    return (
        <Router>
            {/* El contenido principal de la app siempre está presente */}
            <AppContent />

            {/* Las rutas definen qué componentes adicionales se muestran según la URL */}
            <Routes>
                {/* Esta es la regla para que el modal interactivo funcione */}
                <Route path="/reports/:reportId" element={<ReportDetailModalController />} />
            </Routes>
        </Router>
    );
}

export default App;