import React, { createContext, useContext, useState, useEffect } from 'react';
import { doc, getDoc } from 'firebase/firestore';
import { auth, db } from '@/Firebase/config.js';
import { defaultEditar, efectivo, puedeVerCostos } from './permisos.js';

const KromaContext = createContext(undefined);

// Quién está usando Kroma en este teléfono. localStorage (y no sessionStorage)
// para que sobreviva al cerrar la app; todo en try/catch porque en algunos
// WebViews el almacenamiento está apagado y no puede impedir entrar.
const CLAVE = 'kromaActiveUser';
function leerGuardado() {
    try {
        const t = localStorage.getItem(CLAVE) || sessionStorage.getItem(CLAVE);
        return t ? JSON.parse(t) : null;
    } catch { return null; }
}
function guardar(user) {
    const conCuenta = { ...user, authUid: auth.currentUser?.uid || user.authUid || null };
    try { localStorage.setItem(CLAVE, JSON.stringify(conCuenta)); } catch { /* sin almacenamiento */ }
    try { sessionStorage.removeItem(CLAVE); } catch { /* idem */ }
}
function borrarGuardado() {
    try { localStorage.removeItem(CLAVE); } catch { /* idem */ }
    try { sessionStorage.removeItem(CLAVE); } catch { /* idem */ }
}

export const KromaProvider = ({ children }) => {
    const [kromaUser, setKromaUser] = useState(null);
    // true mientras se revisa si la cuenta de GK autenticada es una cuenta
    // REAL de Kroma (empresa nueva) que debe entrar directo, sin picker.
    const [kromaLoading, setKromaLoading] = useState(true);

    useEffect(() => {
        let cancelled = false;

        // La persona queda RECORDADA en el teléfono (pedido del dueño, 19-nov:
        // entrar tiene que ser tan fácil como mandar un WhatsApp). Antes se
        // guardaba en sessionStorage y en el iPhone había que elegirse de nuevo
        // cada vez que se abría la app. Solo vale para la misma cuenta de la
        // empresa, y su rol y permisos se releen en segundo plano para que un
        // cambio del máster (o una baja) se aplique sin pedir nada.
        const saved = leerGuardado();
        const uidAuth = auth.currentUser?.uid || null;
        if (saved && (!saved.authUid || !uidAuth || saved.authUid === uidAuth)) {
            setKromaUser(saved);
            setKromaLoading(false);
            if (saved.viaPicker && saved.id) {
                getDoc(doc(db, 'kroma_users', saved.id)).then(snap => {
                    if (cancelled) return;
                    const d = snap.exists() ? snap.data() : null;
                    if (!d || d.active === false) { borrarGuardado(); setKromaUser(null); return; }
                    const { pinHash, ...resto } = d; // eslint-disable-line no-unused-vars
                    const fresco = { ...saved, ...resto, id: saved.id, viaPicker: true };
                    setKromaUser(fresco);
                    guardar(fresco);
                }).catch(() => { /* sin señal: se queda con lo guardado */ });
            }
            return () => { cancelled = true; };
        }

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
                        guardar(user);
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
        const { pinHash, ...sinPin } = user || {}; // eslint-disable-line no-unused-vars
        const withPicker = { ...sinPin, viaPicker: true };
        setKromaUser(withPicker);
        guardar(withPicker);
    };

    const clearUser = () => {
        setKromaUser(null);
        borrarGuardado();
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
