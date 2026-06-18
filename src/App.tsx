// RUTA: src/App.tsx

import React, { useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { signOut } from 'firebase/auth';
import { onMessage, type MessagePayload } from "firebase/messaging";
import { auth, messaging } from '@/Firebase/config.js';
import { useAuth } from '@/context/AuthContext.tsx';
import { useReportView } from '@/context/ReportViewContext.jsx';
import { useInvite } from '@/context/InviteContext.tsx';
import LoginScreen from '@/Pages/LoginScreen.jsx';
import ManagerLayout from '@/Pages/ManagerLayout.jsx';
import VendedorLayout from '@/Pages/VendedorLayout.jsx';
import AppShell from '@/Pages/AppShell.jsx';
import KromaShell from '@/Kroma/KromaShell.jsx';
import SecurityLockScreen from '@/Components/SecurityLockScreen.tsx';
import LoadingSpinner from '@/Components/LoadingSpinner.jsx';
import InAppNotification from '@/Components/InAppNotification.jsx';
import ReportDetailModalController from '@/Components/ReportDetailModalController.tsx';
import RouteInviteModal from '@/Components/RouteInviteModal.tsx';
import ErrorBoundary from '@/Components/ErrorBoundary.jsx';
import { LogOut, Lock } from 'lucide-react';

interface AppNotification {
  title: string;
  body: string;
}

const AppLayout: React.FC = () => {
    const { user, role, loading, isAccountSuspended } = useAuth();
    const [isSecurityLocked, setIsSecurityLocked] = useState<boolean>(true);
    // ✅ Se trae la lógica del modal aquí
    const { inviteId, setInviteId } = useInvite();
    
    useEffect(() => {
        if (!loading) {
            if ((role === 'merchandiser' || role === 'produccion')) {
                setIsSecurityLocked(true);
            } else {
                setIsSecurityLocked(false);
            }
        }
    }, [loading, role]);


    if (loading) {
        return <div className="flex justify-center items-center h-screen"><LoadingSpinner /></div>;
    }

    if (!user) {
        return <LoginScreen />;
    }

    if (isAccountSuspended) {
        return (
            <div className="flex flex-col items-center justify-center h-screen bg-slate-100 p-6">
                <div className="bg-white rounded-xl shadow-lg p-8 max-w-sm w-full text-center space-y-4">
                    <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto">
                        <Lock size={32} className="text-red-500" />
                    </div>
                    <h2 className="text-2xl font-bold text-slate-800">Cuenta Suspendida</h2>
                    <p className="text-slate-500 text-sm">Tu cuenta ha sido desactivada temporalmente. Contacta con el administrador del sistema para reactivarla.</p>
                    <button
                        onClick={() => signOut(auth)}
                        className="w-full bg-red-500 text-white font-bold py-3 px-6 rounded-lg hover:bg-red-600 transition-colors flex items-center justify-center gap-2"
                    >
                        <LogOut size={18} />
                        Cerrar Sesión
                    </button>
                </div>
            </div>
        );
    }
    
    // El modal de invitación ahora se renderiza aquí, asegurando que el usuario ya está autenticado.
    const renderAppContent = () => {
        if (role === 'master') {
            return <ManagerLayout user={user} role={role} onLogout={() => signOut(auth)} />;
        }
        if (role === 'director') {
            return <ManagerLayout user={user} role={role} readOnly onLogout={() => signOut(auth)} />;
        }
        if (role === 'sales_manager' || role === 'gerencia') {
            return <ManagerLayout user={user} role={role} onLogout={() => signOut(auth)} />;
        }
        if (role === 'vendedor') {
            return <VendedorLayout user={user} onLogout={() => signOut(auth)} />;
        }
        if (role === 'produccion') {
            return <KromaShell onExitKroma={() => signOut(auth)} />;
        }
        if (role === 'merchandiser') {
            return <AppShell user={user} role={role} onLogout={() => signOut(auth)} />;
        }
        return (
            <div className="flex flex-col items-center justify-center h-screen bg-slate-950 gap-5 p-6">
                <p className="text-slate-400 text-center">Rol de usuario no reconocido. Contacta al administrador.</p>
                <button
                    onClick={() => signOut(auth)}
                    className="flex items-center gap-2 bg-slate-800 text-slate-300 font-semibold py-2.5 px-5 rounded-lg hover:bg-slate-700 transition-colors"
                >
                    <LogOut size={16} /> Cerrar Sesión
                </button>
            </div>
        );
    };

    if (isSecurityLocked && (role === 'merchandiser' || role === 'produccion')) {
        return <SecurityLockScreen onUnlock={() => setIsSecurityLocked(false)} role={role as string} />;
    }
    
    return (
        <>
            {inviteId && (
                <RouteInviteModal 
                    inviteId={inviteId} 
                    onClose={() => setInviteId(null)} 
                />
            )}
            <ErrorBoundary key={user?.uid || 'anon'}>
                {renderAppContent()}
            </ErrorBoundary>
        </>
    );
};


const GlobalReportModal: React.FC = () => {
    const { viewedReportId, setViewedReportId } = useReportView();
    if (!viewedReportId) return null;
    return <ReportDetailModalController reportId={viewedReportId} onClose={() => setViewedReportId(null)} />;
};


const App: React.FC = () => {
    const [activeNotification, setActiveNotification] = useState<AppNotification | null>(null);
    const { setInviteId } = useInvite();

    // La lógica para leer la URL se mantiene aquí, se ejecuta al inicio
    useEffect(() => {
        const urlParams = new URLSearchParams(window.location.search);
        const routeInviteId = urlParams.get('routeId');

        if (routeInviteId) {
            setInviteId(routeInviteId);
            window.history.replaceState({}, document.title, window.location.pathname);
        }
    }, [setInviteId]);

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