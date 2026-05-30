// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | WEB2.0 — manual deposit modal cho balance-history page.
// =====================================================================
// Web2ManualDeposit — admin nạp tay vào ví KH (web2_customer_wallets) hoặc
// NCC (Firestore web2_supplier_wallet via polling). UI:
//   • KH: type name/phone + Enter → TPOS search → dropdown candidates → pick
//   • NCC: select dropdown loaded từ Firestore web2_supplier_wallet/main
// =====================================================================

(function (global) {
    'use strict';

    const BASE = 'https://chatomni-proxy.nhijudyshop.workers.dev/api/web2/balance-history';
    const FALLBACK = 'https://n2store-fallback.onrender.com/api/web2/balance-history';

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
.w2md-backdrop { position: absolute; inset: 0; background: rgba(15, 23, 42, 0.55); }
.w2md-panel { position: relative; background: #fff; border-radius: 12px;
  width: min(540px, calc(100vw - 32px)); max-height: calc(100vh - 32px);
  overflow: auto; box-shadow: 0 24px 48px rgba(0,0,0,0.25);
  display: flex; flex-direction: column; }
.w2md-head { display: flex; justify-content: space-between; align-items: center;
  padding: 14px 20px; border-bottom: 1px solid #e5e7eb; }
.w2md-head h3 { margin: 0; font-size: 16px; font-weight: 600; color: #111827; }
.w2md-close { background: none; border: 0; cursor: pointer; padding: 4px;
  color: #6b7280; border-radius: 6px; }
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
  border-color: #6366f1; box-shadow: 0 0 0 3px rgba(99,102,241,0.15); }
.w2md-hint { display: block; font-size: 11px; color: #6b7280; margin-top: 4px; }
.w2md-target-row { display: flex; gap: 16px; }
.w2md-radio { display: flex; align-items: center; gap: 6px; cursor: pointer; font-size: 14px; }
.w2md-radio input { width: auto; margin: 0; }
.w2md-error { color: #dc2626; font-size: 13px; padding: 8px 12px;
  background: #fef2f2; border: 1px solid #fecaca; border-radius: 6px; }
.w2md-foot { display: flex; justify-content: flex-end; gap: 8px;
  padding: 12px 20px; border-top: 1px solid #e5e7eb; background: #f9fafb;
  border-radius: 0 0 12px 12px; }
.w2bh-btn-primary { background: #6366f1 !important; color: #fff !important; border-color: #6366f1 !important; }
.w2bh-btn-primary:hover:not(:disabled) { background: #4f46e5 !important; }

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
.w2md-result-name { font-weight: 500; color: #111827; font-size: 14px; }
.w2md-result-phone { color: #6b7280; font-size: 13px; font-family: ui-monospace, monospace; }
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

    async function jsonFetch(url, options) {
        const r = await fetch(url, options);
        const body = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(body?.error || `HTTP ${r.status}`);
        return body;
    }
    async function postManualDeposit(payload) {
        try {
            return await jsonFetch(`${BASE}/manual-deposit`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
            });
        } catch (e) {
            return await jsonFetch(`${FALLBACK}/manual-deposit`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
            });
        }
    }

    function notify(msg, type) {
        try {
            window.notificationManager?.show?.(msg, type || 'info');
        } catch {}
    }

    // ───────────── KH search (TPOS Partner) ─────────────
    // GetViewV2 với `Name=` param tự match cả Name lẫn Phone substring
    // → 1 call duy nhất handle cả 2 cases.
    async function searchKh(query) {
        const Api = window.PartnerCustomerApi;
        if (!Api?.list) throw new Error('PartnerCustomerApi chưa load');
        const q = String(query || '').trim();
        if (!q) return [];
        const r = await Api.list({ top: 20, search: q });
        return r?.value || [];
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
                return `<div class="w2md-result-row" data-id="${p.Id}" data-phone="${phone}" data-name="${escapeAttr(name)}">
                    <span class="w2md-result-name">${escapeHtml(name)}</span>
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
            notify('KH này chưa có SĐT trên TPOS — không thể nạp', 'warning');
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

    async function doKhSearch() {
        const input = document.getElementById('w2mdKhSearch');
        const q = input.value.trim();
        if (!q) return;
        const listEl = document.getElementById('w2mdKhResults');
        listEl.innerHTML = '<div class="w2md-result-empty">Đang tìm…</div>';
        listEl.hidden = false;
        try {
            const partners = await searchKh(q);
            renderKhResults(partners);
        } catch (e) {
            listEl.innerHTML = `<div class="w2md-result-empty">Lỗi: ${escapeHtml(e.message)}</div>`;
        }
    }

    // ───────────── NCC dropdown (Firestore) ─────────────
    async function loadNccList() {
        if (_nccLoaded) return;
        const select = document.getElementById('w2mdNccSelect');
        try {
            if (!window.firebase?.firestore) throw new Error('Firestore chưa load');
            const db = window.firebase.firestore();
            const snap = await db.collection('web2_supplier_wallet').doc('main').get();
            if (!snap.exists) {
                select.innerHTML = '<option value="">-- Chưa có NCC --</option>';
                _nccLoaded = true;
                return;
            }
            const data = snap.data() || {};
            const wallets = data.wallets || {};
            const names = Object.keys(wallets)
                .filter(Boolean)
                .sort((a, b) => a.localeCompare(b, 'vi'));
            if (names.length === 0) {
                select.innerHTML = '<option value="">-- Chưa có NCC --</option>';
                _nccLoaded = true;
                return;
            }
            const options = ['<option value="">-- Chọn NCC --</option>'];
            for (const name of names) {
                const w = wallets[name] || {};
                const bal = Number(w.balance || 0);
                const balLabel = bal !== 0 ? ` (${bal.toLocaleString('vi-VN')}₫)` : '';
                options.push(
                    `<option value="${escapeAttr(name)}">${escapeHtml(name)}${escapeHtml(balLabel)}</option>`
                );
            }
            select.innerHTML = options.join('');
            _nccLoaded = true;
        } catch (e) {
            select.innerHTML = `<option value="">-- Lỗi tải: ${escapeHtml(e.message)} --</option>`;
        }
    }

    function escapeHtml(v) {
        if (v == null) return '';
        return String(v)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
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
        document.getElementById('w2mdNccSelect').value = '';
        document.getElementById('w2mdAmount').value = '';
        document.getElementById('w2mdNote').value = '';
        document.getElementById('w2mdError').hidden = true;
        document.querySelectorAll('[name="w2mdTarget"]').forEach((r) => {
            r.checked = r.value === 'KH';
        });
        toggleTargetPanel('KH');
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
        const amount = Number(document.getElementById('w2mdAmount').value);
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
            name = document.getElementById('w2mdNccSelect').value;
            if (!name) {
                errEl.textContent = 'Phải chọn NCC từ dropdown';
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
                phone,
                name,
                amount,
                note,
                userName: getCurrentUserName(),
                customerId,
            };
            await postManualDeposit(payload);
            notify(`Đã nạp ${amount.toLocaleString('vi-VN')}₫ cho ${target} ${name}`, 'success');
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
        // KH search
        document.getElementById('w2mdKhSearch')?.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                doKhSearch();
            }
        });
        document.getElementById('w2mdKhSearchBtn')?.addEventListener('click', doKhSearch);
        document.getElementById('w2mdKhClear')?.addEventListener('click', clearKh);
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
