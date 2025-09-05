import React, { createContext, useState, useEffect, useContext } from 'react';
import type { ReactNode } from 'react';
import { onAuthStateChanged, signInWithEmailAndPassword, setPersistence, browserLocalPersistence, signInAnonymously } from 'firebase/auth';
import type { User } from 'firebase/auth';
import { auth } from '../Firebase/config';
import { requestNotificationPermission } from '@/utils/firebaseMessaging.js';

// --- Definimos los "tipos" para que TypeScript entienda la estructura ---

// El tipo de los datos que nuestro contexto va a proveer
interface AuthContextType {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<any>;
  loginAnonymously: () => Promise<any>;
}

// El tipo de las props que nuestro componente AuthProvider recibirá
interface AuthProviderProps {
  children: ReactNode;
}

// Creamos el contexto con el tipo definido
const AuthContext = createContext<AuthContextType | undefined>(undefined);

// Hook personalizado para usar el contexto, ahora con el tipo correcto
export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

// El componente Provider, ahora escrito en TypeScript
export const AuthProvider: React.FC<AuthProviderProps> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      setLoading(false);
    });
    return unsubscribe;
  }, []);

  const login = async (email: string, password: string) => {
    await setPersistence(auth, browserLocalPersistence);
    const userCredential = await signInWithEmailAndPassword(auth, email, password);
    if (userCredential.user) {
      await requestNotificationPermission(userCredential.user.uid);
    }
    return userCredential;
  };
  
  const loginAnonymously = async () => {
    const userCredential = await signInAnonymously(auth);
    if (userCredential.user) {
      await requestNotificationPermission(userCredential.user.uid);
    }
    return userCredential;
  };

  const value: AuthContextType = { 
    user, 
    loading,
    login,
    loginAnonymously
  };

  return (
    <AuthContext.Provider value={value}>
      {!loading && children}
    </AuthContext.Provider>
  );
};