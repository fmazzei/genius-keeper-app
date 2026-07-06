# KROMA ERP

Sistema de gestión integral para queserías: producción diaria, recepción de
leche, inventario de insumos y producto terminado, maestro de materiales,
proveedores, constructores de recetas y procesos, fichas técnicas, despachos,
rotación de cava, costos fijos y dashboards gerenciales (financiero, KPIs de
producción y calidad).

Es una aplicación **web** (React + Vite) con backend **Firebase** (Auth +
Firestore, y Cloud Functions opcionales para notificaciones). Funciona en
navegador de escritorio y móvil, y se puede instalar como PWA en el teléfono.

> Esta es una versión **independiente y autónoma** de KROMA. No depende de
> ningún otro sistema: todo su código y todos sus datos viven en el proyecto
> Firebase que tú configures. Tu equipo de desarrollo puede modificarlo,
> extenderlo o adaptarlo libremente.

---

## 1. Requisitos

- **Node.js 20+** y npm.
- Una cuenta de **Google/Firebase** (gratis para empezar).
- Para las notificaciones push (opcional): plan **Blaze** de Firebase.

---

## 2. Crear tu proyecto Firebase (una sola vez)

1. Entra a <https://console.firebase.google.com> y crea un **proyecto nuevo**.
2. **Authentication** → *Comenzar* → habilita el proveedor **Correo/contraseña**.
   - Crea al menos un usuario (pestaña *Users* → *Add user*) con correo y
     contraseña. Con ese usuario entrarás a la app.
3. **Firestore Database** → *Crear base de datos* → modo **producción** →
   elige la región más cercana.
4. **Configuración del proyecto** (⚙️) → sección *Tus apps* → botón **Web `</>`**
   → registra una app. Copia el objeto `firebaseConfig` que te muestra.

---

## 3. Conectar la app a tu Firebase

Abre **`src/Firebase/config.js`** y reemplaza el objeto `firebaseConfig` por el
que copiaste. Es el **único** archivo que hay que tocar para conectar el backend.

```js
const firebaseConfig = {
  apiKey: "…",
  authDomain: "TU_PROYECTO.firebaseapp.com",
  projectId: "TU_PROYECTO",
  storageBucket: "TU_PROYECTO.appspot.com",
  messagingSenderId: "…",
  appId: "…"
};
```

---

## 4. Correr en local

```bash
npm install
npm run dev
```

Abre la URL que muestra la terminal (normalmente <http://localhost:5173>).
Inicia sesión con el usuario que creaste en el paso 2.

La **primera vez** que entres, la app te pedirá crear el primer usuario
operativo de KROMA (rol *master*), que es quien administra los demás usuarios,
roles y permisos dentro de la aplicación.

---

## 5. Publicar (deploy)

Usa Firebase Hosting (gratis):

```bash
npm install -g firebase-tools     # una sola vez
firebase login                    # una sola vez
firebase use --add                # elige tu proyecto y ponle alias "default"

npm run build                     # genera dist/
firebase deploy --only hosting,firestore:rules
```

Esto publica la app y las **reglas de seguridad** de Firestore
(`firestore.rules`). Tu app quedará en `https://TU_PROYECTO.web.app`.

---

## 6. Notificaciones push (OPCIONAL)

La app funciona perfectamente **sin** esto. Si quieres avisos push (temporizador
de producción por finalizar, despacho recibido):

1. Requiere el plan **Blaze** (Firebase → *Actualizar*).
2. **Configuración del proyecto → Cloud Messaging → Web Push certificates** →
   genera un par de claves y copia la **VAPID key**.
   - Pégala en `src/Kroma/utils/kromaFCM.js` (constante `VAPID_KEY`).
3. Pega tu `firebaseConfig` también en `public/firebase-messaging-sw.js`.
4. Despliega las funciones:
   ```bash
   cd functions && npm install && cd ..
   firebase deploy --only functions
   ```

---

## 7. Estructura del proyecto

```
kroma-standalone/
├── index.html
├── package.json
├── vite.config.js            · alias @ → src
├── tailwind.config.js
├── firebase.json             · hosting + rules + functions
├── firestore.rules           · seguridad (usuario autenticado sobre kroma_*)
├── firestore.indexes.json
├── public/
│   ├── icon.svg
│   └── firebase-messaging-sw.js   · SW para push (opcional)
├── functions/                · Cloud Functions opcionales (notificaciones)
│   ├── index.js
│   └── handlers/
│       ├── kromaNotifications.js  · push de temporizadores de producción
│       └── kromaTriggers.js       · avisos de despacho (notif interna)
└── src/
    ├── main.jsx
    ├── App.jsx               · login (Firebase Auth) → KromaShell
    ├── index.css
    ├── Firebase/config.js    · ⚙️ TU configuración de Firebase
    └── Kroma/                · toda la aplicación KROMA
        ├── KromaShell.jsx    · navegación y enrutamiento de módulos
        ├── KromaContext.jsx  · usuario operativo, rol y permisos
        ├── KromaUserSelect.jsx
        ├── pages/            · admin / operator / manager
        └── utils/
```

## 8. Modelo de datos (Firestore)

Todas las colecciones usan el prefijo `kroma_`:

| Colección | Contenido |
|---|---|
| `kroma_users` | Usuarios operativos (rol + permisos + PIN/biometría) |
| `kroma_products` | Catálogo de productos terminados |
| `kroma_materials` | Maestro de materiales (insumos, empaques) |
| `kroma_suppliers` | Proveedores |
| `kroma_recipes` / `kroma_processes` / `kroma_fichas` | Recetas, procesos y fichas |
| `kroma_milk_reception` | Recepciones de leche |
| `kroma_inventory_materials` / `kroma_inventory_pt` | Inventarios (insumos / producto terminado) |
| `kroma_warehouses` / `kroma_warehouse_movements` | Almacenes y movimientos |
| `kroma_production_logs` | Planillas de producción |
| `kroma_despachos` | Despachos |
| `kroma_almacenes_destino` / `kroma_inventario_destino` | Depósito de destino (recibe los despachos) |
| `kroma_notifications` / `kroma_alerts` / `kroma_scheduled_notifs` | Notificaciones |
| `kroma_settings` / `kroma_config` / `kroma_fixed_costs` | Configuración y costos |

> **Regla universal del sistema:** los registros no se borran físicamente; se
> marcan `active: false` (soft-delete).

## 9. Roles y permisos

Los roles operativos viven en `kroma_users` y se gestionan **dentro** de la app
(módulo *Control del Sistema* / *Usuarios*): `master` (superusuario),
`kroma_admin`, `kroma_gerencial`, `kroma_operario`. El rol define la pantalla de
inicio y qué módulos ve cada quien; los permisos finos (editar/eliminar por
módulo) son configurables por usuario.

A nivel de Firestore, `firestore.rules` exige simplemente **usuario
autenticado** sobre las colecciones `kroma_*` (modelo de un solo inquilino). Si
quieres endurecerlo (p.ej. restringir borrados al rol master a nivel de
servidor), añade funciones `getRole()` que lean de `kroma_users` en
`firestore.rules`.

---

## 10. Convertir esto en tu propio repositorio Git

Esta carpeta es autónoma. Para que tu equipo la tenga en su propio repositorio:

```bash
cd kroma-standalone
rm -rf .git            # por si acaso arrastró algo
git init
git add .
git commit -m "KROMA ERP — versión inicial independiente"
# luego conéctalo al repositorio remoto de tu equipo:
git remote add origin <URL_DE_TU_REPO>
git push -u origin main
```

A partir de ahí es un proyecto 100% independiente: tu equipo de programación
puede evolucionarlo sin ninguna atadura a otros sistemas.
