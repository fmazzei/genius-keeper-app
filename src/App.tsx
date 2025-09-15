// RUTA: src/App.tsx

import React, { useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { signOut } from 'firebase/auth';
import { onMessage, type MessagePayload } from "firebase/messaging";
import { doc, getDoc } from 'firebase/firestore';
import { auth, messaging, db } from '@/Firebase/config.js';
import { useAuth } from '@/context/AuthContext.tsx';
import { useReportView } from '@/context/ReportViewContext.jsx';
import LoginScreen from '@/Pages/LoginScreen.jsx';
import ManagerLayout from '@/Pages/ManagerLayout.jsx';
import AppShell from '@/Pages/AppShell.jsx';
import ProductionPanel from '@/Pages/ProductionPanel.jsx';
import SecurityLockScreen from '@/Components/SecurityLockScreen.jsx';
import LoadingSpinner from '@/Components/LoadingSpinner.jsx';
import InAppNotification from '@/Components/InAppNotification.jsx';
import ReportDetailModalController from '@/Components/ReportDetailModalController.tsx';
import { LogOut } from 'lucide-react';

interface AppNotification {
  title: string;
  body: string;
}

const AppLayout: React.FC = () => {
    const { user, loading: authLoading } = useAuth();
    const [role, setRole] = useState<string | null>(null);
    const [isSecurityLocked, setIsSecurityLocked] = useState<boolean>(true);
    const [isLoadingMetadata, setIsLoadingMetadata] = useState<boolean>(true);

    useEffect(() => {
        const fetchUserMetadata = async () => {
            if (user) {
                setIsLoadingMetadata(true);
                try {
                    const userDocRef = doc(db, 'users_metadata', user.uid);
                    const docSnap = await getDoc(userDocRef);
                    
                    if (docSnap.exists()) {
                        const data = docSnap.data();
                        const userRole = data.role;
                        setRole(userRole);

                        if (userRole === 'merchandiser' || userRole === 'produccion') {
                            if (data.isSecurityBypassed === true) {
                                setIsSecurityLocked(false);
                            } else {
                                setIsSecurityLocked(true);
                            }
                        } else {
                            setIsSecurityLocked(false);
                        }
                    } else {
                        setRole('no-role');
                        setIsSecurityLocked(false);
                    }
                } catch (error) {
                    console.error("Error fetching user metadata:", error);
                    setRole('no-role');
                    setIsSecurityLocked(false);
                } finally {
                    setIsLoadingMetadata(false);
                }
            } else {
                setRole(null);
                setIsLoadingMetadata(false);
                setIsSecurityLocked(false);
            }
        };

        fetchUserMetadata();
    }, [user]);

    if (authLoading || isLoadingMetadata) {
        return <div className="flex justify-center items-center h-screen"><LoadingSpinner /></div>;
    }

    if (!user) {
        return <LoginScreen />;
    }

    // ✅ CAMBIO CLAVE: Ahora pasamos el 'role' como prop a la pantalla de bloqueo.
    if (isSecurityLocked && (role === 'merchandiser' || role === 'produccion')) {
        return <SecurityLockScreen onUnlock={() => setIsSecurityLocked(false)} role={role} />;
    }
    
    if (role === 'master' || role === 'sales_manager') {
        return <ManagerLayout user={user} role={role} onLogout={() => signOut(auth)} />;
    }
    if (role === 'produccion') {
        return (
            <div className="h-screen font-sans flex flex-col">
                 <header className="h-16 bg-white border-b flex items-center justify-between px-6 shadow-sm shrink-0">
                    <h2 className="text-xl font-semibold text-slate-800">Genius Keeper - Producción</h2>
                    <button onClick={() => signOut(auth)} className="flex items-center gap-2 text-sm text-slate-600 hover:text-red-600 font-semibold p-2 rounded-lg hover:bg-slate-100 transition-colors">
                        <LogOut size={18} />
                        Cerrar Sesión
                    </button>
                </header>
                <main className="flex-1 overflow-y-auto bg-slate-50">
                    <ProductionPanel />
                </main>
            </div>
        );
    }
    if (role === 'merchandiser') {
         return <AppShell user={user} role={role} onLogout={() => signOut(auth)} />;
    }
    
    return <div>Error: Rol de usuario no reconocido o no tienes permisos.</div>;
};


const GlobalReportModal: React.FC = () => {
    const { viewedReportId, setViewedReportId } = useReportView();
    if (!viewedReportId) return null;
    return <ReportDetailModalController reportId={viewedReportId} onClose={() => setViewedReportId(null)} />;
};


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
            <InAppNotification
                notification={activeNotification}
                onDismiss={() => setActiveNotification(null)}
            />
            <GlobalReportModal />
            <Routes>
                <Route path="*" element={<AppLayout />} />
            </Routes>
        </Router>
    );
}

export default App;