// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | WEB2.0 — balance-history app (Phase 3 — 100% Web 2.0).
// =====================================================================
// Web2BalanceHistoryApp — quản lý list + filter + manual link cho
// web2_balance_history. KHÔNG dùng /api/sepay/* + /api/v2/balance-history/*
// nữa — toàn bộ qua /api/web2/balance-history/*.
// =====================================================================

(function (global) {
    'use strict';

    const BASE = 'https://chatomni-proxy.nhijudyshop.workers.dev/api/web2/balance-history';
    const DIRECT_BASE = 'https://n2store-fallback.onrender.com/api/web2/balance-history';

    const STATUS_FILTERS = [
        { key: 'all', label: 'Tất cả' },
        { key: 'AUTO_APPROVED', label: 'Tự động', cls: 'chip-auto' },
        { key: 'PENDING_MATCH', label: 'Trùng SĐT — cần chọn', cls: 'chip-pending' },
        { key: 'NO_PHONE', label: 'Chưa gán KH', cls: 'chip-no-phone' },
    ];

    const state = {
        rows: [],
        total: 0,
        page: 1,
        pageSize: 50,
        status: 'all',
        search: '',
        dateFrom: '',
        dateTo: '',
        loading: false,
        stats: {},
    };

    // Diacritic strip (inline)
    function stripDiacritics(s) {
        if (!s) return '';
        return String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D');
    }
    function searchNormalize(s) {
        return stripDiacritics(String(s || ''))
            .toLowerCase()
            .trim();
    }

    async function jsonFetch(url, options) {
        const r = await fetch(url, options);
        const ct = r.headers.get('content-type') || '';
        const body = ct.includes('json') ? await r.json() : await r.text();
        if (!r.ok) {
            const msg =
                (body && body.error) ||
                (typeof body === 'string' ? body.slice(0, 200) : `HTTP ${r.status}`);
            const err = new Error(msg);
            err.status = r.status;
            throw err;
        }
        return body;
    }
    async function withFallback(path, options) {
        try {
            return await jsonFetch(`${BASE}${path}`, options);
        } catch (e) {
            return await jsonFetch(`${DIRECT_BASE}${path}`, options);
        }
    }

    // ----- Helpers -----
    function fmtVnd(n) {
        return Math.round(Number(n) || 0).toLocaleString('vi-VN');
    }
    function fmtTime(iso) {
        if (!iso) return '—';
        try {
            const d = new Date(iso);
            return (
                d.toLocaleDateString('vi-VN') +
                ' ' +
                d.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })
            );
        } catch {
            return iso;
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
    function notify(msg, type) {
        try {
            window.notificationManager?.show?.(msg, type || 'info');
        } catch {}
    }
    function debounce(fn, delay) {
        let t = null;
        return function () {
            const args = arguments;
            if (t) clearTimeout(t);
            t = setTimeout(() => fn.apply(this, args), delay);
        };
    }

    // ----- DOM -----
    const dom = {};
    function cacheDom() {
        dom.root = document.getElementById('web2BhApp');
        dom.statsBar = document.getElementById('w2bhStatsBar');
        dom.statTotal = document.getElementById('w2bhStatTotal');
        dom.statAuto = document.getElementById('w2bhStatAuto');
        dom.statPending = document.getElementById('w2bhStatPending');
        dom.statNoPhone = document.getElementById('w2bhStatNoPhone');
        dom.statSumIn = document.getElementById('w2bhStatSumIn');
        dom.chips = document.getElementById('w2bhChips');
        dom.search = document.getElementById('w2bhSearch');
        dom.tbody = document.getElementById('w2bhTbody');
        dom.pageInfo = document.getElementById('w2bhPageInfo');
        dom.pageButtons = document.getElementById('w2bhPageButtons');
        dom.pageSize = document.getElementById('w2bhPageSize');
        dom.refreshBtn = document.getElementById('w2bhRefreshBtn');
        dom.reprocessBtn = document.getElementById('w2bhReprocessBtn');
        dom.dateFrom = document.getElementById('w2bhDateFrom');
        dom.dateTo = document.getElementById('w2bhDateTo');
        dom.dateClear = document.getElementById('w2bhDateClear');
        dom.csvBtn = document.getElementById('w2bhCsvBtn');
    }

    async function reprocessUnmatched() {
        const btn = dom.reprocessBtn;
        if (!btn) return;
        const ok = confirm(
            'Chạy lại extractor cho 200 giao dịch chưa gán KH gần nhất?\n\n' +
                'Các giao dịch match được sẽ tự động cộng ví Web 2.0. Multi-match → pending modal.'
        );
        if (!ok) return;
        btn.disabled = true;
        const origText = btn.innerHTML;
        btn.innerHTML = '<i data-lucide="loader-2"></i> Đang xử lý…';
        if (window.lucide) window.lucide.createIcons();
        try {
            const r = await withFallback('/reprocess-unmatched', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ limit: 200 }),
            });
            const s = r?.data || {};
            notify(
                `✅ Reprocess ${s.picked} GD: ${s.matched} auto match, ${s.pending} pending, ${s.no_match} no match, ${s.errors} lỗi`,
                'success'
            );
            await load();
        } catch (e) {
            notify('Lỗi reprocess: ' + e.message, 'error');
        } finally {
            btn.disabled = false;
            btn.innerHTML = origText;
            if (window.lucide) window.lucide.createIcons();
        }
    }

    // ----- Render -----
    function renderStats() {
        const s = state.stats || {};
        if (dom.statTotal) dom.statTotal.textContent = fmtVnd(s.total);
        if (dom.statAuto) dom.statAuto.textContent = fmtVnd(s.auto_approved);
        if (dom.statPending) dom.statPending.textContent = fmtVnd(s.pending_match);
        if (dom.statNoPhone) dom.statNoPhone.textContent = fmtVnd(s.no_phone);
        if (dom.statSumIn) dom.statSumIn.textContent = fmtVnd(s.total_in) + '₫';
    }

    function renderChips() {
        dom.chips.innerHTML = STATUS_FILTERS.map(
            (f) =>
                `<button type="button" class="w2bh-chip ${f.cls || ''} ${f.key === state.status ? 'is-active' : ''}" data-status="${f.key}">${f.label}</button>`
        ).join('');
        dom.chips.querySelectorAll('button').forEach((b) => {
            b.addEventListener('click', () => {
                state.status = b.getAttribute('data-status');
                state.page = 1;
                load();
            });
        });
    }

    function renderTable() {
        if (state.loading) {
            dom.tbody.innerHTML = `<tr><td colspan="6" class="w2bh-loading">Đang tải…</td></tr>`;
            return;
        }
        if (!state.rows.length) {
            dom.tbody.innerHTML = `<tr><td colspan="6" class="w2bh-empty">Không có giao dịch phù hợp</td></tr>`;
            return;
        }
        dom.tbody.innerHTML = state.rows.map(renderRow).join('');
        dom.tbody.querySelectorAll('[data-action="link"]').forEach((btn) => {
            btn.addEventListener('click', () => openLinkPrompt(btn.getAttribute('data-id')));
        });
        dom.tbody.querySelectorAll('[data-action="auto-match"]').forEach((btn) => {
            btn.addEventListener('click', () => autoMatchSingle(btn.getAttribute('data-id')));
        });
    }

    async function autoMatchSingle(id) {
        try {
            const r = await withFallback(`/${encodeURIComponent(id)}/auto-match`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({}),
            });
            const data = r?.data || {};
            if (data.success && data.phone) {
                notify(
                    `✅ Match ${data.method}: ${data.customerName || data.phone} (conf ${data.confidenceScore || '-'})`,
                    'success'
                );
            } else if (
                data.method === 'pending_match_created' ||
                data.method === 'pending_low_confidence'
            ) {
                notify(`⏳ Push to pending (${data.method})`, 'warning');
            } else {
                notify(`❌ Không match được: ${data.reason || 'unknown'}`, 'warning');
            }
            await load();
        } catch (e) {
            notify('Lỗi auto-match: ' + e.message, 'error');
        }
    }

    function renderRow(r) {
        const amount = Number(r.transfer_amount) || 0;
        const isIn = r.transfer_type === 'in';
        const cls = isIn ? 'in' : 'out';
        const sign = isIn ? '+' : '-';
        const phone = r.linked_customer_phone || '';
        const name = r.display_name || '';
        const method = r.match_method || '';
        // Badge logic — phân biệt rõ:
        //   AUTO_APPROVED + Web 2.0 method → "Tự động" (xanh)
        //   pending_match / pending_low_confidence → "Chờ chọn" (vàng)
        //   manual_link → "Thủ công" (xanh dương — user click "Gán KH")
        //   phone + debt_added=false → "Legacy" (xám — backfill từ Web 1.0,
        //     ví Web 2.0 CHƯA cộng tiền, cần Reprocess hoặc bỏ qua)
        //   phone + debt_added=true (legacy single_match/qr_code) → "Cũ" (xám nhạt)
        //   no phone → "Chưa gán" (đỏ)
        const WEB2_AUTO_METHODS = new Set(['exact_phone', 'single_match', 'qr_code']);
        const verifBadge = (() => {
            if (method === 'pending_match') {
                return '<span class="w2bh-pill pending">Chờ chọn</span>';
            }
            if (method === 'pending_low_confidence') {
                return '<span class="w2bh-pill pending">Low conf</span>';
            }
            if (method === 'manual_link') {
                return '<span class="w2bh-pill manual" title="User click Gán KH trên Web 2.0">Thủ công</span>';
            }
            if (r.verification_status === 'AUTO_APPROVED' && WEB2_AUTO_METHODS.has(method)) {
                return '<span class="w2bh-pill auto">Tự động</span>';
            }
            if (phone) {
                // Có phone nhưng KHÔNG phải Web 2.0 process → legacy backfill
                if (r.debt_added && r.wallet_processed) {
                    return '<span class="w2bh-pill legacy" title="Legacy: extract từ Web 1.0, đã cộng ví">Cũ — đã cộng ví</span>';
                }
                return '<span class="w2bh-pill legacy" title="Legacy: có phone từ extractor cũ nhưng ví Web 2.0 chưa cộng. Bấm ⚡ để reprocess.">Cũ — chưa cộng ví</span>';
            }
            return '<span class="w2bh-pill nophone">Chưa gán</span>';
        })();
        // Extraction preview cho row chưa gán
        let extractionBadge = '';
        if (!phone && r.extraction_preview) {
            const ext = r.extraction_preview;
            if (ext.type !== 'none' && ext.value) {
                const icon =
                    ext.type === 'qr_code'
                        ? 'qr-code'
                        : ext.type === 'exact_phone'
                          ? 'phone'
                          : 'hash';
                const label =
                    ext.type === 'qr_code'
                        ? 'QR'
                        : ext.type === 'exact_phone'
                          ? 'SĐT đủ'
                          : 'Đuôi SĐT';
                extractionBadge = `
                    <div class="w2bh-extract-hint" title="Extracted: ${escapeHtml(ext.type)} = ${escapeHtml(ext.value)}">
                        <i data-lucide="${icon}" style="width:11px;height:11px"></i>
                        <span>${label}: ${escapeHtml(ext.value)}</span>
                    </div>
                `;
            } else {
                extractionBadge = `<div class="w2bh-extract-hint w2bh-extract-empty" title="Không extract được phone từ content">
                    <i data-lucide="alert-circle" style="width:11px;height:11px"></i>
                    <span>Không có thông tin</span>
                </div>`;
            }
        }
        const canAutoMatch =
            !phone &&
            r.extraction_preview &&
            r.extraction_preview.type !== 'none' &&
            r.extraction_preview.value;
        // Legacy row: có phone từ Web 1.0 extractor nhưng ví Web 2.0 chưa cộng
        // → cho phép reprocess để Web 2.0 matcher tự cộng ví.
        const isLegacyUnprocessed =
            phone &&
            !r.debt_added &&
            r.transfer_type === 'in' &&
            method !== 'pending_match' &&
            method !== 'pending_low_confidence';
        return `
            <tr data-id="${r.id}" data-transaction-id="${r.id}" data-customer-phone="${escapeHtml(phone)}">
                <td class="w2bh-cell-time">${escapeHtml(fmtTime(r.transaction_date))}</td>
                <td class="w2bh-cell-amount ${cls}">${sign}${fmtVnd(amount)}₫</td>
                <td class="w2bh-cell-content">${escapeHtml(r.content || '')}</td>
                <td class="w2bh-cell-ref">${escapeHtml(r.reference_code || r.sepay_id || '')}</td>
                <td class="w2bh-cell-customer" data-tpos-customer-cell="1">
                    ${
                        phone
                            ? `<div class="w2bh-customer">
                                  <span class="w2bh-customer-name">${escapeHtml(name || '(không tên)')}</span>
                                  <span class="w2bh-customer-phone">${escapeHtml(phone)}</span>
                               </div>`
                            : extractionBadge +
                              `<button type="button" class="w2bh-link-btn" data-action="link" data-id="${r.id}">+ Gán KH</button>`
                    }
                    ${verifBadge}
                </td>
                <td class="w2bh-cell-actions">
                    ${
                        canAutoMatch
                            ? `<button type="button" class="w2bh-icon-btn auto-match" data-action="auto-match" data-id="${r.id}" title="Auto-match từ extracted: ${escapeHtml(r.extraction_preview.value)}">
                                <i data-lucide="zap" style="width:14px;height:14px;"></i>
                            </button>`
                            : ''
                    }
                    ${
                        isLegacyUnprocessed
                            ? `<button type="button" class="w2bh-icon-btn auto-match" data-action="auto-match" data-id="${r.id}" title="Reprocess legacy: chạy lại Web 2.0 matcher để cộng ví">
                                <i data-lucide="zap" style="width:14px;height:14px;"></i>
                            </button>`
                            : ''
                    }
                    ${
                        !phone
                            ? `<button type="button" class="w2bh-icon-btn" data-action="link" data-id="${r.id}" title="Gán SĐT thủ công">
                                <i data-lucide="user-plus" style="width:14px;height:14px;"></i>
                            </button>`
                            : ''
                    }
                </td>
            </tr>
        `;
    }

    function renderPagination() {
        const total = state.total;
        const size = state.pageSize;
        const pages = Math.max(1, Math.ceil(total / size));
        const page = Math.min(Math.max(1, state.page), pages);
        const start = total === 0 ? 0 : (page - 1) * size + 1;
        const end = Math.min(page * size, total);
        dom.pageInfo.textContent = `${fmtVnd(start)}–${fmtVnd(end)} / ${fmtVnd(total)}`;

        const btns = [];
        const pushBtn = (label, target, opts) => {
            const disabled = opts && opts.disabled ? 'disabled' : '';
            const active = opts && opts.active ? 'is-active' : '';
            btns.push(
                `<button type="button" class="${active}" data-page="${target}" ${disabled}>${label}</button>`
            );
        };
        pushBtn('«', 1, { disabled: page <= 1 });
        pushBtn('‹', page - 1, { disabled: page <= 1 });
        const win = 5;
        let from = Math.max(1, page - 2);
        let to = Math.min(pages, from + win - 1);
        from = Math.max(1, to - win + 1);
        for (let i = from; i <= to; i++) pushBtn(String(i), i, { active: i === page });
        pushBtn('›', page + 1, { disabled: page >= pages });
        pushBtn('»', pages, { disabled: page >= pages });
        dom.pageButtons.innerHTML = btns.join('');
        dom.pageButtons.querySelectorAll('button[data-page]').forEach((b) => {
            b.addEventListener('click', () => {
                if (b.disabled) return;
                state.page = Math.max(1, Number(b.getAttribute('data-page')) || 1);
                load();
            });
        });
    }

    // ----- Manual link via smart customer search modal -----
    // Dùng Web2LinkCustomerModal (tìm KH qua TPOS Partner OData fast search).
    // Fallback prompt nếu modal chưa load.
    function openLinkPrompt(id) {
        // Tự suy đoán default search từ content của row (extract digits)
        const row = state.rows.find((x) => String(x.id) === String(id));
        let defaultSearch = '';
        if (row?.content) {
            const m = String(row.content).match(/\d{5,}/);
            if (m) defaultSearch = m[0];
        }
        if (window.Web2LinkCustomerModal?.openModal) {
            window.Web2LinkCustomerModal.openModal(id, defaultSearch);
            return;
        }
        // Fallback (modal chưa load)
        const phone = prompt('Nhập SĐT KH (10 chữ số):');
        if (!phone || !/^\d{9,11}$/.test(phone.trim())) {
            if (phone) notify('SĐT không hợp lệ', 'warning');
            return;
        }
        const name = prompt('Tên KH (tuỳ chọn):') || '';
        linkManual(id, phone.trim(), name.trim());
    }
    async function linkManual(id, phone, name) {
        try {
            await withFallback(`/${encodeURIComponent(id)}/link`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ phone, name: name || null }),
            });
            notify(`Đã gán ${name || phone} + cộng ví Web 2.0`, 'success');
            await load();
        } catch (e) {
            notify('Lỗi gán: ' + e.message, 'error');
        }
    }

    // ----- Data loading -----
    let _seq = 0;
    async function load() {
        const my = ++_seq;
        state.loading = true;
        renderTable();
        try {
            const params = new URLSearchParams();
            params.set('limit', String(state.pageSize));
            params.set('offset', String((state.page - 1) * state.pageSize));
            if (state.status !== 'all') params.set('status', state.status);
            if (state.search) params.set('search', state.search);
            if (state.dateFrom) params.set('since', state.dateFrom);
            if (state.dateTo) params.set('until', state.dateTo);
            const [list, stats] = await Promise.all([
                withFallback(`?${params.toString()}`),
                withFallback('/stats'),
            ]);
            if (my !== _seq) return;
            state.rows = list?.data || [];
            state.total = list?.total || 0;
            state.stats = stats?.data || {};
            state.loading = false;
            renderStats();
            renderTable();
            renderPagination();
            renderChips();
            if (window.lucide?.createIcons) window.lucide.createIcons();
        } catch (e) {
            if (my !== _seq) return;
            state.loading = false;
            state.rows = [];
            dom.tbody.innerHTML = `<tr><td colspan="6" class="w2bh-error">Lỗi tải: ${escapeHtml(e.message)}</td></tr>`;
        }
    }

    // ----- SSE realtime -----
    function setupSSE() {
        if (!window.Web2SSE?.subscribe) return;
        let timer = null;
        const reload = () => {
            if (timer) clearTimeout(timer);
            timer = setTimeout(() => {
                timer = null;
                load();
            }, 800);
        };
        window.Web2SSE.subscribe('web2:wallet:*', reload);
    }

    // ----- CSV export -----
    async function exportCsv() {
        const btn = dom.csvBtn;
        if (!btn) return;
        btn.disabled = true;
        const orig = btn.innerHTML;
        btn.innerHTML = '<i data-lucide="loader-2"></i> Đang xuất…';
        if (window.lucide) window.lucide.createIcons();
        try {
            const params = new URLSearchParams();
            params.set('limit', '500');
            params.set('offset', '0');
            if (state.status !== 'all') params.set('status', state.status);
            if (state.search) params.set('search', state.search);
            if (state.dateFrom) params.set('since', state.dateFrom);
            if (state.dateTo) params.set('until', state.dateTo);
            const r = await withFallback(`?${params.toString()}`);
            const rows = r?.data || [];
            const header = [
                'Thời gian',
                'Loại',
                'Số tiền',
                'SĐT KH',
                'Tên KH',
                'Trạng thái',
                'Match method',
                'Confidence',
                'Sepay ID',
                'Reference',
                'Nội dung',
            ];
            const escape = (v) => {
                if (v == null) return '';
                const s = String(v).replace(/"/g, '""');
                return /[",\n]/.test(s) ? `"${s}"` : s;
            };
            const lines = [header.join(',')];
            for (const row of rows) {
                lines.push(
                    [
                        fmtTime(row.transaction_date),
                        row.transfer_type === 'in' ? 'Vào' : 'Ra',
                        row.transfer_amount || 0,
                        row.linked_customer_phone || '',
                        row.display_name || '',
                        row.verification_status || '',
                        row.match_method || '',
                        row.confidence_score || '',
                        row.sepay_id || '',
                        row.reference_code || '',
                        row.content || '',
                    ]
                        .map(escape)
                        .join(',')
                );
            }
            const csv = '﻿' + lines.join('\r\n');
            const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            const stamp = new Date().toISOString().slice(0, 10);
            a.href = url;
            a.download = `balance-history-${stamp}.csv`;
            document.body.appendChild(a);
            a.click();
            setTimeout(() => {
                document.body.removeChild(a);
                URL.revokeObjectURL(url);
            }, 100);
            notify(`Xuất ${rows.length} dòng CSV`, 'success');
        } catch (e) {
            notify('Lỗi xuất CSV: ' + e.message, 'error');
        } finally {
            btn.disabled = false;
            btn.innerHTML = orig;
            if (window.lucide) window.lucide.createIcons();
        }
    }

    // ----- Events -----
    function bindEvents() {
        if (dom.search) {
            dom.search.addEventListener(
                'input',
                debounce(() => {
                    state.search = dom.search.value.trim();
                    state.page = 1;
                    load();
                }, 350)
            );
        }
        if (dom.pageSize) {
            dom.pageSize.addEventListener('change', () => {
                state.pageSize = Number(dom.pageSize.value) || 50;
                state.page = 1;
                load();
            });
        }
        if (dom.refreshBtn) {
            dom.refreshBtn.addEventListener('click', () => load());
        }
        if (dom.reprocessBtn) {
            dom.reprocessBtn.addEventListener('click', () => reprocessUnmatched());
        }
        if (dom.dateFrom) {
            dom.dateFrom.addEventListener('change', () => {
                state.dateFrom = dom.dateFrom.value || '';
                state.page = 1;
                load();
            });
        }
        if (dom.dateTo) {
            dom.dateTo.addEventListener('change', () => {
                state.dateTo = dom.dateTo.value || '';
                state.page = 1;
                load();
            });
        }
        if (dom.dateClear) {
            dom.dateClear.addEventListener('click', () => {
                state.dateFrom = '';
                state.dateTo = '';
                if (dom.dateFrom) dom.dateFrom.value = '';
                if (dom.dateTo) dom.dateTo.value = '';
                state.page = 1;
                load();
            });
        }
        if (dom.csvBtn) {
            dom.csvBtn.addEventListener('click', () => exportCsv());
        }
        // Cmd/Ctrl + K → focus search
        document.addEventListener('keydown', (e) => {
            if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
                e.preventDefault();
                dom.search?.focus();
                dom.search?.select();
            }
        });
    }

    function init() {
        cacheDom();
        if (!dom.root) {
            console.warn('[Web2BalanceHistory] container #web2BhApp not found');
            return;
        }
        renderChips();
        bindEvents();
        load();
        setupSSE();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

    global.Web2BalanceHistoryApp = { load, state };
})(window);
