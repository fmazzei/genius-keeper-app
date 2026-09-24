import React, { createContext, useContext, useState, useEffect } from 'react';
import { doc, getDoc } from 'firebase/firestore';
import { auth, db } from '@/Firebase/config.js';
import { defaultEditar, efectivo, puedeVerCostos } from './permisos.js';

const KromaContext = createContext(undefined);

export const KromaProvider = ({ children }) => {
    const [kromaUser, setKromaUser] = useState(null);
    // true mientras se revisa si la cuenta de GK autenticada es una cuenta
    // REAL de Kroma (empresa nueva) que debe entrar directo, sin picker.
    const [kromaLoading, setKromaLoading] = useState(true);

    useEffect(() => {
        let cancelled = false;

        try {
            const saved = sessionStorage.getItem('kromaActiveUser');
            if (saved) {
                setKromaUser(JSON.parse(saved));
                setKromaLoading(false);
                return;
            }
        } catch {}

        // Sin sesión guardada: si la cuenta de GK autenticada es una cuenta
        // real de Kroma (creada vía crearEmpresaConUsuario/crearUsuarioEmpresa,
        // `users_metadata.kromaDirectLogin === true`), se entra directo con esa
        // identidad — sin pasar por el selector de PIN (`KromaUserSelect`), que
        // sigue existiendo solo para la cuenta compartida legacy de Lacteoca
        // (produccion@lacteoca.com) y su equipo de planta.
        (async () => {
            try {
                const uid = auth.currentUser?.uid;
                if (!uid) return;
                const snap = await getDoc(doc(db, 'users_metadata', uid));
                const data = snap.exists() ? snap.data() : null;
                if (data?.kromaDirectLogin && data?.role) {
                    const user = {
                        id: uid,
                        name: data.name || data.email || 'Usuario',
                        role: data.role,
                        empresaId: data.empresaId || null,
                        viaPicker: false,
                    };
                    if (!cancelled) {
                        setKromaUser(user);
                        try { sessionStorage.setItem('kromaActiveUser', JSON.stringify(user)); } catch {}
                    }
                }
            } catch {
                // Sin conexión o sin permisos: se cae al picker legacy, que sigue
                // funcionando igual para la cuenta compartida.
            } finally {
                if (!cancelled) setKromaLoading(false);
            }
        })();

        return () => { cancelled = true; };
    }, []);

    const selectUser = (user) => {
        const withPicker = { ...user, viaPicker: true };
        setKromaUser(withPicker);
        try { sessionStorage.setItem('kromaActiveUser', JSON.stringify(withPicker)); } catch {}
    };

    const clearUser = () => {
        setKromaUser(null);
        try { sessionStorage.removeItem('kromaActiveUser'); } catch {}
    };

    const kromaRole = kromaUser?.role || null;

    // Master y dueño de empresa (kroma_owner) siempre pasan; el resto requiere
    // un permiso explícito. kroma_owner es "máster acotado a su empresa" — las
    // reglas de Firestore ya limitan sus datos a su propio empresaId.
    const isFullAccess = kromaRole === 'master' || kromaRole === 'kroma_owner';

    // canEdit AHORA MANDA de verdad (antes solo lo miraban dos botones de
    // Almacenes, así que el panel de permisos era decorativo). Al empezar a
    // hacerlo cumplir hizo falta un default por ROL: `permisos.editar` está
    // vacío en casi todos los perfiles y, sin default, el primer día con la
    // regla activa el operario no habría podido abrir una planilla. El toggle
    // que el máster pone a mano sigue mandando sobre el default (ver `efectivo`).
    const canEdit = (module) =>
        isFullAccess || efectivo(kromaUser?.permisos?.editar?.[module], defaultEditar(kromaRole)[module]);

    // Borrar NO tiene default por rol: la convención de Kroma es soft-delete y
    // el borrado es del máster salvo concesión expresa. Se conserva tal cual.
    const canDelete = (module) => isFullAccess || !!(kromaUser?.permisos?.eliminar?.[module]);
    const canDo     = (action) => isFullAccess || !!(kromaUser?.permisos?.acciones?.[action]);

    // Regla de negocio, no permiso: el operario NUNCA ve costos.
    const verCostos = puedeVerCostos(kromaRole);

    return (
        <KromaContext.Provider value={{ kromaUser, kromaRole, kromaLoading, selectUser, clearUser, canEdit, canDelete, canDo, verCostos }}>
            {children}
        </KromaContext.Provider>
    );
};

export const useKroma = () => {
    const ctx = useContext(KromaContext);
    if (!ctx) throw new Error('useKroma must be inside KromaProvider');
    return ctx;
};
