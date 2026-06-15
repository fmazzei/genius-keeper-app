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

## Pendientes — Comisiones GK y Webhooks Zoho Books

Sección de seguimiento para terminar de conectar el módulo de comisiones del
vendedor (GK) con Zoho Books. Mantener actualizada a medida que se resuelvan
items.

### Estado actual (2026-06-15 — integración Zoho Books validada en producción, end-to-end)
- ✅ **Deploy de Cloud Functions desbloqueado**: el secreto `X-Zoho-Secret` ya NO se gestiona vía Secret Manager (`runWith({ secrets: [...] })`) — bloqueaba el deploy por permisos del service account de CI (`secretmanager.versions.get` 403, sin causa raíz identificable). Se reemplazó por un archivo `.env.geniuskeeper-36553` generado por CI a partir del secreto de GitHub Actions `ZOHO_SECRET`, escrito justo antes de `firebase deploy --only functions` y borrado después (ver `.github/workflows/firebase-deploy.yml`, paso "Deploy Cloud Functions"; `functions/handlers/webhooks.js` ahora lee `process.env.ZOHO_SECRET` directo). `functions/.gitignore` excluye `.env`/`.env.*`. El secreto original en Secret Manager quedó huérfano (sin usar) — se puede borrar cuando se quiera.
- ✅ **Webhooks configurados en Zoho Books** (Configuración → Automatización → Reglas de flujo de trabajo): "GK - Sincronizar Facturas" + "GK - Factura Vencida" → `sincronizarFacturaDesdeZoho`; "GK - Nota de Crédito" → `procesarNotaCreditoDesdeZoho`. Ambos con header `X-Zoho-Secret` = mismo valor que `ZOHO_SECRET` en GitHub Actions.
- ✅ **Mapeo vendedor ↔ Zoho**: `zohoSalespersonName` completado para Wilmer Casares.
- ✅ **`zohoOrgIdLacteoca`** configurado en AdminPanel → Integraciones (`793482918`).
- ✅ **Toggles activados** en AdminPanel → Integraciones: "Webhook de Facturas" ON (cubre `sincronizarFacturaDesdeZoho` + `procesarNotaCreditoDesdeZoho`). "Webhook de Comisiones / Pagos" (`procesarComisionesDesdeZoho`, legacy) se deja OFF — no se configuró ese webhook en Zoho (ver punto 7 pendiente).
- ✅ **Prueba end-to-end exitosa**: factura real de Zoho (INV-001638, Francisco Bianco) llegó a "Mis Facturas" del vendedor como "Vencida"; al marcarla pagada en Zoho, el webhook `invoice.paid` actualizó el estado a "Pagada" y el Home del vendedor reflejó `1/1,429 uds`, nivel "Básica (3.5%)" y Bono Puntualidad proporcional (100%) — confirma tasa-cohorte, regla de 45 días y `pagadaDentroDePlazo` funcionando en producción.
- Puntos 1-6 del listado "Pendiente" de abajo: **completados**. Quedan abiertos los puntos 7 (decisión de negocio sobre `procesarComisionesDesdeZoho` legacy) y 8 (bono "Disponibilidad en Anaquel").

### Estado actual (2026-06-15 — herramienta admin para corregir facturas Zoho + reorganización "Mis Facturas")
- ✅ **`MisFacturasView.jsx` reorganizada**: ahora tiene resumen arriba (Vencidas, Por vencer, $ Por cobrar), pestañas de estado (Vencidas, Por vencer, Vigentes, Pagadas, **Anuladas**) y búsqueda por nombre de cliente. "Vencidas"/"Por vencer"/"Vigentes" ordenadas por fecha de vencimiento (más antigua primero); "Pagadas"/"Anuladas" por fecha de factura descendente. "Por vencer" = vencimiento dentro de `PROXIMO_A_VENCER_DIAS = 3` días.
- ✅ **Nueva Cloud Function `gestionarFacturaVendedor`** (`functions/handlers/adminTools.js`, callable `onCall`, requiere rol `master` o `sales_manager`), con 3 acciones sobre un documento de `facturas_vendedor`:
  - **`eliminar`**: borra la factura por completo y revierte unidades/comisión ya contabilizadas (caso típico: factura de prueba como INV-001638).
  - **`anular`**: marca `estado: 'anulada'` (queda visible en la pestaña "Anuladas" de "Mis Facturas" para auditoría, pero fuera de los conteos activos) y revierte unidades/comisión ya contabilizadas.
  - **`reasignar`**: revierte unidades/comisión del vendedor actual, congela una nueva tasa-cohorte para `nuevoVendedorId` y, si la factura ya estaba pagada, recalcula la comisión para el nuevo vendedor (`procesarPagoFactura`).
- ✅ **Lógica de tasa-cohorte/comisión compartida**: `congelarTasaCohorte`, `procesarPagoFactura` y la nueva `revertirAcumulados` se movieron a `functions/handlers/facturaCommissionOps.js`, usadas tanto por `webhooks.js` (`sincronizarFacturaDesdeZoho`) como por `adminTools.js`.
- ✅ **AdminPanel → Integraciones → "Gestión de facturas Zoho"**: nueva sección (`FacturaManagementTool` en `AdminPanel.jsx`) para buscar una factura por número, ver sus datos (cliente, monto, unidades, vendedor actual, comisión generada) y ejecutar Reasignar / Anular / Eliminar con confirmación inline.
- **Por qué esta herramienta y no editar en Zoho**: editar el vendedor o anular una factura directamente en Zoho no dispara ningún webhook de actualización/eliminación hacia GK (solo `invoice.created/overdue/paid` y `creditnote.applied` están configurados), por lo que el documento en `facturas_vendedor` quedaría desincronizado. Esta herramienta administra la corrección directamente en Firestore, revirtiendo y recalculando lo necesario.
- **Caso de uso inmediato**: limpiar la factura de prueba INV-001638 (Francisco Bianco, asignada a Wilmer Casares) desde AdminPanel → Integraciones → "Gestión de facturas Zoho" → buscar "INV-001638" → "Eliminar factura". Esto revertirá las `1/1,429 uds` y la comisión registrada en el test end-to-end.

### Estado actual (2026-06-15 — punto 8 completado: Bono "Disponibilidad en Anaquel")
- ✅ **`commissionConfig`**: nuevos campos `bonusAnaquel` (1.0%), `anaquelThreshold` (80%) y `anaquelMinUnits` (12 uds), agregados a `DEFAULT_COMMISSION_CONFIG` en `CommissionConstructor.jsx` y su espejo `functions/handlers/commissionEngine.js`. Editables desde AdminPanel → Vendedores → Editar → sección "Bonos".
- ✅ **Cálculo en `VendedorLayout.jsx`**: para la cartera del vendedor, identifica los PDV con `pos.regimenComision === 'anaquel'` (activos). Si hay al menos uno (`hasAnaquel`), consulta `visit_reports` de esos `posId` filtrando a la semana actual y días martes/viernes, promedia `inventoryLevel` por sucursal, y verifica si al menos `anaquelThreshold`% de esas sucursales promedian más de `anaquelMinUnits` unidades (`anaquelOk`).
- ✅ **Home del vendedor**: si `hasAnaquel`, el "Bono Activación" se oculta y se muestra en su lugar "Bono Disponibilidad en Anaquel (+X%)" con el progreso `cubiertos/total` sucursales. Si el vendedor no tiene cuentas en régimen anaquel, el comportamiento (Bono Activación con Cobertura de Cartera) no cambia.
- **Pendiente de validar en producción**: aún no hay vendedores con cuentas marcadas `regimenComision: 'anaquel'` ni reportes de anaquel en `visit_reports` para esas cuentas — falta probar end-to-end con una cuenta real (p.ej. Excelsior Gama) una vez se marque el régimen en `EditPosModal.jsx` y existan visitas de martes/viernes con `inventoryLevel`.
- Con esto, **todos los puntos pendientes del listado original (1-8) están completados o implementados**; solo queda abierto el punto 7 (decisión de negocio sobre `procesarComisionesDesdeZoho` legacy).

### Estado actual (2026-06-13 — Fase 1+2 del motor de comisiones completas)
- `commissionConfig` por vendedor (tiers, bonos, período de arranque, `facturaMaxDias`) — ✅ completo, vive en `users_metadata/{uid}.commissionConfig`, configurado desde `CommissionConstructor.jsx`. Nivel "Baja" ahora paga la tasa base del tier más bajo (antes $0).
- `functions/handlers/commissionEngine.js` — ✅ NUEVO: lógica pura de tiers/tasa compartida entre `VendedorLayout.jsx` y los webhooks (`buildTiers`, `getTierFromConfig`, `mesCohorteFromDate`, `diffDias`).
- Home del vendedor (`VendedorLayout.jsx`) — ✅ `unidadesDelMes`/nivel/tasa ahora se leen de `comisiones_mensuales/{uid}_{mes}` (unidades FACTURADAS vía Zoho) si existe ese documento; si no, cae a despachos (fallback pre-Zoho). `comisionSemana` suma directamente `calculatedCommission` de `pagos_registrados` (ya viene con tasa-cohorte aplicada). Bono Puntualidad ahora es proporcional (`stats.puntualidadPct`, basado en `pagadaDentroDePlazo` de `facturas_vendedor`).
- `facturas_vendedor` — ✅ regla de Firestore agregada; ahora incluye `diasCredito`, `unidades`, `mesCohorte`, `tasaCohorte`, `tierCohorte`, `comisionGenerada`, `comisionAnulada`, `pagadaDentroDePlazo`, `fechaPago`. `MisFacturasView` muestra días de crédito.
- `comisiones_mensuales/{vendedorId}_{mes}` — ✅ NUEVO: acumulado de unidades facturadas + nivel/tasa del mes, escrito por `sincronizarFacturaDesdeZoho` dentro de una transacción (`congelarTasaCohorte`). Regla de Firestore agregada.
- Cloud Function `sincronizarFacturaDesdeZoho` — ✅ REESCRITA: resuelve vendedor (`resolveVendedor`, por `zohoSalespersonName`), filtra por `organization_id` (Lacteoca, vía `esOrganizacionLacteoca`/`settings/appConfig.zohoOrgIdLacteoca`), congela tasa-cohorte por factura (`congelarTasaCohorte`, una sola vez por factura), y en `invoice.paid` calcula comisión (`procesarPagoFactura`): aplica regla de 45 días (`facturaMaxDias`) y marca `pagadaDentroDePlazo` (vencimiento + 5 días). Escribe en `pagos_registrados` CON `vendedorId`/`reporterId`.
- Cloud Function `procesarNotaCreditoDesdeZoho` — ✅ NUEVA (`creditnote.applied`): ajusta (resta) comisión ya generada de las facturas asociadas a la tasa-cohorte ya congelada. Arquitectura prevista por el punto 9 original, ya implementada — solo falta activar el evento en Zoho.
- Cloud Function `procesarComisionesDesdeZoho` (pagos, legacy) — ✅ sin cambios, sigue con tasa fija `COMMISSION_RATE = 0.065` y sin `vendedorId` (ver punto 6 más abajo, decisión de negocio pendiente).
- Secreto `X-Zoho-Secret` — ✅ migrado de `functions.config()` (deprecado) a Secret Manager vía `runWith({ secrets: ['ZOHO_SECRET'] })`.
- **Bug crítico corregido**: `configDoc.exists()`/`mesSnap.exists()` (Admin SDK expone `exists` como propiedad, no método) — llamarlo como función lanzaba `TypeError` y devolvía 500 en TODOS los webhooks, incluyendo `procesarComisionesDesdeZoho` que ya estaba "implementado". Corregido en los 4 usos de `functions/handlers/webhooks.js`.
- AdminPanel → Integraciones — ✅ agregado input para `zohoOrgIdLacteoca` (filtro anti-contaminación cross-org), alerta "N facturas de Lacteoca sin vendedor asignado" (consulta `facturas_vendedor where vendedorId == null`), y documentación del endpoint `procesarNotaCreditoDesdeZoho`.
- `EditPosModal.jsx` — ✅ agregado campo `regimenComision` ('estandar' | 'anaquel') por PDV, visible solo cuando `tipoDespacho === 'centralizado'` (caso Excelsior Gama).
- CI (`.github/workflows/firebase-deploy.yml`) — ✅ agregado paso de `firebase deploy --only functions` (con `continue-on-error` hasta que el service account tenga permisos).

### Pendiente (requiere acción manual / decisiones de negocio)
1. **Crear el secreto en Firebase**: `firebase functions:secrets:set ZOHO_SECRET` (valor que Zoho enviará en el header `X-Zoho-Secret`). Sin esto, el deploy de functions fallará al referenciar el secreto.
2. **Permisos del service account de CI — BLOQUEANTE CONFIRMADO (2026-06-11)**: el deploy de Cloud Functions está fallando con
   `Error: Permissions denied enabling secretmanager.googleapis.com` (run #27341760166, step "Deploy Cloud Functions").
   El service account de `FIREBASE_SERVICE_ACCOUNT` no puede habilitar la API de Secret Manager en el proyecto `geniuskeeper-36553`.
   **Acción requerida**: un usuario con rol de "Project Owner"/"Editor" en GCP debe:
   - Habilitar manualmente `secretmanager.googleapis.com` en https://console.cloud.google.com/apis/library/secretmanager.googleapis.com?project=362565450545, **o**
   - Otorgar al service account de CI el rol `roles/serviceusage.serviceUsageAdmin` (o `Editor`/`Owner`) para que pueda habilitar APIs por sí mismo.
   Mientras esto no se resuelva, **ningún cambio en `functions/handlers/*.js` llega a producción** (incluye `sincronizarFacturaDesdeZoho`/`procesarNotaCreditoDesdeZoho` reescritos arriba, y el trigger `onDespachoCreated` agregado el 2026-06-11).
3. **Configurar en Zoho Books** (Configuración → Automatización → Webhooks), payload "default" (todos los campos del módulo como JSON):
   - `invoice.created`, `invoice.overdue`, `invoice.paid` → URL de `sincronizarFacturaDesdeZoho` + header `X-Zoho-Secret`.
   - `creditnote.applied` → URL de `procesarNotaCreditoDesdeZoho` + header `X-Zoho-Secret` (se activa con el mismo toggle "Webhook de Facturas").
   - Pago de factura (legacy) → URL de `procesarComisionesDesdeZoho` + header `X-Zoho-Secret`.
   ⚠️ El parseo de `sincronizarFacturaDesdeZoho`/`procesarNotaCreditoDesdeZoho` asume los nombres de campo estándar de la API v3 de Zoho Books (`invoice_number`, `customer_name`, `total`, `date`, `due_date`, `status`, `salesperson_name`, `line_items[].quantity`, `organization_id`, y para notas de crédito `creditnote.invoices[].invoice_number` / `reference_number`). **Antes de activar en producción, validar contra un payload real de Zoho Books de Lacteoca** (enviar un webhook de prueba y revisar los logs de Cloud Functions) — si Zoho usa nombres distintos en el payload "default" o se configura un payload personalizado, ajustar el handler.
4. **Mapeo vendedor ↔ Zoho**: para cada vendedor, completar el campo "Nombre en Zoho (vendedor)" (`zohoSalespersonName`) en AdminPanel → Vendedores → Editar, igual al "Salesperson" configurado en Zoho Books. Sin esto, las facturas llegan sin `vendedorId` (se reflejan en la alerta de Integraciones) y no generan comisión ni aparecen en la app del vendedor.
5. **Configurar `zohoOrgIdLacteoca`** en AdminPanel → Integraciones con el `organization_id` de la instancia de Zoho Books de Lacteoca (Configuración → Detalles de la organización en Zoho). Si se deja vacío, los webhooks NO filtran por organización (aceptan cualquier payload con secreto válido).
6. **Activar toggles** en AdminPanel → Integraciones: "Webhook de Facturas" (cubre `sincronizarFacturaDesdeZoho` + `procesarNotaCreditoDesdeZoho`) y "Webhook de Comisiones / Pagos" (`procesarComisionesDesdeZoho`, legacy).
7. **Revisar `procesarComisionesDesdeZoho`** (legacy, sin cambios): usa una tasa fija `COMMISSION_RATE = 0.065` (margen "precio planta"), independiente de los `tiers` configurados por vendedor, y no escribe `vendedorId`. El nuevo flujo de comisiones por vendedor vive en `sincronizarFacturaDesdeZoho`/`procesarPagoFactura`. Definir si `procesarComisionesDesdeZoho` debe desactivarse, o si ambos conceptos (margen de planta global vs. comisión del vendedor) deben coexistir.
8. **Régimen "Disponibilidad en Anaquel"** (cuentas con despacho centralizado/consignación, p.ej. Excelsior Gama): el flag `pos.regimenComision` ('estandar'|'anaquel') ya existe en `EditPosModal.jsx`, pero el cálculo del bono (+1% si el 80% de las sucursales activas promedia >12 uds en visitas de martes/viernes vía `visit_reports`, sustituyendo a Cobertura de Cartera) **no está implementado todavía** en `VendedorLayout.jsx`. Pendiente como siguiente fase.


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
