// RUTA: src/Components/ImpersonationBanner.jsx
//
// Banner persistente que se muestra cuando la sesión actual es una
// impersonación (llave maestra). Recuerda al máster que está "viendo como"
// otro usuario y ofrece salir (cierra sesión → vuelve al login para reingresar
// como máster). Se monta a nivel de App y solo se renderiza si aplica.

import React from 'react';
import { signOut } from 'firebase/auth';
import { auth } from '@/Firebase/config.js';
import { useAuth } from '@/context/AuthContext';
import { KeyRound, LogOut } from 'lucide-react';

export default function ImpersonationBanner() {
    const { impersonatedBy, user, role } = useAuth();
    if (!impersonatedBy) return null;

    const quien = user?.displayName || user?.email || role || 'usuario';

    return (
        <div className="fixed top-0 inset-x-0 z-[200] bg-amber-400 text-black px-3 py-1.5 flex items-center justify-center gap-2 text-[13px] font-semibold shadow-md">
            <KeyRound size={15} className="shrink-0" />
            <span className="truncate">Llave maestra — viendo como <b>{quien}</b></span>
            <button
                onClick={() => signOut(auth)}
                className="ml-1 shrink-0 flex items-center gap-1 bg-black/15 hover:bg-black/25 px-2.5 py-0.5 rounded-full"
            >
                <LogOut size={13} /> Salir
            </button>
        </div>
    );
}
