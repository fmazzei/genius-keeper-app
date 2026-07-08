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
  plannerMerchandiser: boolean;
  logisticsMerchandiser: boolean;
  pedidosVendedor: boolean;
  facturasVendedor: boolean;
  zohoIntegracion: boolean;
  rendimientoComercial: boolean;
}

interface AppConfigContextType {
  modules: ModulesConfig;
  roleModules: { [role: string]: Partial<ModulesConfig> };
  ourProductWeight_g: number;
  competitorFrequencyDays: number;
  metaVentasGeneral: number;
  configLoading: boolean;
  updateModule: (moduleName: keyof ModulesConfig, enabled: boolean) => Promise<void>;
  updateRoleModule: (role: string, moduleName: keyof ModulesConfig, enabled: boolean) => Promise<void>;
  updateMetaVentasGeneral: (unidades: number) => Promise<void>;
  getModulesForRole: (role: string) => ModulesConfig;
}

const defaultModules: ModulesConfig = {
  commissions: true,
  salesGoals: true,
  marketTrends: true,
  salesFocus: true,
  plannerManager: true,
  plannerMerchandiser: true,
  logisticsMerchandiser: true,
  pedidosVendedor: true,
  facturasVendedor: true,
  zohoIntegracion: false,
  rendimientoComercial: true,
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
  const [roleModules, setRoleModules] = useState<{ [role: string]: Partial<ModulesConfig> }>({});
  const [ourProductWeight_g, setOurProductWeight_g] = useState<number>(250);
  const [competitorFrequencyDays, setCompetitorFrequencyDays] = useState<number>(15);
  const [metaVentasGeneral, setMetaVentasGeneral] = useState<number>(0);
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
              const data = snap.data();
              if (data.modules) {
                setModules({ ...defaultModules, ...data.modules });
              }
              if (typeof data.competitorFrequencyDays === 'number') {
                setCompetitorFrequencyDays(data.competitorFrequencyDays);
              }
              if (data.roleModules && typeof data.roleModules === 'object') {
                setRoleModules(data.roleModules);
              }
              if (typeof data.ourProductWeight_g === 'number') {
                setOurProductWeight_g(data.ourProductWeight_g);
              }
              setMetaVentasGeneral(typeof data.metaVentasGeneral === 'number' ? data.metaVentasGeneral : 0);
            } else {
              setModules(defaultModules);
              setMetaVentasGeneral(0);
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

  const updateRoleModule = async (role: string, moduleName: keyof ModulesConfig, enabled: boolean) => {
    const configRef = doc(db, 'settings', 'appConfig');
    await setDoc(configRef, { roleModules: { [role]: { [moduleName]: enabled } } }, { merge: true });
  };

  const updateMetaVentasGeneral = async (unidades: number) => {
    const configRef = doc(db, 'settings', 'appConfig');
    await setDoc(configRef, { metaVentasGeneral: Number(unidades) || 0 }, { merge: true });
  };

  const getModulesForRole = (role: string): ModulesConfig => {
    return { ...defaultModules, ...roleModules[role] };
  };

  return (
    <AppConfigContext.Provider value={{ modules, roleModules, ourProductWeight_g, competitorFrequencyDays, metaVentasGeneral, configLoading, updateModule, updateRoleModule, updateMetaVentasGeneral, getModulesForRole }}>
      {children}
    </AppConfigContext.Provider>
  );
};
