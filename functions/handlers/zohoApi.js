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
 * `maxPages` (tope de seguridad). Devuelve la lista cruda de Zoho.
 */
async function listAllInvoices({ accessToken, organizationId, dataCenter, maxPages = 25, perPage = 200, modifiedAfter }) {
    const all = [];
    for (let page = 1; page <= maxPages; page++) {
        const { invoices, hasMore } = await listInvoicesPage({ accessToken, organizationId, dataCenter, page, perPage, modifiedAfter });
        all.push(...invoices);
        if (!hasMore || invoices.length === 0) break;
    }
    return all;
}

module.exports = { getAccessToken, listInvoicesPage, listAllInvoices };
