// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | Read these files before coding, update dev-log after changes.
// =====================================================
// FACEBOOK ADS MANAGER API PROXY
// Proxies requests to Facebook Marketing API v21.0
// Token stored server-side for security
// =====================================================

const express = require('express');
const router = express.Router();

const FB_GRAPH_URL = 'https://graph.facebook.com/v21.0';
const FB_APP_ID = process.env.FB_APP_ID;
const FB_APP_SECRET = process.env.FB_APP_SECRET;

// Token storage — in-memory cache backed by PostgreSQL
let fbTokenStore = {
    accessToken: null,
    expiresAt: null,
    userId: null,
    name: null
};

// DB persistence — multi-account token storage
let _tableCreated = false;

async function ensureTable(db) {
    if (_tableCreated || !db) return;
    try {
        await db.query(`
            CREATE TABLE IF NOT EXISTS fb_ads_tokens (
                user_id TEXT PRIMARY KEY,
                access_token TEXT NOT NULL,
                expires_at BIGINT,
                name TEXT,
                updated_at TIMESTAMP DEFAULT NOW()
            )
        `);
        _tableCreated = true;
    } catch (e) { /* ignore */ }
}

async function saveTokenToDB(req) {
    try {
        const db = req.app.locals.chatDb;
        if (!db) return;
        await ensureTable(db);
        await db.query(`
            INSERT INTO fb_ads_tokens (user_id, access_token, expires_at, name, updated_at)
            VALUES ($1, $2, $3, $4, NOW())
            ON CONFLICT (user_id) DO UPDATE SET
                access_token = EXCLUDED.access_token,
                expires_at = EXCLUDED.expires_at,
                name = EXCLUDED.name,
                updated_at = NOW()
        `, [fbTokenStore.userId, fbTokenStore.accessToken, fbTokenStore.expiresAt, fbTokenStore.name]);
        console.log(`[FB-ADS] Token saved to DB for ${fbTokenStore.name}`);
    } catch (e) {
        console.log('[FB-ADS] Could not save token to DB:', e.message);
    }
}

async function loadTokenFromDB(req, userId) {
    try {
        const db = req.app.locals.chatDb;
        if (!db) return false;
        await ensureTable(db);

        let result;
        if (userId) {
            // Load specific user
            result = await db.query('SELECT * FROM fb_ads_tokens WHERE user_id = $1 AND expires_at > $2', [userId, Date.now()]);
        } else {
            // Load most recently updated valid token
            result = await db.query('SELECT * FROM fb_ads_tokens WHERE expires_at > $1 ORDER BY updated_at DESC LIMIT 1', [Date.now()]);
        }

        if (result.rows.length > 0) {
            const row = result.rows[0];
            fbTokenStore = {
                accessToken: row.access_token,
                expiresAt: parseInt(row.expires_at),
                userId: row.user_id,
                name: row.name
            };
            console.log(`[FB-ADS] Token loaded from DB: ${fbTokenStore.name} (expires ${new Date(fbTokenStore.expiresAt).toLocaleDateString()})`);
            return true;
        }
    } catch (e) { /* table may not exist */ }
    return false;
}

async function getAllSavedAccounts(db) {
    try {
        if (!db) return [];
        await ensureTable(db);
        const result = await db.query('SELECT user_id, name, expires_at, updated_at FROM fb_ads_tokens WHERE expires_at > $1 ORDER BY updated_at DESC', [Date.now()]);
        return result.rows;
    } catch (e) { return []; }
}

// =====================================================
// HELPER: Facebook API fetch
// =====================================================
async function fbFetch(endpoint, options = {}) {
    if (!fbTokenStore.accessToken) {
        throw new Error('Not authenticated. Please login with Facebook first.');
    }

    const url = new URL(`${FB_GRAPH_URL}${endpoint}`);

    // GET requests: append token to URL
    if (!options.method || options.method === 'GET') {
        url.searchParams.set('access_token', fbTokenStore.accessToken);
        if (options.params) {
            for (const [key, val] of Object.entries(options.params)) {
                url.searchParams.set(key, val);
            }
        }
    }

    const fetchOptions = {
        method: options.method || 'GET',
        headers: { 'Content-Type': 'application/json' }
    };

    // POST/DELETE requests: send token in body or URL
    if (options.method === 'POST') {
        const body = options.body || {};
        body.access_token = fbTokenStore.accessToken;
        fetchOptions.body = JSON.stringify(body);
    } else if (options.method === 'DELETE') {
        url.searchParams.set('access_token', fbTokenStore.accessToken);
    }

    const response = await fetch(url.toString(), fetchOptions);
    const data = await response.json();

    if (data.error) {
        // Token invalidated by FB (password change, security reset, etc.)
        if (data.error.code === 190 || (data.error.message && data.error.message.includes('validating access token'))) {
            console.error(`[FB-ADS] Token invalid for ${fbTokenStore.name}: ${data.error.message}`);
            // Mark token as expired so it won't be used again
            fbTokenStore = { accessToken: null, expiresAt: null, userId: null, name: null };
        }
        // Include full error detail for debugging
        const errMsg = data.error.error_user_msg || data.error.message;
        const err = new Error(errMsg);
        err.fbError = data.error;
        err.status = response.status;
        console.error(`[FB-ADS] API error: ${endpoint}`, JSON.stringify(data.error).substring(0, 500));
        throw err;
    }

    return data;
}

// =====================================================
// AUTH ENDPOINTS
// =====================================================

// POST /api/fb-ads/auth/token — Exchange short-lived token for long-lived
router.post('/auth/token', async (req, res) => {
    try {
        const { accessToken, userID, name } = req.body;
        if (!accessToken) {
            return res.status(400).json({ success: false, error: 'accessToken required' });
        }

        // Exchange for long-lived token (60 days)
        const url = `${FB_GRAPH_URL}/oauth/access_token?grant_type=fb_exchange_token&client_id=${FB_APP_ID}&client_secret=${FB_APP_SECRET}&fb_exchange_token=${accessToken}`;
        const response = await fetch(url);
        const data = await response.json();

        if (data.error) {
            console.error('[FB-ADS] Token exchange failed:', JSON.stringify(data.error));
            return res.status(400).json({ success: false, error: data.error.message, fbError: data.error });
        }

        fbTokenStore = {
            accessToken: data.access_token,
            expiresAt: Date.now() + (data.expires_in || 5184000) * 1000,
            userId: userID,
            name: name || 'Unknown'
        };

        // Persist to database
        await saveTokenToDB(req);

        console.log(`[FB-ADS] Authenticated as ${fbTokenStore.name} (${fbTokenStore.userId}), token expires in ${Math.round((data.expires_in || 5184000) / 86400)} days`);

        res.json({
            success: true,
            user: { id: fbTokenStore.userId, name: fbTokenStore.name },
            expiresIn: data.expires_in
        });
    } catch (error) {
        console.error('[FB-ADS] Token exchange error:', error.message);
        res.status(500).json({ success: false, error: error.message });
    }
});

// GET /api/fb-ads/auth/status — Check if authenticated (validates token with FB)
router.get('/auth/status', async (req, res) => {
    // If memory empty, try load from DB (e.g. after server restart)
    if (!fbTokenStore.accessToken) {
        await loadTokenFromDB(req);
    }

    if (fbTokenStore.accessToken && Date.now() < (fbTokenStore.expiresAt || 0)) {
        // Quick validate token with FB
        try {
            const checkUrl = `${FB_GRAPH_URL}/me?fields=id,name&access_token=${fbTokenStore.accessToken}`;
            const checkRes = await fetch(checkUrl);
            const checkData = await checkRes.json();
            if (checkData.error) {
                // Token invalidated — don't delete, tell frontend to auto-refresh
                console.log(`[FB-ADS] Token needs refresh for ${fbTokenStore.name}: ${checkData.error.message}`);
                return res.json({
                    success: true,
                    authenticated: false,
                    user: { id: fbTokenStore.userId, name: fbTokenStore.name },
                    needsRefresh: true
                });
            }
            return res.json({
                success: true,
                authenticated: true,
                user: { id: fbTokenStore.userId, name: checkData.name || fbTokenStore.name },
                expiresAt: fbTokenStore.expiresAt
            });
        } catch (e) {
            // Network error — assume still valid
            return res.json({
                success: true,
                authenticated: true,
                user: { id: fbTokenStore.userId, name: fbTokenStore.name },
                expiresAt: fbTokenStore.expiresAt
            });
        }
    }

    res.json({ success: true, authenticated: false, user: null });
});

// POST /api/fb-ads/auth/logout — Logout (clear memory, keep DB for re-select)
router.post('/auth/logout', async (req, res) => {
    fbTokenStore = { accessToken: null, expiresAt: null, userId: null, name: null };
    res.json({ success: true });
});

// GET /api/fb-ads/auth/saved-accounts — List all saved FB accounts
router.get('/auth/saved-accounts', async (req, res) => {
    try {
        const db = req.app.locals.chatDb;
        const accounts = await getAllSavedAccounts(db);
        res.json({
            success: true,
            data: accounts.map(a => ({
                user_id: a.user_id,
                name: a.name,
                expires_at: parseInt(a.expires_at),
                days_left: Math.max(0, Math.round((parseInt(a.expires_at) - Date.now()) / 86400000))
            }))
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// POST /api/fb-ads/auth/switch — Switch to a saved account
router.post('/auth/switch', async (req, res) => {
    try {
        const { user_id } = req.body;
        if (!user_id) return res.status(400).json({ success: false, error: 'user_id required' });

        const loaded = await loadTokenFromDB(req, user_id);
        if (!loaded) return res.status(404).json({ success: false, error: 'Account not found or token expired' });

        res.json({
            success: true,
            user: { id: fbTokenStore.userId, name: fbTokenStore.name },
            expiresAt: fbTokenStore.expiresAt
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// DELETE /api/fb-ads/auth/saved-accounts/:userId — Remove saved account
router.delete('/auth/saved-accounts/:userId', async (req, res) => {
    try {
        const db = req.app.locals.chatDb;
        if (db) await db.query('DELETE FROM fb_ads_tokens WHERE user_id = $1', [req.params.userId]);
        // If current user, clear memory too
        if (fbTokenStore.userId === req.params.userId) {
            fbTokenStore = { accessToken: null, expiresAt: null, userId: null, name: null };
        }
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// =====================================================
// AD ACCOUNTS
// =====================================================

// GET /api/fb-ads/ad-accounts — List all ad accounts
router.get('/ad-accounts', async (req, res) => {
    try {
        const data = await fbFetch('/me/adaccounts', {
            params: {
                fields: 'id,name,account_id,account_status,currency,timezone_name,amount_spent,balance,business_name',
                limit: '100'
            }
        });
        res.json({ success: true, data: data.data || [] });
    } catch (error) {
        res.status(error.status || 500).json({ success: false, error: error.message, fbError: error.fbError || null });
    }
});

// =====================================================
// CAMPAIGNS
// =====================================================

// GET /api/fb-ads/campaigns?account_id=xxx
router.get('/campaigns', async (req, res) => {
    try {
        const { account_id } = req.query;
        if (!account_id) {
            return res.status(400).json({ success: false, error: 'account_id required' });
        }

        const actId = account_id.startsWith('act_') ? account_id : `act_${account_id}`;
        const data = await fbFetch(`/${actId}/campaigns`, {
            params: {
                fields: 'id,name,status,effective_status,objective,daily_budget,lifetime_budget,budget_remaining,start_time,stop_time,created_time,updated_time',
                limit: req.query.limit || '50'
            }
        });
        res.json({ success: true, data: data.data || [], paging: data.paging });
    } catch (error) {
        res.status(error.status || 500).json({ success: false, error: error.message, fbError: error.fbError || null });
    }
});

// POST /api/fb-ads/campaigns — Create campaign (forwards all fields to FB)
router.post('/campaigns', async (req, res) => {
    try {
        const { account_id, ...body } = req.body;
        if (!account_id || !body.name || !body.objective) {
            return res.status(400).json({ success: false, error: 'account_id, name, objective required' });
        }

        const actId = account_id.startsWith('act_') ? account_id : `act_${account_id}`;
        if (!body.status) body.status = 'PAUSED';
        if (!body.special_ad_categories) body.special_ad_categories = [];

        const data = await fbFetch(`/${actId}/campaigns`, { method: 'POST', body });
        res.json({ success: true, data });
    } catch (error) {
        res.status(error.status || 500).json({ success: false, error: error.message, fbError: error.fbError || null });
    }
});

// POST /api/fb-ads/campaigns/:id/status — Update campaign status
router.post('/campaigns/:id/status', async (req, res) => {
    try {
        const { status } = req.body;
        if (!['ACTIVE', 'PAUSED', 'DELETED'].includes(status)) {
            return res.status(400).json({ success: false, error: 'Invalid status' });
        }

        const data = await fbFetch(`/${req.params.id}`, {
            method: 'POST',
            body: { status }
        });
        res.json({ success: true, data });
    } catch (error) {
        res.status(error.status || 500).json({ success: false, error: error.message, fbError: error.fbError || null });
    }
});

// DELETE /api/fb-ads/campaigns/:id
router.delete('/campaigns/:id', async (req, res) => {
    try {
        const data = await fbFetch(`/${req.params.id}`, { method: 'DELETE' });
        res.json({ success: true, data });
    } catch (error) {
        res.status(error.status || 500).json({ success: false, error: error.message, fbError: error.fbError || null });
    }
});

// =====================================================
// AD SETS
// =====================================================

// GET /api/fb-ads/adsets?campaign_id=xxx OR ?account_id=xxx
router.get('/adsets', async (req, res) => {
    try {
        const { campaign_id, account_id } = req.query;
        let endpoint;

        if (campaign_id) {
            endpoint = `/${campaign_id}/adsets`;
        } else if (account_id) {
            const actId = account_id.startsWith('act_') ? account_id : `act_${account_id}`;
            endpoint = `/${actId}/adsets`;
        } else {
            return res.status(400).json({ success: false, error: 'campaign_id or account_id required' });
        }

        const data = await fbFetch(endpoint, {
            params: {
                fields: 'id,name,status,effective_status,campaign_id,daily_budget,lifetime_budget,budget_remaining,targeting,optimization_goal,billing_event,bid_amount,start_time,end_time,created_time',
                limit: req.query.limit || '50'
            }
        });
        res.json({ success: true, data: data.data || [], paging: data.paging });
    } catch (error) {
        res.status(error.status || 500).json({ success: false, error: error.message, fbError: error.fbError || null });
    }
});

// POST /api/fb-ads/adsets — Create ad set
router.post('/adsets', async (req, res) => {
    try {
        const { account_id, ...body } = req.body;
        if (!account_id || !body.campaign_id || !body.name || !body.targeting) {
            return res.status(400).json({ success: false, error: 'account_id, campaign_id, name, targeting required' });
        }

        const actId = account_id.startsWith('act_') ? account_id : `act_${account_id}`;
        if (!body.billing_event) body.billing_event = 'IMPRESSIONS';
        if (!body.status) body.status = 'PAUSED';

        const data = await fbFetch(`/${actId}/adsets`, { method: 'POST', body });
        res.json({ success: true, data });
    } catch (error) {
        res.status(error.status || 500).json({ success: false, error: error.message, fbError: error.fbError || null });
    }
});

// POST /api/fb-ads/adsets/:id/status
router.post('/adsets/:id/status', async (req, res) => {
    try {
        const { status } = req.body;
        const data = await fbFetch(`/${req.params.id}`, { method: 'POST', body: { status } });
        res.json({ success: true, data });
    } catch (error) {
        res.status(error.status || 500).json({ success: false, error: error.message, fbError: error.fbError || null });
    }
});

// =====================================================
// ADS
// =====================================================

// GET /api/fb-ads/ads?adset_id=xxx OR ?account_id=xxx
router.get('/ads', async (req, res) => {
    try {
        const { adset_id, account_id } = req.query;
        let endpoint;

        if (adset_id) {
            endpoint = `/${adset_id}/ads`;
        } else if (account_id) {
            const actId = account_id.startsWith('act_') ? account_id : `act_${account_id}`;
            endpoint = `/${actId}/ads`;
        } else {
            return res.status(400).json({ success: false, error: 'adset_id or account_id required' });
        }

        const data = await fbFetch(endpoint, {
            params: {
                fields: 'id,name,status,effective_status,adset_id,campaign_id,creative{id,name,title,body,image_url,thumbnail_url,object_story_spec},created_time,updated_time',
                limit: req.query.limit || '50'
            }
        });
        res.json({ success: true, data: data.data || [], paging: data.paging });
    } catch (error) {
        res.status(error.status || 500).json({ success: false, error: error.message, fbError: error.fbError || null });
    }
});

// POST /api/fb-ads/ads — Create ad
router.post('/ads', async (req, res) => {
    try {
        const { account_id, ...body } = req.body;
        if (!account_id || !body.adset_id || !body.name || !body.creative) {
            return res.status(400).json({ success: false, error: 'account_id, adset_id, name, creative required' });
        }

        const actId = account_id.startsWith('act_') ? account_id : `act_${account_id}`;
        if (!body.status) body.status = 'PAUSED';

        const data = await fbFetch(`/${actId}/ads`, { method: 'POST', body });
        res.json({ success: true, data });
    } catch (error) {
        res.status(error.status || 500).json({ success: false, error: error.message, fbError: error.fbError || null });
    }
});

// POST /api/fb-ads/ads/:id/status
router.post('/ads/:id/status', async (req, res) => {
    try {
        const { status } = req.body;
        const data = await fbFetch(`/${req.params.id}`, { method: 'POST', body: { status } });
        res.json({ success: true, data });
    } catch (error) {
        res.status(error.status || 500).json({ success: false, error: error.message, fbError: error.fbError || null });
    }
});

// =====================================================
// INSIGHTS / REPORTING
// =====================================================

// GET /api/fb-ads/insights?account_id=xxx&date_preset=last_30d
router.get('/insights', async (req, res) => {
    try {
        const { account_id, campaign_id, adset_id, date_preset, time_range, level, breakdowns } = req.query;

        let endpoint;
        if (campaign_id) {
            endpoint = `/${campaign_id}/insights`;
        } else if (adset_id) {
            endpoint = `/${adset_id}/insights`;
        } else if (account_id) {
            const actId = account_id.startsWith('act_') ? account_id : `act_${account_id}`;
            endpoint = `/${actId}/insights`;
        } else {
            return res.status(400).json({ success: false, error: 'account_id, campaign_id, or adset_id required' });
        }

        const params = {
            fields: 'campaign_name,campaign_id,adset_name,adset_id,ad_name,ad_id,impressions,clicks,spend,cpc,cpm,ctr,reach,frequency,actions,cost_per_action_type,conversions,cost_per_conversion',
            date_preset: date_preset || 'last_30d',
            level: level || 'campaign',
            limit: '100'
        };

        if (time_range) {
            delete params.date_preset;
            params.time_range = time_range;
        }
        if (breakdowns) params.breakdowns = breakdowns;

        const data = await fbFetch(endpoint, { params });
        res.json({ success: true, data: data.data || [], paging: data.paging });
    } catch (error) {
        res.status(error.status || 500).json({ success: false, error: error.message, fbError: error.fbError || null });
    }
});

// =====================================================
// AD CREATIVES
// =====================================================

// GET /api/fb-ads/adcreatives?account_id=xxx
router.get('/adcreatives', async (req, res) => {
    try {
        const { account_id } = req.query;
        if (!account_id) {
            return res.status(400).json({ success: false, error: 'account_id required' });
        }

        const actId = account_id.startsWith('act_') ? account_id : `act_${account_id}`;
        const data = await fbFetch(`/${actId}/adcreatives`, {
            params: {
                fields: 'id,name,title,body,image_url,thumbnail_url,object_story_spec,status',
                limit: req.query.limit || '50'
            }
        });
        res.json({ success: true, data: data.data || [], paging: data.paging });
    } catch (error) {
        res.status(error.status || 500).json({ success: false, error: error.message, fbError: error.fbError || null });
    }
});

// =====================================================
// TARGETING OPTIONS
// =====================================================

// GET /api/fb-ads/targeting/search?q=xxx&type=adinterest
router.get('/targeting/search', async (req, res) => {
    try {
        const { q, type } = req.query;
        if (!q) {
            return res.status(400).json({ success: false, error: 'q (search query) required' });
        }

        const data = await fbFetch('/search', {
            params: {
                q,
                type: type || 'adinterest',
                limit: '50'
            }
        });
        res.json({ success: true, data: data.data || [] });
    } catch (error) {
        res.status(error.status || 500).json({ success: false, error: error.message, fbError: error.fbError || null });
    }
});

// GET /api/fb-ads/targeting/countries
router.get('/targeting/countries', async (req, res) => {
    try {
        const data = await fbFetch('/search', {
            params: { type: 'adcountry', q: req.query.q || '', limit: '100' }
        });
        res.json({ success: true, data: data.data || [] });
    } catch (error) {
        res.status(error.status || 500).json({ success: false, error: error.message, fbError: error.fbError || null });
    }
});

// =====================================================
// APP ROLES (Add/Remove Testers & Developers)
// =====================================================

// Helper: App access token (required for app roles management)
function getAppToken() {
    return `${FB_APP_ID}|${FB_APP_SECRET}`;
}

// GET /api/fb-ads/app/roles — List app roles
router.get('/app/roles', async (req, res) => {
    try {
        const url = `${FB_GRAPH_URL}/${FB_APP_ID}/roles?access_token=${encodeURIComponent(getAppToken())}&fields=user,role&limit=100`;
        const response = await fetch(url);
        const data = await response.json();
        if (data.error) return res.status(400).json({ success: false, error: data.error.message });
        res.json({ success: true, data: data.data || [] });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// POST /api/fb-ads/app/roles — Add user to app
router.post('/app/roles', async (req, res) => {
    try {
        let { user_id, role } = req.body;
        if (!user_id || !role) {
            return res.status(400).json({ success: false, error: 'user_id and role required' });
        }
        if (!['administrators', 'developers', 'testers', 'insights users'].includes(role)) {
            return res.status(400).json({ success: false, error: 'Invalid role. Use: administrators, developers, testers, insights users' });
        }

        // Auto-resolve Facebook profile URL to user ID
        if (user_id.includes('facebook.com') || user_id.includes('fb.com') || (isNaN(user_id) && !user_id.match(/^\d+$/))) {
            const resolvedId = await resolveFbProfileToId(user_id);
            if (!resolvedId) {
                return res.status(400).json({ success: false, error: 'Không tìm được User ID từ link/username. Thử dùng findmyfbid.in' });
            }
            user_id = resolvedId;
        }

        // FB Graph API requires form-urlencoded for roles
        const params = new URLSearchParams();
        params.append('user', user_id);
        params.append('role', role);
        params.append('access_token', getAppToken());

        const url = `${FB_GRAPH_URL}/${FB_APP_ID}/roles`;
        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: params.toString()
        });
        const data = await response.json();
        if (data.error) return res.status(400).json({ success: false, error: data.error.message });
        res.json({ success: true, data, resolved_user_id: user_id });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Helper: resolve FB profile URL/username to numeric user ID
async function resolveFbProfileToId(input) {
    try {
        // Extract username from URL
        let username = input.trim();
        username = username.replace(/\/$/, ''); // trailing slash
        if (username.includes('facebook.com') || username.includes('fb.com')) {
            const parts = username.split('/');
            username = parts[parts.length - 1];
            // Remove query params
            username = username.split('?')[0];
        }
        if (!username) return null;

        // Try Graph API lookup with app token
        const url = `${FB_GRAPH_URL}/${encodeURIComponent(username)}?fields=id,name&access_token=${encodeURIComponent(getAppToken())}`;
        const response = await fetch(url);
        const data = await response.json();
        if (data.id) {
            console.log(`[FB-ADS] Resolved "${input}" → ${data.id} (${data.name})`);
            return data.id;
        }
    } catch (e) {
        console.log('[FB-ADS] Could not resolve FB profile:', e.message);
    }
    return null;
}

// DELETE /api/fb-ads/app/roles/:userId — Remove user from app
router.delete('/app/roles/:userId', async (req, res) => {
    try {
        const url = `${FB_GRAPH_URL}/${FB_APP_ID}/roles?user=${req.params.userId}&access_token=${encodeURIComponent(getAppToken())}`;
        const response = await fetch(url, { method: 'DELETE' });
        const data = await response.json();
        if (data.error) return res.status(400).json({ success: false, error: data.error.message });
        res.json({ success: true, data });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// =====================================================
// PAGES (for Ad creation)
// =====================================================

// GET /api/fb-ads/pages — List user's Facebook Pages
router.get('/pages', async (req, res) => {
    try {
        const data = await fbFetch('/me/accounts', {
            params: {
                fields: 'id,name,access_token,category,picture{url},fan_count,is_published',
                limit: '100'
            }
        });
        res.json({ success: true, data: data.data || [] });
    } catch (error) {
        res.status(error.status || 500).json({ success: false, error: error.message, fbError: error.fbError || null });
    }
});

// =====================================================
// CAMPAIGN UPDATE
// =====================================================

// POST /api/fb-ads/campaigns/:id/update — Update campaign fields
router.post('/campaigns/:id/update', async (req, res) => {
    try {
        const allowed = ['name', 'daily_budget', 'lifetime_budget', 'status', 'objective', 'stop_time'];
        const body = {};
        for (const key of allowed) {
            if (req.body[key] !== undefined) body[key] = req.body[key];
        }
        if (Object.keys(body).length === 0) {
            return res.status(400).json({ success: false, error: 'No valid fields to update' });
        }

        const data = await fbFetch(`/${req.params.id}`, { method: 'POST', body });
        res.json({ success: true, data });
    } catch (error) {
        res.status(error.status || 500).json({ success: false, error: error.message, fbError: error.fbError || null });
    }
});

// =====================================================
// ADSET UPDATE
// =====================================================

// POST /api/fb-ads/adsets/:id/update
router.post('/adsets/:id/update', async (req, res) => {
    try {
        const allowed = ['name', 'daily_budget', 'lifetime_budget', 'status', 'targeting', 'optimization_goal', 'billing_event', 'bid_amount', 'start_time', 'end_time'];
        const body = {};
        for (const key of allowed) {
            if (req.body[key] !== undefined) body[key] = req.body[key];
        }

        const data = await fbFetch(`/${req.params.id}`, { method: 'POST', body });
        res.json({ success: true, data });
    } catch (error) {
        res.status(error.status || 500).json({ success: false, error: error.message, fbError: error.fbError || null });
    }
});

// =====================================================
// AD IMAGE UPLOAD
// =====================================================

// POST /api/fb-ads/adimages — Upload ad image (base64)
router.post('/adimages', async (req, res) => {
    try {
        const { account_id, image_base64, filename } = req.body;
        if (!account_id || !image_base64) {
            return res.status(400).json({ success: false, error: 'account_id and image_base64 required' });
        }

        const actId = account_id.startsWith('act_') ? account_id : `act_${account_id}`;
        const data = await fbFetch(`/${actId}/adimages`, {
            method: 'POST',
            body: {
                filename: filename || 'ad_image.jpg',
                bytes: image_base64
            }
        });
        res.json({ success: true, data });
    } catch (error) {
        res.status(error.status || 500).json({ success: false, error: error.message, fbError: error.fbError || null });
    }
});

// GET /api/fb-ads/adimages — List ad images
router.get('/adimages', async (req, res) => {
    try {
        const { account_id } = req.query;
        if (!account_id) {
            return res.status(400).json({ success: false, error: 'account_id required' });
        }

        const actId = account_id.startsWith('act_') ? account_id : `act_${account_id}`;
        const data = await fbFetch(`/${actId}/adimages`, {
            params: { fields: 'id,hash,name,url,url_128,permalink_url,width,height,created_time', limit: req.query.limit || '50' }
        });
        res.json({ success: true, data: data.data || [] });
    } catch (error) {
        res.status(error.status || 500).json({ success: false, error: error.message, fbError: error.fbError || null });
    }
});

// =====================================================
// BULK ACTIONS
// =====================================================

// POST /api/fb-ads/bulk/status — Update multiple items status
router.post('/bulk/status', async (req, res) => {
    try {
        const { ids, status } = req.body;
        if (!ids || !Array.isArray(ids) || !status) {
            return res.status(400).json({ success: false, error: 'ids (array) and status required' });
        }

        const results = await Promise.allSettled(
            ids.map(id => fbFetch(`/${id}`, { method: 'POST', body: { status } }))
        );

        const succeeded = results.filter(r => r.status === 'fulfilled').length;
        const failed = results.filter(r => r.status === 'rejected').length;

        res.json({ success: true, data: { succeeded, failed, total: ids.length } });
    } catch (error) {
        res.status(error.status || 500).json({ success: false, error: error.message, fbError: error.fbError || null });
    }
});

// POST /api/fb-ads/bulk/delete
router.post('/bulk/delete', async (req, res) => {
    try {
        const { ids } = req.body;
        if (!ids || !Array.isArray(ids)) {
            return res.status(400).json({ success: false, error: 'ids (array) required' });
        }

        const results = await Promise.allSettled(
            ids.map(id => fbFetch(`/${id}`, { method: 'DELETE' }))
        );

        const succeeded = results.filter(r => r.status === 'fulfilled').length;
        const failed = results.filter(r => r.status === 'rejected').length;

        res.json({ success: true, data: { succeeded, failed, total: ids.length } });
    } catch (error) {
        res.status(error.status || 500).json({ success: false, error: error.message, fbError: error.fbError || null });
    }
});

// =====================================================
// AD PREVIEW
// =====================================================

// GET /api/fb-ads/adpreview/:adId
router.get('/adpreview/:adId', async (req, res) => {
    try {
        const data = await fbFetch(`/${req.params.adId}/previews`, {
            params: { ad_format: req.query.format || 'DESKTOP_FEED_STANDARD' }
        });
        res.json({ success: true, data: data.data || [] });
    } catch (error) {
        res.status(error.status || 500).json({ success: false, error: error.message, fbError: error.fbError || null });
    }
});

// =====================================================
// BILLING & PAYMENT
// =====================================================

// GET /api/fb-ads/billing/payment-methods?account_id=xxx
router.get('/billing/payment-methods', async (req, res) => {
    try {
        const actId = req.query.account_id?.startsWith('act_') ? req.query.account_id : `act_${req.query.account_id}`;
        const data = await fbFetch(`/${actId}`, {
            params: { fields: 'funding_source,funding_source_details,spend_cap,amount_spent,balance,currency,timezone_name,disable_reason,account_status' }
        });
        res.json({ success: true, data });
    } catch (error) {
        res.status(error.status || 500).json({ success: false, error: error.message, fbError: error.fbError || null });
    }
});

// GET /api/fb-ads/billing/transactions?account_id=xxx
router.get('/billing/transactions', async (req, res) => {
    try {
        const actId = req.query.account_id?.startsWith('act_') ? req.query.account_id : `act_${req.query.account_id}`;
        const data = await fbFetch(`/${actId}/transactions`, {
            params: {
                fields: 'id,time,account_id,fatura_id,charge_type,status,billing_amount,payment_option,reason',
                limit: req.query.limit || '50'
            }
        });
        res.json({ success: true, data: data.data || [] });
    } catch (error) {
        res.status(error.status || 500).json({ success: false, error: error.message, fbError: error.fbError || null });
    }
});

// POST /api/fb-ads/billing/spend-cap — Update account spend cap
router.post('/billing/spend-cap', async (req, res) => {
    try {
        const { account_id, spend_cap } = req.body;
        const actId = account_id?.startsWith('act_') ? account_id : `act_${account_id}`;
        const data = await fbFetch(`/${actId}`, {
            method: 'POST',
            body: { spend_cap: spend_cap.toString() }
        });
        res.json({ success: true, data });
    } catch (error) {
        res.status(error.status || 500).json({ success: false, error: error.message, fbError: error.fbError || null });
    }
});

// =====================================================
// ACCOUNT MANAGEMENT
// =====================================================

// GET /api/fb-ads/account/details?account_id=xxx
router.get('/account/details', async (req, res) => {
    try {
        const actId = req.query.account_id?.startsWith('act_') ? req.query.account_id : `act_${req.query.account_id}`;
        const data = await fbFetch(`/${actId}`, {
            params: {
                fields: 'id,name,account_id,account_status,currency,timezone_name,business_name,disable_reason,funding_source,spend_cap,amount_spent,balance,created_time,is_prepay_account'
            }
        });
        res.json({ success: true, data });
    } catch (error) {
        res.status(error.status || 500).json({ success: false, error: error.message, fbError: error.fbError || null });
    }
});

// POST /api/fb-ads/account/update — Update account settings
router.post('/account/update', async (req, res) => {
    try {
        const { account_id } = req.body;
        const actId = account_id?.startsWith('act_') ? account_id : `act_${account_id}`;
        const allowed = ['name', 'spend_cap', 'timezone_id', 'currency'];
        const body = {};
        for (const key of allowed) {
            if (req.body[key] !== undefined) body[key] = req.body[key];
        }
        const data = await fbFetch(`/${actId}`, { method: 'POST', body });
        res.json({ success: true, data });
    } catch (error) {
        res.status(error.status || 500).json({ success: false, error: error.message, fbError: error.fbError || null });
    }
});

// GET /api/fb-ads/account/users?account_id=xxx — Users with access
router.get('/account/users', async (req, res) => {
    try {
        const actId = req.query.account_id?.startsWith('act_') ? req.query.account_id : `act_${req.query.account_id}`;
        const data = await fbFetch(`/${actId}/users`, {
            params: { fields: 'id,name,permissions,role', limit: '100' }
        });
        res.json({ success: true, data: data.data || [] });
    } catch (error) {
        res.status(error.status || 500).json({ success: false, error: error.message, fbError: error.fbError || null });
    }
});

// GET /api/fb-ads/account/activities?account_id=xxx — Activity log
router.get('/account/activities', async (req, res) => {
    try {
        const actId = req.query.account_id?.startsWith('act_') ? req.query.account_id : `act_${req.query.account_id}`;
        const data = await fbFetch(`/${actId}/activities`, {
            params: {
                fields: 'event_time,event_type,actor_id,actor_name,object_id,object_name,extra_data',
                limit: req.query.limit || '50'
            }
        });
        res.json({ success: true, data: data.data || [] });
    } catch (error) {
        res.status(error.status || 500).json({ success: false, error: error.message, fbError: error.fbError || null });
    }
});

// =====================================================
// AUDIENCES
// =====================================================

// GET /api/fb-ads/audiences?account_id=xxx
router.get('/audiences', async (req, res) => {
    try {
        const actId = req.query.account_id?.startsWith('act_') ? req.query.account_id : `act_${req.query.account_id}`;
        const data = await fbFetch(`/${actId}/customaudiences`, {
            params: {
                fields: 'id,name,description,subtype,approximate_count,time_created,time_updated,data_source,delivery_status,operation_status,permission_for_actions',
                limit: req.query.limit || '50'
            }
        });
        res.json({ success: true, data: data.data || [] });
    } catch (error) {
        res.status(error.status || 500).json({ success: false, error: error.message, fbError: error.fbError || null });
    }
});

// POST /api/fb-ads/audiences — Create custom audience
router.post('/audiences', async (req, res) => {
    try {
        const { account_id, name, description, subtype, customer_file_source, rule } = req.body;
        if (!account_id || !name) {
            return res.status(400).json({ success: false, error: 'account_id and name required' });
        }
        const actId = account_id.startsWith('act_') ? account_id : `act_${account_id}`;
        const body = { name, subtype: subtype || 'CUSTOM' };
        if (description) body.description = description;
        if (customer_file_source) body.customer_file_source = customer_file_source;
        if (rule) body.rule = rule;

        const data = await fbFetch(`/${actId}/customaudiences`, { method: 'POST', body });
        res.json({ success: true, data });
    } catch (error) {
        res.status(error.status || 500).json({ success: false, error: error.message, fbError: error.fbError || null });
    }
});

// POST /api/fb-ads/audiences/lookalike — Create lookalike audience
router.post('/audiences/lookalike', async (req, res) => {
    try {
        const { account_id, name, origin_audience_id, country, ratio } = req.body;
        if (!account_id || !name || !origin_audience_id || !country) {
            return res.status(400).json({ success: false, error: 'account_id, name, origin_audience_id, country required' });
        }
        const actId = account_id.startsWith('act_') ? account_id : `act_${account_id}`;
        const data = await fbFetch(`/${actId}/customaudiences`, {
            method: 'POST',
            body: {
                name,
                subtype: 'LOOKALIKE',
                origin_audience_id,
                lookalike_spec: JSON.stringify({
                    country,
                    ratio: ratio || 0.01,
                    type: 'similarity'
                })
            }
        });
        res.json({ success: true, data });
    } catch (error) {
        res.status(error.status || 500).json({ success: false, error: error.message, fbError: error.fbError || null });
    }
});

// DELETE /api/fb-ads/audiences/:id
router.delete('/audiences/:id', async (req, res) => {
    try {
        const data = await fbFetch(`/${req.params.id}`, { method: 'DELETE' });
        res.json({ success: true, data });
    } catch (error) {
        res.status(error.status || 500).json({ success: false, error: error.message, fbError: error.fbError || null });
    }
});

// =====================================================
// SAVED AUDIENCES
// =====================================================

// GET /api/fb-ads/saved-audiences?account_id=xxx
router.get('/saved-audiences', async (req, res) => {
    try {
        const actId = req.query.account_id?.startsWith('act_') ? req.query.account_id : `act_${req.query.account_id}`;
        const data = await fbFetch(`/${actId}/saved_audiences`, {
            params: {
                fields: 'id,name,targeting,approximate_count,run_status,sentence_lines',
                limit: req.query.limit || '50'
            }
        });
        res.json({ success: true, data: data.data || [] });
    } catch (error) {
        res.status(error.status || 500).json({ success: false, error: error.message, fbError: error.fbError || null });
    }
});

// =====================================================
// PIXELS & EVENTS
// =====================================================

// GET /api/fb-ads/pixels?account_id=xxx
router.get('/pixels', async (req, res) => {
    try {
        const actId = req.query.account_id?.startsWith('act_') ? req.query.account_id : `act_${req.query.account_id}`;
        const data = await fbFetch(`/${actId}/adspixels`, {
            params: {
                fields: 'id,name,code,creation_time,last_fired_time,is_created_by_app,owner_business,data_use_setting',
                limit: '50'
            }
        });
        res.json({ success: true, data: data.data || [] });
    } catch (error) {
        res.status(error.status || 500).json({ success: false, error: error.message, fbError: error.fbError || null });
    }
});

// GET /api/fb-ads/pixels/:pixelId/stats
router.get('/pixels/:pixelId/stats', async (req, res) => {
    try {
        const data = await fbFetch(`/${req.params.pixelId}/stats`, {
            params: {
                aggregation: req.query.aggregation || 'event',
                start_time: req.query.start_time || Math.floor(Date.now() / 1000) - 86400 * 7,
                end_time: req.query.end_time || Math.floor(Date.now() / 1000)
            }
        });
        res.json({ success: true, data: data.data || [] });
    } catch (error) {
        res.status(error.status || 500).json({ success: false, error: error.message, fbError: error.fbError || null });
    }
});

// =====================================================
// AUTOMATED RULES
// =====================================================

// GET /api/fb-ads/rules?account_id=xxx
router.get('/rules', async (req, res) => {
    try {
        const actId = req.query.account_id?.startsWith('act_') ? req.query.account_id : `act_${req.query.account_id}`;
        const data = await fbFetch(`/${actId}/adrules_library`, {
            params: {
                fields: 'id,name,status,evaluation_spec,execution_spec,schedule_spec,created_time,updated_time',
                limit: '50'
            }
        });
        res.json({ success: true, data: data.data || [] });
    } catch (error) {
        res.status(error.status || 500).json({ success: false, error: error.message, fbError: error.fbError || null });
    }
});

// POST /api/fb-ads/rules — Create automated rule
router.post('/rules', async (req, res) => {
    try {
        const { account_id, name, evaluation_spec, execution_spec, schedule_spec } = req.body;
        if (!account_id || !name || !evaluation_spec || !execution_spec) {
            return res.status(400).json({ success: false, error: 'account_id, name, evaluation_spec, execution_spec required' });
        }
        const actId = account_id.startsWith('act_') ? account_id : `act_${account_id}`;
        const body = { name, evaluation_spec, execution_spec };
        if (schedule_spec) body.schedule_spec = schedule_spec;

        const data = await fbFetch(`/${actId}/adrules_library`, { method: 'POST', body });
        res.json({ success: true, data });
    } catch (error) {
        res.status(error.status || 500).json({ success: false, error: error.message, fbError: error.fbError || null });
    }
});

// POST /api/fb-ads/rules/:id/status
router.post('/rules/:id/status', async (req, res) => {
    try {
        const { status } = req.body;
        const data = await fbFetch(`/${req.params.id}`, { method: 'POST', body: { status } });
        res.json({ success: true, data });
    } catch (error) {
        res.status(error.status || 500).json({ success: false, error: error.message, fbError: error.fbError || null });
    }
});

// DELETE /api/fb-ads/rules/:id
router.delete('/rules/:id', async (req, res) => {
    try {
        const data = await fbFetch(`/${req.params.id}`, { method: 'DELETE' });
        res.json({ success: true, data });
    } catch (error) {
        res.status(error.status || 500).json({ success: false, error: error.message, fbError: error.fbError || null });
    }
});

// =====================================================
// REPORTS & EXPORT
// =====================================================

// GET /api/fb-ads/reports/daily?account_id=xxx&date_preset=last_30d
router.get('/reports/daily', async (req, res) => {
    try {
        const actId = req.query.account_id?.startsWith('act_') ? req.query.account_id : `act_${req.query.account_id}`;
        const data = await fbFetch(`/${actId}/insights`, {
            params: {
                fields: 'date_start,date_stop,impressions,clicks,spend,cpc,cpm,ctr,reach,frequency,actions,cost_per_action_type',
                date_preset: req.query.date_preset || 'last_30d',
                time_increment: '1',
                level: 'account',
                limit: '100'
            }
        });
        res.json({ success: true, data: data.data || [] });
    } catch (error) {
        res.status(error.status || 500).json({ success: false, error: error.message, fbError: error.fbError || null });
    }
});

// GET /api/fb-ads/reports/breakdown?account_id=xxx&breakdowns=age,gender
router.get('/reports/breakdown', async (req, res) => {
    try {
        const actId = req.query.account_id?.startsWith('act_') ? req.query.account_id : `act_${req.query.account_id}`;
        const data = await fbFetch(`/${actId}/insights`, {
            params: {
                fields: 'impressions,clicks,spend,cpc,ctr,reach,actions,cost_per_action_type',
                date_preset: req.query.date_preset || 'last_30d',
                breakdowns: req.query.breakdowns || 'age,gender',
                level: req.query.level || 'account',
                limit: '200'
            }
        });
        res.json({ success: true, data: data.data || [] });
    } catch (error) {
        res.status(error.status || 500).json({ success: false, error: error.message, fbError: error.fbError || null });
    }
});

// GET /api/fb-ads/reports/placement?account_id=xxx
router.get('/reports/placement', async (req, res) => {
    try {
        const actId = req.query.account_id?.startsWith('act_') ? req.query.account_id : `act_${req.query.account_id}`;
        const data = await fbFetch(`/${actId}/insights`, {
            params: {
                fields: 'impressions,clicks,spend,cpc,ctr,reach,actions',
                date_preset: req.query.date_preset || 'last_30d',
                breakdowns: 'publisher_platform,platform_position',
                level: 'account',
                limit: '200'
            }
        });
        res.json({ success: true, data: data.data || [] });
    } catch (error) {
        res.status(error.status || 500).json({ success: false, error: error.message, fbError: error.fbError || null });
    }
});

// =====================================================
// REACH ESTIMATE
// =====================================================

// POST /api/fb-ads/reach-estimate
router.post('/reach-estimate', async (req, res) => {
    try {
        const { account_id, targeting_spec } = req.body;
        if (!account_id || !targeting_spec) {
            return res.status(400).json({ success: false, error: 'account_id and targeting_spec required' });
        }
        const actId = account_id.startsWith('act_') ? account_id : `act_${account_id}`;
        const data = await fbFetch(`/${actId}/reachestimate`, {
            params: { targeting_spec: JSON.stringify(targeting_spec) }
        });
        res.json({ success: true, data });
    } catch (error) {
        res.status(error.status || 500).json({ success: false, error: error.message, fbError: error.fbError || null });
    }
});

module.exports = router;
