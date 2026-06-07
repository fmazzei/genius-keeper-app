# Genius Keeper (GK) — Documento de Referencia

### Qué es, qué hace, cómo se compara con el mercado y qué potencial tiene para Lacteoca y empresas similares

---

## 1. ¿Qué es Genius Keeper?

Genius Keeper es un sistema de **inteligencia y ejecución comercial** construido a la medida para empresas de consumo masivo que venden a través de una red de puntos de venta (supermercados, automercados, tiendas) y que dependen de un equipo de campo (mercaderistas, vendedores, repartidores) para que el producto llegue, se vea bien y se venda.

En palabras simples: GK es la herramienta que conecta **lo que pasa en el anaquel del supermercado** con **lo que la gerencia necesita saber para tomar decisiones** — todo en una sola aplicación, sin papeles, sin hojas de cálculo sueltas, y sin depender de que alguien recuerde contarle a alguien más lo que vio.

No es un software genérico comprado "de catálogo": fue diseñado pensando en la realidad operativa real de una empresa como Lacteoca — equipos pequeños, dispositivos compartidos entre varias personas, conexión a internet intermitente, anaqueles que no siempre están ordenados, y la necesidad de que cada decisión (qué producir, a dónde despachar, a quién pagar comisión, dónde reforzar la cobertura) esté respaldada por datos reales y no por intuición.

---

## 2. ¿Qué hace GK? — El panorama general

GK cubre, de punta a punta, el ciclo comercial de una empresa de consumo masivo:

```
   Visita al punto de venta
            ↓
   Reporte de ejecución + inteligencia de mercado
            ↓
   Toma de pedido  →  Despacho  →  Logística e inventario
            ↓
   Alertas y notificaciones automáticas
            ↓
   Dashboards e indicadores para la gerencia
            ↓
   Metas, comisiones y planificación de rutas
```

Cada pieza de este ciclo alimenta a la siguiente, y todas terminan convergiendo en los **dashboards gerenciales**, donde la empresa puede ver — en tiempo real y con números, no con sensaciones — cómo está funcionando su operación comercial.

---

## 3. Características y funciones — explicadas una por una

### 3.1 Reporte de Visita (el corazón operativo de GK)

Es el formulario que el mercaderista llena cada vez que visita un punto de venta. No es un formulario genérico: se adapta paso a paso a lo que realmente importa medir, e incluye:

- **Inventario y lotes**: registro de existencias con lectura automática de la fecha de vencimiento por foto (la cámara del teléfono "lee" la fecha impresa en el empaque mediante reconocimiento óptico — esto ya funciona hoy).
- **Quiebre de stock**: un interruptor simple para declarar si el anaquel está vacío — información crítica que dispara alertas automáticas.
- **Ejecución en anaquel**: dónde está ubicado el producto, qué categoría tiene al lado, el estado del material publicitario (POP), y cuántas "caras" del producto son visibles.
- **Inteligencia competitiva**: el mercaderista registra qué productos de la competencia vio, a qué precio, si tenían material publicitario, y si hubo degustaciones recientes. El sistema es lo suficientemente inteligente como para **precargar** los datos de la última visita si fue reciente, o **exigir** que se actualicen si ya pasó mucho tiempo — así nunca se trabaja con información vieja sin darse cuenta.
- **Detección de nuevos entrantes**: si aparece una marca o producto nuevo en el punto de venta, el mercaderista lo declara con un par de toques — y esto **dispara automáticamente una notificación** al equipo comercial, para que se enteren el mismo día, no semanas después por casualidad.
- **Confirmación de ubicación por GPS**: el sistema verifica que el mercaderista realmente está físicamente en el punto de venta (comparando su posición real contra la registrada, con un margen de tolerancia), lo cual le da **veracidad** a cada reporte — un dato que hoy en día muchas empresas todavía no tienen forma de confirmar.
- **Funciona sin internet**: si el mercaderista está en una zona sin señal, el reporte se guarda en el teléfono y se sincroniza automáticamente apenas vuelve la conexión — nada se pierde.

### 3.2 Gestión de Puntos de Venta (PDV)

Un catálogo donde se administra cada punto de venta: a qué cadena pertenece, en qué zona está ubicado, sus coordenadas GPS, y — algo importante — **cada PDV tiene su propia frecuencia de visita** (cada cuántos días debe visitarse). Esto es lo que le permite al sistema, más adelante, calcular automáticamente si un punto está "al día" o "atrasado".

### 3.3 Sistema de Alertas

GK vigila constantemente la red de puntos de venta y genera alertas automáticas cuando:
- Un punto de venta **no ha sido visitado** dentro del plazo que le corresponde ("Visita Vencida").
- Un punto de venta **nunca ha sido visitado** ("Nunca Visitado").
- Se reportó un **quiebre de stock** (la alerta de mayor prioridad — porque significa que se está dejando de vender).

Cada alerta tiene un nivel de prioridad, lo cual permite que tanto el mercaderista como la gerencia sepan **qué atender primero**.

### 3.4 Centro de Notificaciones

Una bandeja de notificaciones en tiempo real (con su propio contador de no leídas) que avisa sobre eventos relevantes — nuevos entrantes detectados, cambios de estado, alertas — y permite saltar directo al reporte relacionado con un toque, sin tener que buscarlo.

### 3.5 Planificador de Rutas

Una de las piezas más sofisticadas de GK: un planificador que ayuda al mercaderista a decidir **a qué puntos ir y en qué orden**, considerando:
- La **prioridad** de cada parada (un punto con quiebre de stock o muy atrasado pesa más que uno que fue visitado ayer).
- La **distancia real** entre puntos, calculada con la ubicación GPS del dispositivo (usando geometría de distancias sobre la curvatura terrestre — lo mismo que usan las apps de navegación profesionales).
- Una opción de **ruta inteligente automática**, que arma el recorrido del día priorizando lo más urgente y lo más cercano.
- Vistas de calendario mensual y agenda semanal, y conexión directa con Google Maps para navegación turno-por-turno.

### 3.6 Toma de Pedidos

Permite registrar pedidos verbales hechos directamente en el punto de venta — con historial semanal, seguimiento por punto de venta, y estado de notificación por correo. Esto cierra el círculo entre "lo que el cliente quiere" y "lo que la empresa puede despachar".

### 3.7 Logística, Despacho e Inventario

Un módulo completo de manejo de inventario que:
- Administra **múltiples depósitos** (producción y distribución) con trazabilidad por lote.
- Registra **transferencias entre almacenes** con alertas de "carga pendiente por recibir".
- Controla **ajustes de inventario con permisos según el rol** (un gerente de ventas no puede tocar el inventario de producción, y viceversa — evitando errores y descuadres).
- Lleva el seguimiento de **ventas pendientes por surtir**.

### 3.8 Dashboards Gerenciales — "Genius Index" y más

Aquí es donde todos los datos capturados en el campo se convierten en **decisiones**. GK calcula un indicador propio llamado **Genius Index** — una calificación de 0 a 100 para cada punto de venta, construida sobre tres pilares:

| Pilar | Peso | Qué mide |
|---|---|---|
| **Ejecución** | 50% | Posición en el anaquel, calidad del material POP, quiebres de stock |
| **Cobertura** | 30% | Cumplimiento de visitas, pedidos generados por visita |
| **Inteligencia** | 20% | Qué tan completo está el reporte, cuánta información de competencia se capturó |

Sobre esa base, los dashboards muestran más de una docena de análisis: rotación de producto, frescura del inventario por lote, efectividad de la posición en anaquel, índice de precio frente a la competencia, mapas de calor de demanda por zona geográfica, cumplimiento y duración de visitas, actividad promocional de la competencia, y rankings de los mejores y peores puntos de venta — todo navegable, con filtros por rango de tiempo (15, 30, 90 días o histórico completo).

Adicionalmente existe un **Dashboard de Ventas**, que muestra el avance del mes frente a la meta, el ritmo diario de ventas ("run rate"), y una proyección de cómo va a cerrar el mes si la tendencia se mantiene.

### 3.9 Metas de Cobertura

Permite definir, **persona por persona del equipo de campo**, una meta de cobertura (qué porcentaje de los puntos de venta activos debe mantener visitados dentro de su frecuencia asignada), y activarla o desactivarla según corresponda — porque no todo el personal de campo tiene esa responsabilidad. Es una meta de seguimiento, no de comisión: simplemente ayuda a que cada quien sepa, en todo momento, qué tan al día está con su trabajo.

### 3.10 Constructor de Comisiones

Una herramienta para configurar, por cada vendedor, su meta mensual, sueldo fijo, viáticos semanales, y una estructura de comisión escalonada (por ejemplo, niveles "Básica", "Óptima" y "Plus" según el porcentaje de la meta alcanzado), incluyendo bonos de activación y puntualidad — con un simulador que muestra, en tiempo real, cuánto cobraría una persona según su desempeño proyectado.

### 3.11 Panel de Administración

El centro de control de todo el sistema: gestión del personal de campo (altas, bajas, activar/desactivar), catálogo de puntos de venta, personalización de los formularios de reporte, y un sistema de configuración de los widgets que aparecen en cada dashboard según el rol de quien lo ve.

### 3.12 Arquitectura de "dispositivo compartido"

Una solución pensada específicamente para la realidad de muchas PYMES: varias personas pueden usar el mismo dispositivo y la misma cuenta de acceso (algo común quando no es viable dar un teléfono a cada persona). Antes de empezar a trabajar, GK pregunta **"¿Quién está trabajando hoy?"**, y desde ese momento cada reporte queda asociado a la persona real que lo hizo — no a la cuenta genérica del dispositivo. Esto permite medir el desempeño de cada persona individualmente, **incluso cuando varias comparten el mismo equipo**.

---

## 4. Los KPIs que mide GK (resumen)

- **Genius Index** (0–100, por punto de venta y agregable por zona/cadena/empresa)
- Quiebres de stock (cantidad y porcentaje)
- Rotación de producto (promedio diario)
- Días de inventario disponible
- Índice de frescura (porcentaje de lotes en estado óptimo)
- Efectividad de posición en anaquel
- Calidad del material POP
- Cumplimiento y duración de visitas
- Índice de precio propio vs. competencia
- Nuevos entrantes detectados
- Actividad promocional de la competencia (incluyendo degustaciones)
- Demanda por zona geográfica (mapa de calor)
- Avance de ventas vs. meta, ritmo diario, proyección de cierre de mes

---

## 5. Ventajas de uso

1. **Todo conectado, nada suelto**: la visita, el pedido, el despacho, el inventario, las comisiones y los dashboards viven en el mismo sistema y se alimentan entre sí. No hay que exportar de una herramienta e importar a otra.
2. **Hecho para la realidad del terreno, no para una vitrina de ventas**: dispositivos compartidos, conexión intermitente, anaqueles desordenados — GK fue diseñado asumiendo esas condiciones desde el principio, no como una limitación que hay que sortear.
3. **Datos verificables, no reportes "de buena fe"**: la confirmación por GPS y la sincronización offline garantizan que lo que llega a la oficina realmente ocurrió, donde se dijo que ocurrió.
4. **Sin costo por usuario ni por licencia**: a diferencia de las plataformas comerciales (que cobran entre 24 y 29 dólares por persona al mes), GK no tiene ese techo — el equipo de campo puede crecer sin que el costo del software se vuelva una barrera.
5. **Evoluciona con la empresa**: como es una herramienta propia y no alquilada, cualquier necesidad nueva (un campo adicional, una métrica distinta, un flujo nuevo) se puede incorporar directamente, sin esperar a que un proveedor externo decida si vale la pena.

---

## 6. Comparación con otras apps del mercado

Existen plataformas especializadas en "ejecución comercial" (Repsly, Involves Stage, GoSpotCheck, CityTroops, entre otras) que atienden específicamente a empresas de consumo masivo pequeñas y medianas, incluso con presencia en Venezuela. Comparando a fondo:

### Dónde GK iguala o supera a esas plataformas

| Aspecto | Plataformas del mercado | Genius Keeper |
|---|---|---|
| Captura de visitas, fotos, formularios | Sí | Sí — y con lectura automática de fechas de vencimiento por foto |
| Verificación de ubicación (GPS) | Variable, no siempre presente | Sí, con validación matemática de distancia |
| Inteligencia de competencia | Básica (marca y precio) | Más profunda: precio, material POP, degustaciones, detección de nuevos entrantes con notificación automática |
| Funciona sin internet | Pocas lo resuelven bien | Sí, con cola local y sincronización automática |
| Planificación de rutas optimizada | A veces, como módulo aparte o de pago extra | Incluida, con prioridades por alertas y navegación integrada |
| Pedidos, despacho e inventario | Generalmente NO — requieren conectar con un sistema externo (ERP/ventas) | Incluido en la misma herramienta |
| Comisiones del equipo de ventas | No | Incluido, con simulador |
| Indicador de desempeño compuesto (tipo "score") | Algunas lo ofrecen de forma genérica | Genius Index — diseñado y calibrado específicamente para esta operación |
| Costo | Por usuario/mes (24–29 USD y más) | Sin costo de licencia por usuario |

### Dónde el mercado va un paso adelante (por ahora)

Las plataformas líderes destacan por su capacidad de **analizar automáticamente la foto del anaquel** mediante visión por computadora — contar productos, detectar marcas, medir presencia relativa, todo de forma automática apenas se toma la foto. GK hoy captura la foto y ya usa visión por computadora para leer fechas de vencimiento, pero todavía no analiza el contenido visual del anaquel de forma automática.

La buena noticia es doble: primero, esa es prácticamente la **única** brecha real identificada frente al mercado — todo lo demás GK ya lo iguala o supera, y de forma integrada. Segundo, GK ya tiene construida la infraestructura técnica necesaria para avanzar hacia eso (la misma "tubería" de procesamiento de imágenes que hoy lee fechas de vencimiento es la base sobre la cual se puede construir el análisis de anaquel) — por lo que cerrar esa brecha no implica empezar de cero, sino extender algo que ya funciona, de forma cuidadosa y progresiva (capturando primero, comparando después, y solo confiando en la automatización una vez que se demuestre, con datos reales de los anaqueles de Lacteoca, que es confiable).

---

## 7. Potencial para Lacteoca — y para cualquier empresa láctea de consumo masivo

Hoy, GK ya le da a una empresa como Lacteoca algo que muchas PYMES del sector no tienen: **visibilidad real, en tiempo real, de lo que pasa entre la fábrica y el consumidor final** — sin depender de reportes verbales, memorias o intuiciones.

Mirando hacia adelante, el camino de crecimiento es claro y, sobre todo, **construido sobre una base que ya existe y funciona**:

- **Un "ojo entrenado" para el anaquel**: cada foto que se tome de aquí en adelante, junto con el reporte humano que la acompaña, va construyendo — sin esfuerzo adicional ni proyectos paralelos — la base de conocimiento necesaria para que, con el tiempo, GK aprenda a reconocer automáticamente los productos propios, los de la competencia, e incluso estimar de forma aproximada cómo rota el inventario de otras marcas en el punto de venta. Es un trabajo de mediano-largo plazo, pero que se construye solo, día a día, como parte de la operación normal.
- **Más cobertura con el mismo equipo**: a medida que se reduce el tiempo que toma llenar cada reporte (gracias a automatizaciones como la lectura de fechas o, eventualmente, el conteo automático de producto en anaquel), el mismo equipo de campo puede cubrir más puntos de venta por día.
- **Decisiones de producción mejor informadas**: al cruzar lo que GK ve en la calle (qué se agota, qué rota más rápido, dónde hay más demanda) con lo que pasa en planta, una empresa lechera puede ajustar su producción a la realidad del mercado — en lugar de producir "a ojo" y descubrir después que algo sobró o faltó.
- **Una herramienta que crece con la empresa**: si Lacteoca decide ampliar su portafolio, entrar a nuevas zonas, o incluso replicar este modelo en otra línea de negocio, GK no necesita "otro contrato" ni "otra licencia" — se extiende, porque es suyo.

En definitiva: Genius Keeper no es solamente una app para que los mercaderistas llenen formularios. Es el sistema nervioso comercial de la empresa — el que conecta lo que pasa en cada punto de venta con las decisiones que se toman en la oficina, y que, con el tiempo, está destinado a volverse cada vez más inteligente sobre el mercado específico en el que Lacteoca compite.
