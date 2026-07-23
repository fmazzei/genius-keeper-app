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

// ── Red de seguridad del arranque ────────────────────────────────────────────
// En conexiones móviles a medio morir (3G/webview), un getDoc de Firestore
// puede quedarse COLGADO sin rechazar nunca → el spinner de App.tsx giraba
// para siempre (reportes de Android). Dos defensas:
// 1) withTimeout: ninguna lectura del arranque espera más de N segundos.
// 2) Caché del ROL por uid en localStorage (acceso protegido: en webviews con
//    storage bloqueado, leerlo lanza — nunca romper el arranque por eso). Si la
//    red no responde, un usuario recurrente entra con su último rol conocido;
//    las reglas de Firestore siguen protegiendo los datos del lado del servidor.
const withTimeout = <T,>(p: Promise<T>, ms: number): Promise<T> =>
  Promise.race([
    p,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error('timeout')), ms)),
  ]);

const safeGetRole = (uid: string): string | null => {
  try { return localStorage.getItem(`gk_role_${uid}`); } catch { return null; }
};
const safeSetRole = (uid: string, role: string) => {
  try { localStorage.setItem(`gk_role_${uid}`, role); } catch { /* storage bloqueado */ }
};

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
          const tokenResult = await withTimeout(currentUser.getIdTokenResult(), 10000);
          setImpersonatedBy((tokenResult.claims.impersonatedBy as string) || null);
        } catch {
          setImpersonatedBy(null);
        }
        try {
          const userDocRef = doc(db, 'users_metadata', currentUser.uid);
          const docSnap = await withTimeout(getDoc(userDocRef), 15000);
          if (docSnap.exists()) {
            const data = docSnap.data();
            setRole(data.role);
            if (data.role) safeSetRole(currentUser.uid, data.role);
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
          // Respaldo: último rol conocido de este uid (usuario recurrente en red
          // mala entra igual; los datos siguen protegidos por reglas del servidor).
          const cached = safeGetRole(currentUser.uid);
          setRole(cached || 'no-role');
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