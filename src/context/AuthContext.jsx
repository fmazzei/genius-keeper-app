import React, { createContext, useState, useEffect, useContext } from 'react';
import { onAuthStateChanged, signInWithEmailAndPassword, setPersistence, browserLocalPersistence, signInAnonymously } from 'firebase/auth';
import { auth } from '../Firebase/config';
import { requestNotificationPermission } from '@/utils/firebaseMessaging.js'; // Importamos la función

const AuthContext = createContext();

export const useAuth = () => {
  return useContext(AuthContext);
};

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      setLoading(false);
    });
    return unsubscribe;
  }, []);

  // --- NUEVA FUNCIÓN DE LOGIN CENTRALIZADA ---
  const login = async (email, password) => {
    await setPersistence(auth, browserLocalPersistence);
    const userCredential = await signInWithEmailAndPassword(auth, email, password);
    if (userCredential.user) {
      // La llamada ahora se hace desde aquí, asegurando que el contexto de auth está listo.
      await requestNotificationPermission(userCredential.user.uid);
    }
    return userCredential;
  };
  
  // --- NUEVA FUNCIÓN DE LOGIN ANÓNIMO CENTRALIZADA ---
  const loginAnonymously = async () => {
    const userCredential = await signInAnonymously(auth);
    if (userCredential.user) {
      await requestNotificationPermission(userCredential.user.uid);
    }
    return userCredential;
  };

  const value = { 
    user, 
    loading,
    login, // Exponemos la nueva función de login
    loginAnonymously // Exponemos la nueva función de login anónimo
  };

  return (
    <AuthContext.Provider value={value}>
      {!loading && children}
    </AuthContext.Provider>
  );
};