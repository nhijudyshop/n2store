// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | WEB2.0 MODULE.
// =====================================================
// Web 2.0 — Pancake server-side LOGIN (pure Node, no browser)
// =====================================================
// Đăng nhập Pancake bằng id/password qua 3 request thuần (cookie jar + follow
// redirect tay) → lấy cookie `jwt`. Dùng cho auto-refresh token hết hạn (cron
// + on-demand) — KHÔNG cần headless Chromium trên Render.
//
// Flow (đã verify thực tế):
//   1. GET  account.pancake.vn/oauth2/authorize  → parse _csrf_token, device_info, _query_string
//   2. POST account.pancake.vn/page/login        → identity+password+hidden  (lands on approve page)
//   3. POST account.pancake.vn/page/oauth2/approve {_csrf_token, approve:true}
//      → redirect pancake.vn/.../pancake_id_login_success → set cookie `jwt`
//
// loginPancake({identity,password}) → { ok, token, decoded } | { ok:false, reason }

const CLIENT_ID = '53e2d5e33a8940f4a30ba22a4011e52a';
const STATE =
    'eyJsb2NhbGUiOiJ2aSIsImNvdW50cnkiOiJWTiIsImJyb3dzZXIiOjEsIm9zIjoxLCJkZXZpY2VfdHlwZSI6MywiY2xpZW50X3ZlcnNpb24iOjEsImFwcGxpY2F0aW9uIjoxfQ%3D%3D';
const AUTHORIZE_URL =
    'https://account.pancake.vn/oauth2/authorize?grant_type=code&client_id=' +
    CLIENT_ID +
    '&redirect_uri=https%3A%2F%2Fpancake.vn%2Fapi%2Fv1%2Fusers%2Fpancake_id_login_success' +
    '&scope=avatar%2Cemail%2Csubscriptions&verification_method=email&locale=vi&is_mobile_fb=true&isMFb=true&state=' +
    STATE;
const UA =
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0 Safari/537.36';
const MAX_HOPS = 20;

function htmlDecode(s) {
    return s == null
        ? s
        : s
              .replace(/&amp;/g, '&')
              .replace(/&quot;/g, '"')
              .replace(/&#39;/g, "'")
              .replace(/&#x2F;/g, '/')
              .replace(/&lt;/g, '<')
              .replace(/&gt;/g, '>');
}
function field(html, name) {
    const m = html.match(new RegExp('name="' + name + '"[^>]*value="([^"]*)"'));
    return m ? htmlDecode(m[1]) : null;
}
function formAction(html) {
    const m = html.match(/<form[^>]*action="([^"]*)"/);
    return m ? htmlDecode(m[1]) : null;
}
function decodeJwt(token) {
    try {
        const p = String(token).split('.');
        if (p.length !== 3) return null;
        let b = p[1].replace(/-/g, '+').replace(/_/g, '/');
        const pad = b.length % 4;
        if (pad) b += '='.repeat(4 - pad);
        return JSON.parse(Buffer.from(b, 'base64').toString('utf-8'));
    } catch {
        return null;
    }
}

// Minimal cookie jar — flow chỉ hit *.pancake.vn nên gom chung 1 jar theo name.
function makeJar() {
    const jar = new Map();
    return {
        setFrom(resp) {
            let list = [];
            try {
                list =
                    typeof resp.headers.getSetCookie === 'function'
                        ? resp.headers.getSetCookie()
                        : [];
            } catch {
                /* */
            }
            if (!list.length) {
                const raw = resp.headers.get('set-cookie');
                if (raw) list = [raw];
            }
            for (const sc of list) {
                const first = sc.split(';')[0];
                const eq = first.indexOf('=');
                if (eq > 0) {
                    const name = first.slice(0, eq).trim();
                    const val = first.slice(eq + 1).trim();
                    if (name) jar.set(name, val);
                }
            }
        },
        header() {
            return [...jar.entries()].map(([k, v]) => k + '=' + v).join('; ');
        },
        get(name) {
            return jar.get(name) || null;
        },
    };
}

// fetch + follow redirects thủ công, giữ cookie jar.
async function followFetch(jar, url, { method = 'GET', body = null, referer = null } = {}) {
    let curUrl = url;
    let curMethod = method;
    let curBody = body;
    for (let hop = 0; hop < MAX_HOPS; hop++) {
        const headers = {
            'User-Agent': UA,
            // Browser-like Accept — endpoint pancake_id_login_success trả 406 nếu
            // Accept quá hẹp (vd chỉ 'text/html').
            Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
            'Accept-Language': 'vi,en;q=0.9',
            Cookie: jar.header(),
        };
        if (referer) headers.Referer = referer;
        if (curBody != null) headers['Content-Type'] = 'application/x-www-form-urlencoded';

        const resp = await fetch(curUrl, {
            method: curMethod,
            headers,
            body: curBody,
            redirect: 'manual',
        });
        jar.setFrom(resp);

        const status = resp.status;
        if (status >= 300 && status < 400) {
            const loc = resp.headers.get('location');
            if (!loc) return resp;
            curUrl = new URL(loc, curUrl).toString();
            curMethod = 'GET'; // redirect → GET
            curBody = null;
            referer = null;
            continue;
        }
        // final
        const text = await resp.text().catch(() => '');
        return { status, url: curUrl, text, headers: resp.headers };
    }
    throw new Error('too_many_redirects');
}

/**
 * Đăng nhập 1 account Pancake. Trả về { ok, token, decoded } hoặc
 * { ok:false, reason }. reason: 'no_csrf'|'login_failed'|'approve_failed'|'no_jwt'|'needs_otp'|...
 */
async function loginPancake({ identity, password }) {
    if (!identity || !password) return { ok: false, reason: 'missing_credentials' };
    const jar = makeJar();
    try {
        // 1) GET authorize
        const g = await followFetch(jar, AUTHORIZE_URL);
        const csrf = field(g.text, '_csrf_token');
        const dev = field(g.text, 'device_info');
        const qs = field(g.text, '_query_string');
        if (!csrf) return { ok: false, reason: 'no_csrf' };

        // 2) POST login
        const loginBody = new URLSearchParams({
            _csrf_token: csrf,
            device_info: dev || '',
            _query_string: qs || '',
            identity,
            password,
        }).toString();
        const p = await followFetch(jar, 'https://account.pancake.vn/page/login', {
            method: 'POST',
            body: loginBody,
            referer: AUTHORIZE_URL,
        });
        // Sai mật khẩu / OTP → vẫn ở trang login/verify, không có form approve
        if (
            /name="identity"/.test(p.text) &&
            /mật khẩu|password|không chính xác|sai/i.test(p.text)
        ) {
            return { ok: false, reason: 'login_failed' };
        }
        if (/name=("|')?otp|nhập mã|verification code|mã xác/i.test(p.text)) {
            return { ok: false, reason: 'needs_otp' };
        }

        // 3) POST approve
        const action = formAction(p.text);
        const acsrf = field(p.text, '_csrf_token');
        if (!action || !acsrf) {
            // có thể đã set jwt luôn (đã từng approve trước đó)
            const direct = jar.get('jwt');
            if (direct) return _finish(direct);
            return { ok: false, reason: 'approve_failed' };
        }
        const approveUrl = action.startsWith('http')
            ? action
            : 'https://account.pancake.vn' + action;
        await followFetch(jar, approveUrl, {
            method: 'POST',
            body: new URLSearchParams({ _csrf_token: acsrf, approve: 'true' }).toString(),
            referer: p.url,
        });

        const jwt = jar.get('jwt');
        if (!jwt) return { ok: false, reason: 'no_jwt' };
        return _finish(jwt);
    } catch (e) {
        return { ok: false, reason: (e.message || 'error').slice(0, 120) };
    }
}

function _finish(jwt) {
    const decoded = decodeJwt(jwt);
    if (!decoded || !decoded.uid) return { ok: false, reason: 'bad_token' };
    return { ok: true, token: jwt, decoded };
}

module.exports = { loginPancake, decodeJwt };
