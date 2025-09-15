// RUTA: src/context/AuthContext.tsx

import React, { createContext, useState, useEffect, useContext } from 'react';
import type { ReactNode } from 'react';
// ✅ CAMBIO: Ya no importamos 'setPersistence' ni 'indexedDBLocalPersistence' aquí.
import { onAuthStateChanged, signInWithEmailAndPassword, signInWithCustomToken } from 'firebase/auth';
import type { User } from 'firebase/auth';
import { auth } from '../Firebase/config';
import { requestNotificationPermission } from '@/utils/firebaseMessaging.js';

interface AuthContextType {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<any>;
  signInWithCustomToken: (token: string) => Promise<any>;
}

interface AuthProviderProps {
  children: ReactNode;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

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
    // ✅ CAMBIO: La línea 'setPersistence' ha sido eliminada. Ya no es necesaria aquí.
    const userCredential = await signInWithEmailAndPassword(auth, email, password);
    if (userCredential.user) {
      await requestNotificationPermission(userCredential.user.uid);
    }
    return userCredential;
  };

  const signInWithCustomTokenHandler = async (token: string) => {
      const userCredential = await signInWithCustomToken(auth, token);
      if (userCredential.user) {
          await requestNotificationPermission(userCredential.user.uid);
      }
      return userCredential;
  };

  const value: AuthContextType = { 
    user, 
    loading,
    login,
    signInWithCustomToken: signInWithCustomTokenHandler,
  };

  return (
    <AuthContext.Provider value={value}>
      {!loading && children}
    </AuthContext.Provider>
  );
};