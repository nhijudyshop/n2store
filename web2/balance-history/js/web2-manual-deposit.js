// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | WEB2.0 — manual deposit modal cho balance-history page.
// =====================================================================
// Web2ManualDeposit — admin nạp tay vào ví KH (web2_customer_wallets) hoặc
// NCC (Firestore web2_supplier_wallet via polling). UI:
//   • KH: type name/phone + Enter → WEB2 search → dropdown candidates → pick
//   • NCC: select dropdown loaded từ Firestore web2_supplier_wallet/main
// =====================================================================

(function (global) {
    'use strict';

    // 1 nguồn base-URL = WEB2_CONFIG (web2-auth.js load trước); literal chỉ là fallback.
    const _WORKER =
        global.API_CONFIG?.WORKER_URL ||
        global.WEB2_CONFIG?.WORKER_URL ||
        'https://chatomni-proxy.nhijudyshop.workers.dev';
    const _DIRECT = global.WEB2_CONFIG?.WEB2_API || 'https://web2-api-kv04.onrender.com';
    const BASE = _WORKER + '/api/web2/balance-history';
    const FALLBACK = _DIRECT + '/api/web2/balance-history';

    let _selectedKh = null; // { id, name, phone }
    let _nccLoaded = false;

    function isAdmin() {
        try {
            const authStr =
                localStorage.getItem('loginindex_auth') ||
                sessionStorage.getItem('loginindex_auth') ||
                '{}';
            const auth = JSON.parse(authStr);
            const userType = localStorage.getItem('userType') || '';
            return (
                auth.isAdmin === true ||
                auth.roleTemplate === 'admin' ||
                userType.startsWith('admin')
            );
        } catch {
            return false;
        }
    }

    function getCurrentUserName() {
        try {
            const authStr =
                localStorage.getItem('loginindex_auth') ||
                sessionStorage.getItem('loginindex_auth') ||
                '{}';
            const auth = JSON.parse(authStr);
            return auth.username || auth.userName || auth.email || 'admin';
        } catch {
            return 'admin';
        }
    }

    function ensureStyles() {
        if (document.getElementById('web2-manual-deposit-styles')) return;
        const css = `
.w2md-modal { position: fixed; inset: 0; z-index: 9999; display: flex;
  align-items: center; justify-content: center; }
.w2md-modal[hidden] { display: none; }
.w2md-backdrop { position: absolute; inset: 0; background: rgba(15, 23, 42, 0.42); }
.w2md-panel { position: relative; background: #fff; border-radius: var(--web2-radius, 12px);
  width: min(540px, calc(100vw - 32px)); max-height: calc(100vh - 32px);
  overflow: auto; box-shadow: var(--shadow-lg, 0 12px 24px rgba(15,23,42,0.18));
  display: flex; flex-direction: column; }
.w2md-head { position: relative; display: flex; justify-content: space-between; align-items: center;
  padding: 14px 20px; border-bottom: 1px solid var(--web2-border-btn, #e5e7eb);
  background: linear-gradient(180deg, var(--web2-primary-soft, #eef4ff) 0%, #fff 100%); }
.w2md-head::after { content: ""; position: absolute; left: 20px; bottom: -1px;
  width: 60px; height: 2px; background: linear-gradient(90deg, var(--web2-primary, #0068ff), var(--web2-info, #38bdf8)); }
.w2md-head h3 { margin: 0; font-size: 15px; font-weight: 700; color: var(--native-text, #111827); }
.w2md-close { background: none; border: 0; cursor: pointer; padding: 4px;
  color: #6b7280; border-radius: var(--web2-radius-sm, 9px); }
.w2md-close:hover { background: #f3f4f6; color: #111827; }
.w2md-body { padding: 16px 20px; display: flex; flex-direction: column; gap: 14px; }
.w2md-banner { background: #eff6ff; border: 1px solid #bfdbfe; color: #1e40af;
  padding: 10px 12px; border-radius: 6px; font-size: 13px; display: flex;
  gap: 8px; align-items: flex-start; }
.w2md-banner i[data-lucide], .w2md-banner svg { width: 16px; height: 16px; flex-shrink: 0; margin-top: 2px; }
.w2md-field label { display: block; font-size: 12px; font-weight: 600;
  color: #374151; margin-bottom: 6px; text-transform: uppercase; letter-spacing: 0.02em; }
.w2md-field input, .w2md-field textarea, .w2md-field select { width: 100%;
  border: 1px solid #d1d5db; border-radius: 6px; padding: 8px 12px;
  font-size: 14px; font-family: inherit; outline: none; box-sizing: border-box; }
.w2md-field input:focus, .w2md-field textarea:focus, .w2md-field select:focus {
  border-color: #2a96ff; box-shadow: 0 0 0 3px rgba(0, 104, 255,0.15); }
.w2md-hint { display: block; font-size: 11px; color: #6b7280; margin-top: 4px; }
.w2md-target-row { display: flex; gap: 16px; }
.w2md-radio { display: flex; align-items: center; gap: 6px; cursor: pointer; font-size: 14px; }
.w2md-radio input { width: auto; margin: 0; }
.w2md-error { color: #dc2626; font-size: 13px; padding: 8px 12px;
  background: #fef2f2; border: 1px solid #fecaca; border-radius: 6px; }
.w2md-foot { display: flex; justify-content: flex-end; gap: 8px;
  padding: 12px 20px; border-top: 1px solid var(--border, #e5e7eb); background: var(--gray-50, #f9fafb);
  border-radius: 0 0 var(--web2-radius, 12px) var(--web2-radius, 12px); }
.w2bh-btn-primary { background: #2a96ff !important; color: #fff !important; border-color: #2a96ff !important; }
.w2bh-btn-primary:hover:not(:disabled) { background: #0058da !important; }

/* KH search */
.w2md-search-wrap { display: flex; gap: 6px; }
.w2md-search-wrap input { flex: 1; }
.w2md-icon-btn { background: #f3f4f6; border: 1px solid #d1d5db; padding: 0 12px;
  border-radius: 6px; cursor: pointer; color: #374151; }
.w2md-icon-btn:hover { background: #e5e7eb; }
.w2md-icon-btn svg { width: 16px; height: 16px; }
.w2md-result-list { margin-top: 8px; border: 1px solid #e5e7eb; border-radius: 6px;
  max-height: 220px; overflow-y: auto; background: #fff; }
.w2md-result-row { padding: 8px 12px; cursor: pointer; border-bottom: 1px solid #f3f4f6;
  display: flex; justify-content: space-between; gap: 12px; align-items: center; }
.w2md-result-row:last-child { border-bottom: 0; }
.w2md-result-row:hover { background: #f9fafb; }
.w2md-result-info { display: flex; gap: 8px; align-items: center; flex: 1; }
.w2md-result-name { font-weight: 500; color: #111827; font-size: 14px; }
.w2md-result-phone { color: #6b7280; font-size: 13px; font-family: ui-monospace, monospace; }
.w2md-source-badge { font-size: 10px; padding: 2px 6px; border-radius: 4px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.04em; }
.w2md-source-web2 { background: #dbeafe; color: #1e40af; }
.w2md-source-web2 { background: #fef3c7; color: #92400e; }

/* NCC field — label row + create button + new input wrap */
.w2md-label-row { display: flex; justify-content: space-between; align-items: center;
  margin-bottom: 6px; }
.w2md-label-row label { margin: 0 !important; }
.w2md-mini-btn { display: inline-flex; align-items: center; gap: 4px;
  font-size: 11px; font-weight: 600; padding: 4px 10px; border-radius: 4px;
  background: #2a96ff; color: #fff; border: 0; cursor: pointer;
  text-transform: uppercase; letter-spacing: 0.04em; }
.w2md-mini-btn:hover { background: #0058da; }
.w2md-mini-btn svg { width: 12px; height: 12px; }
.w2md-mini-btn-ghost { background: #f3f4f6; color: #6b7280; }
.w2md-mini-btn-ghost:hover { background: #e5e7eb; color: #111827; }
.w2md-ncc-new-wrap { display: flex; gap: 6px; margin-top: 8px; }
.w2md-ncc-new-wrap input { flex: 1; }
.w2md-result-empty { padding: 16px; text-align: center; color: #6b7280; font-size: 13px; }
.w2md-selected { margin-top: 8px; padding: 10px 12px; background: #f0fdf4;
  border: 1px solid #86efac; border-radius: 6px; display: flex; gap: 10px;
  align-items: center; }
.w2md-selected-name { font-weight: 600; color: #166534; flex: 1; }
.w2md-selected-phone { color: #15803d; font-family: ui-monospace, monospace; font-size: 13px; }
.w2md-clear { background: none; border: 0; cursor: pointer; padding: 4px;
  color: #166534; border-radius: 4px; }
.w2md-clear:hover { background: #dcfce7; }
.w2md-clear svg { width: 14px; height: 14px; }
        `;
        const style = document.createElement('style');
        style.id = 'web2-manual-deposit-styles';
        style.textContent = css;
        document.head.appendChild(style);
    }

    // ENFORCE-PREP (2026-06-12): gắn x-web2-token cho /api/web2/balance-history/manual-deposit
    // (soft-gate → WEB2_AUTH_ENFORCE=1). Choke point: jsonFetch. GIỮ NGUYÊN idempotencyKey logic.
    function authHeaders(extra) {
        if (window.Web2Auth?.authHeaders) return window.Web2Auth.authHeaders(extra);
        try {
            const t = JSON.parse(localStorage.getItem('web2_auth'))?.token;
            return t ? { ...(extra || {}), 'x-web2-token': t } : { ...(extra || {}) };
        } catch {
            return { ...(extra || {}) };
        }
    }

    async function jsonFetch(url, options) {
        const opts = { ...(options || {}), headers: authHeaders((options || {}).headers) }; // ENFORCE-PREP (2026-06-12)
        const r = await fetch(url, opts);
        const body = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(body?.error || `HTTP ${r.status}`);
        return body;
    }
    async function postManualDeposit(payload) {
        // 3H11 FIX (2026-06-12): idempotencyKey sinh 1 LẦN cho cả 2 base — CF
        // Worker timeout 524 SAU khi Render đã COMMIT → retry sang FALLBACK với
        // CÙNG key → server derive cùng sepay_id → ON CONFLICT trả
        // alreadyProcessed thay vì nạp/rút tiền lần 2.
        const withKey = {
            ...payload,
            idempotencyKey:
                payload.idempotencyKey ||
                (crypto.randomUUID
                    ? crypto.randomUUID()
                    : `md-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`),
        };
        const body = JSON.stringify(withKey);
        try {
            return await jsonFetch(`${BASE}/manual-deposit`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body,
            });
        } catch (e) {
            return await jsonFetch(`${FALLBACK}/manual-deposit`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body,
            });
        }
    }

    function notify(msg, type) {
        try {
            window.notificationManager?.show?.(msg, type || 'info');
        } catch {}
    }

    // ───────────── KH search — fast path (Postgres aggregate) + WEB2 fallback ─────
    // Strategy ưu tiên tốc độ:
    //   1. Postgres /aggregate (~100-200ms, cached 5s server-side): search KH có
    //      web2 activity (5k+ active customers). Phone digits + name ILIKE work.
    //   2. Nếu /aggregate trả 0 rows VÀ user search by name → fallback WEB2
    //      (~2-3s, full coverage 92k customers nhưng KH chưa active web2).
    //   3. Phone search-only: /aggregate đủ vì KH có web2 activity = có wallet.
    //
    // Cache client-side LRU (max 30 queries) cho repeat searches → instant.

    const _searchCache = new Map(); // key: q-lower → { ts, results }
    const SEARCH_CACHE_MAX = 30;
    const SEARCH_CACHE_TTL = 60_000; // 1 min

    function _cacheGet(q) {
        const k = q.toLowerCase();
        const v = _searchCache.get(k);
        if (!v) return null;
        if (Date.now() - v.ts > SEARCH_CACHE_TTL) {
            _searchCache.delete(k);
            return null;
        }
        return v.results;
    }
    function _cacheSet(q, results) {
        const k = q.toLowerCase();
        if (_searchCache.size >= SEARCH_CACHE_MAX) {
            const oldestKey = _searchCache.keys().next().value;
            _searchCache.delete(oldestKey);
        }
        _searchCache.set(k, { ts: Date.now(), results });
    }

    const CW_BASE = _WORKER + '/api/web2/customer-wallet';
    const CW_FALLBACK = _DIRECT + '/api/web2/customer-wallet';

    async function searchKhAggregate(query) {
        const url = `${CW_BASE}/aggregate?limit=20&search=${encodeURIComponent(query)}`;
        const fallbackUrl = `${CW_FALLBACK}/aggregate?limit=20&search=${encodeURIComponent(query)}`;
        let data;
        try {
            data = await jsonFetch(url);
        } catch {
            data = await jsonFetch(fallbackUrl);
        }
        // Aggregate shape: { data: [{ phone, name, customerId, walletBalance, ... }] }
        const rows = data?.data || [];
        return rows.map((r) => ({
            Id: r.customerId,
            Name: r.name,
            Phone: r.phone,
            _source: 'web2',
            _wallet: r.walletBalance,
        }));
    }

    async function searchKhWeb2(query) {
        const Api = window.PartnerCustomerApi;
        if (!Api?.list) throw new Error('PartnerCustomerApi chưa load');
        const r = await Api.list({ top: 20, search: query });
        return (r?.value || []).map((p) => ({ ...p, _source: 'web2' }));
    }

    async function searchKh(query) {
        const q = String(query || '').trim();
        if (!q) return [];
        // Cache hit
        const cached = _cacheGet(q);
        if (cached) return cached;
        // 1. Fast path aggregate (~150ms)
        try {
            const fast = await searchKhAggregate(q);
            if (fast.length > 0) {
                _cacheSet(q, fast);
                return fast;
            }
        } catch (e) {
            console.warn('[w2md] aggregate search fail:', e.message);
        }
        // 2. Fallback WEB2 — chỉ dùng khi aggregate miss
        try {
            const web2 = await searchKhWeb2(q);
            _cacheSet(q, web2);
            return web2;
        } catch (e) {
            console.warn('[w2md] WEB2 search fail:', e.message);
            return [];
        }
    }

    function renderKhResults(partners) {
        const listEl = document.getElementById('w2mdKhResults');
        if (!partners || partners.length === 0) {
            listEl.innerHTML = '<div class="w2md-result-empty">Không tìm thấy KH</div>';
            listEl.hidden = false;
            return;
        }
        listEl.innerHTML = partners
            .map((p) => {
                const phone = (p.Phone || p.Mobile || '').replace(/\D/g, '');
                const name = p.Name || '(không tên)';
                const sourceLabel =
                    p._source === 'web2'
                        ? '<span class="w2md-source-badge w2md-source-web2">Web 2.0</span>'
                        : '<span class="w2md-source-badge w2md-source-web2">WEB2</span>';
                return `<div class="w2md-result-row" data-id="${p.Id || ''}" data-phone="${phone}" data-name="${escapeAttr(name)}">
                    <div class="w2md-result-info">
                        <span class="w2md-result-name">${escapeHtml(name)}</span>
                        ${sourceLabel}
                    </div>
                    <span class="w2md-result-phone">${escapeHtml(phone || '(no phone)')}</span>
                </div>`;
            })
            .join('');
        listEl.hidden = false;
        listEl.querySelectorAll('.w2md-result-row').forEach((row) => {
            row.addEventListener('click', () => {
                pickKh({
                    id: Number(row.dataset.id),
                    name: row.dataset.name,
                    phone: row.dataset.phone,
                });
            });
        });
    }

    function pickKh(kh) {
        if (!kh.phone) {
            notify('KH này chưa có SĐT trên WEB2 — không thể nạp', 'warning');
            return;
        }
        _selectedKh = kh;
        document.getElementById('w2mdKhSearch').value = '';
        document.getElementById('w2mdKhResults').hidden = true;
        document.getElementById('w2mdKhResults').innerHTML = '';
        document.getElementById('w2mdKhSelectedName').textContent = kh.name;
        document.getElementById('w2mdKhSelectedPhone').textContent = kh.phone;
        document.getElementById('w2mdKhSelected').hidden = false;
        if (window.lucide) window.lucide.createIcons();
    }

    function clearKh() {
        _selectedKh = null;
        document.getElementById('w2mdKhSelected').hidden = true;
        document.getElementById('w2mdKhResults').hidden = true;
        document.getElementById('w2mdKhResults').innerHTML = '';
        document.getElementById('w2mdKhSearch').focus();
    }

    let _searchSeq = 0;
    async function doKhSearch() {
        const mySeq = ++_searchSeq;
        const input = document.getElementById('w2mdKhSearch');
        const q = input.value.trim();
        const listEl = document.getElementById('w2mdKhResults');
        if (!q) {
            listEl.hidden = true;
            listEl.innerHTML = '';
            return;
        }
        // Show "Đang tìm" chỉ khi cache miss (instant nếu hit)
        const cached = _cacheGet(q);
        if (!cached) {
            listEl.innerHTML = '<div class="w2md-result-empty">Đang tìm…</div>';
            listEl.hidden = false;
        }
        try {
            const partners = await searchKh(q);
            if (mySeq !== _searchSeq) return; // stale (user gõ tiếp)
            renderKhResults(partners);
        } catch (e) {
            if (mySeq !== _searchSeq) return;
            listEl.innerHTML = `<div class="w2md-result-empty">Lỗi: ${escapeHtml(e.message)}</div>`;
        }
    }

    // Debounce 250ms: search-as-you-type giúp user thấy kết quả ngay
    let _debounceTimer = null;
    function scheduleSearch() {
        if (_debounceTimer) clearTimeout(_debounceTimer);
        _debounceTimer = setTimeout(() => {
            _debounceTimer = null;
            doKhSearch();
        }, 250);
    }

    // ───────────── NCC select (server ledger ví NCC) + Tạo mới button ─────────────
    // P2 (2026-06-15): danh sách TÊN NCC lấy từ directory CHUNG `Web2SuppliersCache`
    // (web2_supplier_meta — master, gồm cả NCC chưa có ví) thay vì chỉ wallet keys
    // của `/state`. Balance vẫn đọc từ `/state` (chỉ NCC đã có giao dịch mới có số dư).
    // → 1 nguồn tên NCC dùng chung mọi trang; deposit được cho cả NCC mới.
    async function loadNccList() {
        if (_nccLoaded) return;
        const select = document.getElementById('w2mdNccSelect');
        try {
            // (a) số dư theo NCC từ ledger /state
            const balByName = new Map();
            try {
                const r = await jsonFetch(_WORKER + '/api/web2-supplier-wallet/state');
                const wallets = (r && r.wallets) || {};
                for (const name of Object.keys(wallets)) {
                    if (!name) continue;
                    balByName.set(name, Number((wallets[name] || {}).balance || 0));
                }
            } catch (e) {
                console.warn('[w2md] loadNccList state fail:', e.message);
            }

            // (b) tên NCC = directory chung (master) ∪ keys có số dư.
            let names = [];
            if (global.Web2SuppliersCache) {
                try {
                    await global.Web2SuppliersCache.init();
                    names = global.Web2SuppliersCache.getNames() || [];
                } catch (e) {
                    console.warn('[w2md] suppliers-cache init fail:', e.message);
                }
            }
            const seen = new Set(names.map((n) => n.toLowerCase()));
            for (const name of balByName.keys())
                if (!seen.has(name.toLowerCase())) names.push(name);
            names.sort((a, b) => a.localeCompare(b, 'vi'));

            if (names.length === 0) {
                select.innerHTML = '<option value="">-- Chưa có NCC, bấm "Tạo mới" --</option>';
                _nccLoaded = true;
                return;
            }
            const options = ['<option value="">-- Chọn NCC --</option>'];
            for (const name of names) {
                const bal = Number(balByName.get(name) || 0);
                const balLabel = bal !== 0 ? ` (${bal.toLocaleString('vi-VN')}₫)` : '';
                options.push(
                    `<option value="${escapeAttr(name)}">${escapeHtml(name)}${escapeHtml(balLabel)}</option>`
                );
            }
            select.innerHTML = options.join('');
            _nccLoaded = true;
        } catch (e) {
            console.warn('[w2md] loadNccList fail:', e.message);
            select.innerHTML = `<option value="">-- Lỗi tải: ${escapeHtml(e.message)} --</option>`;
        }
    }

    function showNccNewInput() {
        const wrap = document.getElementById('w2mdNccNewWrap');
        const input = document.getElementById('w2mdNccNewInput');
        const select = document.getElementById('w2mdNccSelect');
        wrap.hidden = false;
        select.value = '';
        select.disabled = true;
        input.value = '';
        setTimeout(() => input.focus(), 50);
        if (window.lucide) window.lucide.createIcons();
    }
    function hideNccNewInput() {
        const wrap = document.getElementById('w2mdNccNewWrap');
        const input = document.getElementById('w2mdNccNewInput');
        const select = document.getElementById('w2mdNccSelect');
        wrap.hidden = true;
        input.value = '';
        select.disabled = false;
    }
    function getNccValue() {
        const newWrap = document.getElementById('w2mdNccNewWrap');
        if (!newWrap.hidden) {
            return document.getElementById('w2mdNccNewInput').value.trim();
        }
        return document.getElementById('w2mdNccSelect').value;
    }

    function escapeHtml(v) {
        if (window.Web2Escape && window.Web2Escape.escapeHtml)
            return window.Web2Escape.escapeHtml(v);
        if (window.Web2Escape) return window.Web2Escape.escapeHtml(v); // 1 nguồn
        if (v == null) return '';
        return String(v)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }
    function escapeAttr(v) {
        return escapeHtml(v);
    }

    // ───────────── Open / Close ─────────────
    function open() {
        ensureStyles();
        const modal = document.getElementById('w2mdModal');
        if (!modal) return;
        // Reset
        _selectedKh = null;
        document.getElementById('w2mdKhSearch').value = '';
        document.getElementById('w2mdKhResults').hidden = true;
        document.getElementById('w2mdKhResults').innerHTML = '';
        document.getElementById('w2mdKhSelected').hidden = true;
        const nccSel = document.getElementById('w2mdNccSelect');
        if (nccSel) {
            nccSel.value = '';
            nccSel.disabled = false;
        }
        const nccNewInp = document.getElementById('w2mdNccNewInput');
        if (nccNewInp) nccNewInp.value = '';
        const nccNewWrap = document.getElementById('w2mdNccNewWrap');
        if (nccNewWrap) nccNewWrap.hidden = true;
        if (window.Web2NumberInput)
            Web2NumberInput.setValue(document.getElementById('w2mdAmount'), '');
        else document.getElementById('w2mdAmount').value = '';
        document.getElementById('w2mdNote').value = '';
        document.getElementById('w2mdError').hidden = true;
        document.querySelectorAll('[name="w2mdTarget"]').forEach((r) => {
            r.checked = r.value === 'KH';
        });
        document.querySelectorAll('[name="w2mdType"]').forEach((r) => {
            r.checked = r.value === 'deposit';
        });
        toggleTargetPanel('KH');
        // Preload NCC datalist (background) — sẵn sàng khi user switch sang NCC
        loadNccList().catch(() => {});
        modal.hidden = false;
        document.body.style.overflow = 'hidden';
        setTimeout(() => document.getElementById('w2mdKhSearch')?.focus(), 50);
        if (window.lucide) window.lucide.createIcons();
    }

    function close() {
        const modal = document.getElementById('w2mdModal');
        if (!modal) return;
        modal.hidden = true;
        document.body.style.overflow = '';
    }

    function toggleTargetPanel(target) {
        document.getElementById('w2mdKhPanel').hidden = target !== 'KH';
        document.getElementById('w2mdNccPanel').hidden = target !== 'NCC';
        if (target === 'NCC') loadNccList();
    }

    // ───────────── Submit ─────────────
    async function submit() {
        const errEl = document.getElementById('w2mdError');
        errEl.hidden = true;
        const target = document.querySelector('[name="w2mdTarget"]:checked')?.value || 'KH';
        const type = document.querySelector('[name="w2mdType"]:checked')?.value || 'deposit';
        const amount = window.Web2NumberInput
            ? Web2NumberInput.getValue(document.getElementById('w2mdAmount'))
            : Number(document.getElementById('w2mdAmount').value);
        const note = document.getElementById('w2mdNote').value.trim();

        let phone = null;
        let name = '';
        let customerId = null;
        if (target === 'KH') {
            if (!_selectedKh) {
                errEl.textContent = 'Phải chọn KH từ danh sách tìm';
                errEl.hidden = false;
                return;
            }
            phone = _selectedKh.phone;
            name = _selectedKh.name;
            customerId = _selectedKh.id || null;
        } else {
            name = getNccValue();
            if (!name) {
                errEl.textContent = 'Chọn NCC từ dropdown hoặc bấm "Tạo mới" để nhập NCC mới';
                errEl.hidden = false;
                return;
            }
        }
        if (!Number.isFinite(amount) || amount <= 0) {
            errEl.textContent = 'Số tiền phải > 0';
            errEl.hidden = false;
            return;
        }

        const btn = document.getElementById('w2mdSubmit');
        btn.disabled = true;
        const origTxt = btn.innerHTML;
        btn.innerHTML = '<i data-lucide="loader-2"></i> Đang xử lý…';
        if (window.lucide) window.lucide.createIcons();

        try {
            const payload = {
                target,
                type,
                phone,
                name,
                amount,
                note,
                userName: getCurrentUserName(),
                customerId,
            };
            await postManualDeposit(payload);
            const verb = type === 'deposit' ? 'nạp' : 'rút';
            const dir = type === 'deposit' ? 'vào' : 'khỏi';
            notify(
                `Đã ${verb} ${amount.toLocaleString('vi-VN')}₫ ${dir} ví ${target} ${name}`,
                'success'
            );
            close();
            window.Web2BalanceHistoryApp?.load?.();
        } catch (e) {
            errEl.textContent = 'Lỗi: ' + e.message;
            errEl.hidden = false;
        } finally {
            btn.disabled = false;
            btn.innerHTML = origTxt;
            if (window.lucide) window.lucide.createIcons();
        }
    }

    // ───────────── Init ─────────────
    function init() {
        ensureStyles();
        const btn = document.getElementById('w2bhManualDepositBtn');
        if (!btn) return;
        if (!isAdmin()) {
            btn.hidden = true;
            return;
        }
        btn.hidden = false;
        btn.addEventListener('click', open);

        const modal = document.getElementById('w2mdModal');
        if (!modal) return;
        modal.addEventListener('click', (e) => {
            if (e.target.closest('[data-w2md-close]')) close();
        });
        document.getElementById('w2mdSubmit')?.addEventListener('click', submit);
        document.querySelectorAll('[name="w2mdTarget"]').forEach((r) => {
            r.addEventListener('change', () => toggleTargetPanel(r.value));
        });
        // KH search — debounce 250ms as-you-type + Enter for instant
        const searchInput = document.getElementById('w2mdKhSearch');
        searchInput?.addEventListener('input', scheduleSearch);
        searchInput?.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                if (_debounceTimer) {
                    clearTimeout(_debounceTimer);
                    _debounceTimer = null;
                }
                doKhSearch();
            }
        });
        document.getElementById('w2mdKhSearchBtn')?.addEventListener('click', doKhSearch);
        document.getElementById('w2mdKhClear')?.addEventListener('click', clearKh);
        // NCC "Tạo mới" toggle
        document.getElementById('w2mdNccCreateBtn')?.addEventListener('click', showNccNewInput);
        document.getElementById('w2mdNccNewCancel')?.addEventListener('click', hideNccNewInput);
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && !modal.hidden) close();
        });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

    global.Web2ManualDeposit = { open, close };
})(window);
