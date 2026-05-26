import React, { createContext, useContext, useState, useEffect } from 'react';

const KromaContext = createContext(undefined);

export const KromaProvider = ({ children }) => {
    const [kromaUser, setKromaUser] = useState(null);

    useEffect(() => {
        try {
            const saved = sessionStorage.getItem('kromaActiveUser');
            if (saved) setKromaUser(JSON.parse(saved));
        } catch {}
    }, []);

    const selectUser = (user) => {
        setKromaUser(user);
        sessionStorage.setItem('kromaActiveUser', JSON.stringify(user));
    };

    const clearUser = () => {
        setKromaUser(null);
        sessionStorage.removeItem('kromaActiveUser');
    };

    const kromaRole = kromaUser?.role || null;

    // Master always returns true; other roles require explicit permisos grant
    const canEdit   = (module) => kromaRole === 'master' || !!(kromaUser?.permisos?.editar?.[module]);
    const canDelete = (module) => kromaRole === 'master' || !!(kromaUser?.permisos?.eliminar?.[module]);

    return (
        <KromaContext.Provider value={{ kromaUser, kromaRole, selectUser, clearUser, canEdit, canDelete }}>
            {children}
        </KromaContext.Provider>
    );
};

export const useKroma = () => {
    const ctx = useContext(KromaContext);
    if (!ctx) throw new Error('useKroma must be inside KromaProvider');
    return ctx;
};
