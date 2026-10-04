// RUTA: functions/handlers/zohoApi.js
//
// Cliente mínimo de la API de Zoho Books v3 para la CONCILIACIÓN bajo demanda
// (GK consulta a Zoho el estado real de las facturas). Usa OAuth 2.0 con
// refresh_token (self-client): se refresca un access_token de corta vida en cada
// corrida y se pagina el listado de facturas de la organización.
//
// Credenciales (settings/zohoApiCreds, solo lee el Admin SDK): { clientId,
// clientSecret, refreshToken, dataCenter }. El data center define el dominio de
// Zoho (com / eu / in / com.au / jp / ca / sa) — Venezuela suele ser 'com'.

const axios = require('axios');

// Dominios por data center de Zoho. accounts.* para OAuth, zohoapis.* para la API.
const DC = {
    com:    { accounts: 'https://accounts.zoho.com',    api: 'https://www.zohoapis.com' },
    eu:     { accounts: 'https://accounts.zoho.eu',     api: 'https://www.zohoapis.eu' },
    in:     { accounts: 'https://accounts.zoho.in',     api: 'https://www.zohoapis.in' },
    'com.au': { accounts: 'https://accounts.zoho.com.au', api: 'https://www.zohoapis.com.au' },
    jp:     { accounts: 'https://accounts.zoho.jp',     api: 'https://www.zohoapis.jp' },
    ca:     { accounts: 'https://accounts.zohocloud.ca', api: 'https://www.zohoapis.ca' },
    sa:     { accounts: 'https://accounts.zoho.sa',     api: 'https://www.zohoapis.sa' },
};

function dcUrls(dataCenter) {
    return DC[(dataCenter || 'com').toLowerCase()] || DC.com;
}

/**
 * Refresca un access_token a partir del refresh_token (grant_type=refresh_token).
 * @returns {Promise<string>} access_token
 */
async function getAccessToken({ clientId, clientSecret, refreshToken, dataCenter }) {
    if (!clientId || !clientSecret || !refreshToken) {
        throw new Error('Faltan credenciales de Zoho (clientId, clientSecret o refreshToken).');
    }
    const { accounts } = dcUrls(dataCenter);
    const res = await axios.post(`${accounts}/oauth/v2/token`, null, {
        params: {
            refresh_token: refreshToken,
            client_id:     clientId,
            client_secret: clientSecret,
            grant_type:    'refresh_token',
        },
        timeout: 20000,
    });
    const token = res.data?.access_token;
    if (!token) {
        const err = res.data?.error || 'sin access_token en la respuesta';
        throw new Error(`Zoho no devolvió access_token: ${err}`);
    }
    return token;
}

/**
 * Trae UNA página del listado de facturas de la organización. El listado NO
 * incluye line_items (para eso está el detalle), pero sí estado, fechas, total,
 * cliente y salesperson — suficiente para conciliar el estado de cobro.
 * @returns {Promise<{invoices: Array, hasMore: boolean}>}
 */
async function listInvoicesPage({ accessToken, organizationId, dataCenter, page, perPage = 200, modifiedAfter }) {
    const { api } = dcUrls(dataCenter);
    const params = {
        organization_id: organizationId,
        page,
        per_page: perPage,
        sort_column: 'date',
        sort_order: 'D',
    };
    if (modifiedAfter) params.last_modified_time = modifiedAfter;
    const res = await axios.get(`${api}/books/v3/invoices`, {
        params,
        headers: { Authorization: `Zoho-oauthtoken ${accessToken}` },
        timeout: 30000,
    });
    return {
        invoices: Array.isArray(res.data?.invoices) ? res.data.invoices : [],
        hasMore:  res.data?.page_context?.has_more_page === true,
    };
}

/**
 * Trae TODAS las facturas de la organización, paginando hasta agotar o hasta
 * `maxPages` (tope de seguridad). `complete` indica si se agotó el listado (true)
 * o se cortó por `maxPages` (false) — importante para NO marcar facturas como
 * ausentes si el barrido quedó incompleto.
 * @returns {Promise<{invoices: Array, complete: boolean}>}
 */
async function listAllInvoices({ accessToken, organizationId, dataCenter, maxPages = 40, perPage = 200, modifiedAfter }) {
    const all = [];
    let complete = true;
    for (let page = 1; page <= maxPages; page++) {
        const { invoices, hasMore } = await listInvoicesPage({ accessToken, organizationId, dataCenter, page, perPage, modifiedAfter });
        all.push(...invoices);
        if (!hasMore || invoices.length === 0) { complete = true; break; }
        if (page === maxPages && hasMore) complete = false; // se cortó por el tope
    }
    return { invoices: all, complete };
}

/**
 * Trae UNA página de FACTURAS DE PROVEEDOR (bills) = cuentas por PAGAR.
 * Requiere el scope `ZohoBooks.bills.READ` en el Self Client: sin él Zoho
 * responde 401 y la sincronización lo reporta como "falta autorizar".
 */
async function listBillsPage({ accessToken, organizationId, dataCenter, page, perPage = 200, filterBy }) {
    const { api } = dcUrls(dataCenter);
    const params = { organization_id: organizationId, page, per_page: perPage, sort_column: 'date', sort_order: 'D' };
    if (filterBy) params.filter_by = filterBy;
    const res = await axios.get(`${api}/books/v3/bills`, {
        params,
        headers: { Authorization: `Zoho-oauthtoken ${accessToken}` },
        timeout: 30000,
    });
    // Zoho puede responder 200 con un código de error en el cuerpo (p.ej. sin
    // permiso) y sin la lista: eso NO es "cero facturas", es un error, y se
    // lanza con el mensaje de Zoho para que se vea en pantalla.
    if (res.data && res.data.code != null && Number(res.data.code) !== 0) {
        const err = new Error(`Zoho (código ${res.data.code}): ${res.data.message || 'error sin mensaje'}`);
        err.zohoCode = res.data.code;
        throw err;
    }
    if (!Array.isArray(res.data?.bills)) {
        throw new Error(`Zoho respondió sin lista de facturas de proveedor (claves: ${Object.keys(res.data || {}).join(', ') || 'ninguna'})`);
    }
    return {
        bills:   res.data.bills,
        hasMore: res.data?.page_context?.has_more_page === true,
    };
}

/** Todas las facturas de proveedor, paginando. `complete` = se agotó el listado. */
async function listAllBills({ accessToken, organizationId, dataCenter, maxPages = 20, perPage = 200, filterBy }) {
    const all = [];
    let complete = true;
    for (let page = 1; page <= maxPages; page++) {
        const { bills, hasMore } = await listBillsPage({ accessToken, organizationId, dataCenter, page, perPage, filterBy });
        all.push(...bills);
        if (!hasMore || bills.length === 0) { complete = true; break; }
        if (page === maxPages && hasMore) complete = false;
    }
    return { bills: all, complete };
}

/**
 * Trae el DETALLE de una factura (incluye line_items, que el listado NO trae).
 * Se usa para rellenar las unidades de facturas que entraron por conciliación.
 * @returns {Promise<object|null>} el objeto invoice con line_items, o null.
 */
async function getInvoiceDetail({ accessToken, organizationId, dataCenter, invoiceId }) {
    const { api } = dcUrls(dataCenter);
    const res = await axios.get(`${api}/books/v3/invoices/${invoiceId}`, {
        params: { organization_id: organizationId },
        headers: { Authorization: `Zoho-oauthtoken ${accessToken}` },
        timeout: 20000,
    });
    return res.data?.invoice || null;
}

/**
 * Busca UNA factura por su NÚMERO ("INV-001737") y devuelve su `invoice_id` de
 * Zoho. El documento de GK se identifica por el número, no por el id interno de
 * Zoho, así que hace falta este puente para pedir el detalle de una sola factura.
 * @returns {Promise<string|null>} invoice_id, o null si no existe.
 */
async function findInvoiceIdByNumber({ accessToken, organizationId, dataCenter, invoiceNumber }) {
    const { api } = dcUrls(dataCenter);
    const res = await axios.get(`${api}/books/v3/invoices`, {
        params: { organization_id: organizationId, invoice_number: invoiceNumber, per_page: 5 },
        headers: { Authorization: `Zoho-oauthtoken ${accessToken}` },
        timeout: 20000,
    });
    const list = Array.isArray(res.data?.invoices) ? res.data.invoices : [];
    const exacta = list.find(i => String(i.invoice_number).trim() === String(invoiceNumber).trim());
    return (exacta || list[0])?.invoice_id ? String((exacta || list[0]).invoice_id) : null;
}

/**
 * Trae el DETALLE de un CONTACTO (cliente) de Zoho Books — incluye company_name,
 * tax_reg_no, custom_fields y la dirección fiscal, de donde se extrae el RIF.
 * El RIF es la identidad REAL de la razón social (varias sucursales = varios
 * contactos con el MISMO RIF). Se cachea por contactId en el llamador.
 * @returns {Promise<object|null>} el objeto contact, o null.
 */
async function getContactDetail({ accessToken, organizationId, dataCenter, contactId }) {
    const { api } = dcUrls(dataCenter);
    const res = await axios.get(`${api}/books/v3/contacts/${contactId}`, {
        params: { organization_id: organizationId },
        headers: { Authorization: `Zoho-oauthtoken ${accessToken}` },
        timeout: 20000,
    });
    return res.data?.contact || null;
}

/**
 * Intercambia el CÓDIGO de autorización (Generate Code del Self Client) por un
 * refresh_token permanente. Para Self Client no se requiere redirect_uri.
 * @returns {Promise<string>} refresh_token
 */
async function exchangeCode({ clientId, clientSecret, code, dataCenter }) {
    if (!clientId || !clientSecret || !code) {
        throw new Error('Faltan clientId, clientSecret o code.');
    }
    const { accounts } = dcUrls(dataCenter);
    const res = await axios.post(`${accounts}/oauth/v2/token`, null, {
        params: {
            grant_type:    'authorization_code',
            client_id:     clientId,
            client_secret: clientSecret,
            code,
        },
        timeout: 20000,
    });
    const refreshToken = res.data?.refresh_token;
    if (!refreshToken) {
        const err = res.data?.error || 'Zoho no devolvió refresh_token (¿el código ya expiró o se usó?).';
        throw new Error(err);
    }
    return refreshToken;
}


/**
 * Lista el CATÁLOGO de artículos de Zoho Books. Una factura se arma con los
 * ítems de Zoho (cada uno con su `item_id`), así que GK necesita esta lista para
 * que el vendedor elija producto sin escribir nada a mano.
 * @returns {Promise<Array>} artículos activos
 */
async function listItems({ accessToken, organizationId, dataCenter, perPage = 200 }) {
    const { api } = dcUrls(dataCenter);
    const todos = [];
    for (let page = 1; page <= 10; page++) {
        const res = await axios.get(`${api}/books/v3/items`, {
            params: { organization_id: organizationId, page, per_page: perPage },
            headers: { Authorization: `Zoho-oauthtoken ${accessToken}` },
            timeout: 30000,
        });
        const lote = Array.isArray(res.data?.items) ? res.data.items : [];
        todos.push(...lote);
        if (!res.data?.page_context?.has_more_page || lote.length === 0) break;
    }
    return todos;
}

/**
 * CREA una factura en Zoho Books. Requiere que el self-client tenga permiso de
 * ESCRITURA (ZohoBooks.invoices.CREATE): con el token de solo lectura Zoho
 * responde 401/"not authorized".
 *
 * @param {object} invoice  payload de Zoho: { customer_id, date, line_items:[...], ... }
 * @param {boolean} enviar  true = la deja EMITIDA (sent); false = borrador
 * @returns {Promise<object>} la factura creada, tal como la devuelve Zoho
 */
async function createInvoice({ accessToken, organizationId, dataCenter, invoice, enviar = false }) {
    const { api } = dcUrls(dataCenter);
    const res = await axios.post(`${api}/books/v3/invoices`, invoice, {
        params: { organization_id: organizationId },
        headers: { Authorization: `Zoho-oauthtoken ${accessToken}`, 'Content-Type': 'application/json' },
        timeout: 30000,
    });
    const creada = res.data?.invoice;
    if (!creada) throw new Error('Zoho no devolvió la factura creada.');

    // Zoho crea en BORRADOR por defecto. Para dejarla emitida hay que marcarla.
    if (enviar && creada.invoice_id) {
        try {
            await axios.post(`${api}/books/v3/invoices/${creada.invoice_id}/status/sent`, null, {
                params: { organization_id: organizationId },
                headers: { Authorization: `Zoho-oauthtoken ${accessToken}` },
                timeout: 20000,
            });
            creada.status = 'sent';
        } catch (e) {
            // La factura YA existe; solo no se pudo cambiar el estado.
            creada._avisoEstado = e.response?.data?.message || e.message;
        }
    }
    return creada;
}

/**
 * Trae TODOS los CLIENTES (contactos tipo customer) de Zoho Books, paginando.
 * Sirve para que la lista de razones sociales de GK tenga también a los
 * clientes que todavía no tienen facturas (recién creados en Zoho).
 * Requiere el scope `ZohoBooks.contacts.READ`: sin él Zoho responde 401.
 */
async function listAllContacts({ accessToken, organizationId, dataCenter, maxPages = 20, perPage = 200 }) {
    const { api } = dcUrls(dataCenter);
    const all = [];
    let complete = true;
    for (let page = 1; page <= maxPages; page++) {
        const res = await axios.get(`${api}/books/v3/contacts`, {
            params: { organization_id: organizationId, contact_type: 'customer', page, per_page: perPage },
            headers: { Authorization: `Zoho-oauthtoken ${accessToken}` },
            timeout: 30000,
        });
        const contacts = Array.isArray(res.data?.contacts) ? res.data.contacts : [];
        all.push(...contacts);
        const hasMore = res.data?.page_context?.has_more_page === true;
        if (!hasMore || contacts.length === 0) { complete = true; break; }
        if (page === maxPages && hasMore) complete = false;
    }
    return { contacts: all, complete };
}

/**
 * Categoría de cuentas por pagar de una ficha de proveedor: campo personalizado
 * "Categoría CxP" (api_name `cf_categor_a_cxp`), que Zoho entrega como clave
 * `cf_categor_a_cxp` en el LISTADO de contactos (verificado contra el listado
 * real de Lacteoca). Vacío = proveedor.
 *   "Proveedor" → 'proveedor' · "Personal - nómina" → 'nomina' · "Personal - destajo" → 'destajo'
 */
function categoriaCxP(contacto) {
    const crudo = String(contacto?.cf_categor_a_cxp_unformatted ?? contacto?.cf_categor_a_cxp ?? '')
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
    if (crudo.includes('nomina')) return 'nomina';
    if (crudo.includes('destajo')) return 'destajo';
    return 'proveedor';
}

/**
 * TODAS las fichas de PROVEEDOR de Zoho, con su saldo (`outstanding_payable_amount`
 * y `unused_credits_payable_amount`) y su categoría de cuentas por pagar. Sirve
 * para clasificar cada factura de proveedor (por `vendor_id`) y como control
 * cruzado contra el listado de bills.
 */
async function listVendorBalances({ accessToken, organizationId, dataCenter, maxPages = 10, perPage = 200 }) {
    const { api } = dcUrls(dataCenter);
    const all = [];
    for (let page = 1; page <= maxPages; page++) {
        const res = await axios.get(`${api}/books/v3/contacts`, {
            params: { organization_id: organizationId, contact_type: 'vendor', page, per_page: perPage },
            headers: { Authorization: `Zoho-oauthtoken ${accessToken}` },
            timeout: 30000,
        });
        if (res.data && res.data.code != null && Number(res.data.code) !== 0) {
            throw new Error(`Zoho (código ${res.data.code}): ${res.data.message || 'error sin mensaje'}`);
        }
        const contacts = Array.isArray(res.data?.contacts) ? res.data.contacts : [];
        all.push(...contacts);
        if (res.data?.page_context?.has_more_page !== true || contacts.length === 0) break;
    }
    return all.map(c => ({
        vendorId: c.contact_id != null ? String(c.contact_id) : null,
        nombre: c.contact_name || c.vendor_name || '—',
        porPagar: Number(c.outstanding_payable_amount) || 0,
        creditos: Number(c.unused_credits_payable_amount) || 0,
        categoria: categoriaCxP(c),
    }));
}

/**
 * Perfiles de FACTURAS DE PROVEEDOR RECURRENTES (GET /recurringbills): la
 * nómina se emite sola el 15 y el 30. Se usa para anunciar la próxima quincena.
 * Los nombres de campo de la respuesta no están verificados contra un payload
 * real de Lacteoca: quien llama lee con respaldos y guarda las claves que vio.
 */
async function listRecurringBills({ accessToken, organizationId, dataCenter, maxPages = 5, perPage = 200 }) {
    const { api } = dcUrls(dataCenter);
    const all = [];
    for (let page = 1; page <= maxPages; page++) {
        const res = await axios.get(`${api}/books/v3/recurringbills`, {
            params: { organization_id: organizationId, page, per_page: perPage },
            headers: { Authorization: `Zoho-oauthtoken ${accessToken}` },
            timeout: 30000,
        });
        if (res.data && res.data.code != null && Number(res.data.code) !== 0) {
            const err = new Error(`Zoho (código ${res.data.code}): ${res.data.message || 'error sin mensaje'}`);
            err.zohoCode = res.data.code;
            throw err;
        }
        const lista = Array.isArray(res.data?.recurring_bills) ? res.data.recurring_bills
            : Array.isArray(res.data?.recurringbills) ? res.data.recurringbills : null;
        if (!lista) throw new Error(`Zoho respondió sin lista de facturas recurrentes (claves: ${Object.keys(res.data || {}).join(', ') || 'ninguna'})`);
        all.push(...lista);
        if (res.data?.page_context?.has_more_page !== true || lista.length === 0) break;
    }
    return all;
}

/**
 * Saldo de UNA cuenta del plan de cuentas, buscada por código (p.ej. la nómina
 * por pagar 2.1.1.04.01). GET /chartofaccounts?showbalance=true. Probablemente
 * requiere ZohoBooks.accountants.READ: si Zoho lo rechaza, se lanza con su
 * mensaje y quien llama lo declara en pantalla.
 * @returns {Promise<{encontrada:boolean, nombre?:string, codigo?:string, saldo?:number}>}
 */
async function getAccountBalanceByCode({ accessToken, organizationId, dataCenter, codigo }) {
    const { api } = dcUrls(dataCenter);
    for (let page = 1; page <= 10; page++) {
        const res = await axios.get(`${api}/books/v3/chartofaccounts`, {
            params: { organization_id: organizationId, showbalance: true, page, per_page: 200 },
            headers: { Authorization: `Zoho-oauthtoken ${accessToken}` },
            timeout: 30000,
        });
        if (res.data && res.data.code != null && Number(res.data.code) !== 0) {
            throw new Error(`Zoho (código ${res.data.code}): ${res.data.message || 'error sin mensaje'}`);
        }
        const cuentas = Array.isArray(res.data?.chartofaccounts) ? res.data.chartofaccounts : [];
        const c = cuentas.find(a => String(a.account_code || '').trim() === codigo);
        if (c) {
            const saldo = Number(c.current_balance ?? c.balance ?? c.closing_balance);
            return { encontrada: true, nombre: c.account_name || '', codigo, saldo: Number.isFinite(saldo) ? saldo : null };
        }
        if (res.data?.page_context?.has_more_page !== true || cuentas.length === 0) break;
    }
    return { encontrada: false, codigo };
}

module.exports = { categoriaCxP, listRecurringBills, getAccountBalanceByCode, listVendorBalances, getAccessToken, listInvoicesPage, listAllInvoices, listBillsPage, listAllBills, getInvoiceDetail, findInvoiceIdByNumber, getContactDetail, listAllContacts, exchangeCode, listItems, createInvoice };
