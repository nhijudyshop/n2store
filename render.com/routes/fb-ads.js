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

// In-memory token storage (per session, refreshed via Facebook Login)
let fbTokenStore = {
    accessToken: null,
    expiresAt: null,
    userId: null,
    name: null
};

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
        const err = new Error(data.error.message);
        err.fbError = data.error;
        err.status = response.status;
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

// GET /api/fb-ads/auth/status — Check if authenticated
router.get('/auth/status', (req, res) => {
    const isAuth = !!fbTokenStore.accessToken && Date.now() < (fbTokenStore.expiresAt || 0);
    res.json({
        success: true,
        authenticated: isAuth,
        user: isAuth ? { id: fbTokenStore.userId, name: fbTokenStore.name } : null,
        expiresAt: fbTokenStore.expiresAt
    });
});

// POST /api/fb-ads/auth/logout
router.post('/auth/logout', (req, res) => {
    fbTokenStore = { accessToken: null, expiresAt: null, userId: null, name: null };
    res.json({ success: true });
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
        res.status(error.status || 500).json({ success: false, error: error.message });
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
        res.status(error.status || 500).json({ success: false, error: error.message });
    }
});

// POST /api/fb-ads/campaigns — Create campaign
router.post('/campaigns', async (req, res) => {
    try {
        const { account_id, name, objective, status, daily_budget, special_ad_categories } = req.body;
        if (!account_id || !name || !objective) {
            return res.status(400).json({ success: false, error: 'account_id, name, objective required' });
        }

        const actId = account_id.startsWith('act_') ? account_id : `act_${account_id}`;
        const body = {
            name,
            objective,
            status: status || 'PAUSED',
            special_ad_categories: special_ad_categories || ['NONE']
        };
        if (daily_budget) body.daily_budget = daily_budget;

        const data = await fbFetch(`/${actId}/campaigns`, { method: 'POST', body });
        res.json({ success: true, data });
    } catch (error) {
        res.status(error.status || 500).json({ success: false, error: error.message });
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
        res.status(error.status || 500).json({ success: false, error: error.message });
    }
});

// DELETE /api/fb-ads/campaigns/:id
router.delete('/campaigns/:id', async (req, res) => {
    try {
        const data = await fbFetch(`/${req.params.id}`, { method: 'DELETE' });
        res.json({ success: true, data });
    } catch (error) {
        res.status(error.status || 500).json({ success: false, error: error.message });
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
        res.status(error.status || 500).json({ success: false, error: error.message });
    }
});

// POST /api/fb-ads/adsets — Create ad set
router.post('/adsets', async (req, res) => {
    try {
        const { account_id, campaign_id, name, daily_budget, billing_event, optimization_goal, targeting, status, start_time, end_time } = req.body;
        if (!account_id || !campaign_id || !name || !optimization_goal || !targeting) {
            return res.status(400).json({ success: false, error: 'account_id, campaign_id, name, optimization_goal, targeting required' });
        }

        const actId = account_id.startsWith('act_') ? account_id : `act_${account_id}`;
        const body = {
            campaign_id,
            name,
            optimization_goal,
            billing_event: billing_event || 'IMPRESSIONS',
            targeting,
            status: status || 'PAUSED'
        };
        if (daily_budget) body.daily_budget = daily_budget;
        if (start_time) body.start_time = start_time;
        if (end_time) body.end_time = end_time;

        const data = await fbFetch(`/${actId}/adsets`, { method: 'POST', body });
        res.json({ success: true, data });
    } catch (error) {
        res.status(error.status || 500).json({ success: false, error: error.message });
    }
});

// POST /api/fb-ads/adsets/:id/status
router.post('/adsets/:id/status', async (req, res) => {
    try {
        const { status } = req.body;
        const data = await fbFetch(`/${req.params.id}`, { method: 'POST', body: { status } });
        res.json({ success: true, data });
    } catch (error) {
        res.status(error.status || 500).json({ success: false, error: error.message });
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
        res.status(error.status || 500).json({ success: false, error: error.message });
    }
});

// POST /api/fb-ads/ads — Create ad
router.post('/ads', async (req, res) => {
    try {
        const { account_id, adset_id, name, creative, status } = req.body;
        if (!account_id || !adset_id || !name || !creative) {
            return res.status(400).json({ success: false, error: 'account_id, adset_id, name, creative required' });
        }

        const actId = account_id.startsWith('act_') ? account_id : `act_${account_id}`;
        const body = {
            adset_id,
            name,
            creative,
            status: status || 'PAUSED'
        };

        const data = await fbFetch(`/${actId}/ads`, { method: 'POST', body });
        res.json({ success: true, data });
    } catch (error) {
        res.status(error.status || 500).json({ success: false, error: error.message });
    }
});

// POST /api/fb-ads/ads/:id/status
router.post('/ads/:id/status', async (req, res) => {
    try {
        const { status } = req.body;
        const data = await fbFetch(`/${req.params.id}`, { method: 'POST', body: { status } });
        res.json({ success: true, data });
    } catch (error) {
        res.status(error.status || 500).json({ success: false, error: error.message });
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
        res.status(error.status || 500).json({ success: false, error: error.message });
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
        res.status(error.status || 500).json({ success: false, error: error.message });
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
        res.status(error.status || 500).json({ success: false, error: error.message });
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
        res.status(error.status || 500).json({ success: false, error: error.message });
    }
});

// =====================================================
// APP ROLES (Add/Remove Testers & Developers)
// =====================================================

// GET /api/fb-ads/app/roles — List app roles
router.get('/app/roles', async (req, res) => {
    try {
        const data = await fbFetch(`/${FB_APP_ID}/roles`, {
            params: { fields: 'user,role', limit: '100' }
        });
        res.json({ success: true, data: data.data || [] });
    } catch (error) {
        res.status(error.status || 500).json({ success: false, error: error.message });
    }
});

// POST /api/fb-ads/app/roles — Add user to app
router.post('/app/roles', async (req, res) => {
    try {
        const { user_id, role } = req.body;
        if (!user_id || !role) {
            return res.status(400).json({ success: false, error: 'user_id and role required' });
        }
        if (!['administrators', 'developers', 'testers', 'insights users'].includes(role)) {
            return res.status(400).json({ success: false, error: 'Invalid role. Use: administrators, developers, testers, insights users' });
        }

        const data = await fbFetch(`/${FB_APP_ID}/roles`, {
            method: 'POST',
            body: { user: user_id, role }
        });
        res.json({ success: true, data });
    } catch (error) {
        res.status(error.status || 500).json({ success: false, error: error.message });
    }
});

// DELETE /api/fb-ads/app/roles/:userId — Remove user from app
router.delete('/app/roles/:userId', async (req, res) => {
    try {
        const data = await fbFetch(`/${FB_APP_ID}/roles`, {
            method: 'DELETE',
            body: { user: req.params.userId }
        });
        res.json({ success: true, data });
    } catch (error) {
        res.status(error.status || 500).json({ success: false, error: error.message });
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
        res.status(error.status || 500).json({ success: false, error: error.message });
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
        res.status(error.status || 500).json({ success: false, error: error.message });
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
        res.status(error.status || 500).json({ success: false, error: error.message });
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
        res.status(error.status || 500).json({ success: false, error: error.message });
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
        res.status(error.status || 500).json({ success: false, error: error.message });
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
        res.status(error.status || 500).json({ success: false, error: error.message });
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
        res.status(error.status || 500).json({ success: false, error: error.message });
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
        res.status(error.status || 500).json({ success: false, error: error.message });
    }
});

module.exports = router;
