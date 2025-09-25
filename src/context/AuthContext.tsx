// RUTA: src/context/AuthContext.tsx

import React, { createContext, useState, useEffect, useContext } from 'react';
import type { ReactNode } from 'react';
import { onAuthStateChanged, signInWithEmailAndPassword, signInWithCustomToken } from 'firebase/auth';
import type { User } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { auth, db } from '../Firebase/config';
import { requestNotificationPermission } from '@/utils/firebaseMessaging.js';

interface AuthContextType {
  user: User | null;
  role: string | null;
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
  const [role, setRole] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      setUser(currentUser);
      if (currentUser) {
        try {
          const userDocRef = doc(db, 'users_metadata', currentUser.uid);
          const docSnap = await getDoc(userDocRef);
          if (docSnap.exists()) {
            setRole(docSnap.data().role);
          } else {
            setRole('no-role');
          }
        } catch (error) {
          console.error("Error crítico al buscar el rol del usuario:", error);
          setRole('no-role');
        }
      } else {
        setRole(null);
      }
      setLoading(false);
    });
    return unsubscribe;
  }, []);

  const login = async (email: string, password: string) => {
    const userCredential = await signInWithEmailAndPassword(auth, email, password);
    if (userCredential.user) {
        // ✅ SOLUCIÓN: Envolvemos la petición de notificaciones en su propio try...catch.
        // Si falla, solo mostrará una advertencia en la consola pero NO detendrá el login.
        try {
            await requestNotificationPermission(userCredential.user.uid);
        } catch (notificationError) {
            console.warn("No se pudo obtener el permiso para notificaciones (esto es normal en desarrollo):", notificationError);
        }
    }
    return userCredential;
  };

  const signInWithCustomTokenHandler = async (token: string) => {
      const userCredential = await signInWithCustomToken(auth, token);
      if (userCredential.user) {
          try {
            await requestNotificationPermission(userCredential.user.uid);
          } catch (notificationError) {
            console.warn("No se pudo obtener el permiso para notificaciones:", notificationError);
          }
      }
      return userCredential;
  };

  const value: AuthContextType = { 
    user, 
    role,
    loading,
    login,
    signInWithCustomToken: signInWithCustomTokenHandler,
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};