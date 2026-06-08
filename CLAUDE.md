# KROMA ERP — Guía de Desarrollo Persistente

Este archivo es leído automáticamente por Claude Code al inicio de cada sesión.
Contiene la arquitectura completa del sistema KROMA, reglas de negocio, modelos de datos
y convenciones de implementación. **Toda decisión de desarrollo debe estar alineada con este documento.**

---

## Stack técnico

- React 18 + Vite + Tailwind CSS (dark theme)
- Firebase: Auth + Firestore (no Storage, no Functions por ahora)
- Colores base: `bg-slate-950` (fondo principal), `bg-slate-900` (paneles)
- Git: feature branch `claude/modular-app-architecture-R1XHo`, deploy desde `main`

---

## Roles Firebase Auth

| Rol | Descripción |
|---|---|
| `produccion` | Operario / Maestro Quesero (Módulo 3 y 4) |
| `kroma_admin` | Administrador de planta (Módulo 1) |
| `kroma_gerencial` | Gerencia — solo lectura con dashboards (Módulo 2) |
| `master` | Superusuario — acceso total |

Regla Firestore base: `isKromaAccess() = getRole(uid) == 'produccion' || isMaster()`

---

## Colecciones Firestore

| Colección | Descripción |
|---|---|
| `kroma_users` | Perfiles de usuario Kroma |
| `kroma_products` | Catálogo de productos terminados |
| `kroma_materials` | Maestro de Materiales (insumos, empaques, consumibles) |
| `kroma_suppliers` | Catálogo de proveedores |
| `kroma_processes` | Constructores de proceso (flujogramas) |
| `kroma_recipes` | Constructores de receta (ingredientes + dosis) |
| `kroma_warehouses` | Almacenes / depósitos físicos |
| `kroma_milk_reception` | Recepciones de leche con parámetros |
| `kroma_inventory_materials` | Inventario operativo de insumos |
| `kroma_inventory_pt` | Inventario de producto terminado |
| `kroma_production_logs` | Planillas de producción activa (histórico) |
| `kroma_notifications` | Notificaciones push internas (producción completada, alertas) |
| `kroma_warehouse_movements` | Movimientos entre almacenes (trazabilidad) |

**Regla universal**: soft-delete con `active: false`. Nunca borrar documentos.
**Índices**: evitar índices compuestos — filtrar y ordenar en cliente.

---

## Modelo de datos clave

### kroma_materials
```
nombre, categoria, proveedorId, presentacion, cantidadPresentacion,
unidad (g/kg/ml/l/und), costoUSD, notas, active,
asignaciones: [{                          ← solo materiales categoria 'empaques'
  productoId, productoNombre, presentacionId, presentacionNombre,
  tipoConsumo: 'unitario' | 'grupal',
  cantidadPorUnidad,                       ← si 'unitario': cantidad de material por unidad de SKU
  unidadesPorGrupo, cantidadPorGrupo,      ← si 'grupal': p.ej. 1 bobina envuelve paquetes de 12 und
}]
```
**Categorías válidas**: `leche | cultivos | coagulantes | sales | empaques | consumibles | detergentes | reactivos | otros`

**Vinculación empaque ↔ producto**: la asignación se hace **desde el Maestro de Materiales**
(material de empaque → "este empaque es para tal producto/SKU"), NO desde el Catálogo de Productos.
El constructor de procesos/recetas define el flujo de producción; el maestro de materiales es donde
vive el costeo y la trazabilidad de insumos — por eso la asignación de empaques a SKU vive allí,
junto al resto del modelo de costos del material.

### kroma_recipes
```
productoId, productoNombre, procesoId, procesoNombre,
loteReferencia: 1,   ← SIEMPRE 1 (dosis por litro de leche, no por lote)
ingredientes: [{ materialId, materialNombre, categoria, dosis, unidadDosis,
                 costoUsdUnidad, unidadMaterial }],
estado, creadoPor, creadoPorNombre, active, createdAt
```

### kroma_processes
```
productoId, productoNombre,
bloques: [{ id, tipo, params }],
estado, creadoPor, creadoPorNombre, active, createdAt
```

---

## Reglas de negocio críticas

### Costos — visibilidad por rol (regla transversal)
- **El maestro quesero / operario (rol `produccion`) NUNCA debe ver costos** — ni en el
  Constructor de Recetas, ni en el Constructor de Procesos, ni en Recepción de Leche,
  ni en la Planilla de Producción. Esos módulos son su herramienta operativa de trabajo,
  desconectada deliberadamente de los costos reales del negocio.
- Internamente Kroma sí **calcula y snapshotea** los costos (`costoUsdUnidad`,
  `costoUsdLitro`, etc.) en cada transacción — esos datos alimentan el costeo financiero
  de Administración y Gerencia (Módulos 1 y 2) — pero **jamás se renderizan en pantallas
  de operario**. Si se agrega una funcionalidad nueva en Módulo 3 o 4, no debe incluir
  badges, paneles ni textos con `$`/USD/"costo".

### Recetas
- La dosis de cada ingrediente es **por litro de leche** (`LOTE_REF = 1`).
  Kroma multiplica por litros reales en producción.
- Solo aparecen en el selector de ingredientes las categorías:
  `cultivos`, `coagulantes`, `sales`, `otros`.
  **EXCLUIR**: `leche`, `empaques`, `consumibles`, `detergentes`, `reactivos`.
- El operario puede crear insumos nuevos en el maestro **solo si no existen**,
  sin precio ni cantidad — solo para poder crear la receta.
- Costo teórico: `pricePerUnit = costoUSD / cantidadPresentacion`; conversiones
  g↔kg, ml↔L. Densidad≈1 para g↔L cuando no hay alternativa.

### Inventario de leche
- Solo entra al tanque si el operario marcó esa ruta en recepción.
- Si fue directo a producción, los campos de parámetros previos a pasteurización **no aparecen**.

### Pasteurización — merma
- El operario selecciona litros retenidos en pasteurizador: **rango estricto 8–15 L**.
- Litros netos = litros ingresados − merma seleccionada.

### Salado — puerta de calidad
- Kroma detecta automáticamente el tipo de queso (no checkbox manual).
- **Salmuera**: bloqueada hasta que se ingresen Temperatura + Titulación (°D) + Salinidad (°Bé).
- Sin esos parámetros el proceso no se habilita.

### Planilla de producción (Módulo 4)
- Campo "dosis teórica" = solo lectura (calculado por Kroma).
- Campo "cantidad real añadida" = obligatorio para operario.
- El formulario se adapta dinámicamente al producto seleccionado cruzando receta + proceso.

### Valoración de inventario
- Método: **Costo Promedio Ponderado** para insumos.
- Recalcular precio promedio ante cada nueva compra.

### Permisos de edición históricos
- Administrador: **solo lectura** en históricos.
- Gerencia: puede editar históricos.
- Operario: crea y edita solo su propia planilla activa.

---

## Módulo 1 — Administrador

### 1.1 Usuarios y permisos
- Creación requiere autorización de gerencia.

### 1.2 Almacenes (multialmacén)
Zonas predefinidas: Bodega Insumos, Tanque Enfriamiento MP, Cava Cuarto Planta, Depósito Comercial Caracas.
- Todo movimiento lleva: lote de producción, fecha de caducidad, usuario responsable, fecha.
- Transferencias internas entre almacenes con registro completo.

### 1.3 Proveedores
Campos obligatorios: nombre comercial, nombre fiscal, dirección fiscal, RIF, contacto, teléfono, email.
Categorías: materia prima (leche), empaques, insumos producción, detergentes, reactivos, laboratorios (+ crear categoría).
Datos bancarios: cuenta nacional (banco/cuenta/RIF), pago móvil (teléfono/cédula), Zelle + campo multilínea para cuentas internacionales.

### 1.4 Maestro de Materiales
- Vinculado a proveedor existente.
- Presentación de entrada (a granel, sobre, envase, saco, bulto, unidad — o crear).
- Unidad de medida interna (litro, ml, kg, g — o crear).
- Costo en USD de la presentación → conversión automática a precio por unidad mínima.
- Valoración: Costo Promedio Ponderado.

### 1.5 Reportes históricos
Filtros: por fecha o calendario (resalta días con proceso).
Incluye: balance de masa leche, costo de entrada, distribución litros por producto, consumo insumos, rendimiento kg, consumo empaques desglosado, unidades finales, personal responsable.
Score de proveedores: escala numérica + colores basada en parámetros históricos de calidad.
Trazabilidad de personal: biométrico o firma digital para responsables de movimientos.

---

## Módulo 2 — Gerencial (dashboards, solo lectura)

### 2.1 Tablero financiero
- Capital inmovilizado en tiempo real (MP + Insumos + Empaques + PT) en USD.
- Costo Teórico vs Costo Real por lote (gráfico comparativo).
- Margen bruto estimado por SKU.

### 2.2 Tablero de rendimiento
- KPI histórico: Litros leche utilizados vs Kg queso obtenidos (L/Kg).
- Control de mermas: pasteurizador + sala de procesos, comparativa mensual.

### 2.3 Tablero de calidad y proveedores
- Parámetros históricos por proveedor (Temperatura, Densidad, Brix, pH).
- Ranking automático de productores: volumen entregado + índice de calidad/rechazos.

---

## Módulo 3 — Operario (constructores)

### 3.1 Inventarios operativos
- Leche: crear, editar, visualizar.
- Insumos: el operario solo puede crear insumos **nuevos** (no existentes en maestro),
  sin precio ni cantidad — solo para recetas.

### 3.2 Constructor de Recetas
Flujo 3 pasos: Producto → Proceso (vincular, opcional) → Ingredientes.
- Ingredientes: solo categorías `cultivos`, `coagulantes`, `sales`, `otros`.
- Dosis expresada por **1 litro de leche**.
- PrecisionStepper con pasos `[0.001, 0.01, 0.1, 1]` para dosis pequeñas.
- `costoUsdUnidad` se snapshotea internamente en cada ingrediente (alimenta el costeo
  financiero gerencial) **pero nunca se muestra en pantalla** — el maestro quesero /
  operario no debe ver costos de insumos, recetas ni procesos. Esa información es
  exclusiva de Administración y Gerencia (Módulos 1 y 2).

### 3.3 Constructor de Procesos

Los bloques son secuenciales. Cada uno es opcional excepto Pasteurización y Cuajado.

#### Bloque 1 — Pasteurización
- Temperatura máxima (°C)
- Temperatura de salida / choque térmico: mínima y máxima (°C)
- Tiempo de sostenimiento a temp. máx. (seg o min)
- Preajustes: HTLV (72°C / 15 seg), LTLT (63°C / 30 min), Personalizado

#### Bloque 2 — Cuajado (tres secciones)
**Parámetros iniciales**: temperatura pre-cuajado, pH pre-cuajado, tipo coagulación (láctica / enzimática).
**Adición de insumos** (en este orden):
1. Cloruro de Calcio: Sí/No → tiempo agitación
2. Conservante: Sí/No → nombre libre → tiempo agitación
3. Cuajo: tipo (microbiano, vegetal, animal, genético) → tiempo agitación
4. Fermento: Sí/No → tipo (mesófilo, termófilo, blend termomesófilo) → temp. inoculación → tiempo agitación
**Cierre**: tiempo coagulación (hrs/min) + temperatura coagulación (°C)

#### Bloque 3 — Corte de Cuajada (Sí/No)
- Tamaño de grano: `dado` (~20mm), `frijol_rojo` (~12mm), `maiz` (~6mm), `arroz` (~3mm)
- Agitar post corte: tiempo
- Temperatura (°C)
- Acidificación: pH

#### Bloque 4 — Desuerado (Sí/No) — típico en quesos crema / yogurt griego
- Temperatura (°C), Tiempo (hrs), pH post desuerado

#### Bloque 5 — Pre-Prensa (Sí/No) — típico en coagulación enzimática
- Unidad: kg/cm² o PSI (usuario selecciona)
- Valor de presión, Tiempo (min)

#### Bloque 6 — Moldeado (Sí/No)
- Selección de molde (pre-cargados o crear nuevo)
- Vueltas 1 a 5: tiempo cada una (hrs/min)
- pH post moldeado
- Campo multilínea: observaciones de textura, firmeza, acidez

#### Bloque 7 — Prensado (Sí/No)
- Número de vueltas (1–4): el operario desmoldea y vira en cada vuelta
- Por vuelta: presión en PSI + tiempo (min)

#### Bloque 8 — Salado (puerta de calidad inteligente)
- Sistema detecta tipo de queso automáticamente → habilita masa o salmuera
- **Masa**: g o kg de sal por kg de masa
- **Salmuera** (bloqueada hasta parámetros): Temperatura (°C) + Titulación (°D) + Salinidad (°Bé)
  - Una vez liberada: kg de queso, temperatura, vueltas 1–4 con tiempo

#### Bloque 9 — Maduración / Curado (Sí/No)
- Fecha/hora y condiciones de entrada a cava (temp., pH)
- Temperatura objetivo (°C) + Humedad relativa (%)
- Tiempo de estadía (días/meses) + cantidad de virajes
- Cepillados: Sí/No → frecuencia
- Programar cambios climáticos: Sí/No → temperatura/humedad por día específico
- pH de salida del queso

#### Bloque 10 — Empaque
- Tipo de empaque (selección múltiple): envases plásticos, bolsas vacío, encerado, termoencogibles, bolsas precintadas, crear tipo
- Presentaciones de venta: desde 50g hasta 4Kg (un producto puede tener varias)
- Checkboxes: Aspersión de Conservante, Precintado (foil/sello), Envalado (paquetes/bultos)

---

## Módulo 5 — Control del Sistema (SuperAdmin / Master)

Panel de administración total. Accesible únicamente por rol `master`.

### 5.1 Gestión de usuarios y personal
- Crear usuario: nombre completo, email, cargo (texto libre), rol Firebase
- Roles disponibles: `produccion`, `kroma_admin`, `kroma_gerencial`, `master`
- Activar / desactivar acceso (soft-disable: campo `active: false` en `kroma_users`)
- Editar cargo y datos de contacto

### 5.2 Permisos y visibilidad de módulos
Por usuario se puede activar/desactivar el acceso a cada módulo:
```
módulos: {
  produccionDiaria: true | false,
  inventarioMateriales: true | false,
  inventarioPT: true | false,
  almacenes: true | false,
  historialProduccion: true | false,
  dashboardsGerenciales: true | false,
  catalogos: true | false,   ← productos, materiales, proveedores
  constructores: true | false, ← procesos, recetas
  controlSistema: true | false,
}
```
Estos flags se leen en `KromaShell.jsx` para mostrar/ocultar ítems de navegación.

### 5.3 Notificaciones y alertas
- Configurar qué eventos generan notificación push (producción completada, stock bajo, lote sin empacar, etc.)
- Activar / desactivar notificaciones por usuario
- Configurar correo electrónico destino por usuario (campo `email` en `kroma_users`)
- Historial de notificaciones enviadas (colección `kroma_notifications`, leídas/no leídas)

### 5.4 Centro de notificaciones (badge global)
- Ícono de campana en el header con badge de no leídas
- Lista de notificaciones recientes: tipo, lote, fecha, leída
- Al tocar: navega al registro relacionado
- Marcar como leída / marcar todas como leídas

### Modelo de datos — kroma_users (extendido)
```
nombre, email, cargo, rol, active,
modulos: { produccionDiaria, inventarioMateriales, ... },
notificaciones: { produccionCompletada, stockBajo, lotesPendientes },
createdAt, updatedAt
```

### Modelo de datos — kroma_notifications
```
tipo, logId?, lote?, productoNombre?, mensaje,
destinatarios: [uid | rol],
leidaPor: [uid],
leida: bool,
createdAt
```

---

## Módulo 4 — Operación diaria (planilla activa)

### 4.1 Planilla inteligente
Seleccionar producto → Kroma cruza receta + proceso y despliega solo los campos necesarios.

### 4.2 Recepción de leche
- Selector de proveedor (existente), litros recibidos
- Parámetros: Temperatura, Densidad, pH, Brix
- Enrutamiento: tanque de enfriamiento ← o → directo a producción

### 4.3 Pasteurización y merma
- Si la leche vino del tanque: mostrar casillas de parámetros previos; si fue directa: ocultar.
- Merma: selector de litros retenidos en pasteurizador, rango estricto **8–15 L**.
- Litros netos = ingresados − merma → cierran la fase de pasteurización.

### 4.4 Producción — asistente de insumos
- Dosis teórica (solo lectura, calculada por Kroma según litros netos × receta)
- Cantidad real añadida (campo obligatorio del operario)
- Registro por insumo en el orden del proceso
- Fase de coagulación: tiempo transcurrido, temperatura mantenida, pH de salida
- Continuación dinámica: el sistema despliega Desuerado → Moldeado → Empaque
  según configuración del proceso

---

## Convenciones de implementación

### Componentes reutilizables (ya creados)
- `PillGroup` — selector de opciones estilo píldoras (exportado desde `ProductCatalogPage`)
- `SliderField` — rango con valor decimal y unidad
- `StepperField` — botones +/− con touch targets grandes
- `TiempoRow` — StepperField + PillGroup de unidades (min/h/días)
- `PrecisionStepper` — stepper con selector de paso `[0.001, 0.01, 0.1, 1]`
- `SecLabel` — etiqueta de sección en mayúsculas pequeñas

### Patrones establecidos
- **Draft persistence**: `localStorage` con clave `kroma_*_draft`; banner ámbar de recuperación
- **Load errors**: banner rojo con código de error + botón Reintentar
- **Save errors**: banner rojo inline en el header del builder
- **Filtrado**: siempre client-side para evitar índices compuestos en Firestore
- **Soft-delete**: `active: false` — nunca `.delete()`

### Archivos principales
```
src/Kroma/
  KromaShell.jsx          ← navegación lateral y routing
  KromaContext.jsx         ← kromaUser, rol, proveedor de contexto
  pages/
    OperatorPages.jsx      ← re-exporta páginas del operario
    admin/
      ProductCatalogPage.jsx   ← PillGroup, catálogo de productos
      MaterialsMasterPage.jsx  ← Maestro de Materiales
      SupplierPage.jsx         ← Catálogo de proveedores
    operator/
      ProcessBuilderPage.jsx   ← Constructor de procesos (Módulo 3.3)
      RecipeBuilderPage.jsx    ← Constructor de recetas (Módulo 3.2)
```

### Firestore rules (kroma_*)
```
match /kroma_{collection}/{id} {
  allow read, write: if isKromaAccess();
}
```

---

## Estado actual de implementación

| Módulo / Página | Estado |
|---|---|
| ProductCatalogPage (Admin) | ✅ Completo |
| MaterialsMasterPage (Admin) | ✅ Completo — unidades g/kg/ml/l/m/und |
| SupplierPage (Admin) | ✅ Completo |
| ProcessBuilderPage (Operario) | ✅ Completo — alineado con manual |
| RecipeBuilderPage (Operario) | ✅ Completo — alineado con manual |
| MilkInventoryPage | ✅ Completo — edición master dentro de 10 min |
| MaterialsInventoryPage | ✅ Completo — stockCerrado/stockEnUso, alertas, ajuste, secciones |
| DailyProductionPage | ✅ Completo — recepción, runner bloques, historial, reporte lote, firmas, notificaciones |
| WarehousesPage | 🔄 En desarrollo (Módulo 1.2) |
| InventoryPTPage | 🔲 Pendiente (Módulo 1.2) |
| ProductionHistoryPage | 🔲 Pendiente (Módulo 1.5) |
| Dashboards Gerenciales | 🔲 Pendiente (Módulo 2) |
| ControlSistemaPage | 🔲 Pendiente (Módulo 5) — usuarios, permisos, notificaciones |

### Orden de construcción recomendado
1. WarehousesPage — almacenes multialmacén + movimientos + PT
2. InventoryPTPage — visualización y gestión del PT generado en producción
3. ProductionHistoryPage — reportes históricos admin (Módulo 1.5)
4. Dashboards Gerenciales — KPIs financieros, rendimiento, calidad (Módulo 2)
5. ControlSistemaPage — usuarios, permisos, notificaciones push (Módulo 5)
