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

// Parent category tag (Cat 3 — KHÔNG CẦN CHỐT). When server adds GIỎ TRỐNG,
// it also adds this parent so the XL Cat 3 mapping stays consistent with TPOS.
const KHONG_CAN_CHOT_NAME = 'KHÔNG CẦN CHỐT';
const KHONG_CAN_CHOT_NAME_UPPER = KHONG_CAN_CHOT_NAME.toUpperCase();

// Subtag DA_GOP_KHONG_CHOT also belongs to Cat 3 → if user has this on TPOS,
// removing the parent would orphan it. Server checks for this name when removing.
const DA_GOP_KHONG_CHOT_NAME_UPPER = 'ĐÃ GỘP KO CHỐT';

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
// TAG CACHE (GIỎ TRỐNG + KHÔNG CẦN CHỐT)
// =====================================================

const _tagCache = new Map(); // upperName → {Id, Name, Color}

async function _findTagByName(displayName) {
    const upperName = displayName.toUpperCase();
    if (_tagCache.has(upperName)) return _tagCache.get(upperName);

    const escapedName = displayName.replace(/'/g, "''");
    const filter = encodeURIComponent(`Name eq '${escapedName}'`);
    const url = `${TAG_QUERY_URL}?$format=json&$filter=${filter}&$top=5`;
    const res = await _authedFetch(url, {
        headers: { 'Accept': 'application/json' }
    });

    if (!res.ok) throw new Error(`Tag query failed for "${displayName}": ${res.status}`);
    const data = await res.json();
    const list = Array.isArray(data?.value) ? data.value : [];
    const found = list.find(t => String(t.Name || '').toUpperCase() === upperName) || list[0];

    if (!found) {
        throw new Error(`Tag "${displayName}" not found in TPOS — please create it manually first`);
    }

    const tag = { Id: found.Id, Name: found.Name, Color: found.Color || '#000000' };
    _tagCache.set(upperName, tag);
    console.log(`[TPOS] ✅ Tag cached: ${tag.Name} Id=${tag.Id}`);
    return tag;
}

async function getGioTrongTag() {
    return _findTagByName(GIO_TRONG_NAME);
}

async function getKhongCanChotTag() {
    return _findTagByName(KHONG_CAN_CHOT_NAME);
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
    getKhongCanChotTag,
    assignTag,
    GIO_TRONG_NAME_UPPER,
    KHONG_CAN_CHOT_NAME_UPPER,
    DA_GOP_KHONG_CHOT_NAME_UPPER
};
