// =====================================================
// tab1-chat-facebook.js - Facebook Token Utilities
// getFacebookPageToken (shared utility), markFacebookTokenInvalid
// =====================================================
// Dependencies: tab1-chat-core.js (state globals)
// Exposes: window.getFacebookPageToken, window.markFacebookTokenInvalid

console.log('[Tab1-Chat-Facebook] Loading...');

// Cache for invalid Facebook tokens (keyed by pageId)
const _fbTokenValidationCache = {};

/**
 * Get Facebook Page Token from various sources (TPOS CRMTeam data)
 * Shared utility - used by tab1-chat-realtime.js, bill-service.js
 *
 * Priority: 1. currentCRMTeam → 2. currentOrder.CRMTeam → 3. cachedChannelsData → 4. TPOS API
 *
 * @param {string} [pageId] - Facebook Page ID (defaults to window.currentChatChannelId)
 * @returns {Promise<string|null>} Facebook Page Token or null
 */
window.getFacebookPageToken = async function (pageId) {
    pageId = pageId || window.currentChatChannelId;
    if (!pageId) return null;

    // Check validation cache - skip known-invalid tokens
    if (_fbTokenValidationCache[pageId]?.invalid) {
        const cacheAge = Date.now() - (_fbTokenValidationCache[pageId].timestamp || 0);
        // Cache invalid status for 10 minutes, then allow retry
        if (cacheAge < 10 * 60 * 1000) {
            console.warn('[FB-TOKEN] Token for page', pageId, 'marked invalid (cached). Skipping.');
            return null;
        }
        delete _fbTokenValidationCache[pageId];
    }

    // Source 1: currentCRMTeam (set when chat modal opens)
    if (window.currentCRMTeam?.Facebook_PageToken) {
        const crmPageId = window.currentCRMTeam.ChannelId || window.currentCRMTeam.Facebook_AccountId || window.currentCRMTeam.Id;
        if (String(crmPageId) === String(pageId) || String(window.currentCRMTeam.Facebook_AccountId) === String(pageId)) {
            return window.currentCRMTeam.Facebook_PageToken;
        }
    }

    // Source 2: currentOrder.CRMTeam
    if (window.currentOrder?.CRMTeam?.Facebook_PageToken) {
        const crmPageId = window.currentOrder.CRMTeam.ChannelId || window.currentOrder.CRMTeam.Facebook_AccountId;
        if (String(crmPageId) === String(pageId) || String(window.currentOrder.CRMTeam.Facebook_AccountId) === String(pageId)) {
            return window.currentOrder.CRMTeam.Facebook_PageToken;
        }
    }

    // Source 3: cachedChannelsData
    if (window.cachedChannelsData) {
        const channel = window.cachedChannelsData.find(ch =>
            String(ch.ChannelId) === String(pageId) || String(ch.Facebook_AccountId) === String(pageId)
        );
        if (channel?.Facebook_PageToken) return channel.Facebook_PageToken;
    }

    // Source 4: Fetch CRMTeam from TPOS API
    try {
        const headers = await window.tokenManager?.getAuthHeader() || {};
        const baseUrl = window.API_CONFIG?.WORKER_URL || 'https://chatomni-proxy.nhijudyshop.workers.dev';
        const crmUrl = `${baseUrl}/api/odata/CRMTeam?$filter=ChannelId eq '${pageId}' or Facebook_AccountId eq '${pageId}'&$top=1`;
        const response = await fetch(crmUrl, {
            method: 'GET',
            headers: { ...headers, 'Accept': 'application/json' }
        });
        if (response.ok) {
            const data = await response.json();
            const teams = data.value || data;
            if (teams?.length > 0 && teams[0].Facebook_PageToken) {
                return teams[0].Facebook_PageToken;
            }
        }
    } catch (fetchError) {
        console.warn('[FB-TOKEN] Could not fetch CRMTeam from TPOS:', fetchError.message);
    }

    return null;
};

/**
 * Mark a Facebook Page Token as invalid (e.g. expired, error code 190)
 * @param {string} pageId
 */
window.markFacebookTokenInvalid = function (pageId) {
    _fbTokenValidationCache[pageId] = { invalid: true, timestamp: Date.now() };
};

console.log('[Tab1-Chat-Facebook] Loaded successfully.');
