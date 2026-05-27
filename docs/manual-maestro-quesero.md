# KROMA ERP — Manual del Maestro Quesero
### Guía completa de operación del sistema

---

## ÍNDICE

1. [¿Qué es KROMA?](#1-qué-es-kroma)
2. [Acceso y selección de usuario](#2-acceso-y-selección-de-usuario)
3. [Módulo Leche — Recepción y gestión](#3-módulo-leche--recepción-y-gestión)
4. [Módulo Fichas de Producción](#4-módulo-fichas-de-producción)
5. [Módulo Recetas](#5-módulo-recetas)
6. [Módulo Producción Diaria](#6-módulo-producción-diaria)
7. [Bloques de proceso — guía por etapa](#7-bloques-de-proceso--guía-por-etapa)
8. [Hold y continuación al día siguiente](#8-hold-y-continuación-al-día-siguiente)
9. [Cierre de Jornada — consumibles](#9-cierre-de-jornada--consumibles)
10. [Cierre de producción y empaque](#10-cierre-de-producción-y-empaque)
11. [Historial y reporte de lote](#11-historial-y-reporte-de-lote)
12. [Poderes del usuario Master](#12-poderes-del-usuario-master)

---

## 1. ¿Qué es KROMA?

KROMA es el sistema de trazabilidad y gestión de producción de Lacteoca. Registra cada paso desde que llega la leche hasta que el queso sale empacado, generando un historial permanente de cada lote.

**Lo que KROMA hace por ti:**
- Calcula automáticamente las dosis de cada insumo según los litros de leche
- Genera el código de lote de cada producción
- Controla el stock de insumos y te avisa cuando algo está por agotarse
- Guarda el tiempo real de cada etapa del proceso
- Produce el reporte final del lote con firmas digitales

**Lo que KROMA NO hace (tú lo decides):**
- Los valores reales que introduces en cada campo
- Cuándo completar cada bloque
- La calidad organoléptica del producto final

---

## 2. Acceso y selección de usuario

Al abrir KROMA verás la pantalla de selección de usuario. Toca tu nombre en la lista.

- Si es la primera vez, el sistema te pedirá registrar tu huella o PIN.
- Si ya tienes sesión guardada, entrarás directamente.

**Tu vista predeterminada** después de entrar es el módulo de **Producción Diaria**.

La barra lateral izquierda (ícono ≡) te da acceso a todos los módulos:

| Módulo | Para qué sirve |
|--------|---------------|
| Producción Diaria | Gestión del proceso activo del día |
| Leche | Registrar y consultar recepciones de leche |
| Inventario | Ver stock de insumos y materiales |
| Fichas | Construir y editar plantillas de producción |
| Recetas | Construir y editar recetas de insumos |

---

## 3. Módulo Leche — Recepción y gestión

Antes de iniciar cualquier producción **debes registrar la leche que llegó hoy**.

### 3.1 Registrar una nueva recepción

1. Entra al módulo **Leche**.
2. Toca el botón azul **+ Nueva**.
3. Rellena los campos:

| Campo | Qué debes ingresar |
|-------|--------------------|
| **Proveedor** | Selecciona el productor de la lista |
| **Litros recibidos** | Cantidad real medida en el bidón / tanque cisterna |
| **Temperatura** | Temperatura de llegada (°C) — lee el termómetro |
| **pH** | Lectura del pHmetro |
| **Densidad** | Lectura del lactodensímetro (g/ml) |
| **°Brix** | Lectura del refractómetro |

4. Selecciona el **enrutamiento**:
   - **Tanque de Enfriamiento** → La leche va al tanque y se reserva para producción posterior
   - **Directo a Producción** → La leche se usa inmediatamente ese mismo día

5. Toca **Guardar recepción**.

> **⚠ Importante:** Si la leche fue al tanque, KROMA habilitará los campos de parámetros previos a pasteurización. Si fue directo a producción, esos campos no aparecerán.

### 3.2 Tarjetas de leche activa

En la pantalla principal de Leche verás:

- **En Tanque** (azul): litros disponibles en el tanque de enfriamiento
- **En Proceso** (violeta): litros que ya están en una planilla de producción activa

Toca cualquiera para ver el detalle de cada recepción.

### 3.3 Editar o inhabilitar una recepción

- Toca la recepción para abrirla.
- Durante los **primeros 10 minutos** desde el registro puedes editar todos los campos.
- Pasados 10 minutos solo el administrador o el master pueden editar.
- Para inhabilitar una recepción errónea, toca **Inhabilitar** (ícono de candado).

---

## 4. Módulo Fichas de Producción

La **Ficha** es la plantilla maestra que KROMA usa para guiarte durante la producción. Combina el proceso (los pasos) con las dosis de los insumos.

> **Analogía:** La ficha es como la hoja técnica de cada queso. La creas una vez y la reutilizas en cada lote.

### 4.1 Crear una ficha nueva

1. Entra a **Fichas** desde el menú.
2. Toca **+ Nueva Ficha**.
3. Paso 1 — **Producto**: selecciona el queso que vas a elaborar del catálogo.
4. Paso 2 — **Proceso (bloques)**: construye la secuencia de etapas.

#### Cómo agregar bloques al proceso

- Toca **+ Agregar bloque** para ver la paleta de tipos de bloque.
- Selecciona el tipo (Pasteurización, Cuajado, Desuerado, etc.).
- El bloque aparece al final de la secuencia con sus valores predeterminados.
- Toca el bloque para expandirlo y **ajustar los parámetros planificados** (temperaturas, tiempos, pH objetivo, etc.).
- Reordena bloques usando las flechas ↑ ↓ o arrastrando.

**Bloques disponibles y su uso:**

| Bloque | Cuándo usarlo |
|--------|---------------|
| Pasteurización | Siempre — obligatorio como primer bloque |
| Enfriamiento | Cuando hay choque térmico antes de inocular |
| Agregar Insumo | Para cada insumo individual (cloruro, conservante, etc.) |
| Inoculación | Para cultivos que requieren incubación prolongada |
| Cuajado | Siempre — añade calcio, cuajo y fermento en orden |
| Agitación | Cocción de la cuajada con calor y movimiento |
| Corte de Cuajada | Para quesos que requieren cortar la cuajada |
| Desuerado | Quesos crema, chèvre, griegos |
| Pre-Prensa | Antes del prensado formal, para quesos de molde |
| Moldeado | Para dar forma al queso |
| Prensado | Para quesos de pasta dura/semidura |
| Salado | Sal en masa o salmuera |
| Maduración/Curado | Para quesos curados en cava |
| Empaque | Último bloque — siempre obligatorio al final |

5. Paso 3 — **Dosis (Receta)**: para cada bloque que usa insumos (Cuajado, Agregar Insumo, Inoculación), define la dosis **por litro de leche**.

> **¿Por qué por litro?** Porque los litros varían en cada lote. KROMA multiplica automáticamente la dosis × litros netos cuando produzcas.

6. Toca **Guardar Ficha** cuando termines.

### 4.2 Editar una ficha existente

- Toca la ficha en la lista para abrirla.
- Toca el ícono de edición (lápiz).
- Modifica lo que necesites.
- Los cambios NO afectan producciones ya iniciadas — solo las futuras.

---

## 5. Módulo Recetas

Las recetas son una lista de ingredientes con sus dosis por litro de leche, asociadas a un producto. Se utilizan como referencia cruzada dentro de la Ficha.

> **Nota:** Las recetas son independientes de las fichas y permiten calcular el costo teórico del lote.

### 5.1 Ingredientes válidos en recetas

Solo puedes agregar insumos de las categorías:
- **Cultivos** (fermentos, bacterias)
- **Coagulantes** (cuajo microbiano, vegetal, animal, genético)
- **Sales** (cloruro de calcio, sal)
- **Otros** (conservantes, aditivos permitidos)

> **No aparecen** en la receta: leche, empaques, consumibles, detergentes, reactivos (estos se gestionan en el inventario operativo).

### 5.2 Tipo de dosis

Cada ingrediente puede tener:
- **Por litro de leche**: dosis estándar (ej: 0.3 ml cuajo / L)
- **Por envase terminado**: para aspersiones y conservantes de superficie (ej: natamicina en solución)

---

## 6. Módulo Producción Diaria

Este es el módulo que usarás todos los días durante la elaboración.

### 6.1 Iniciar una nueva producción

1. Toca el botón verde **+ Nueva** en la pantalla de Producción Diaria.

2. **Selecciona el producto** (Ficha): elige el queso que vas a elaborar. Verás la secuencia de bloques configurada en la ficha.

3. **Selecciona la leche a procesar**:
   - Verás la lista de recepciones pendientes con su proveedor, litros y parámetros.
   - Toca para marcar una o varias recepciones (puedes combinar entregas del mismo día).
   - El total de litros se actualiza en tiempo real.

   > Si necesitas agregar leche directa (que no fue registrada antes), toca **"+ Registrar leche directa a producción"** al pie de la lista.

4. Toca **▶ Iniciar** cuando tengas la leche seleccionada.

KROMA genera automáticamente el **código de lote** con las iniciales del producto + fecha + hora.

---

## 7. Bloques de proceso — guía por etapa

Una vez iniciada la producción, KROMA te muestra un bloque a la vez. Los bloques ya completados aparecen en verde con su marca de tiempo.

### BLOQUE: Pasteurización 🟠

**Qué hace KROMA:** Muestra los parámetros planificados (temperatura máxima, temperatura de salida, tiempo de sostenimiento).

**Qué debes ingresar:**
- **Temp. máxima alcanzada (°C)**: lo que marcó el termómetro en el punto más alto
- **Temp. de salida (°C)**: temperatura al salir del pasteurizador
- **Merma en pasteurizador**: selecciona entre 8 y 15 litros (lo que quedó retenido en el equipo)

> KROMA calcula automáticamente los **litros netos** = litros recibidos − merma. A partir de aquí todas las dosis se calculan sobre este número.

**Cuándo completar:** Cuando la leche haya salido del pasteurizador a la temperatura correcta.

---

### BLOQUE: Enfriamiento 🔵

Registra la temperatura objetivo de enfriamiento antes de inocular. Completa cuando la leche llegue a la temperatura deseada.

---

### BLOQUE: Cuajado 🟡

Este es el bloque más complejo. Cubre la adición de todos los ingredientes de coagulación en orden.

**Sección 1 — Parámetros iniciales:**
- Temperatura pre-cuajado real (°C): la temperatura de la leche antes de agregar cualquier ingrediente
- pH pre-cuajado real

**Sección 2 — Asistente de insumos** (en el orden definido en la ficha):

| Ingrediente | Qué debes registrar |
|-------------|---------------------|
| **CaCl₂ (Cloruro de Calcio)** | KROMA calcula los ml de solución a preparar y los ml a añadir. Ingresa la cantidad real añadida |
| **Conservante** | Cantidad real añadida (g o ml) |
| **Cuajo** | Cantidad real añadida |
| **Fermento** | Cantidad real añadida |

> Para cada ingrediente, KROMA muestra la **dosis teórica** calculada (dosis receta × litros netos). Tú ingresas lo que realmente añadiste.

**Sección 3 — Cierre del bloque:**
- Tiempo de coagulación real (horas/minutos)
- pH de salida de la leche

**Cuándo completar:** Al finalizar el tiempo de coagulación y antes de pasar al corte o desuerado.

---

### BLOQUE: Agregar Insumo 🟢

Para insumos individuales (natamicina en polvo, conservante directo, etc.).
- Ingresa la cantidad real añadida
- Ingresa el tiempo real de agitación

---

### BLOQUE: Corte de Cuajada 🔴

- **Tamaño de grano obtenido**: selecciona entre Dado (~20mm), Frijol (~12mm), Maíz (~6mm), Arroz (~3mm)
- Temperatura de la cuajada al cortar
- pH de acidificación

---

### BLOQUE: Agitación / Cocción 🟠

- Temperatura real alcanzada durante la agitación/cocción
- Tiempo real

---

### BLOQUE: Desuerado 🔵

- Temperatura ambiente durante el desuerado
- Tiempo real (horas)
- pH post-desuerado

> Si el desuerado toma más de 30 minutos, KROMA te sugerirá poner la producción en **Hold** para continuar al día siguiente.

---

### BLOQUE: Pre-Prensa

- Presión real aplicada (kg/cm² o PSI)
- Tiempo real (minutos)

---

### BLOQUE: Moldeado 🟣

Para cada vuelta (según el número definido en la ficha):
- Tiempo real de cada vuelta (minutos)

Al final:
- pH post-moldeado
- Observaciones de textura, firmeza, acidez (campo de texto libre)

---

### BLOQUE: Prensado ⬜

Para cada vuelta:
- Presión real (kg/cm² o PSI)
- Tiempo real (minutos)

---

### BLOQUE: Salado 🟢

**Paso 1:** Ingresa los **kg de masa a salar**.

**Paso 2:** Selecciona el método:
- **En masa / superficie**: KROMA calcula la sal teórica en gramos. Ingresa la sal real aplicada.
- **Salmuera**: 🔒 **Puerta de calidad** — debes ingresar los 3 parámetros antes de continuar:
  - Temperatura de la salmuera (°C)
  - Titulación (°D)
  - Salinidad (°Bé)
  
  Una vez los 3 valores están ingresados, se habilita la salmuera.

---

### BLOQUE: Maduración / Curado 🟡

- Temperatura de entrada a cava (°C)
- pH de entrada
- **Fecha/hora de salida programada**: KROMA pondrá la producción en Hold hasta esa fecha.

> La maduración siempre genera un Hold automático.

---

### BLOQUE: Empaque 🔵 ← ÚLTIMO BLOQUE

Este bloque cierra la producción.

**Paso 1 — Producción total:**
- **Kg de queso producido**: pesa el total de masa antes de empacar
- KROMA calcula el rendimiento: litros procesados ÷ kg producidos = L/kg
- pH del queso terminado

**Paso 2 — ¿Qué harás con esta producción?**
- **Empacar todo ahora**: toda la producción se empaca hoy
- **Guardar sin envasar**: la masa va a cava sin empacar
- **Empacar parte / Guardar parte**: defines cuántos kg empacar y cuántos reservar

**Paso 3 — Presentaciones:**
- Selecciona las presentaciones del catálogo (250g, 500g, 1kg, etc.)
- Ingresa las unidades empacadas de cada presentación
- KROMA suma el total empacado en kg

**Paso 4 — Fecha de vencimiento del lote**

**Paso 5 — Operaciones adicionales:**
- Aspersión de conservante (natamicina en solución)
- Precintado / foil / sello
- Envalado (paquetes/bultos)

**Si marcaste Aspersión de conservante:**
- KROMA muestra la preparación: _ej: 1.5g natamicina / 500ml agua destilada_
- Ingresa el número de envases a rociar → KROMA calcula ml de solución y gramos de conservante
- Ingresa la cantidad real aplicada (g)

Toca **✓ Cerrar Producción** para finalizar.

---

## 8. Hold y continuación al día siguiente

Los quesos de maduración larga o desuerado prolongado requieren pausar la producción entre días.

### Cómo poner un bloque en Hold

En los bloques de larga duración (Cuajado, Desuerado, Maduración, etc.):

1. Verás el botón **"Poner en hold al completar"** — tócalo para activarlo (se pone en ámbar).
2. Se despliega un selector de **fecha y hora de reanudación**.
3. Ajusta la fecha/hora y toca **⏸ Completar y poner en hold**.

La planilla cambia a estado **"En Hold"** y aparece en la lista con:
- La fecha de reanudación: _"Reanuda: 27-may., 12:21 p.m. — Cuajado"_
- El porcentaje de avance del proceso

### Cómo reanudar al día siguiente

1. En la pantalla de Producción Diaria, toca la tarjeta del lote en hold.
2. Toca **Reanudar**.
3. KROMA te muestra cuánto tiempo transcurrió desde el último bloque completado.
4. Continúa con el siguiente bloque.

> **Consejo:** Si el lote está en hold y pasó mucho tiempo (ej: 2 días), KROMA te lo indica al reanudar para que lo tengas presente en el reporte.

---

## 9. Cierre de Jornada — consumibles

Cuando completas un bloque y lo pones en Hold para el día siguiente, KROMA abre automáticamente el **Cierre de Jornada**.

### ¿Para qué sirve?

Registrar los consumibles usados ese día: jabón, cloro, soda cáustica, guantes de nitrilo, tapabocas, etc.

### Por qué hay que hacerlo EN EL MOMENTO

KROMA te lo pide **mientras aún estás en planta** — antes de salir del día. Al día siguiente ya nadie recuerda exactamente cuánto jabón se usó.

### Cómo llenarlo

1. Aparece una pantalla con todos los consumibles que tienes en inventario.
2. Para cada ítem que usaste, toca **+** para aumentar la cantidad.
3. Los que no usaste déjalos en **0**.
4. Toca **Confirmar y continuar**.

KROMA descuenta automáticamente esas cantidades del inventario operativo.

> Si no hay consumibles en inventario, el cierre aparece vacío — puedes confirmarlo sin llenar nada.

---

## 10. Cierre de producción y empaque

Al completar el bloque de Empaque, KROMA:

1. Marca la planilla como **Completada**
2. Genera el registro en el inventario de Producto Terminado (PT)
3. Envía una notificación a gerencia y administración con los datos del lote
4. Muestra el **Reporte de Lote**

### Firmas digitales del reporte

El reporte requiere dos firmas:

| Responsable | Quién firma | Cómo |
|-------------|-------------|------|
| **Maestro Quesero** | Tú (el operario del lote) | Botón "Firmar como Maestro Quesero" |
| **Resp. Almacén PT** | La persona que recibe el producto | Escribe su nombre y toca "Firmar como Resp. Almacén PT" |

### Producción con masa sin envasar

Si guardaste parte o toda la masa sin envasar, aparecerá en la sección **"Pendiente de empacar"** en la pantalla principal, con el contador de días transcurridos.

Para empacarla después:
1. Toca la tarjeta de pendiente de empacar.
2. Toca **"Finalizar empaque →"**
3. Selecciona las presentaciones y las unidades.
4. Confirma.

---

## 11. Historial y reporte de lote

En la parte inferior de Producción Diaria, toca **Historial** para ver los últimos 20 lotes.

### Filtros disponibles

| Filtro | Qué muestra |
|--------|-------------|
| Todas | Todos los lotes históricos |
| Empacada | Solo lotes 100% empacados |
| Sin envasar | Solo lotes guardados en cava sin empacar |
| Incompleta | Lotes con empaque parcial |

### Reporte de lote

Toca cualquier lote histórico para ver el reporte completo con:
- Código de lote
- Recepciones de leche usadas (proveedor, litros, parámetros)
- Balance de procesamiento (litros recibidos, merma, litros netos)
- Datos de cada bloque completado (real vs. teórico)
- Kg producidos y rendimiento L/kg
- Detalle de empaque por presentación
- Firmas de responsables

### Compartir el reporte

Toca el botón **Compartir** (ícono de flecha) en el encabezado del reporte. El texto del reporte se copia al portapapeles o se puede compartir por WhatsApp/correo.

---

## 12. Poderes del usuario Master

El usuario Master tiene control total sobre todas las planillas. Estas opciones **no son visibles** para operarios ni administradores.

### Editar un bloque ya completado

En el runner de una producción activa, los bloques completados (Pasteurización ✓, Cuajado ✓, etc.) muestran dos botones pequeños:

| Botón | Color | Qué hace |
|-------|-------|----------|
| ✎ Lápiz | Violeta | Abre el editor del bloque con los datos guardados. Modifica lo que necesites y guarda. El bloque queda marcado como "✎ editado por master". |
| ↺ Reabrir | Ámbar | Elimina la información registrada del bloque y mueve el proceso de vuelta a ese paso. El operario puede completarlo de nuevo. |

### Eliminar una planilla de producción

En la pantalla principal del runner (vista del proceso activo), hay un **ícono de papelera rojo** en el encabezado (solo visible para master).

También hay botón de eliminar en:
- Cada tarjeta de producción activa (junto al botón "Reanudar")
- Cada ítem del historial (enlace "Eliminar planilla" al pie de la tarjeta)

**Qué pasa al eliminar una planilla:**
1. Aparece un modal de confirmación con el nombre del lote y los litros de leche vinculados.
2. Al confirmar, la planilla queda marcada como eliminada (no se borra permanentemente).
3. Las recepciones de leche vinculadas se **liberan automáticamente** — vuelven a estado "Pendiente" y quedan disponibles para iniciar un nuevo proceso.
4. Se envía una **notificación push** a administración y producción: *"X litros de leche (Proveedor) liberados y disponibles para nueva producción."*

### Editar/eliminar recepciones de leche

En el módulo **Leche**, cualquier recepción puede ser editada o eliminada por el master sin restricción de tiempo (los operarios solo tienen 10 minutos para editar después del registro).

---

## GUIÓN DE OPERACIÓN — UN DÍA TÍPICO

Este es el guion que sigues en cada jornada de trabajo.

---

### AL LLEGAR A LA PLANTA (6:00–7:00 a.m.)

```
1. Abre KROMA y selecciona tu usuario.

2. Si hay producciones "En Hold" que deben reanudarse hoy:
   → Toca la tarjeta → Reanudar
   → KROMA te muestra el tiempo transcurrido desde la pausa
   → Continúa con el siguiente bloque

3. Si hay leche nueva llegando:
   → Módulo Leche → + Nueva
   → Registra: proveedor, litros, temperatura, pH, densidad, Brix
   → Selecciona enrutamiento (tanque o directo a producción)
```

---

### INICIO DE PRODUCCIÓN NUEVA

```
4. Producción Diaria → + Nueva
5. Selecciona la Ficha del queso a elaborar
6. Marca las recepciones de leche a procesar (una o varias)
7. Confirma los litros totales
8. Toca ▶ Iniciar → KROMA genera el código de lote
```

---

### DURANTE EL PROCESO (bloque por bloque)

```
9. Pasteurización:
   - Anota temp. máxima alcanzada
   - Anota temp. de salida
   - Selecciona merma (8–15 L)
   - Toca ✓ Completar bloque

10. Para cada bloque siguiente:
    - Lee los parámetros planificados (referencia)
    - Ejecuta el paso en planta
    - Ingresa los valores reales en KROMA
    - Toca ✓ Completar bloque

11. En el Cuajado:
    - Ingresa temperatura y pH pre-cuajado
    - Para cada ingrediente: ingresa la cantidad real añadida
    - Al terminar el tiempo de coagulación: ingresa tiempo real y pH de salida
    - Si el cuajado dura toda la noche → activa Hold → selecciona fecha/hora de mañana
    → KROMA te pedirá el Cierre de Jornada antes de salir
```

---

### CIERRE DE JORNADA (antes de salir)

```
12. KROMA abre automáticamente el Cierre de Jornada al poner un bloque en Hold
    para el día siguiente.

13. Registra lo que usaste hoy:
    - Jabón líquido: X unidades
    - Cloro: X litros
    - Soda cáustica: X kg
    - Guantes de nitrilo: X pares
    - Tapabocas: X unidades
    (Los que no usaste, déjalos en 0)

14. Toca Confirmar y continuar.
    → KROMA descuenta del inventario
    → La planilla queda en Hold hasta la fecha programada
```

---

### EMPAQUE (último día del proceso)

```
15. Continúa hasta el bloque de Empaque.

16. Ingresa los kg de queso producido (pesa antes de empacar).

17. Selecciona las presentaciones y cuántas unidades de cada una.

18. Si hay aspersión de natamicina:
    - Prepara la solución según las instrucciones de KROMA
    - Ingresa el número de envases rociados
    - Ingresa los gramos reales aplicados

19. Ingresa la fecha de vencimiento del lote.

20. Toca ✓ Cerrar Producción.

21. Firma el reporte como Maestro Quesero.

22. Entrega el producto al responsable de almacén → pídele que firme también.
```

---

## REFERENCIA RÁPIDA — Alertas comunes

| Lo que ves en pantalla | Qué significa | Qué hacer |
|------------------------|---------------|-----------|
| 🔒 "Completa los 3 parámetros de salmuera" | Faltan temperatura, titulación o salinidad | Ingresa los 3 valores del análisis de salmuera |
| ⚠ "Stock bajo: [insumo]" | El inventario del insumo bajó del mínimo | Informa al administrador para reposición |
| 🟡 "En Hold — Reanuda: [fecha]" | La producción está pausada | No hay que hacer nada hasta la fecha indicada |
| ⚠ "Pendiente de empacar — X días" | Hay masa en cava sin envasar | Empacar lo antes posible |
| 🔔 "X L de leche liberados" | Un proceso fue eliminado y la leche quedó disponible | Revisar si se debe iniciar un nuevo proceso |

---

*KROMA ERP — Lacteoca · Versión actualizada mayo 2026*
