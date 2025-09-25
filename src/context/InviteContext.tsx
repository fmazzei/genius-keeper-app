// RUTA: src/context/InviteContext.tsx

import React, { createContext, useState, useContext, type ReactNode } from 'react';

interface InviteContextType {
    inviteId: string | null;
    setInviteId: (id: string | null) => void;
}

const InviteContext = createContext<InviteContextType | undefined>(undefined);

export const useInvite = (): InviteContextType => {
    const context = useContext(InviteContext);
    if (context === undefined) {
        throw new Error('useInvite must be used within an InviteProvider');
    }
    return context;
};

interface InviteProviderProps {
    children: ReactNode;
}

export const InviteProvider: React.FC<InviteProviderProps> = ({ children }) => {
    const [inviteId, setInviteId] = useState<string | null>(null);

    const value = {
        inviteId,
        setInviteId,
    };

    return (
        <InviteContext.Provider value={value}>
            {children}
        </InviteContext.Provider>
    );
};