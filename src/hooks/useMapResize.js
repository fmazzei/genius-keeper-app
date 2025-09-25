import { useEffect } from 'react';

/**
 * Hook personalizado que observa un contenedor y fuerza la actualización
 * del tamaño de un mapa de Leaflet cuando el contenedor cambia de tamaño.
 * @param {React.RefObject<HTMLElement>} containerRef - Ref al elemento contenedor del mapa.
 * @param {L.Map} mapInstance - La instancia del mapa de Leaflet.
 */
export const useMapResize = (containerRef, mapInstance) => {
  useEffect(() => {
    if (!containerRef.current || !mapInstance) return;

    // ResizeObserver es una API moderna que nos notifica eficientemente
    // cuando las dimensiones de un elemento cambian.
    const resizeObserver = new ResizeObserver(() => {
      mapInstance.invalidateSize();
    });

    // Empezamos a observar el contenedor del mapa.
    resizeObserver.observe(containerRef.current);

    // Función de limpieza: cuando el componente se desmonte, dejamos de observar.
    return () => {
      if (containerRef.current) {
        resizeObserver.unobserve(containerRef.current);
      }
    };
  }, [containerRef, mapInstance]);
};