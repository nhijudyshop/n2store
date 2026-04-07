// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | Read these files before coding, update dev-log after changes.
// =====================================================
// TPOS CLIENT — Token manager + Tag operations
// Used by /api/tpos/empty-cart-sync endpoint
// =====================================================

const PROXY_BASE = 'https://chatomni-proxy.nhijudyshop.workers.dev';
const TOKEN_URL = `${PROXY_BASE}/api/token`;
const ASSIGN_TAG_URL = `${PROXY_BASE}/api/odata/TagSaleOnlineOrder/ODataService.AssignTag`;
const TAG_QUERY_URL = `${PROXY_BASE}/api/odata/Tag`;

const GIO_TRONG_NAME = 'GIỎ TRỐNG';
const GIO_TRONG_NAME_UPPER = GIO_TRONG_NAME.toUpperCase();

// =====================================================
// TOKEN MANAGER
// =====================================================

let _token = null;
let _tokenExpiry = null;
let _refreshPromise = null;

async function getToken() {
    if (_token && _tokenExpiry && Date.now() < _tokenExpiry) {
        return _token;
    }
    if (_refreshPromise) return _refreshPromise;

    _refreshPromise = _fetchNewToken();
    try {
        return await _refreshPromise;
    } finally {
        _refreshPromise = null;
    }
}

async function _fetchNewToken() {
    const username = process.env.TPOS_USERNAME;
    const password = process.env.TPOS_PASSWORD;
    const clientId = process.env.TPOS_CLIENT_ID || 'tmtWebApp';

    if (!username || !password) {
        throw new Error('TPOS credentials not configured (TPOS_USERNAME, TPOS_PASSWORD)');
    }

    console.log('[TPOS] Fetching new token...');
    const body = new URLSearchParams({
        grant_type: 'password',
        username,
        password,
        client_id: clientId
    });

    const res = await fetch(TOKEN_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: body.toString()
    });

    if (!res.ok) {
        const text = await res.text().catch(() => '');
        throw new Error(`TPOS token request failed: ${res.status} ${text}`);
    }

    const data = await res.json();
    if (!data.access_token) throw new Error('No access_token in TPOS response');

    _token = data.access_token;
    const expiresInSec = data.expires_in || 3600;
    _tokenExpiry = Date.now() + (expiresInSec - 300) * 1000; // 5 min buffer
    console.log(`[TPOS] ✅ Token cached (expires in ${expiresInSec}s)`);
    return _token;
}

async function _authedFetch(url, opts = {}, retried = false) {
    const token = await getToken();
    const res = await fetch(url, {
        ...opts,
        headers: {
            ...(opts.headers || {}),
            'Authorization': `Bearer ${token}`
        }
    });
    if (res.status === 401 && !retried) {
        console.log('[TPOS] 401 → forcing token refresh');
        _token = null;
        _tokenExpiry = null;
        return _authedFetch(url, opts, true);
    }
    return res;
}

// =====================================================
// GIỎ TRỐNG TAG CACHE
// =====================================================

let _gioTrongTag = null; // {Id, Name, Color}

async function getGioTrongTag() {
    if (_gioTrongTag) return _gioTrongTag;

    // Query by exact name via OData $filter (same pattern as client tag-sync)
    const escapedName = GIO_TRONG_NAME.replace(/'/g, "''");
    const filter = encodeURIComponent(`Name eq '${escapedName}'`);
    const url = `${TAG_QUERY_URL}?$format=json&$filter=${filter}&$top=5`;
    const res = await _authedFetch(url, {
        headers: { 'Accept': 'application/json' }
    });

    if (!res.ok) throw new Error(`Tag query failed: ${res.status}`);
    const data = await res.json();
    const list = Array.isArray(data?.value) ? data.value : [];
    const found = list.find(t => String(t.Name || '').toUpperCase() === GIO_TRONG_NAME_UPPER) || list[0];

    if (!found) {
        throw new Error(`Tag "${GIO_TRONG_NAME}" not found in TPOS — please create it manually first`);
    }

    _gioTrongTag = { Id: found.Id, Name: found.Name, Color: found.Color || '#000000' };
    console.log(`[TPOS] ✅ GIỎ TRỐNG tag cached: Id=${_gioTrongTag.Id}`);
    return _gioTrongTag;
}

// =====================================================
// ASSIGN TAG
// =====================================================

/**
 * Call TPOS AssignTag API.
 * @param {string} orderId TPOS order GUID
 * @param {Array<{Id,Name,Color}>} tagObjects Final tag list (FULL replacement)
 */
async function assignTag(orderId, tagObjects) {
    const payload = {
        Tags: tagObjects.map(t => ({ Id: t.Id, Color: t.Color, Name: t.Name })),
        OrderId: orderId
    };
    const res = await _authedFetch(ASSIGN_TAG_URL, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json'
        },
        body: JSON.stringify(payload)
    });
    if (!res.ok) {
        const text = await res.text().catch(() => '');
        throw new Error(`AssignTag HTTP ${res.status}: ${text.substring(0, 200)}`);
    }
    return true;
}

module.exports = {
    getToken,
    getGioTrongTag,
    assignTag,
    GIO_TRONG_NAME_UPPER
};
