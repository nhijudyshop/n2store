// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | WEB2.0 MODULE.
/**
 * Web 2.0 — "Giọng AI Pro" service (proxy server-side, GIẤU nhà cung cấp + API key).
 *
 * ⚠ Tên nhà cung cấp (lucylab/vivibe) KHÔNG được lộ ra frontend (yêu cầu user 2026-06-22):
 *   - route browser gọi = /api/web2-tts-pro (trung tính), KHÔNG phải /web2-vivibe
 *   - backend RELAY file audio (tải .wav rồi stream về) → domain lucylab.io / ttsapi.app
 *     KHÔNG bao giờ xuất hiện trong network tab của trình duyệt.
 *   - key chỉ ở env Render, không bao giờ trả về client.
 *
 * Backend = JSON-RPC api.lucylab.io. TTS BẤT ĐỒNG BỘ: ttsLongText → job → poll
 * getExportStatus (2s, tối đa ~120s) → tải .wav công khai → trả Buffer.
 *
 * XOAY TUA KEY (gộp nhiều account free): env VIVIBE_API_KEY1..N (hoặc VIVIBE_API_KEY
 * đơn / phẩy). Round-robin rải tải; key 401/hết credit → cooldown 1h, thử key kế.
 */
'use strict';

const EP = 'https://api.lucylab.io/json-rpc';
const MAX_TEXT = 5000; // chặn đốt credit (video narration/cảnh thường ngắn)
const COOLDOWN_MS = 60 * 60 * 1000; // 1h sau khi key auth/quota lỗi
const POLL_INTERVAL_MS = 2000;
const POLL_TIMEOUT_MS = 120 * 1000;

let _rr = 0; // con trỏ round-robin
const _cooldown = new Map(); // key → ts hết cooldown

// Đọc key: ưu tiên VIVIBE_API_KEY1..N, fallback VIVIBE_API_KEY (đơn / phẩy).
function _keys() {
    const arr = [];
    for (let i = 1; i <= 10; i++) {
        const v = (process.env['VIVIBE_API_KEY' + i] || '').trim();
        if (v) arr.push(v);
    }
    const single = (process.env.VIVIBE_API_KEY || '').trim();
    if (single)
        single
            .split(',')
            .map((s) => s.trim())
            .filter(Boolean)
            .forEach((k) => {
                if (!arr.includes(k)) arr.push(k);
            });
    return arr;
}
function configured() {
    return _keys().length > 0;
}
function keyCount() {
    return _keys().length;
}

// Thứ tự thử key: round-robin + đẩy key đang cooldown xuống cuối.
function _orderedKeys() {
    const keys = _keys();
    if (!keys.length) return [];
    const now = Date.now();
    const start = _rr % keys.length;
    _rr = (_rr + 1) % keys.length;
    const ordered = [];
    for (let i = 0; i < keys.length; i++) ordered.push(keys[(start + i) % keys.length]);
    const fresh = ordered.filter((k) => !(_cooldown.get(k) > now));
    const cooled = ordered.filter((k) => _cooldown.get(k) > now);
    return fresh.concat(cooled);
}

// 1 lời gọi JSON-RPC với 1 key cụ thể. Ném Error có cờ _auth/_quota để biết đổi key.
async function _rpc(key, method, input) {
    let r;
    try {
        r = await fetch(EP, {
            method: 'POST',
            headers: { Authorization: `Bearer ${key}`, 'content-type': 'application/json' },
            body: JSON.stringify({ jsonrpc: '2.0', id: 'n2s', method, input }),
        });
    } catch (e) {
        const err = new Error('Không kết nối được dịch vụ giọng: ' + (e.message || e));
        err._net = true;
        throw err;
    }
    let body = null;
    try {
        body = await r.json();
    } catch {}
    if (!r.ok || (body && body.error)) {
        const msg =
            (body && body.error && (body.error.message || body.error.code)) || `HTTP ${r.status}`;
        const err = new Error(String(msg).slice(0, 300));
        const s = `${r.status} ${msg}`;
        if (r.status === 401 || r.status === 403 || /unauth|invalid.*key|forbidden/i.test(s))
            err._auth = true;
        if (
            r.status === 429 ||
            r.status === 402 ||
            /credit|quota|insufficient|limit|exceeded|too_many/i.test(s)
        )
            err._quota = true;
        throw err;
    }
    return body ? body.result : null;
}

// Chạy fn(key) lần lượt; key auth/quota lỗi → cooldown + thử key kế. Lỗi khác → ném ngay.
async function _withKey(fn) {
    const keys = _orderedKeys();
    if (!keys.length) throw new Error('VIVIBE_API_KEY chưa cấu hình');
    let lastErr;
    for (const key of keys) {
        try {
            return await fn(key);
        } catch (e) {
            lastErr = e;
            if (e && (e._auth || e._quota)) {
                _cooldown.set(key, Date.now() + COOLDOWN_MS);
                continue;
            }
            throw e; // lỗi nội dung (text rỗng, voice id sai…) → không phí key khác
        }
    }
    throw lastErr || new Error('Tất cả key đều lỗi/hết credit');
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let _voicesCache = null;
let _voicesAt = 0;
const VOICES_TTL = 10 * 60 * 1000;

// Chuẩn hoá 1 voice record → shape gọn cho frontend (KHÔNG lộ field nội bộ nhà cung cấp).
function _mapVoice(v) {
    return {
        id: v.id,
        name: v.name,
        tags: Array.isArray(v.tags) ? v.tags : [],
        description: v.description || '',
    };
}

// Giọng cộng đồng (getCommunityVoices — method DUY NHẤT liệt kê được qua API key).
// params: {search, page, limit}. Trả {voices, total, hasNext}.
async function listCommunityVoices(params = {}) {
    const input = {
        limit: Math.min(60, Math.max(1, +params.limit || 40)),
        page: Math.max(1, +params.page || 1),
    };
    const search = String(params.search || '').trim();
    if (search) input.search = search.slice(0, 60);
    const cacheable = !search && input.page === 1 && input.limit === 40;
    const now = Date.now();
    if (cacheable && _voicesCache && now - _voicesAt < VOICES_TTL) return _voicesCache;
    const out = await _withKey(async (key) => {
        const res = (await _rpc(key, 'getCommunityVoices', input)) || {};
        return {
            voices: (res.items || []).map(_mapVoice),
            total: res.total || 0,
            hasNext: !!res.hasNext,
        };
    });
    if (cacheable) {
        _voicesCache = out;
        _voicesAt = now;
    }
    return out;
}

// Giọng của tài khoản (getUserVoices). params: {page, limit}.
async function listUserVoices(params = {}) {
    const input = {
        limit: Math.min(60, Math.max(1, +params.limit || 40)),
        page: Math.max(1, +params.page || 1),
    };
    return _withKey(async (key) => {
        const res = (await _rpc(key, 'getUserVoices', input)) || {};
        return {
            voices: (res.items || []).map(_mapVoice),
            total: res.total || 0,
            hasNext: !!res.hasNext,
        };
    });
}

// text → wav Buffer. voiceId = id giọng (community/user đều dùng được). opts: {speed}.
// 1 key chạy hết chu trình submit→poll→download (giữ nguyên key cho cả job).
async function tts(text, voiceId, opts = {}) {
    const t = String(text || '').trim();
    if (!t) throw new Error('text rỗng');
    if (!voiceId) throw new Error('thiếu voice_id');
    const clipped = t.length > MAX_TEXT ? t.slice(0, MAX_TEXT) : t;
    const speed = Math.max(0.5, Math.min(2.0, Number(opts.speed) || 1.0));
    return _withKey(async (key) => {
        const sub = await _rpc(key, 'ttsLongText', {
            text: clipped,
            userVoiceId: voiceId,
            speed,
        });
        const exportId = sub && sub.projectExportId;
        if (!exportId) throw new Error('Không tạo được job TTS');
        const start = Date.now();
        let url = '';
        while (Date.now() - start < POLL_TIMEOUT_MS) {
            await sleep(POLL_INTERVAL_MS);
            const st = (await _rpc(key, 'getExportStatus', { projectExportId: exportId })) || {};
            if (st.state === 'completed') {
                url = st.url;
                break;
            }
            if (st.state === 'failed') {
                throw new Error('Tạo giọng thất bại: ' + (st.error || 'unknown'));
            }
            // pending / processing / active → tiếp tục poll
        }
        if (!url) throw new Error('Tạo giọng quá lâu (timeout)');
        // RELAY: tải .wav công khai về server → trả Buffer (không lộ domain nhà cung cấp).
        const ar = await fetch(url);
        if (!ar.ok) throw new Error('Tải audio thất bại: HTTP ' + ar.status);
        return Buffer.from(await ar.arrayBuffer());
    });
}

module.exports = {
    configured,
    keyCount,
    listCommunityVoices,
    listUserVoices,
    tts,
    MAX_TEXT,
};
