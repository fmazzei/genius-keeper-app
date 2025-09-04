import { useState, useEffect } from 'react'; // SOLUCIÓN: Se elimina la importación innecesaria de 'React'
import { signOut } from 'firebase/auth';
import { onMessage } from "firebase/messaging";
import type { MessagePayload } from "firebase/messaging"; // SOLUCIÓN: Se importa 'MessagePayload' como un tipo
import { auth, messaging } from '@/Firebase/config.js';
import { useAuth } from '@/context/AuthContext.jsx';
import { requestNotificationPermission } from '@/utils/firebaseMessaging.js';
import LoginScreen from '@/Pages/LoginScreen.jsx';
import ManagerLayout from '@/Pages/ManagerLayout.jsx';
import AppShell from '@/Pages/AppShell.jsx';
import LoadingSpinner from '@/Components/LoadingSpinner.jsx';
import InAppNotification from '@/Components/InAppNotification.jsx';

// Definir una interfaz para la estructura de nuestra notificación
interface AppNotification {
  title: string;
  body: string;
}

function App() {
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
            
            requestNotificationPermission(user.uid);
        } else { 
            setRole(''); 
        }
    }, [user]);

    useEffect(() => {
        const unsubscribe = onMessage(messaging, (payload: MessagePayload) => {
            console.log("Notificación recibida en primer plano: ", payload);
            
            // Comprobación de seguridad para asegurar que la notificación tiene el formato esperado
            if (payload.notification) {
                setActiveNotification({
                    title: payload.notification.title || "Nueva Notificación",
                    body: payload.notification.body || "Has recibido un nuevo mensaje.",
                });
            }
        });

        return () => {
            unsubscribe();
        };
    }, []);

    if (loading || (user && !role)) {
        return <LoadingSpinner />;
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

export default App;