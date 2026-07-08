// RUTA: src/context/AuthContext.tsx

import React, { createContext, useState, useEffect, useContext } from 'react';
import type { ReactNode } from 'react';
import { onAuthStateChanged, signInWithEmailAndPassword, signInWithCustomToken } from 'firebase/auth';
import type { User } from 'firebase/auth';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { auth, db } from '../Firebase/config';
import { requestNotificationPermission } from '@/utils/firebaseMessaging.js';

interface AuthContextType {
  user: User | null;
  role: string | null;
  loading: boolean;
  isAccountSuspended: boolean;
  impersonatedBy: string | null;
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
  const [isAccountSuspended, setIsAccountSuspended] = useState(false);
  const [impersonatedBy, setImpersonatedBy] = useState<string | null>(null);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      setUser(currentUser);
      if (currentUser) {
        // Detecta si la sesión actual es una impersonación (llave maestra):
        // el custom token lleva el claim `impersonatedBy` con el uid del máster.
        try {
          const tokenResult = await currentUser.getIdTokenResult();
          setImpersonatedBy((tokenResult.claims.impersonatedBy as string) || null);
        } catch {
          setImpersonatedBy(null);
        }
        try {
          const userDocRef = doc(db, 'users_metadata', currentUser.uid);
          const docSnap = await getDoc(userDocRef);
          if (docSnap.exists()) {
            const data = docSnap.data();
            setRole(data.role);
            setIsAccountSuspended(data.active === false);
            // Backfill de nombre para cuentas compartidas creadas sin `name`
            // (evita que aparezca el UID crudo en los listados).
            if (!data.name) {
              const sharedNames: Record<string, string> = {
                'lacteoca@lacteoca.com': 'Máster',
                'anaquel@lacteoca.com': 'Equipo de Campo',
                'produccion@lacteoca.com': 'Producción',
              };
              const nm = sharedNames[currentUser.email || ''];
              if (nm) setDoc(userDocRef, { name: nm }, { merge: true }).catch(() => {});
            }
          } else {
            // Cuentas con perfil auto-recreable si el doc fue eliminado
            const sharedAccounts: Record<string, { role: string; name: string }> = {
              'lacteoca@lacteoca.com':   { role: 'master',       name: 'Máster' },
              'anaquel@lacteoca.com':    { role: 'merchandiser', name: 'Equipo de Campo' },
              'produccion@lacteoca.com': { role: 'produccion',   name: 'Producción' },
            };
            const email = currentUser.email || '';
            if (sharedAccounts[email]) {
              // Incluye `name` para que no aparezca el UID crudo en los listados.
              await setDoc(userDocRef, { role: sharedAccounts[email].role, email, name: sharedAccounts[email].name });
              setRole(sharedAccounts[email].role);
            } else {
              setRole('no-role');
            }
            setIsAccountSuspended(false);
          }
        } catch (error) {
          console.error("Error crítico al buscar el rol del usuario:", error);
          setRole('no-role');
          setIsAccountSuspended(false);
        }
      } else {
        setRole(null);
        setIsAccountSuspended(false);
        setImpersonatedBy(null);
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
    isAccountSuspended,
    impersonatedBy,
    login,
    signInWithCustomToken: signInWithCustomTokenHandler,
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};