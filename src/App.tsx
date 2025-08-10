import React from 'react';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { auth } from './firebase/config';
import LoginScreen from './pages/LoginScreen';
import AppShell from './pages/AppShell';
import LoadingSpinner from './components/LoadingSpinner';

export default function App() {
    const [user, setUser] = React.useState(null);
    const [role, setRole] = React.useState('');
    const [loading, setLoading] = React.useState(true);

    React.useEffect(() => {
        const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
            if (currentUser) {
                let userRole = 'merchandiser';
                if (currentUser.isAnonymous) {
                    userRole = 'merchandiser';
                } else if (currentUser.email === 'lacteoca@lacteoca.com') {
                    userRole = 'master';
                } else if (currentUser.email === 'carolina@lacteoca.com') {
                    userRole = 'sales_manager';
                }
                setUser(currentUser);
                setRole(userRole);
            } else {
                setUser(null);
                setRole('');
            }
            setLoading(false);
        });
        return () => unsubscribe();
    }, []);

    if (loading) {
        return <LoadingSpinner />;
    }

    return (
        <div>
            {user ? <AppShell user={user} role={role} onLogout={() => signOut(auth)} /> : <LoginScreen />}
        </div>
    );
}