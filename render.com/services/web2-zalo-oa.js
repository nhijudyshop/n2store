// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | WEB2.0 MODULE — Zalo OA + ZNS (official API).
// =====================================================================
// Zalo Official Account — token store/refresh + ZNS + tin tư vấn (cs).
// Dùng cho account_type='oa' trong web2_zalo_accounts.
//
// Endpoints (official — xác minh tại developers.zalo.me khi cấu hình OA thật):
//   • OAuth token   : POST https://oauth.zaloapp.com/v4/oa/access_token
//   • ZNS template  : POST https://business.openapi.zalo.me/message/template
//   • List template : GET  https://business.openapi.zalo.me/template/all
//   • Tin tư vấn cs : POST https://openapi.zalo.me/v3.0/oa/message/cs
//
// access_token ~1h, refresh_token ~3 tháng & XOAY VÒNG mỗi lần refresh →
// LUÔN lưu lại refresh_token mới trả về.
// =====================================================================

'use strict';

const secretCrypto = require('../lib/web2-secret-crypto');

const OAUTH_URL = 'https://oauth.zaloapp.com/v4/oa/access_token';
const ZNS_TEMPLATE_URL = 'https://business.openapi.zalo.me/message/template';
const TEMPLATE_LIST_URL = 'https://business.openapi.zalo.me/template/all';
const CS_MESSAGE_URL = 'https://openapi.zalo.me/v3.0/oa/message/cs';

const TOKEN_SKEW_MS = 60 * 1000; // refresh sớm 60s trước hạn

function now() {
    return Date.now();
}

// ── form-urlencoded helper ──────────────────────────────────────────────
function _form(obj) {
    return Object.entries(obj)
        .filter(([, v]) => v !== undefined && v !== null)
        .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
        .join('&');
}

// ── Đọc account row (oa) theo account_key hoặc oa_id ────────────────────
async function _loadOaAccount(pool, ref) {
    const { rows } = await pool.query(
        `SELECT * FROM web2_zalo_accounts
          WHERE account_type='oa' AND (account_key = $1 OR oa_id = $1)
          LIMIT 1`,
        [ref]
    );
    return rows[0] || null;
}

// Nếu không truyền ref → lấy OA active đầu tiên (đa số shop chỉ 1 OA)
async function _loadDefaultOa(pool) {
    const { rows } = await pool.query(
        `SELECT * FROM web2_zalo_accounts
          WHERE account_type='oa' AND is_active=true
          ORDER BY updated_at DESC LIMIT 1`
    );
    return rows[0] || null;
}

// ── Refresh access_token (xoay refresh_token) ───────────────────────────
// ⚠ Zalo XOAY refresh_token mỗi lần dùng → gọi refresh song song = token cũ bị
//   vô hiệu → OA khoá tới khi auth lại. Dedup promise theo account để mọi caller
//   đồng thời (vd vòng bulk ZNS) chờ CÙNG 1 lần refresh.
const _refreshInFlight = new Map(); // account_key|id -> Promise<token>

async function refreshToken(pool, account) {
    const key = account?.account_key || account?.id || 'default';
    if (_refreshInFlight.has(key)) return _refreshInFlight.get(key);
    const p = _doRefresh(pool, account).finally(() => _refreshInFlight.delete(key));
    _refreshInFlight.set(key, p);
    return p;
}

async function _doRefresh(pool, account) {
    if (!account?.app_id || !account?.oa_secret || !account?.refresh_token) {
        throw new Error('OA thiếu app_id / secret / refresh_token — cần kết nối lại');
    }
    const res = await fetch(OAUTH_URL, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            secret_key: secretCrypto.decryptString(account.oa_secret),
        },
        body: _form({
            refresh_token: secretCrypto.decryptString(account.refresh_token),
            app_id: account.app_id,
            grant_type: 'refresh_token',
        }),
    });
    const data = await res.json().catch(() => ({}));
    if (!data.access_token) {
        throw new Error(
            'Refresh token thất bại: ' +
                (data.error_name || data.error_description || JSON.stringify(data).slice(0, 120))
        );
    }
    const expiresIn = parseInt(data.expires_in, 10) || 3600;
    const tokenExpires = now() + expiresIn * 1000;
    await pool.query(
        `UPDATE web2_zalo_accounts
            SET access_token=$1, refresh_token=$2, token_expires=$3,
                status='token_ok', status_msg=NULL, updated_at=$4
          WHERE id=$5`,
        [
            secretCrypto.encryptString(data.access_token),
            secretCrypto.encryptString(
                data.refresh_token || secretCrypto.decryptString(account.refresh_token)
            ),
            tokenExpires,
            now(),
            account.id,
        ]
    );
    return data.access_token;
}

// ── Đổi authorization code → tokens (lần kết nối OA đầu) ─────────────────
async function exchangeCode(pool, { accountKey, appId, secret, code, oaId, oaName }) {
    if (!appId || !secret || !code) throw new Error('Thiếu app_id / secret / code');
    const res = await fetch(OAUTH_URL, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            secret_key: secret,
        },
        body: _form({ code, app_id: appId, grant_type: 'authorization_code' }),
    });
    const data = await res.json().catch(() => ({}));
    if (!data.access_token) {
        throw new Error(
            'Đổi code thất bại: ' +
                (data.error_name || data.error_description || JSON.stringify(data).slice(0, 120))
        );
    }
    const expiresIn = parseInt(data.expires_in, 10) || 3600;
    const tokenExpires = now() + expiresIn * 1000;
    const key = accountKey || oaId || `oa_${appId}`;
    const ts = now();
    await pool.query(
        `INSERT INTO web2_zalo_accounts
            (account_key, account_type, label, oa_id, display_name, app_id, oa_secret,
             access_token, refresh_token, token_expires, status, is_active, created_at, updated_at)
         VALUES ($1,'oa',$2,$3,$2,$4,$5,$6,$7,$8,'token_ok',true,$9,$9)
         ON CONFLICT (account_key) DO UPDATE SET
            oa_id=EXCLUDED.oa_id, app_id=EXCLUDED.app_id, oa_secret=EXCLUDED.oa_secret,
            access_token=EXCLUDED.access_token, refresh_token=EXCLUDED.refresh_token,
            token_expires=EXCLUDED.token_expires, status='token_ok', status_msg=NULL,
            is_active=true, updated_at=EXCLUDED.updated_at`,
        [
            key,
            oaName || 'Zalo OA',
            oaId || null,
            appId,
            secretCrypto.encryptString(secret),
            secretCrypto.encryptString(data.access_token),
            data.refresh_token ? secretCrypto.encryptString(data.refresh_token) : null,
            tokenExpires,
            ts,
        ]
    );
    return { accountKey: key, accessToken: data.access_token };
}

// ── Lấy access_token còn hạn (tự refresh nếu sắp hết) ───────────────────
async function getValidToken(pool, ref) {
    const account = ref ? await _loadOaAccount(pool, ref) : await _loadDefaultOa(pool);
    if (!account) throw new Error('Chưa kết nối Zalo OA nào');
    if (
        !account.access_token ||
        !account.token_expires ||
        account.token_expires < now() + TOKEN_SKEW_MS
    ) {
        return { token: await refreshToken(pool, account), account };
    }
    return { token: secretCrypto.decryptString(account.access_token), account };
}

// ── Gửi ZNS theo template ───────────────────────────────────────────────
async function sendZNS(pool, { phone, templateId, data, orderRef, oaRef, sentBy, customerId }) {
    const p = String(phone || '').replace(/\D/g, '');
    if (!p || p.length < 9) throw new Error('SĐT không hợp lệ');
    if (!templateId) throw new Error('Thiếu template_id');
    // Zalo yêu cầu định dạng 84xxxxxxxxx
    const phone84 = p.startsWith('84') ? p : p.startsWith('0') ? '84' + p.slice(1) : p;

    const { token, account } = await getValidToken(pool, oaRef);
    const ts = now();
    // log pending trước
    const { rows: logRows } = await pool.query(
        `INSERT INTO web2_zns_log (oa_id, template_id, phone, customer_id, params, status, order_ref, sent_by, created_at)
         VALUES ($1,$2,$3,$4,$5,'pending',$6,$7,$8) RETURNING log_id`,
        [
            account.oa_id || account.account_key,
            String(templateId),
            p,
            customerId || null,
            JSON.stringify(data || {}),
            orderRef || null,
            sentBy || null,
            ts,
        ]
    );
    const logId = logRows[0].log_id;

    try {
        const res = await fetch(ZNS_TEMPLATE_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', access_token: token },
            body: JSON.stringify({
                phone: phone84,
                template_id: String(templateId),
                template_data: data || {},
                tracking_id: orderRef || logId,
            }),
        });
        const body = await res.json().catch(() => ({}));
        const ok = body.error === 0 || body.error === '0';
        const msgId = body.data?.msg_id || body.data?.message_id || null;
        await pool.query(
            `UPDATE web2_zns_log SET status=$1, zalo_msg_id=$2, quota_cost=$3, error_msg=$4, sent_at=$5 WHERE log_id=$6`,
            [
                ok ? 'sent' : 'failed',
                msgId,
                body.data?.quota?.remainingQuota ?? null,
                ok ? null : body.message || JSON.stringify(body).slice(0, 200),
                now(),
                logId,
            ]
        );
        if (!ok) throw new Error('ZNS lỗi: ' + (body.message || body.error));
        return { success: true, msgId, logId, raw: body };
    } catch (e) {
        await pool
            .query(
                `UPDATE web2_zns_log SET status='failed', error_msg=$1 WHERE log_id=$2 AND status='pending'`,
                [String(e.message).slice(0, 200), logId]
            )
            .catch(() => {});
        throw e;
    }
}

// ── Gửi tin tư vấn (cs) tới user đã nhắn OA ─────────────────────────────
async function sendCsMessage(pool, { oaRef, userId, text }) {
    if (!userId) throw new Error('Thiếu user_id');
    if (!text || !String(text).trim()) throw new Error('Nội dung rỗng');
    const { token } = await getValidToken(pool, oaRef);
    const res = await fetch(CS_MESSAGE_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', access_token: token },
        body: JSON.stringify({
            recipient: { user_id: String(userId) },
            message: { text: String(text) },
        }),
    });
    const body = await res.json().catch(() => ({}));
    const ok = body.error === 0 || body.error === '0';
    if (!ok) throw new Error('OA cs lỗi: ' + (body.message || body.error));
    return { success: true, msgId: body.data?.message_id || null, raw: body };
}

// ── Đồng bộ danh sách template ZNS từ OA về DB ──────────────────────────
async function syncTemplates(pool, oaRef) {
    const { token, account } = await getValidToken(pool, oaRef);
    const res = await fetch(`${TEMPLATE_LIST_URL}?offset=0&limit=100&status=1`, {
        headers: { access_token: token },
    });
    const body = await res.json().catch(() => ({}));
    const list = Array.isArray(body.data) ? body.data : [];
    const ts = now();
    let n = 0;
    for (const t of list) {
        const tid = String(t.templateId || t.template_id || '');
        if (!tid) continue;
        await pool.query(
            `INSERT INTO web2_zns_templates
                (template_id, oa_id, template_name, template_quality, status, params, preview_url, is_active, created_at, updated_at)
             VALUES ($1,$2,$3,$4,$5,$6,$7,true,$8,$8)
             ON CONFLICT (template_id) DO UPDATE SET
                template_name=EXCLUDED.template_name, template_quality=EXCLUDED.template_quality,
                status=EXCLUDED.status, params=EXCLUDED.params, preview_url=EXCLUDED.preview_url, updated_at=EXCLUDED.updated_at`,
            [
                tid,
                account.oa_id || account.account_key,
                t.templateName || t.template_name || tid,
                t.templateQuality || t.template_quality || null,
                String(t.status ?? 'ENABLE'),
                JSON.stringify(t.listParams || t.params || []),
                t.previewUrl || t.preview_url || null,
                ts,
            ]
        );
        n++;
    }
    return { synced: n };
}

module.exports = {
    refreshToken,
    exchangeCode,
    getValidToken,
    sendZNS,
    sendCsMessage,
    syncTemplates,
};
