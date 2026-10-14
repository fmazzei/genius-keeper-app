// RUTA: src/Components/AjustesGerencia.jsx
//
// "Ajustes" de la gerencia (pedido del dueño, 14-oct). La gerencia NO entra a
// Configuraciones (usuarios, integraciones, comisiones, módulos: eso es del
// máster). Aquí solo lo que es de la persona:
//   1. Alertas del agente — su bandeja, separada de la campanita (operación).
//   2. Avisos en este teléfono — activar o apagar las notificaciones.
//   3. Mi cuenta — contraseña y huella.

import React from 'react';
import AlertasAgentePanel from '@/Components/AlertasAgentePanel.jsx';
import ActivarAvisos from '@/Components/ActivarAvisos.jsx';
import ChangePasswordButton from '@/Components/ChangePasswordButton.jsx';
import BiometricEnrollButton from '@/Components/BiometricEnrollButton.jsx';

const boton = 'flex items-center gap-2 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 text-sm font-semibold px-4 py-3 rounded-xl';

export default function AjustesGerencia({ alertas, uid }) {
    return (
        <div className="max-w-3xl space-y-8">
            <AlertasAgentePanel
                alertas={alertas.lista} uid={uid}
                nota="Lo que el sistema detecta solo: la ruta del mercaderista, los PDV sin visita, el ritmo de la meta y el anaquel. Los reportes de visita siguen en la campanita."
                onMarcarLeida={alertas.onMarcarLeida}
                onMarcarTodas={alertas.onMarcarTodas}
                onEliminar={alertas.onEliminar}
                pie={<ActivarAvisos uid={uid} />}
            />

            <section className="space-y-3">
                <h3 className="font-bold text-slate-800">Mi cuenta</h3>
                <div className="grid sm:grid-cols-2 gap-2">
                    <ChangePasswordButton className={boton} />
                    <BiometricEnrollButton className={boton} />
                </div>
            </section>
        </div>
    );
}
