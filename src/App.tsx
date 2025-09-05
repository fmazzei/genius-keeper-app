import { useState, useEffect } from 'react';
import { signOut } from 'firebase/auth';
import { onMessage, MessagePayload } from "firebase/messaging";
// --- NUEVO: Se importan las herramientas de enrutamiento ---
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { auth, messaging } from '@/Firebase/config.js';
import { useAuth } from '@/context/AuthContext.jsx';
import { requestNotificationPermission } from '@/utils/firebaseMessaging.js';
import LoginScreen from '@/Pages/LoginScreen.jsx';
import ManagerLayout from '@/Pages/ManagerLayout.jsx';
import AppShell from '@/Pages/AppShell.jsx';
import LoadingSpinner from '@/Components/LoadingSpinner.jsx';
import InAppNotification from '@/Components/InAppNotification.jsx';
// --- NUEVO: Se importa el controlador del modal ---
import ReportDetailModalController from '@/Components/ReportDetailModalController.jsx';

interface AppNotification {
  title: string;
  body: string;
}

// --- NUEVO: Se mueve la lógica principal a un sub-componente ---
// Esto permite que el enrutador lo maneje correctamente.
const AppContent = () => {
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
            
            // La llamada a requestNotificationPermission se movió al AuthContext,
            // por lo que ya no es necesaria aquí, pero si la necesitaras, este sería el lugar.
        } else { 
            setRole(''); 
        }
    }, [user]);

    useEffect(() => {
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
}

// --- MODIFICADO: El componente App ahora gestiona el enrutamiento ---
function App() {
    return (
        <Router>
            {/* El contenido principal de la app se renderiza siempre */}
            <AppContent />

            {/* El enrutador escucha cambios en la URL y renderiza componentes específicos */}
            <Routes>
                {/* Esta es la nueva regla: si la URL es /reports/..., muestra el modal */}
                <Route path="/reports/:reportId" element={<ReportDetailModalController />} />
            </Routes>
        </Router>
    );
}

export default App;