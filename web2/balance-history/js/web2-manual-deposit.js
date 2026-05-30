// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | WEB2.0 — manual deposit modal cho balance-history page.
// =====================================================================
// Web2ManualDeposit — admin nạp tay vào ví KH (web2_customer_wallets) hoặc
// NCC (Firestore web2_supplier_wallet via polling). Tạo row giả lập trong
// web2_balance_history với match_method='manual_deposit', credit ví ngay.
// =====================================================================

(function (global) {
    'use strict';

    const BASE = 'https://chatomni-proxy.nhijudyshop.workers.dev/api/web2/balance-history';
    const FALLBACK = 'https://n2store-fallback.onrender.com/api/web2/balance-history';

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
  width: min(520px, calc(100vw - 32px)); max-height: calc(100vh - 32px);
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
.w2md-field input:focus, .w2md-field textarea:focus {
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

    function open() {
        ensureStyles();
        const modal = document.getElementById('w2mdModal');
        if (!modal) return;
        // Reset fields
        document.getElementById('w2mdPhone').value = '';
        document.getElementById('w2mdName').value = '';
        document.getElementById('w2mdAmount').value = '';
        document.getElementById('w2mdNote').value = '';
        document.getElementById('w2mdError').hidden = true;
        document.querySelectorAll('[name="w2mdTarget"]').forEach((r) => {
            r.checked = r.value === 'KH';
        });
        toggleTargetFields('KH');
        modal.hidden = false;
        document.body.style.overflow = 'hidden';
        setTimeout(() => document.getElementById('w2mdPhone')?.focus(), 50);
        if (window.lucide) window.lucide.createIcons();
    }

    function close() {
        const modal = document.getElementById('w2mdModal');
        if (!modal) return;
        modal.hidden = true;
        document.body.style.overflow = '';
    }

    function toggleTargetFields(target) {
        const phoneField = document.getElementById('w2mdPhoneField');
        const phoneInput = document.getElementById('w2mdPhone');
        if (target === 'NCC') {
            phoneField.style.opacity = '0.6';
            phoneInput.placeholder = '(optional cho NCC)';
        } else {
            phoneField.style.opacity = '1';
            phoneInput.placeholder = '0xxxxxxxxx';
        }
    }

    async function lookupNameByPhone(phone) {
        if (!phone || phone.length < 9) return null;
        try {
            const Api = window.PartnerCustomerApi;
            if (!Api?.listByPhones) return null;
            const map = await Api.listByPhones([phone], { concurrency: 1 });
            const p = map.get(phone);
            return p?.Name || null;
        } catch {
            return null;
        }
    }

    async function submit() {
        const errEl = document.getElementById('w2mdError');
        errEl.hidden = true;
        const target = document.querySelector('[name="w2mdTarget"]:checked')?.value || 'KH';
        const phone = document.getElementById('w2mdPhone').value.replace(/\D/g, '');
        const name = document.getElementById('w2mdName').value.trim();
        const amount = Number(document.getElementById('w2mdAmount').value);
        const note = document.getElementById('w2mdNote').value.trim();

        // Validation
        if (target === 'KH' && phone.length < 9) {
            errEl.textContent = 'KH bắt buộc có SĐT ≥ 9 digits';
            errEl.hidden = false;
            return;
        }
        if (!name) {
            errEl.textContent = 'Tên bắt buộc';
            errEl.hidden = false;
            return;
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
            // Try TPOS lookup for customerId nếu KH
            let customerId = null;
            if (target === 'KH') {
                try {
                    const Api = window.PartnerCustomerApi;
                    const map = await Api?.listByPhones?.([phone], { concurrency: 1 });
                    const p = map?.get?.(phone);
                    customerId = p?.Id || null;
                } catch {}
            }
            const payload = {
                target,
                phone: target === 'KH' ? phone : phone || null,
                name,
                amount,
                note,
                userName: getCurrentUserName(),
                customerId,
            };
            const result = await postManualDeposit(payload);
            notify(`Đã nạp ${amount.toLocaleString('vi-VN')}₫ cho ${target} ${name}`, 'success');
            close();
            // Reload balance-history list
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
            r.addEventListener('change', () => toggleTargetFields(r.value));
        });
        // Auto-fill name khi blur phone (KH only)
        document.getElementById('w2mdPhone')?.addEventListener('blur', async (e) => {
            const phone = e.target.value.replace(/\D/g, '');
            const nameInput = document.getElementById('w2mdName');
            if (!nameInput.value && phone.length >= 9) {
                const name = await lookupNameByPhone(phone);
                if (name) nameInput.value = name;
            }
        });
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
