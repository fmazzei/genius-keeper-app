// RUTA: src/context/AppConfigContext.tsx

import React, { createContext, useState, useEffect, useContext } from 'react';
import type { ReactNode } from 'react';
import { doc, onSnapshot, setDoc } from 'firebase/firestore';
import { onAuthStateChanged } from 'firebase/auth';
import { auth, db } from '../Firebase/config';

export interface ModulesConfig {
  commissions: boolean;
  salesGoals: boolean;
  marketTrends: boolean;
  salesFocus: boolean;
  plannerManager: boolean;
  inventoryManager: boolean;
  plannerMerchandiser: boolean;
  logisticsMerchandiser: boolean;
  pedidosVendedor: boolean;
  facturasVendedor: boolean;
  zohoIntegracion: boolean;
}

interface AppConfigContextType {
  modules: ModulesConfig;
  competitorFrequencyDays: number;
  configLoading: boolean;
  updateModule: (moduleName: keyof ModulesConfig, enabled: boolean) => Promise<void>;
}

const defaultModules: ModulesConfig = {
  commissions: true,
  salesGoals: true,
  marketTrends: true,
  salesFocus: true,
  plannerManager: true,
  inventoryManager: true,
  plannerMerchandiser: true,
  logisticsMerchandiser: true,
  pedidosVendedor: true,
  facturasVendedor: true,
  zohoIntegracion: false,
};

const AppConfigContext = createContext<AppConfigContextType | undefined>(undefined);

export const useAppConfig = (): AppConfigContextType => {
  const context = useContext(AppConfigContext);
  if (context === undefined) {
    throw new Error('useAppConfig must be used within an AppConfigProvider');
  }
  return context;
};

export const AppConfigProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [modules, setModules] = useState<ModulesConfig>(defaultModules);
  const [competitorFrequencyDays, setCompetitorFrequencyDays] = useState<number>(15);
  const [configLoading, setConfigLoading] = useState(true);

  useEffect(() => {
    let snapshotUnsubscribe: (() => void) | null = null;

    const authUnsubscribe = onAuthStateChanged(auth, (user) => {
      if (snapshotUnsubscribe) {
        snapshotUnsubscribe();
        snapshotUnsubscribe = null;
      }

      if (user) {
        const configRef = doc(db, 'settings', 'appConfig');
        snapshotUnsubscribe = onSnapshot(
          configRef,
          (snap) => {
            if (snap.exists()) {
              if (snap.data().modules) {
                setModules({ ...defaultModules, ...snap.data().modules });
              }
              if (typeof snap.data().competitorFrequencyDays === 'number') {
                setCompetitorFrequencyDays(snap.data().competitorFrequencyDays);
              }
            } else {
              setModules(defaultModules);
            }
            setConfigLoading(false);
          },
          () => {
            setModules(defaultModules);
            setConfigLoading(false);
          }
        );
      } else {
        setModules(defaultModules);
        setConfigLoading(false);
      }
    });

    return () => {
      authUnsubscribe();
      if (snapshotUnsubscribe) snapshotUnsubscribe();
    };
  }, []);

  const updateModule = async (moduleName: keyof ModulesConfig, enabled: boolean) => {
    const configRef = doc(db, 'settings', 'appConfig');
    await setDoc(configRef, { modules: { [moduleName]: enabled } }, { merge: true });
  };

  return (
    <AppConfigContext.Provider value={{ modules, competitorFrequencyDays, configLoading, updateModule }}>
      {children}
    </AppConfigContext.Provider>
  );
};
