import { useState, useEffect } from 'react';
import { collection, query, where, onSnapshot, doc, updateDoc, serverTimestamp, addDoc, orderBy } from 'firebase/firestore';
import { db } from '../Firebase/config';
import { useAuth } from '../context/AuthContext';

// Este es el "cerebro" que maneja la lógica de las tareas delegadas.
export const useDelegatedTasks = (role) => {
    const { user } = useAuth();
    const [tasks, setTasks] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (!user) {
            setLoading(false);
            return;
        }

        let tasksQuery;
        const tasksCollectionRef = collection(db, 'delegated_tasks');

        // Los gerentes pueden ver todas las tareas, los merchandisers solo las suyas.
        if (role === 'master' || role === 'sales_manager') {
            tasksQuery = query(tasksCollectionRef, orderBy('createdAt', 'desc'));
        } else {
            // Se usa el UID del usuario anónimo como identificador único.
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
    }, [user, role]);

    // Función para marcar una tarea como completada
    const completeTask = async (taskId) => {
        const taskRef = doc(db, 'delegated_tasks', taskId);
        try {
            await updateDoc(taskRef, {
                status: 'completed',
                completedAt: serverTimestamp()
            });
        } catch (error) {
            console.error("Error completing task: ", error);
            // Opcional: manejar el error en la UI
        }
    };
    
    // Función para que los gerentes creen una nueva tarea
    const delegateTask = async (taskData) => {
         try {
            await addDoc(collection(db, 'delegated_tasks'), {
                ...taskData,
                status: 'pending',
                createdAt: serverTimestamp()
            });
         } catch (error) {
            console.error("Error delegating task: ", error);
            throw error; // Relanzar el error para manejarlo en la UI
         }
    };

    return { tasks, loading, completeTask, delegateTask };
};