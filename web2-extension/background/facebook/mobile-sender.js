// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | Read these files before coding, update dev-log after changes.
// Facebook Mobile Site Sender — Port của Pancake V2 class Fp (InboxMobile)
//
// Khi `business.facebook.com/messaging/send/` trả error 1545012
// (BLOCKED_RETRY_SOCKET) — FB chặn HTTP path và đòi MQTT socket. Pancake
// có WebSocket frontend code; mình không. Thay vì socket, fallback sang
// `m.facebook.com/messages/send/` (mobile site) — endpoint khác, auth
// khác, thường KHÔNG hit 1545012 cho cùng conversation.
//
// Reference: /tmp/pancake-v2-crx/extracted/assets/background.formatted.js
//   class Fp (line 5685-5739) + buildMParams (line 322-325)

import { log } from '../../shared/logger.js';
import { calcJazoest, generateReqId, parseFbRes, generateOfflineThreadingID } from './utils.js';

const MODULE = 'FB-MobileSender';

const M_INBOX_URL = (pageId) => `https://m.facebook.com/messages/?pageID=${pageId}&ref=bookmarks`;
const M_SEND_URL = (pageId) =>
    `https://m.facebook.com/messages/send/?icm=1&pageID=${pageId}&entrypoint=web%3Atrigger%3Athread_list_thread`;

// Cache m.facebook.com session per pageId (60 min TTL)
const mobileSessionCache = new Map(); // pageId → {token, userId, lsd, timestamp}
const M_SESSION_TTL = 60 * 60 * 1000;

/**
 * Initialize mobile session for a page — fetch m.facebook.com/messages?pageID=X
 * and extract fb_dtsg + userId + lsd from HTML.
 *
 * Returns null if mobile site is no longer reachable (FB sunset m.facebook.com
 * for some regions / accounts).
 */
async function initMobileSession(pageId) {
    const cached = mobileSessionCache.get(pageId);
    if (cached && Date.now() - cached.timestamp < M_SESSION_TTL) {
        log.debug(MODULE, `Using cached mobile session for page ${pageId}`);
        return cached;
    }

    log.info(MODULE, `Initializing m.facebook.com session for page ${pageId}...`);
    const resp = await fetch(M_INBOX_URL(pageId), {
        credentials: 'include',
        headers: {
            // Force mobile user-agent so FB doesn't auto-redirect to www.
            // chrome.declarativeNetRequest dynamic rule could spoof UA but
            // simpler: just include hint header — FB respects ?icm=1 query.
            Accept: 'text/html,application/xhtml+xml',
            'Accept-Language': 'en-US,en;q=0.9',
        },
        redirect: 'follow',
    });

    if (!resp.ok) {
        throw new Error(`m.facebook.com inbox returned HTTP ${resp.status}`);
    }
    // FB redirects m.facebook.com to www.facebook.com on desktop UA?
    // Check final URL.
    if (!resp.url.includes('m.facebook.com')) {
        throw new Error(`m.facebook.com redirected to ${resp.url} — mobile path not available`);
    }

    const html = await resp.text();
    const session = extractMobileSession(html, pageId);
    if (!session.token) {
        throw new Error('Failed to extract fb_dtsg from m.facebook.com HTML');
    }

    session.timestamp = Date.now();
    mobileSessionCache.set(pageId, session);
    log.info(
        MODULE,
        `Mobile session ready: fb_dtsg=${session.token.slice(0, 12)}..., userId=${session.userId}`
    );
    return session;
}

function extractMobileSession(html, pageId) {
    const data = { token: null, userId: null, lsd: null, pageId };

    // m.facebook.com still uses form-based dtsg — easier extraction
    const dtsgMatch =
        html.match(/name="fb_dtsg"\s+value="([^"]+)"/) ||
        html.match(/"DTSGInitialData"[^}]*"token":"([^"]+)"/);
    if (dtsgMatch) data.token = dtsgMatch[1];

    const userMatch = html.match(/"USER_ID":"(\d+)"|"actorID":"(\d+)"|c_user=(\d+)/);
    if (userMatch) data.userId = userMatch[1] || userMatch[2] || userMatch[3];

    const lsdMatch = html.match(/name="lsd"\s+value="([^"]+)"|"LSD",\[\],\{"token":"([^"]+)"/);
    if (lsdMatch) data.lsd = lsdMatch[1] || lsdMatch[2];

    return data;
}

/**
 * Build m.facebook.com /messages/send/ form params — matches Pancake's Fp.buildParams.
 */
function buildMobileParams({ session, pageId, convId, message, attachmentType, files }) {
    // Strip "t_" prefix if present (legacy thread key format)
    const cleanConvId = String(convId).replace(/^t_/, '');

    // M-specific base params (smaller than business.facebook.com)
    const mParams = {
        __user: session.userId || '0',
        __req: generateReqId(),
        __a: '1',
        fb_dtsg: session.token,
        jazoest: calcJazoest(session.token),
    };

    const params = {
        tids: `cid.c.${cleanConvId}:${pageId}`,
        wwwupp: 'C3',
        [`tids[${cleanConvId}]`]: cleanConvId,
        body: message || '',
        waterfall_source: 'message',
    };

    // Attach files (only for non-SEND_TEXT_ONLY)
    if (attachmentType === 'PHOTO' && files?.length) {
        files.forEach((id, i) => {
            params[`photo_ids[${i}]`] = id;
        });
    } else if (attachmentType === 'STICKER' && files?.length) {
        params.sticker_id = files[0];
    }
    // SEND_TEXT_ONLY → no attachment fields

    params.action_time = Date.now();
    params.m_sess = '';

    return { ...params, ...mParams };
}

function encodeForm(obj) {
    const sp = new URLSearchParams();
    for (const [k, v] of Object.entries(obj)) {
        if (v !== undefined && v !== null) sp.append(k, String(v));
    }
    return sp.toString();
}

/**
 * Check if mobile response indicates success.
 * Pancake's returnIsSuccess only looks at payload.actions[].target === "messaging_compose_error"
 * and checks the html is empty error div. Inverted: success = no compose error.
 */
function isMobileSuccess(result) {
    if (!result || !result.payload || !result.payload.actions) return false;
    for (const a of result.payload.actions) {
        if (a.target === 'messaging_compose_error') {
            // Pancake bug: uses assignment (=) instead of (==) — but the html check still gates
            return a.html === '<div id="messaging_compose_error"></div>';
        }
    }
    // No compose_error action — assume success if payload has actions
    return result.payload.actions.length > 0;
}

/**
 * Extract message id from m.facebook.com response.
 * Either payload.actions[0].message_id, or fallback regex on raw HTML.
 */
function extractMobileMessageId(result, rawText) {
    if (result?.payload?.actions) {
        const sent = result.payload.actions.find((a) => a.message_id);
        if (sent) return sent.message_id;
    }
    // Pancake's fallback: scan raw HTML for "mid" via MTouchChannelPayloadRouter
    if (typeof rawText === 'string') {
        const m = rawText.match(/MTouchChannelPayloadRouter.+\\"mid\\":\\"([^\\"]+)\\"/i);
        if (m) return m[1].replace('mid.', 'm_mid.');
    }
    return null;
}

/**
 * Send a message via m.facebook.com fallback.
 * @returns {Promise<{ok:boolean, messageId?:string, error?:string}>}
 */
export async function sendViaMobile({ pageId, convId, message, attachmentType, files }) {
    log.info(
        MODULE,
        `Mobile send: page=${pageId}, conv=${convId}, type=${attachmentType}, body_len=${(message || '').length}`
    );

    let session;
    try {
        session = await initMobileSession(pageId);
    } catch (e) {
        log.error(MODULE, `Mobile init failed: ${e.message}`);
        return { ok: false, error: `Mobile session init failed: ${e.message}` };
    }

    const params = buildMobileParams({ session, pageId, convId, message, attachmentType, files });
    const body = encodeForm(params);

    log.info(MODULE, `[DEBUG] POST ${M_SEND_URL(pageId)}`);
    log.info(MODULE, `[DEBUG] Body (first 400 chars): ${body.substring(0, 400)}`);

    let resp;
    try {
        resp = await fetch(M_SEND_URL(pageId), {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                'X-Requested-With': 'XMLHttpRequest',
                'X-Response-Format': 'JSONStream',
                'X-MSGR-Region': 'ATN',
            },
            body,
            credentials: 'include',
        });
    } catch (e) {
        log.error(MODULE, `Mobile fetch threw: ${e.message}`);
        return { ok: false, error: `Mobile network error: ${e.message}` };
    }

    const rawText = await resp.text();
    log.info(MODULE, `[DEBUG] Response status=${resp.status}, len=${rawText.length}`);
    log.info(MODULE, `[DEBUG] Response body (first 500 chars): ${rawText.substring(0, 500)}`);

    if (resp.status !== 200) {
        return { ok: false, error: `m.facebook.com HTTP ${resp.status}` };
    }

    let result;
    try {
        result = parseFbRes(rawText);
    } catch (e) {
        // Mobile site may return raw HTML — try regex extract message id
        const mid = extractMobileMessageId(null, rawText);
        if (mid) {
            log.info(MODULE, `Mobile send success (via HTML regex): mid=${mid}`);
            return { ok: true, messageId: mid };
        }
        return { ok: false, error: `Mobile response parse failed: ${e.message}` };
    }

    if (result.error || result.errorSummary) {
        log.error(MODULE, `Mobile FB error: ${JSON.stringify(result).slice(0, 300)}`);
        return {
            ok: false,
            error: result.errorSummary || result.error || 'Mobile FB error',
            fbErrorCode: result.error,
        };
    }

    if (!isMobileSuccess(result)) {
        return { ok: false, error: 'Mobile response indicates failure', raw: result };
    }

    const messageId = extractMobileMessageId(result, rawText);
    log.info(MODULE, `Mobile send success: mid=${messageId || 'unknown'}`);
    return { ok: true, messageId };
}

export function clearMobileSession(pageId) {
    mobileSessionCache.delete(pageId);
}
