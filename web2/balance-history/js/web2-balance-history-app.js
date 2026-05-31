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
        { key: 'MANUAL', label: 'Nạp/Rút tay', cls: 'chip-manual' },
        { key: 'MANUAL_ALL', label: 'Lịch sử thủ công', cls: 'chip-manual-all' },
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

    // Auto-reprocess: fire-and-forget background reprocess khi page load.
    // Web 2.0 = 100% auto — không có nút thủ công, hệ thống tự handle. Throttle
    // 30s/page-load để chống spam khi user F5 liên tục.
    let _autoReprocessRunning = false;
    async function autoReprocessOnLoad() {
        if (_autoReprocessRunning) return;
        const lastRun = Number(sessionStorage.getItem('w2bh_last_auto_reprocess') || 0);
        if (Date.now() - lastRun < 30 * 1000) return; // throttle 30s
        _autoReprocessRunning = true;
        sessionStorage.setItem('w2bh_last_auto_reprocess', String(Date.now()));
        try {
            const r = await withFallback('/reprocess-unmatched', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ limit: 200 }),
            });
            const s = r?.data || {};
            if (s.picked > 0 && (s.matched > 0 || s.pending > 0)) {
                notify(
                    `Auto-process: ${s.matched} cộng ví, ${s.pending} chờ chọn KH, ${s.no_match} không match`,
                    'info'
                );
                await load();
                // Nếu còn rows chưa xử lý → loop tiếp (max 5 lần để chống vô hạn)
                if (
                    s.picked === 200 &&
                    Number(sessionStorage.getItem('w2bh_loop_count') || 0) < 5
                ) {
                    sessionStorage.setItem(
                        'w2bh_loop_count',
                        String(Number(sessionStorage.getItem('w2bh_loop_count') || 0) + 1)
                    );
                    sessionStorage.removeItem('w2bh_last_auto_reprocess');
                    setTimeout(() => {
                        _autoReprocessRunning = false;
                        autoReprocessOnLoad();
                    }, 1500);
                    return;
                }
                sessionStorage.removeItem('w2bh_loop_count');
            }
        } catch (e) {
            console.warn('[w2bh] auto-reprocess failed:', e.message);
        } finally {
            _autoReprocessRunning = false;
        }
    }

    async function reprocessUnmatched() {
        const btn = dom.reprocessBtn;
        if (!btn) return;
        // No confirm — Web 2.0 = 100% auto, no friction. User chỉ click khi muốn
        // force-run thay vì đợi auto-reprocess on load.
        sessionStorage.removeItem('w2bh_last_auto_reprocess');
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
        dom.tbody.querySelectorAll('[data-action="reassign"]').forEach((btn) => {
            btn.addEventListener('click', () =>
                openReassignModal(
                    btn.getAttribute('data-id'),
                    btn.getAttribute('data-old-phone'),
                    Number(btn.getAttribute('data-amount')) || 0
                )
            );
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

    function _extractUserFromRow(r) {
        // Prefer verified_by (new column for manual_link/resolve/reassign).
        // Fallback: parse raw_data JSONB cho manual_deposit/withdraw (userName).
        if (r.verified_by) return String(r.verified_by);
        const raw = r.raw_data || r.body;
        if (raw && typeof raw === 'object') {
            if (raw.userName) return String(raw.userName);
        }
        if (typeof raw === 'string') {
            try {
                const parsed = JSON.parse(raw);
                if (parsed && parsed.userName) return String(parsed.userName);
            } catch {}
        }
        return null;
    }

    function renderRow(r) {
        const amount = Number(r.transfer_amount) || 0;
        const isIn = r.transfer_type === 'in';
        const cls = isIn ? 'in' : 'out';
        const sign = isIn ? '+' : '-';
        const phone = r.linked_customer_phone || '';
        const name = r.display_name || '';
        const method = r.match_method || '';
        const isManual = method === 'manual_deposit' || method === 'manual_withdraw';
        const isManualByUser =
            method === 'manual_deposit' ||
            method === 'manual_withdraw' ||
            method === 'manual_link' ||
            method === 'manual_resolve' ||
            method === 'manual_reassign';
        const assignedBy = _extractUserFromRow(r);
        const ACTION_LABELS = {
            manual_deposit: 'Nạp tay',
            manual_withdraw: 'Rút tay',
            manual_link: 'Gán KH',
            manual_resolve: 'Chọn KH (multi)',
            manual_reassign: 'Đổi KH',
        };
        const actionLabel = ACTION_LABELS[method] || '';
        const verifiedAtText = r.verified_at ? fmtTime(r.verified_at) : '';
        const userBadge =
            isManualByUser && assignedBy
                ? `<span class="w2bh-user-badge" title="${escapeHtml(actionLabel)}${verifiedAtText ? ' lúc ' + verifiedAtText : ''}">
                       <i data-lucide="user-check" style="width:10px;height:10px"></i>
                       ${actionLabel ? `<b class="w2bh-user-action">${escapeHtml(actionLabel)}</b>` : ''}
                       ${escapeHtml(assignedBy)}
                   </span>`
                : isManualByUser
                  ? `<span class="w2bh-user-badge w2bh-user-badge-unknown" title="${escapeHtml(actionLabel)} — không xác định user">
                       <i data-lucide="user" style="width:10px;height:10px"></i>
                       ${actionLabel ? `<b class="w2bh-user-action">${escapeHtml(actionLabel)}</b>` : ''}
                       (—)
                   </span>`
                  : '';
        // Manual NCC: có display_name nhưng KHÔNG có phone (Firestore-based).
        //   Không show "+ Gán KH" / "Không có thông tin" như rows webhook unmatched.
        const isManualNcc = isManual && !phone && name;
        // Badge logic — Web 2.0 = 100% tự động. Chỉ 3 trạng thái:
        //   AUTO_APPROVED hoặc debt_added=true → "Tự động" (xanh, đã cộng ví)
        //   pending_match / pending_low_confidence → "Chờ chọn" (vàng, multi-match cần user)
        //   chưa xử lý → "Đang xử lý…" (xám, auto-reprocess sẽ chạy)
        //   no phone + đã reprocess không ra → "Chưa gán" (đỏ, cần user gán hoặc bỏ qua)
        const verifBadge = (() => {
            if (method === 'pending_match') {
                return '<span class="w2bh-pill pending">Chờ chọn KH</span>';
            }
            if (method === 'pending_low_confidence') {
                return '<span class="w2bh-pill pending">Chờ xác minh</span>';
            }
            if (r.debt_added === true) {
                return '<span class="w2bh-pill auto" title="Đã cộng ví Web 2.0 tự động">Tự động</span>';
            }
            if (phone) {
                // Có phone nhưng wallet chưa process → đang chờ auto-reprocess
                return '<span class="w2bh-pill processing" title="Đang chờ Web 2.0 matcher cộng ví. Bấm ⚡ để chạy ngay.">Đang xử lý…</span>';
            }
            return '<span class="w2bh-pill nophone">Chưa gán</span>';
        })();
        // Extraction preview cho row chưa gán (KHÔNG áp cho manual deposit)
        let extractionBadge = '';
        if (!phone && !isManual && r.extraction_preview) {
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
        // Web 2.0 = 100% auto. Không có nút ⚡ thủ công. Auto-reprocess background
        // (init + SSE) sẽ tự cộng ví cho mọi row eligible. Chỉ giữ nút "Gán KH" cho
        // edge case: extract không ra phone → user nhập tay (rare).
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
                            : isManualNcc
                              ? `<div class="w2bh-customer">
                                    <span class="w2bh-customer-name">${escapeHtml(name)}</span>
                                    <span class="w2bh-customer-phone w2bh-ncc-tag">NCC</span>
                                 </div>`
                              : extractionBadge +
                                `<button type="button" class="w2bh-link-btn" data-action="link" data-id="${r.id}">+ Gán KH</button>`
                    }
                    ${verifBadge}
                    ${userBadge}
                </td>
                <td class="w2bh-cell-actions">
                    ${
                        !phone && !isManualNcc
                            ? `<button type="button" class="w2bh-icon-btn" data-action="link" data-id="${r.id}" title="Gán SĐT thủ công (fallback khi extractor không tìm ra)">
                                <i data-lucide="user-plus" style="width:14px;height:14px;"></i>
                            </button>`
                            : ''
                    }
                    ${
                        phone && isIn && r.debt_added === true && amount > 0
                            ? `<button type="button" class="w2bh-icon-btn w2bh-icon-reassign" data-action="reassign" data-id="${r.id}" data-old-phone="${escapeHtml(phone)}" data-amount="${amount}" title="Sửa KH (chuyển công nợ sang KH khác)">
                                <i data-lucide="user-cog" style="width:14px;height:14px;"></i>
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
    function _currentUser() {
        try {
            const raw =
                localStorage.getItem('loginindex_auth') ||
                sessionStorage.getItem('loginindex_auth') ||
                '{}';
            const auth = JSON.parse(raw);
            return auth.username || auth.userName || auth.email || 'admin';
        } catch {
            return 'admin';
        }
    }

    async function linkManual(id, phone, name) {
        try {
            await withFallback(`/${encodeURIComponent(id)}/link`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    phone,
                    name: name || null,
                    verifiedBy: _currentUser(),
                }),
            });
            notify(`Đã gán ${name || phone} + cộng ví Web 2.0`, 'success');
            await load();
        } catch (e) {
            notify('Lỗi gán: ' + e.message, 'error');
        }
    }

    // ----- Reassign customer (admin) — chuyển công nợ KH cũ → KH mới -----
    const CUSTOMER_SEARCH_BASE = BASE.replace(/\/api\/web2\/balance-history$/, '/api/v2/customers');
    const CUSTOMER_SEARCH_FALLBACK = DIRECT_BASE.replace(
        /\/api\/web2\/balance-history$/,
        '/api/v2/customers'
    );

    async function searchCustomers(q) {
        const query = String(q || '').trim();
        if (query.length < 2) return [];
        const url = (base) =>
            `${base}?search=${encodeURIComponent(query)}&limit=8&sort=last_order_date&order=desc`;
        const parse = async (base) => {
            const r = await fetch(url(base));
            if (!r.ok) throw new Error(`HTTP ${r.status}`);
            const data = await r.json();
            const arr = Array.isArray(data?.customers)
                ? data.customers
                : Array.isArray(data?.data)
                  ? data.data
                  : [];
            return arr
                .map((c) => ({
                    phone: c.phone || '',
                    name: c.name || c.full_name || '',
                }))
                .filter((c) => c.phone);
        };
        try {
            return await parse(CUSTOMER_SEARCH_BASE);
        } catch {
            try {
                return await parse(CUSTOMER_SEARCH_FALLBACK);
            } catch (e) {
                console.warn('[balance-history] customer search fail:', e.message);
                return [];
            }
        }
    }

    function ensureReassignModalDom() {
        if (document.getElementById('w2bhReassignModal')) return;
        const div = document.createElement('div');
        div.id = 'w2bhReassignModal';
        div.className = 'w2bh-reassign-modal';
        div.hidden = true;
        div.innerHTML = `
            <div class="w2bh-reassign-backdrop" data-close></div>
            <div class="w2bh-reassign-panel">
                <header class="w2bh-reassign-head">
                    <h3>Sửa khách hàng — Chuyển công nợ</h3>
                    <button type="button" class="w2bh-reassign-close" data-close aria-label="Đóng">&times;</button>
                </header>
                <div class="w2bh-reassign-body">
                    <div class="w2bh-reassign-info" id="w2bhReassignInfo"></div>
                    <p class="w2bh-reassign-warn">
                        ⚠️ Hành động này sẽ <strong>trừ ví KH cũ</strong> và <strong>cộng vào ví KH mới</strong>.
                        Audit log đầy đủ.
                    </p>
                    <label class="w2bh-reassign-field">
                        <span>Tìm KH mới (SĐT / tên):</span>
                        <div class="w2bh-reassign-search-wrap">
                            <input type="search" id="w2bhReassignSearch"
                                placeholder="Gõ SĐT hoặc tên KH (tối thiểu 2 ký tự)…"
                                autocomplete="off" />
                            <div class="w2bh-reassign-dropdown" id="w2bhReassignDropdown" hidden></div>
                        </div>
                    </label>
                    <label class="w2bh-reassign-field">
                        <span>Tên KH (tự nhập):</span>
                        <input type="text" id="w2bhReassignName" placeholder="Tên (tuỳ chọn)" />
                    </label>
                    <label class="w2bh-reassign-field">
                        <span>Lý do (tuỳ chọn):</span>
                        <input type="text" id="w2bhReassignReason" placeholder="VD: gán nhầm, KH báo CK hộ…" />
                    </label>
                </div>
                <footer class="w2bh-reassign-foot">
                    <button type="button" class="btn-secondary" data-close>Huỷ</button>
                    <button type="button" class="btn-primary" id="w2bhReassignSubmit">Xác nhận chuyển</button>
                </footer>
            </div>
        `;
        document.body.appendChild(div);
        div.querySelectorAll('[data-close]').forEach((el) =>
            el.addEventListener('click', () => (div.hidden = true))
        );
        const search = div.querySelector('#w2bhReassignSearch');
        const dd = div.querySelector('#w2bhReassignDropdown');
        const nameInput = div.querySelector('#w2bhReassignName');
        let debounceT = null;
        search.addEventListener('input', () => {
            if (debounceT) clearTimeout(debounceT);
            const q = search.value || '';
            debounceT = setTimeout(async () => {
                if (q.trim().length < 2) {
                    dd.hidden = true;
                    dd.innerHTML = '';
                    return;
                }
                dd.innerHTML = '<div class="w2bh-reassign-loading">Đang tìm…</div>';
                dd.hidden = false;
                const results = await searchCustomers(q);
                if (!results.length) {
                    dd.innerHTML =
                        '<div class="w2bh-reassign-loading">Không tìm thấy. Có thể gõ thẳng SĐT rồi bấm Xác nhận.</div>';
                    return;
                }
                dd.innerHTML = results
                    .map(
                        (c) => `<button type="button" class="w2bh-reassign-item"
                            data-phone="${escapeHtml(c.phone)}"
                            data-name="${escapeHtml(c.name || '')}">
                            <span class="w2bh-reassign-item-phone">${escapeHtml(c.phone)}</span>
                            <span class="w2bh-reassign-item-name">${escapeHtml(c.name || '(không tên)')}</span>
                        </button>`
                    )
                    .join('');
                dd.querySelectorAll('.w2bh-reassign-item').forEach((b) => {
                    b.addEventListener('mousedown', (e) => e.preventDefault());
                    b.addEventListener('click', () => {
                        search.value = b.dataset.phone;
                        nameInput.value = b.dataset.name || '';
                        dd.hidden = true;
                    });
                });
            }, 220);
        });
        search.addEventListener('blur', () => {
            setTimeout(() => (dd.hidden = true), 150);
        });
        div.querySelector('#w2bhReassignSubmit').addEventListener('click', submitReassign);
        ensureReassignStyles();
    }

    function ensureReassignStyles() {
        if (document.getElementById('w2bhReassignStyles')) return;
        const s = document.createElement('style');
        s.id = 'w2bhReassignStyles';
        s.textContent = `
            .w2bh-reassign-modal { position: fixed; inset: 0; z-index: 10000; display: flex; align-items: center; justify-content: center; }
            .w2bh-reassign-modal[hidden] { display: none; }
            .w2bh-reassign-backdrop { position: absolute; inset: 0; background: rgba(15,23,42,.55); }
            .w2bh-reassign-panel { position: relative; background: #fff; border-radius: 12px; width: min(560px, 92vw); max-height: 86vh; display: flex; flex-direction: column; box-shadow: 0 24px 60px rgba(0,0,0,0.25); overflow: hidden; }
            .w2bh-reassign-head { padding: 14px 18px; border-bottom: 1px solid #e5e7eb; display: flex; justify-content: space-between; align-items: center; }
            .w2bh-reassign-head h3 { margin: 0; font-size: 16px; font-weight: 700; color: #0f172a; }
            .w2bh-reassign-close { background: transparent; border: none; font-size: 22px; color: #475569; cursor: pointer; padding: 4px 8px; }
            .w2bh-reassign-body { padding: 16px 18px; overflow-y: auto; flex: 1; }
            .w2bh-reassign-info { background: #eff6ff; border: 1px solid #bfdbfe; border-radius: 6px; padding: 10px 12px; margin-bottom: 12px; font-size: 13px; color: #1e3a8a; }
            .w2bh-reassign-info b { color: #0c4a6e; }
            .w2bh-reassign-warn { margin: 0 0 14px; padding: 10px 12px; background: #fef3c7; border-left: 4px solid #f59e0b; border-radius: 6px; color: #78350f; font-size: 13px; line-height: 1.5; }
            .w2bh-reassign-field { display: block; margin-bottom: 12px; }
            .w2bh-reassign-field > span { display: block; font-size: 12px; font-weight: 600; color: #475569; margin-bottom: 4px; }
            .w2bh-reassign-field input[type="text"], .w2bh-reassign-field input[type="search"] { width: 100%; height: 36px; padding: 0 12px; border: 1px solid #cbd5e1; border-radius: 6px; font: 400 14px Inter, sans-serif; color: #0f172a; outline: none; box-sizing: border-box; }
            .w2bh-reassign-field input:focus { border-color: #0891b2; box-shadow: 0 0 0 2px rgba(8,145,178,.2); }
            .w2bh-reassign-search-wrap { position: relative; }
            .w2bh-reassign-dropdown { position: absolute; top: 100%; left: 0; right: 0; z-index: 30; margin-top: 4px; background: #fff; border: 1px solid #e5e7eb; border-radius: 6px; box-shadow: 0 10px 24px rgba(15,23,42,.14); max-height: 220px; overflow-y: auto; padding: 4px; }
            .w2bh-reassign-item { display: flex; gap: 10px; padding: 6px 10px; border: none; background: transparent; border-radius: 4px; text-align: left; cursor: pointer; width: 100%; font-size: 12px; }
            .w2bh-reassign-item:hover { background: #ecfdf5; }
            .w2bh-reassign-item-phone { font-weight: 600; color: #047857; min-width: 110px; }
            .w2bh-reassign-item-name { flex: 1; color: #0f172a; }
            .w2bh-reassign-loading { padding: 10px; text-align: center; color: #94a3b8; font-size: 12px; font-style: italic; }
            .w2bh-reassign-foot { padding: 12px 18px; border-top: 1px solid #e5e7eb; background: #f9fafb; display: flex; justify-content: flex-end; gap: 8px; }
            .w2bh-reassign-foot .btn-primary { background: #0891b2; color: #fff; border: none; padding: 8px 16px; border-radius: 6px; cursor: pointer; font-weight: 600; }
            .w2bh-reassign-foot .btn-primary:hover { background: #0e7490; }
            .w2bh-reassign-foot .btn-primary:disabled { background: #94a3b8; cursor: not-allowed; }
            .w2bh-reassign-foot .btn-secondary { background: #fff; color: #475569; border: 1px solid #cbd5e1; padding: 8px 16px; border-radius: 6px; cursor: pointer; }
            .w2bh-icon-reassign { color: #b45309; }
            .w2bh-icon-reassign:hover { color: #92400e; background: #fef3c7; }
            .w2bh-user-badge { display: inline-flex; align-items: center; gap: 3px; padding: 2px 8px; background: #f1f5f9; color: #475569; border-radius: 999px; font-size: 11px; font-weight: 500; margin-left: 4px; }
        `;
        document.head.appendChild(s);
    }

    let _reassignCtx = null;

    function openReassignModal(id, oldPhone, amount) {
        ensureReassignModalDom();
        _reassignCtx = { id, oldPhone, amount };
        const row = state.rows.find((x) => String(x.id) === String(id));
        const oldName = row?.display_name || '(không tên)';
        document.getElementById('w2bhReassignInfo').innerHTML = `
            <div>GD: <b>+${fmtVnd(amount)}₫</b> · ${escapeHtml(row?.reference_code || row?.sepay_id || '')}</div>
            <div>KH hiện tại: <b>${escapeHtml(oldName)}</b> — ${escapeHtml(oldPhone)}</div>
        `;
        document.getElementById('w2bhReassignSearch').value = '';
        document.getElementById('w2bhReassignName').value = '';
        document.getElementById('w2bhReassignReason').value = '';
        const submit = document.getElementById('w2bhReassignSubmit');
        submit.disabled = false;
        submit.textContent = 'Xác nhận chuyển';
        document.getElementById('w2bhReassignModal').hidden = false;
        setTimeout(() => document.getElementById('w2bhReassignSearch').focus(), 60);
        if (window.lucide?.createIcons) window.lucide.createIcons();
    }

    function _normalizePhoneInput(raw) {
        let s = String(raw || '').replace(/[^0-9]/g, '');
        if (s.startsWith('84') && s.length >= 11) s = '0' + s.slice(2);
        return s;
    }

    async function submitReassign() {
        if (!_reassignCtx) return;
        const { id, oldPhone, amount } = _reassignCtx;
        const rawPhone = document.getElementById('w2bhReassignSearch').value || '';
        const name = (document.getElementById('w2bhReassignName').value || '').trim();
        const reason = (document.getElementById('w2bhReassignReason').value || '').trim();
        const phone = _normalizePhoneInput(rawPhone);
        if (!phone || phone.length < 9 || phone.length > 11) {
            notify('SĐT mới phải có 9-11 số', 'warning');
            return;
        }
        if (phone === _normalizePhoneInput(oldPhone)) {
            notify('SĐT mới trùng SĐT cũ — không cần chuyển', 'warning');
            return;
        }
        const submit = document.getElementById('w2bhReassignSubmit');
        submit.disabled = true;
        submit.textContent = 'Đang xử lý…';
        try {
            const r = await withFallback(`/${encodeURIComponent(id)}/reassign`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    phone,
                    name: name || null,
                    verifiedBy: _currentUser(),
                    reason: reason || null,
                }),
            });
            const d = r?.data || {};
            notify(
                `✅ Đã chuyển ${fmtVnd(amount)}₫ từ ${d.oldPhone || oldPhone} → ${d.newPhone || phone}`,
                'success'
            );
            document.getElementById('w2bhReassignModal').hidden = true;
            _reassignCtx = null;
            await load();
        } catch (e) {
            notify('Lỗi reassign: ' + e.message, 'error');
            submit.disabled = false;
            submit.textContent = 'Xác nhận chuyển';
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
        // Fire auto-reprocess in background after initial render. Web 2.0 = 100%
        // tự động — không để user thấy "Đang xử lý…" lâu cho rows từ legacy backfill.
        setTimeout(() => autoReprocessOnLoad(), 2000);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

    global.Web2BalanceHistoryApp = { load, state };
})(window);
