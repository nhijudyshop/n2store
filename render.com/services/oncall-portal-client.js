// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | Read these files before coding, update dev-log after changes.

/**
 * OnCallCX Portal Client — HTTP-only (no browser)
 *
 * Thực hiện login + fetch data từ PrimeFaces/JSF portal pbx-ucaas.oncallcx.vn
 * bằng node-fetch + HTML parsing (regex). Không cần Playwright runtime.
 *
 * API:
 *   const client = new OnCallPortalClient({ username, password });
 *   await client.login();                        // idempotent, cache session
 *   const calls = await client.listCalls({ page: 1 });
 *   const stream = await client.downloadRecording(rowKey);  // returns fetch Response
 *   const exts = await client.listExtensions();
 *   const live = await client.listLiveCalls();
 *   const dids = await client.listPublicNumbers();
 *
 * Session caching: 1 instance giữ cookie + ViewState trong memory.
 * ANAUTH cookie thường tồn tại ~1h. Khi hết hạn, call tự re-login.
 */

const fetch = require('node-fetch');

const PORTAL_BASE = 'https://pbx-ucaas.oncallcx.vn';
const LOGIN_URL   = `${PORTAL_BASE}/portal/login.xhtml`;

const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

// ============================================================
// Helpers
// ============================================================

/** Parse Set-Cookie headers → cookie jar { name: value } */
function parseCookies(setCookieHeaders, jar = {}) {
    const raw = Array.isArray(setCookieHeaders) ? setCookieHeaders : (setCookieHeaders ? [setCookieHeaders] : []);
    for (const sc of raw) {
        const pair = sc.split(';')[0];
        const idx = pair.indexOf('=');
        if (idx <= 0) continue;
        const name = pair.slice(0, idx).trim();
        const value = pair.slice(idx + 1).trim();
        if (!name) continue;
        if (/^deleted$/i.test(value) || /Max-Age=0/i.test(sc)) { delete jar[name]; continue; }
        jar[name] = value;
    }
    return jar;
}

function jarToHeader(jar) {
    return Object.entries(jar).map(([k, v]) => `${k}=${v}`).join('; ');
}

function extractBetween(html, startRe, endRe) {
    const s = html.search(startRe);
    if (s < 0) return null;
    const rest = html.slice(s);
    const e = rest.search(endRe);
    if (e < 0) return null;
    return rest.slice(0, e);
}

/** Extract `javax.faces.ViewState` hidden input from HTML */
function extractViewState(html) {
    const m = html.match(/name="javax\.faces\.ViewState"[^>]*value="([^"]+)"/)
        || html.match(/id="javax\.faces\.ViewState[^"]*"[^>]*value="([^"]+)"/);
    return m ? decodeHtml(m[1]) : null;
}

function extractNonce(html) {
    const m = html.match(/name="primefaces\.nonce"[^>]*value="([^"]+)"/);
    return m ? decodeHtml(m[1]) : null;
}

function decodeHtml(s) {
    return s.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'");
}

function parseTableRows(html, tableId) {
    // Escape tableId for regex (contains `:`)
    const escId = tableId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    // Match <table id="..."> ... <tbody> ... </tbody>
    const tblRe = new RegExp(`id="${escId}"[\\s\\S]*?<tbody[^>]*>([\\s\\S]*?)</tbody>`, 'i');
    const m = html.match(tblRe);
    if (!m) return [];
    const tbodyHtml = m[1];
    const rowRe = /<tr[^>]*data-ri="(\d+)"(?:[^>]*data-rk="([^"]+)")?[^>]*>([\s\S]*?)<\/tr>/g;
    const rows = [];
    let rm;
    while ((rm = rowRe.exec(tbodyHtml)) !== null) {
        const cells = [];
        const cellRe = /<td[^>]*>([\s\S]*?)<\/td>/g;
        let cm;
        while ((cm = cellRe.exec(rm[3])) !== null) {
            const text = cm[1]
                .replace(/<span[^>]*class="ui-column-title"[^>]*>[^<]*<\/span>/g, '')
                .replace(/<[^>]+>/g, ' ')
                .replace(/\s+/g, ' ')
                .trim();
            cells.push(decodeHtml(text));
        }
        rows.push({ dataRi: rm[1], dataRk: rm[2] || null, cells });
    }
    return rows;
}

function parseTableHeaders(html, tableId) {
    const escId = tableId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const tblRe = new RegExp(`id="${escId}"[\\s\\S]*?<thead[^>]*>([\\s\\S]*?)</thead>`, 'i');
    const m = html.match(tblRe);
    if (!m) return [];
    const thRe = /<span[^>]*class="[^"]*ui-column-title[^"]*"[^>]*>([^<]*)<\/span>/g;
    const heads = [];
    let hm;
    while ((hm = thRe.exec(m[1])) !== null) {
        const t = decodeHtml(hm[1].replace(/\s+/g, ' ').trim());
        if (t) heads.push(t);
    }
    return heads;
}

// ============================================================
// Client
// ============================================================

class OnCallPortalClient {
    constructor({ username, password, debug = false } = {}) {
        this.username = username || process.env.ONCALL_USERNAME;
        this.password = password || process.env.ONCALL_PASSWORD;
        if (!this.username || !this.password) throw new Error('OnCallPortalClient: username/password required');
        this.cookies = {};
        this.lastLoginAt = 0;
        this.debug = debug;
        // Re-login after this long (avoid using stale ANAUTH)
        this.sessionMaxAgeMs = 40 * 60 * 1000; // 40 min
    }

    _log(...a) { if (this.debug) console.log('[oncall]', ...a); }

    /** Ensure we have a fresh ANAUTH. Re-login if not or expired. */
    async login(force = false) {
        const fresh = Date.now() - this.lastLoginAt < this.sessionMaxAgeMs;
        if (!force && fresh && this.cookies.ANAUTH) return;

        this._log('Logging in…');
        // Step 1: GET login.xhtml → ViewState, nonce, JSESSIONID
        const r1 = await fetch(LOGIN_URL, { headers: { 'User-Agent': UA }, redirect: 'manual' });
        const sc1 = r1.headers.raw ? r1.headers.raw()['set-cookie'] : r1.headers.get('set-cookie');
        parseCookies(sc1, this.cookies);
        const html1 = await r1.text();
        const viewState = extractViewState(html1);
        const nonce = extractNonce(html1);
        if (!viewState) throw new Error('Login step 1: ViewState not found');
        this._log('Got JSESSIONID:', this.cookies.JSESSIONID?.slice(0, 20), '| VS len:', viewState.length);

        // Step 2: POST credentials
        const body = new URLSearchParams({
            'javax.faces.partial.ajax': 'true',
            'javax.faces.source': 'loginForm:login',
            'javax.faces.partial.execute': 'loginForm',
            'javax.faces.partial.render': 'loginForm',
            'loginForm:login': 'loginForm:login',
            'loginForm:username': this.username,
            'loginForm:password': this.password,
            'loginForm_SUBMIT': '1',
            'javax.faces.ViewState': viewState,
            'primefaces.nonce': nonce || '',
        });
        const jsid = this.cookies.JSESSIONID;
        const postUrl = `${LOGIN_URL}${jsid ? ';jsessionid=' + jsid : ''}`;
        const r2 = await fetch(postUrl, {
            method: 'POST',
            headers: {
                'User-Agent': UA,
                'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
                'Faces-Request': 'partial/ajax',
                'X-Requested-With': 'XMLHttpRequest',
                'Accept': 'application/xml, text/xml, */*; q=0.01',
                'Cookie': jarToHeader(this.cookies),
                'Referer': LOGIN_URL,
                'Origin': PORTAL_BASE,
            },
            body,
            redirect: 'manual',
        });
        const sc2 = r2.headers.raw ? r2.headers.raw()['set-cookie'] : r2.headers.get('set-cookie');
        parseCookies(sc2, this.cookies);
        if (!this.cookies.ANAUTH) {
            const txt = await r2.text();
            throw new Error('Login failed: no ANAUTH cookie. Response: ' + txt.slice(0, 200));
        }
        this.lastLoginAt = Date.now();
        this._log('Login OK. Cookies:', Object.keys(this.cookies).join(', '));
    }

    /** GET a portal page, return { html, viewState, nonce } */
    async getPage(url) {
        await this.login();
        const r = await fetch(url, {
            headers: {
                'User-Agent': UA,
                'Cookie': jarToHeader(this.cookies),
                'Accept': 'text/html,application/xhtml+xml',
                'Referer': PORTAL_BASE + '/portal/',
            },
            redirect: 'manual',
        });
        const sc = r.headers.raw ? r.headers.raw()['set-cookie'] : r.headers.get('set-cookie');
        parseCookies(sc, this.cookies);
        const finalUrl = r.headers.get('location') || url;
        if (finalUrl.includes('login.xhtml') || finalUrl.includes('404')) {
            // session expired, re-login & retry once
            this._log('Session expired, retrying…');
            await this.login(true);
            const r2 = await fetch(url, {
                headers: { 'User-Agent': UA, 'Cookie': jarToHeader(this.cookies), 'Accept': 'text/html', 'Referer': PORTAL_BASE + '/portal/' },
                redirect: 'manual',
            });
            const html = await r2.text();
            return { html, viewState: extractViewState(html), nonce: extractNonce(html) };
        }
        const html = await r.text();
        return { html, viewState: extractViewState(html), nonce: extractNonce(html) };
    }

    /** POST a PrimeFaces AJAX action, return response text (XML) */
    async postAjax(pageUrl, fields) {
        const body = new URLSearchParams(fields);
        const r = await fetch(pageUrl, {
            method: 'POST',
            headers: {
                'User-Agent': UA,
                'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
                'Faces-Request': 'partial/ajax',
                'X-Requested-With': 'XMLHttpRequest',
                'Accept': 'application/xml, text/xml, */*; q=0.01',
                'Cookie': jarToHeader(this.cookies),
                'Referer': pageUrl,
                'Origin': PORTAL_BASE,
            },
            body,
            redirect: 'manual',
        });
        const sc = r.headers.raw ? r.headers.raw()['set-cookie'] : r.headers.get('set-cookie');
        parseCookies(sc, this.cookies);
        return { status: r.status, text: await r.text(), headers: r.headers };
    }

    // ==================== Public APIs ====================

    /** List calls from pbxCalls.xhtml */
    async listCalls({ page = 1 } = {}) {
        const url = `${PORTAL_BASE}/portal/pbxCalls.xhtml`;
        const { html } = await this.getPage(url);
        const headers = parseTableHeaders(html, 'content:calls:calls');
        const rows = parseTableRows(html, 'content:calls:calls');
        // Map cells → fields (cell[0] is radio, skip)
        const calls = rows.map(r => {
            const c = r.cells;
            return {
                rowKey: r.dataRk,
                rowIndex: parseInt(r.dataRi, 10),
                start: c[1] || '',
                from: c[2] || '',
                outboundPublicNumber: c[3] || '',
                to: c[4] || '',
                restricted: /yes/i.test(c[5] || ''),
                connected: /yes/i.test(c[6] || ''),
                duration: c[7] || '',
                sipStatus: c[8] || '',
                hasRecording: /yes/i.test(c[6] || '') && c[7] && c[7] !== '00:00:00',
            };
        });
        return { headers, total: calls.length, calls, page };
    }

    /** Download recording for a given rowKey. Returns { filename, stream, contentType, contentLength } */
    async downloadRecording(rowKey) {
        const pageUrl = `${PORTAL_BASE}/portal/pbxCalls.xhtml`;
        const { html, viewState, nonce } = await this.getPage(pageUrl);
        if (!viewState) throw new Error('Calls page: ViewState not found');

        // Step 1: Select row (AJAX)
        const selFields = {
            'javax.faces.partial.ajax': 'true',
            'javax.faces.source': 'content:calls:calls',
            'javax.faces.partial.execute': 'content:calls:calls',
            'javax.faces.partial.render': 'content:calls:headerButtons content:calls:unselectButton',
            'javax.faces.behavior.event': 'rowSelectRadio',
            'javax.faces.partial.event': 'rowSelectRadio',
            'content:calls:calls_instantSelectedRowKey': rowKey,
            'content:calls:calls_radio': 'on',
            'content:calls:calls_selection': rowKey,
            'content:calls:calls_reflowDD': '0_0',
            'content:calls:calls_rppDD': '25',
            'content_SUBMIT': '1',
            'javax.faces.ViewState': viewState,
            'primefaces.nonce': nonce || '',
        };
        const selResp = await this.postAjax(pageUrl, selFields);
        if (selResp.status !== 200) throw new Error(`Select row failed: status ${selResp.status}`);
        // ViewState có thể refresh — parse lại từ XML response
        const newVs = selResp.text.match(/<update id="j_id__v_0:javax\.faces\.ViewState[^"]*"><!\[CDATA\[([^\]]+)\]\]><\/update>/)
            || selResp.text.match(/<update[^>]*javax\.faces\.ViewState[^"]*"><!\[CDATA\[([^\]]+)\]\]/);
        const vs2 = newVs ? newVs[1] : viewState;

        // Step 2: Click Download Audio button (AJAX)
        const dlFields = {
            'javax.faces.partial.ajax': 'true',
            'javax.faces.source': 'content:calls:j_id_89',
            'javax.faces.partial.execute': '@all',
            'javax.faces.partial.render': 'audioDownloadProgress',
            'content:calls:j_id_89': 'content:calls:j_id_89',
            'content:calls:calls_selection': rowKey,
            'content:calls:calls_rppDD': '25',
            'content_SUBMIT': '1',
            'javax.faces.ViewState': vs2,
            'primefaces.nonce': nonce || '',
        };
        const dlResp = await this.postAjax(pageUrl, dlFields);
        if (dlResp.status !== 200) throw new Error(`Trigger download failed: status ${dlResp.status}`);

        // Step 3: Parse download URL từ XML response
        // Response chứa một <redirect> hoặc một update với URL /download/...
        const urlMatch = dlResp.text.match(/\/download\/[^"'\s<>&]+(?:\?[^"'\s<>&]+)?/);
        if (!urlMatch) {
            throw new Error('Download URL not found in response: ' + dlResp.text.slice(0, 400));
        }
        const downloadUrl = PORTAL_BASE + decodeHtml(urlMatch[0]);

        // Step 4: GET file (stream)
        const fileResp = await fetch(downloadUrl, {
            headers: { 'User-Agent': UA, 'Cookie': jarToHeader(this.cookies), 'Referer': pageUrl },
        });
        if (fileResp.status !== 200) throw new Error(`Download file failed: status ${fileResp.status}`);
        const filename = (downloadUrl.split('/').pop() || 'recording.wav').split('?')[0];
        return {
            filename,
            stream: fileResp.body,
            contentType: fileResp.headers.get('content-type') || 'audio/wav',
            contentLength: fileResp.headers.get('content-length'),
            downloadUrl,
        };
    }

    /** List extensions from privateNumbers.xhtml */
    async listExtensions() {
        const { html } = await this.getPage(`${PORTAL_BASE}/portal/privateNumbers.xhtml`);
        const headers = parseTableHeaders(html, 'content:privateNumbers:privateNumbers');
        const rows = parseTableRows(html, 'content:privateNumbers:privateNumbers');
        return {
            headers,
            extensions: rows.map(r => ({
                rowKey: r.dataRk,
                extension: r.cells[1] || '',
                displayedName: r.cells[2] || '',
                pbxUser: r.cells[3] || '',
                publicDialInNumber: r.cells[4] || '',
                extraCells: r.cells.slice(5),
            })),
        };
    }

    /** Live calls */
    async listLiveCalls() {
        const { html } = await this.getPage(`${PORTAL_BASE}/portal/pbxLiveCallMonitoring.xhtml`);
        const headers = parseTableHeaders(html, 'content:liveCallMonitoring:liveCallMonitoring');
        const rows = parseTableRows(html, 'content:liveCallMonitoring:liveCallMonitoring');
        return {
            headers,
            liveCalls: rows.map(r => ({
                rowKey: r.dataRk,
                callingNumber: r.cells[1] || '',
                calledNumber: r.cells[2] || '',
                terminal: r.cells[3] || '',
                channelDirection: r.cells[4] || '',
                extra: r.cells.slice(5),
            })),
        };
    }

    /** Public numbers (DID) */
    async listPublicNumbers() {
        const { html } = await this.getPage(`${PORTAL_BASE}/portal/publicNumbers.xhtml`);
        const headers = parseTableHeaders(html, 'content:publicNumbers:publicNumbers');
        const rows = parseTableRows(html, 'content:publicNumbers:publicNumbers');
        return {
            headers,
            publicNumbers: rows.map(r => ({
                rowKey: r.dataRk,
                publicNumber: r.cells[1] || '',
                name: r.cells[2] || '',
                destination: r.cells[3] || '',
                outboundUsedBy: r.cells[4] || '',
                extra: r.cells.slice(5),
            })),
        };
    }

    /** Dashboard summary — phone status */
    async dashboard() {
        const { html } = await this.getPage(`${PORTAL_BASE}/portal/pbxDashboard.xhtml`);
        const phonesRows = parseTableRows(html, 'content:phones:phones');
        return {
            phones: phonesRows.map(r => ({
                rowKey: r.dataRk,
                internalNumber: r.cells[1] || '',
                phoneName: r.cells[2] || '',
                status: r.cells[3] || '',
                extra: r.cells.slice(4),
            })),
        };
    }
}

module.exports = { OnCallPortalClient };
