// RUTA: src/hooks/useDelegatedTasks.jsx

import { useState, useEffect } from 'react';
import { collection, query, where, onSnapshot, doc, updateDoc, serverTimestamp, addDoc, orderBy } from 'firebase/firestore';
import { db } from '../Firebase/config';
import { useAuth } from '../context/AuthContext';
// ✅ 1. IMPORTAMOS EL CONTEXTO DE SIMULACIÓN
import { useSimulation } from '../context/SimulationContext.jsx';

export const useDelegatedTasks = (role) => {
    const { user } = useAuth();
    // ✅ 2. OBTENEMOS LOS DATOS Y HERRAMIENTAS DE SIMULACIÓN
    const { simulationMode, simulatedData, simulationEngine } = useSimulation();

    const [tasks, setTasks] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (!user) {
            setLoading(false);
            return;
        }

        // ✅ 3. LÓGICA CONDICIONAL PARA EL MODO SIMULACIÓN
        if (simulationMode) {
            console.log("useDelegatedTasks: Sirviendo tareas de SIMULACIÓN.");
            setTasks(simulatedData.delegatedTasks || []);
            setLoading(false);
            return; // Salimos para no crear el listener de Firestore
        }

        console.log("useDelegatedTasks: Sirviendo tareas de FIREBASE.");
        let tasksQuery;
        const tasksCollectionRef = collection(db, 'delegated_tasks');

        if (role === 'master' || role === 'sales_manager') {
            tasksQuery = query(tasksCollectionRef, orderBy('createdAt', 'desc'));
        } else {
            const userId = user.uid;
            tasksQuery = query(tasksCollectionRef, where('delegatedToId', '==', userId), orderBy('createdAt', 'desc'));
        }

        const unsubscribe = onSnapshot(tasksQuery, (snapshot) => {
            const tasksData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            setTasks(tasksData);
            setLoading(false);
        }, (error) => {
            console.error("Error fetching delegated tasks: ", error);
            setLoading(false);
        });

        return () => unsubscribe();
    }, [user, role, simulationMode, simulatedData]); // Se añaden dependencias de simulación

    const completeTask = async (taskId) => {
        // ✅ 4. LA ACCIÓN DE COMPLETAR TAMBIÉN ES CONSCIENTE DE LA SIMULACIÓN
        if (simulationMode) {
            simulationEngine.simulateCompleteTask(taskId);
            return;
        }
        
        const taskRef = doc(db, 'delegated_tasks', taskId);
        try {
            await updateDoc(taskRef, {
                status: 'completed',
                completedAt: serverTimestamp()
            });
        } catch (error) {
            console.error("Error completing task: ", error);
        }
    };
    
    const delegateTask = async (taskData) => {
        if (simulationMode) {
            console.log("SIMULACIÓN: Delegar tarea (acción no implementada en el motor).", taskData);
            alert("La delegación de tareas no está disponible en modo simulación.");
            return;
        }
         try {
            await addDoc(collection(db, 'delegated_tasks'), {
                ...taskData,
                status: 'pending',
                createdAt: serverTimestamp()
            });
         } catch (error) {
            console.error("Error delegating task: ", error);
            throw error;
         }
    };

    return { tasks, loading, completeTask, delegateTask };
};