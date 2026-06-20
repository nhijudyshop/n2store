// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | WEB2.0 module.
// =====================================================================
// Web2CustomerWalletApp — Events module.
// event wiring (search/sort/pagination/chips/modal/keyboard) + QR ops + CSV export.
// Extends shared namespace window.W2CW.
// =====================================================================

(function (global) {
    'use strict';

    const W2CW = global.W2CW || (global.W2CW = {});
    const { state, dom, notify, debounce } = W2CW;
    const api = W2CW.api;
    const render = W2CW.render;

    // ----- QR ops -----
    async function upsertQr() {
        const phone = state.activePhone;
        if (!phone) return;
        const c = state.cache[phone];
        const partner = state.web2Partners[phone];
        const btnCreate = document.getElementById('cwQrCreate');
        const btnUpsert = document.getElementById('cwQrUpsert');
        const targetBtn = btnUpsert?.offsetParent ? btnUpsert : btnCreate;
        if (targetBtn) {
            targetBtn.disabled = true;
            targetBtn.dataset._txt = targetBtn.innerHTML;
            targetBtn.innerHTML = '<i data-lucide="loader-2"></i> Đang xử lý…';
            if (window.lucide) window.lucide.createIcons();
        }
        try {
            const body = {
                customerId: partner?.Id || c?.customerId || undefined,
                customerName: partner?.Name || c?.name || undefined,
            };
            const r = await api.qrFetch(`/${encodeURIComponent(phone)}/qr`, {
                method: 'POST',
                // x-web2-token bắt buộc (WEB2_AUTH_ENFORCE=1) — POST QR là write.
                headers: window.Web2Auth?.authHeaders
                    ? window.Web2Auth.authHeaders({ 'Content-Type': 'application/json' })
                    : { 'Content-Type': 'application/json' },
                body: JSON.stringify(body),
            });
            render.renderQrData(r.body.data);
            try {
                window.notificationManager?.show?.('Đã tạo QR thành công', 'success');
            } catch (_) {}
        } catch (e) {
            try {
                window.notificationManager?.show?.('Lỗi tạo QR: ' + e.message, 'error');
            } catch (_) {}
        } finally {
            if (targetBtn) {
                targetBtn.disabled = false;
                targetBtn.innerHTML = targetBtn.dataset._txt;
                if (window.lucide) window.lucide.createIcons();
            }
        }
    }
    function copyQrCode() {
        const code = document.getElementById('cwQrCode').textContent;
        if (!code || code === '—') return;
        navigator.clipboard?.writeText(code).then(
            () => window.notificationManager?.show?.('Đã copy mã QR', 'success'),
            () => window.notificationManager?.show?.('Copy thất bại', 'error')
        );
    }
    // Wire QR buttons after DOM ready
    document.addEventListener('click', (e) => {
        if (e.target.closest('#cwQrCreate, #cwQrUpsert')) {
            e.preventDefault();
            upsertQr();
        } else if (e.target.closest('#cwQrCopyCode')) {
            e.preventDefault();
            copyQrCode();
        }
    });

    // ─── CSV export (fetches up to 500 rows from server with current filter) ─
    async function exportCsv() {
        const btn = dom.exportCsvBtn;
        if (btn) btn.disabled = true;
        try {
            notify('Đang chuẩn bị CSV…', 'info');
            // MEDIUM-cleanup (2026-06-13): vip/warning/bomb là filter trạng thái WEB2 (warehouse) —
            // server /aggregate KHÔNG hiểu (chỉ debt/has_balance/paid_off) nên trước đây ignore filter
            // → CSV khác list màn hình. Với các filter này export ĐÚNG data đang hiển thị (state.rows).
            const STATUS_FILTERS = ['vip', 'warning', 'bomb'];
            let items;
            if (STATUS_FILTERS.includes(state.quickFilter)) {
                items = state.rows || [];
            } else {
                const result = await api.fetchAggregateWeb2Only({
                    limit: 500,
                    offset: 0,
                    sort: state.sort,
                    filter: state.quickFilter,
                    search: state.search,
                });
                items = result?.data || [];
            }
            if (!items.length) {
                notify('Không có KH nào để xuất', 'warning');
                return;
            }
            const headers = [
                'Phone',
                'Name',
                'WEB2 Status',
                'Tổng mua',
                'Đã thu',
                'Đã trả',
                'Còn nợ',
                'Dư ví',
            ];
            const csvEscape = (v) => {
                const s = String(v ?? '');
                if (/[",\n]/.test(s)) return '"' + s.replace(/"/g, '""') + '"';
                return s;
            };
            const lines = [headers.map(csvEscape).join(',')];
            for (const c of items) {
                const partner = state.web2Partners[c.phone];
                lines.push(
                    [
                        c.phone,
                        c.name || '',
                        partner?.StatusText || partner?.Status || '',
                        Math.round(c.totalPurchased || 0),
                        Math.round(c.paidAmount || 0),
                        Math.round(c.returnedAmount || 0),
                        Math.round(c.balance || 0),
                        Math.round(c.walletBalance || 0),
                    ]
                        .map(csvEscape)
                        .join(',')
                );
            }
            const csv = '﻿' + lines.join('\n');
            const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
            a.href = url;
            a.download = `vi-khach-hang-${state.quickFilter}-${stamp}.csv`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
            notify(`Đã xuất ${items.length} KH (filter: ${state.quickFilter})`, 'success');
        } catch (e) {
            notify('Lỗi xuất CSV: ' + e.message, 'error');
        } finally {
            if (btn) btn.disabled = false;
        }
    }

    // ─── Wire UI ────────────────────────────────────────────────────
    function wireUi() {
        const load = W2CW.load;
        const hardReset = W2CW.hardReset;
        const renderList = render.renderList;
        const renderDetailTabs = render.renderDetailTabs;

        dom.search.addEventListener(
            'input',
            debounce(() => {
                state.search = dom.search.value.trim();
                state.page = 1;
                load();
            }, 350)
        );
        dom.sort.addEventListener('change', () => {
            state.sort = dom.sort.value;
            state.page = 1;
            load();
        });
        dom.refreshBtn?.addEventListener('click', load);
        dom.hardResetBtn?.addEventListener('click', hardReset);
        dom.exportCsvBtn?.addEventListener('click', exportCsv);

        if (dom.pageSize) {
            dom.pageSize.addEventListener('change', () => {
                state.pageSize = Number(dom.pageSize.value) || 50;
                state.page = 1;
                load();
            });
        }
        if (dom.pageButtons) {
            dom.pageButtons.addEventListener('click', (e) => {
                const btn = e.target.closest('button[data-page]');
                if (!btn || btn.disabled) return;
                const target = Number(btn.getAttribute('data-page'));
                if (!Number.isFinite(target)) return;
                state.page = Math.max(1, target);
                load();
            });
        }

        // Quick filter chips
        dom.chipsContainer?.addEventListener('click', (e) => {
            const btn = e.target.closest('.cw-chip[data-filter]');
            if (!btn) return;
            const f = btn.dataset.filter || 'all';
            // VIP/Warning/Bomb hiện chưa hỗ trợ server-side (cần join WEB2).
            // Giữ filter này local-only — load all + filter client-side. TODO.
            state.quickFilter = f;
            state.page = 1;
            load();
        });

        document.addEventListener('click', (e) => {
            if (e.target.closest('[data-cw-close]')) {
                document.querySelectorAll('.sw-modal:not([hidden])').forEach((m) => {
                    m.hidden = true;
                });
            }
            const tab = e.target.closest('[data-detail-tab]');
            if (tab) {
                state.detailTab = tab.dataset.detailTab;
                renderDetailTabs();
            }
        });

        document.addEventListener('keydown', (e) => {
            // Ctrl/⌘+K → focus search
            if ((e.metaKey || e.ctrlKey) && (e.key === 'k' || e.key === 'K')) {
                e.preventDefault();
                dom.search?.focus();
                dom.search?.select();
                return;
            }
            // Esc → close modal HOẶC clear search
            if (e.key === 'Escape') {
                const openModal = document.querySelector('.sw-modal:not([hidden])');
                if (openModal) {
                    openModal.hidden = true;
                } else if (document.activeElement === dom.search && dom.search.value) {
                    dom.search.value = '';
                    renderList();
                }
            }
            // / → focus search (Gmail-style)
            if (
                e.key === '/' &&
                document.activeElement?.tagName !== 'INPUT' &&
                document.activeElement?.tagName !== 'TEXTAREA'
            ) {
                e.preventDefault();
                dom.search?.focus();
                dom.search?.select();
            }
        });
    }

    // Expose events on W2CW
    W2CW.events = {
        upsertQr,
        copyQrCode,
        exportCsv,
        wireUi,
    };
})(window);
