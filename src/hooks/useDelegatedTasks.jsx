// RUTA: src/hooks/useDelegatedTasks.jsx

import { useState, useEffect } from 'react';
import { collection, query, where, onSnapshot, doc, updateDoc, serverTimestamp, addDoc, orderBy } from 'firebase/firestore';
import { db } from '../Firebase/config';
import { useSimulation } from '../context/SimulationContext.jsx';
// ✅ ELIMINADO: Ya no necesitamos el usuario autenticado para esta consulta.
// import { useAuth } from '../context/AuthContext';

// ✅ ACTUALIZADO: El hook ahora recibe el reporterId
export const useDelegatedTasks = (reporterId) => {
    // const { user } = useAuth(); // <- ELIMINADO
    const { simulationMode, simulatedData, simulationEngine } = useSimulation();

    const [tasks, setTasks] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        // ✅ ACTUALIZADO: La condición ahora depende de si tenemos un reporterId.
        if (!reporterId) {
            setLoading(false);
            setTasks([]); // Nos aseguramos de que no haya tareas si no hay reporter
            return;
        }

        if (simulationMode) {
            console.log("useDelegatedTasks: Sirviendo tareas de SIMULACIÓN.");
            setTasks(simulatedData.delegatedTasks || []);
            setLoading(false);
            return;
        }

        console.log("useDelegatedTasks: Sirviendo tareas de FIREBASE para el reporter:", reporterId);
        
        // ✅ ACTUALIZADO: La consulta ahora es única y específica para el reporter.
        // Busca en 'delegated_tasks' donde el campo 'targetReporterId' coincida
        // con el ID del reporter que seleccionamos en la pantalla de inicio.
        const tasksQuery = query(
            collection(db, 'delegated_tasks'), 
            where('targetReporterId', '==', reporterId), 
            orderBy('createdAt', 'desc')
        );

        const unsubscribe = onSnapshot(tasksQuery, (snapshot) => {
            const tasksData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            setTasks(tasksData);
            setLoading(false);
        }, (error) => {
            console.error("Error fetching delegated tasks: ", error);
            setLoading(false);
        });

        return () => unsubscribe();
    // ✅ ACTUALIZADO: Las dependencias del efecto ahora son reporterId y el modo simulación.
    }, [reporterId, simulationMode, simulatedData]);

    const completeTask = async (taskId) => {
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