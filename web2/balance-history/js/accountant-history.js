// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | Read these files before coding, update dev-log after changes.
// =====================================================
// ACCOUNTANT HISTORY MODULE
// File: balance-history/js/accountant-history.js
//
// Tab "Lịch Sử" — Đọc audit log từ Firestore (collection `edit_history`)
// và hiển thị toàn bộ thao tác Duyệt / Điều chỉnh / Kiểm tra ở balance-history.
//
// Action types tracked:
// - approve  ← actionType: accountant_entry_create + transaction_approve
// - adjust   ← actionType: transaction_adjust
// - verify   ← actionType: transaction_verify
//
// Filters: date range, action type, performer, search (txId / description)
// =====================================================

(function () {
    'use strict';

    const COLLECTION = 'edit_history';
    const PAGE_SIZE = 50;
    const MAX_FETCH = 1000;
    // Cache key bumped to v2 — fetch strategy đổi từ where(module).limit(300) (random docs)
    // sang orderBy(timestamp desc).limit(1000) + filter module client-side để đảm bảo
    // entries mới nhất luôn nằm trong kết quả.
    const CACHE_KEY = 'acc_history_cache_v2';
    const CACHE_TTL_MS = 60 * 1000; // 60s — stale-while-revalidate

    // Map raw actionType → category trong tab
    const ACTION_TYPE_TO_CATEGORY = {
        accountant_entry_create: 'approve',
        transaction_approve: 'approve',
        transaction_adjust: 'adjust',
        transaction_verify: 'verify',
    };

    const CATEGORY_LABELS = {
        approve: { text: 'Duyệt', cls: 'badge-approve', icon: 'check-circle' },
        adjust: { text: 'Điều chỉnh', cls: 'badge-adjust', icon: 'edit' },
        verify: { text: 'Kiểm tra', cls: 'badge-verify', icon: 'clipboard-check' },
    };

    const state = {
        rawRecords: [],
        filtered: [],
        pageNum: 1,
        filters: {
            startDate: '',
            endDate: '',
            action: '',
            user: '',
            search: '',
        },
        loading: false,
    };

    function getDb() {
        try {
            if (typeof window.initializeFirestore === 'function') {
                const db = window.initializeFirestore({ enablePersistence: false });
                if (db) return db;
            }
            if (window.firebase && typeof window.firebase.firestore === 'function') {
                return window.firebase.firestore();
            }
        } catch (e) {
            console.error('[AccountantHistory] Firestore init failed:', e);
        }
        return null;
    }

    function fmtDateTime(ts) {
        if (!ts) return '—';
        let d;
        if (ts && typeof ts.toDate === 'function') {
            d = ts.toDate();
        } else if (typeof ts === 'string' || typeof ts === 'number') {
            d = new Date(ts);
        } else if (ts instanceof Date) {
            d = ts;
        } else if (ts && typeof ts.seconds === 'number') {
            d = new Date(ts.seconds * 1000);
        } else {
            return '—';
        }
        if (!d || isNaN(d.getTime())) return '—';
        const pad = (n) => String(n).padStart(2, '0');
        return `${pad(d.getDate())}/${pad(d.getMonth() + 1)} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
    }

    function escapeHtml(str) {
        if (str == null) return '';
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    function getRecordTimestamp(rec) {
        const ts = rec.timestamp;
        if (!ts) return null;
        if (typeof ts.toDate === 'function') return ts.toDate();
        if (ts instanceof Date) return ts;
        if (typeof ts.seconds === 'number') return new Date(ts.seconds * 1000);
        if (typeof ts === 'string' || typeof ts === 'number') {
            const d = new Date(ts);
            return isNaN(d.getTime()) ? null : d;
        }
        return null;
    }

    const STATUS_LABELS_VI = {
        PENDING_VERIFICATION: 'Chờ duyệt',
        APPROVED: 'Đã duyệt',
        REJECTED: 'Từ chối',
        ADJUSTED: 'Đã điều chỉnh',
        VERIFIED: 'Đã kiểm tra',
    };

    function viStatus(s) {
        if (!s) return s;
        return STATUS_LABELS_VI[s] || s;
    }

    function formatChangeContent(rec) {
        const category = ACTION_TYPE_TO_CATEGORY[rec.actionType];
        const oldD = rec.oldData || {};
        const newD = rec.newData || {};
        const parts = [];

        if (category === 'approve') {
            if (oldD.status && newD.status) {
                parts.push(
                    `<span class="diff-pill diff-old">${escapeHtml(viStatus(oldD.status))}</span> → <span class="diff-pill diff-new">${escapeHtml(viStatus(newD.status))}</span>`
                );
            }
            if (newD.bulk) {
                parts.push(`<span class="diff-meta">Hàng loạt: ${newD.count || 0} GD</span>`);
            }
            if (newD.note)
                parts.push(`<span class="diff-meta">Ghi chú: ${escapeHtml(newD.note)}</span>`);
            if (newD.imageUrl) parts.push(`<span class="diff-meta">+ Ảnh xác minh</span>`);
        } else if (category === 'adjust') {
            const at = newD.adjustment_type;
            if (at === 'transfer_to_correct') {
                parts.push(
                    `<span class="diff-meta">Chuyển sang KH: <strong>${escapeHtml(newD.correct_customer_phone || '')}</strong></span>`
                );
            } else if (at === 'debit_only') {
                parts.push(`<span class="diff-meta">Chỉ trừ ví khách sai</span>`);
            }
            if (oldD.phone) {
                parts.push(
                    `<span class="diff-meta">KH gốc: ${escapeHtml(oldD.customer_name || '')} (${escapeHtml(oldD.phone)})</span>`
                );
            }
            if (oldD.amount) {
                parts.push(
                    `<span class="diff-meta">Số tiền: ${Number(oldD.amount).toLocaleString('vi-VN')}đ</span>`
                );
            }
            if (newD.reason)
                parts.push(`<span class="diff-reason">Lý do: ${escapeHtml(newD.reason)}</span>`);
        } else if (category === 'verify') {
            parts.push(
                `<span class="diff-pill diff-old">Chưa kiểm tra</span> → <span class="diff-pill diff-new">Đã kiểm tra</span>`
            );
            if (newD.review_note)
                parts.push(
                    `<span class="diff-meta">Ghi chú: ${escapeHtml(newD.review_note)}</span>`
                );
            if (newD.review_image_url) parts.push(`<span class="diff-meta">+ Ảnh kiểm tra</span>`);
        }

        if (!parts.length) {
            try {
                const summary = JSON.stringify(newD);
                if (summary && summary !== '{}' && summary !== 'null') {
                    parts.push(
                        `<span class="diff-meta">${escapeHtml(summary.substring(0, 200))}</span>`
                    );
                }
            } catch (e) {
                /* ignore */
            }
        }

        return parts.join(' ');
    }

    function getRecordCategory(rec) {
        return ACTION_TYPE_TO_CATEGORY[rec.actionType] || null;
    }

    function getEntityIdLabel(rec) {
        const newD = rec.newData || {};
        if (newD.bulk && Array.isArray(newD.txIds)) {
            return `Bulk (${newD.txIds.length})`;
        }
        return rec.entityId || newD.txId || '—';
    }

    function getPerformer(rec) {
        return (
            rec.performerUserName ||
            rec.approverUserName ||
            rec.performerUserId ||
            rec.approverUserId ||
            'Unknown'
        );
    }

    function applyFilters() {
        const { startDate, endDate, action, user, search } = state.filters;
        const startMs = startDate ? new Date(startDate + 'T00:00:00').getTime() : null;
        const endMs = endDate ? new Date(endDate + 'T23:59:59').getTime() : null;
        const searchLower = (search || '').trim().toLowerCase();

        state.filtered = state.rawRecords.filter((rec) => {
            const category = getRecordCategory(rec);
            if (!category) return false;
            if (action && category !== action) return false;
            if (user && getPerformer(rec) !== user) return false;
            const ts = getRecordTimestamp(rec);
            if (!ts) return false;
            const ms = ts.getTime();
            if (startMs && ms < startMs) return false;
            if (endMs && ms > endMs) return false;
            if (searchLower) {
                const haystack = [
                    rec.description,
                    getEntityIdLabel(rec),
                    rec.entityId,
                    rec.newData ? JSON.stringify(rec.newData) : '',
                    rec.oldData ? JSON.stringify(rec.oldData) : '',
                ]
                    .filter(Boolean)
                    .join(' ')
                    .toLowerCase();
                if (!haystack.includes(searchLower)) return false;
            }
            return true;
        });

        state.pageNum = 1;
    }

    function populateUserDropdown() {
        const sel = document.getElementById('accHistoryUserFilter');
        if (!sel) return;
        const current = sel.value;
        const users = new Set();
        state.rawRecords.forEach((rec) => {
            if (getRecordCategory(rec)) users.add(getPerformer(rec));
        });
        const sorted = Array.from(users).sort((a, b) => a.localeCompare(b));
        sel.innerHTML =
            '<option value="">Tất cả</option>' +
            sorted
                .map(
                    (u) =>
                        `<option value="${escapeHtml(u)}"${u === current ? ' selected' : ''}>${escapeHtml(u)}</option>`
                )
                .join('');
    }

    function renderStats() {
        const el = document.getElementById('accHistoryStats');
        if (!el) return;
        if (!state.filtered.length) {
            el.style.display = 'none';
            return;
        }
        const counts = { approve: 0, adjust: 0, verify: 0 };
        state.filtered.forEach((rec) => {
            const c = getRecordCategory(rec);
            if (c && counts[c] != null) counts[c]++;
        });
        el.style.display = '';
        el.innerHTML = `
            <div class="acc-history-stat">
                <span class="stat-label">Tổng:</span>
                <strong>${state.filtered.length}</strong>
            </div>
            <div class="acc-history-stat stat-approve">
                <span class="stat-label">Duyệt:</span>
                <strong>${counts.approve}</strong>
            </div>
            <div class="acc-history-stat stat-adjust">
                <span class="stat-label">Điều chỉnh:</span>
                <strong>${counts.adjust}</strong>
            </div>
            <div class="acc-history-stat stat-verify">
                <span class="stat-label">Kiểm tra:</span>
                <strong>${counts.verify}</strong>
            </div>
        `;
    }

    function renderTable() {
        const tbody = document.getElementById('accHistoryTableBody');
        if (!tbody) return;

        if (state.loading) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="6" class="acc-empty-state">
                        <div class="empty-text">Đang tải lịch sử từ Firestore...</div>
                    </td>
                </tr>
            `;
            return;
        }

        if (!state.filtered.length) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="6" class="acc-empty-state">
                        <div class="empty-text">Không có thao tác nào khớp bộ lọc</div>
                    </td>
                </tr>
            `;
            renderPagination();
            return;
        }

        const startIdx = (state.pageNum - 1) * PAGE_SIZE;
        const pageRecords = state.filtered.slice(startIdx, startIdx + PAGE_SIZE);

        tbody.innerHTML = pageRecords
            .map((rec) => {
                const category = getRecordCategory(rec);
                const meta = CATEGORY_LABELS[category] || { text: 'Khác', cls: '', icon: 'circle' };
                const ts = getRecordTimestamp(rec);
                const performer = escapeHtml(getPerformer(rec));
                const entityId = escapeHtml(getEntityIdLabel(rec));
                const desc = escapeHtml(rec.description || '');
                const change = formatChangeContent(rec);
                return `
                    <tr>
                        <td class="col-time">${escapeHtml(fmtDateTime(ts))}</td>
                        <td><span class="acc-history-badge ${meta.cls}">${escapeHtml(meta.text)}</span></td>
                        <td class="col-txid">${entityId}</td>
                        <td>${performer}</td>
                        <td class="col-desc">${desc}</td>
                        <td class="col-change">${change}</td>
                    </tr>
                `;
            })
            .join('');

        if (window.lucide) lucide.createIcons();
        renderPagination();
    }

    function renderPagination() {
        const el = document.getElementById('accPaginationHistory');
        if (!el) return;
        const total = state.filtered.length;
        const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
        if (totalPages <= 1) {
            el.innerHTML = '';
            return;
        }
        const cur = state.pageNum;
        const btn = (page, label, disabled, active) =>
            `<button class="acc-page-btn${active ? ' active' : ''}" data-page="${page}"${disabled ? ' disabled' : ''}>${label}</button>`;
        const buttons = [];
        buttons.push(btn(1, '«', cur === 1, false));
        buttons.push(btn(Math.max(1, cur - 1), '‹', cur === 1, false));

        const range = 2;
        let from = Math.max(1, cur - range);
        let to = Math.min(totalPages, cur + range);
        if (from > 1) buttons.push(`<span class="acc-page-ellipsis">…</span>`);
        for (let p = from; p <= to; p++) {
            buttons.push(btn(p, String(p), false, p === cur));
        }
        if (to < totalPages) buttons.push(`<span class="acc-page-ellipsis">…</span>`);

        buttons.push(btn(Math.min(totalPages, cur + 1), '›', cur === totalPages, false));
        buttons.push(btn(totalPages, '»', cur === totalPages, false));

        // Page select
        const opts = [];
        for (let p = 1; p <= totalPages; p++) {
            opts.push(`<option value="${p}"${p === cur ? ' selected' : ''}>${p}</option>`);
        }
        const select = `<select class="acc-page-select" id="accHistoryPageJump">${opts.join('')}</select>`;

        el.innerHTML = `
            <div class="acc-page-info">Trang ${cur}/${totalPages} — Tổng ${total} bản ghi</div>
            <div class="acc-page-controls">${buttons.join('')}<span class="acc-page-jump-label">Đi đến:</span>${select}</div>
        `;

        el.querySelectorAll('.acc-page-btn').forEach((b) => {
            b.addEventListener('click', () => {
                const p = parseInt(b.dataset.page, 10);
                if (!isNaN(p)) gotoPage(p);
            });
        });
        const jump = document.getElementById('accHistoryPageJump');
        if (jump) {
            jump.addEventListener('change', () => {
                const p = parseInt(jump.value, 10);
                if (!isNaN(p)) gotoPage(p);
            });
        }
    }

    function gotoPage(page) {
        const totalPages = Math.max(1, Math.ceil(state.filtered.length / PAGE_SIZE));
        state.pageNum = Math.min(Math.max(1, page), totalPages);
        renderTable();
    }

    function readFiltersFromUI() {
        state.filters.startDate = document.getElementById('accHistoryStartDate')?.value || '';
        state.filters.endDate = document.getElementById('accHistoryEndDate')?.value || '';
        state.filters.action = document.getElementById('accHistoryActionFilter')?.value || '';
        state.filters.user = document.getElementById('accHistoryUserFilter')?.value || '';
        state.filters.search = document.getElementById('accHistorySearch')?.value || '';
    }

    function setDatePreset(preset, days) {
        const end = new Date();
        let start = new Date();
        if (preset === 'today') {
            // start = today
        } else if (preset === 'yesterday') {
            start.setDate(start.getDate() - 1);
            end.setDate(end.getDate() - 1);
        } else if (days) {
            start.setDate(start.getDate() - parseInt(days, 10) + 1);
        }
        const iso = (d) => {
            const y = d.getFullYear();
            const m = String(d.getMonth() + 1).padStart(2, '0');
            const dd = String(d.getDate()).padStart(2, '0');
            return `${y}-${m}-${dd}`;
        };
        document.getElementById('accHistoryStartDate').value = iso(start);
        document.getElementById('accHistoryEndDate').value = iso(end);
    }

    function readCache() {
        try {
            const raw = localStorage.getItem(CACHE_KEY);
            if (!raw) return null;
            const obj = JSON.parse(raw);
            if (!obj || !Array.isArray(obj.records) || !obj.savedAt) return null;
            // Records cache lưu timestamp ms (đã convert) + giữ raw fields khác
            return obj;
        } catch (e) {
            return null;
        }
    }

    function writeCache(records) {
        try {
            const slim = records.map((rec) => {
                const ts = getRecordTimestamp(rec);
                return {
                    ...rec,
                    timestamp: ts ? ts.getTime() : null,
                };
            });
            localStorage.setItem(CACHE_KEY, JSON.stringify({ savedAt: Date.now(), records: slim }));
        } catch (e) {
            // QuotaExceeded etc. — bỏ qua
        }
    }

    async function fetchRecords() {
        const db = getDb();
        if (!db) {
            console.error('[AccountantHistory] Firestore unavailable');
            return [];
        }
        // QUAN TRỌNG: orderBy('timestamp', 'desc') + limit, KHÔNG dùng where('module', ...)
        // Lý do: where('module',==,X)+limit(N) KHÔNG có orderBy → Firestore order by __name__
        // (random cho auto-IDs) → trả N docs ngẫu nhiên trải dài nhiều tháng, miss entries mới.
        // Composite index (module asc + timestamp desc) sẽ giải quyết, nhưng để tránh phụ thuộc
        // index deploy: dùng single-field index timestamp (auto-created), filter module client-side.
        try {
            const snap = await db
                .collection(COLLECTION)
                .orderBy('timestamp', 'desc')
                .limit(MAX_FETCH)
                .get();
            const records = [];
            snap.forEach((doc) => {
                const data = doc.data();
                if (data && data.module === 'balance-history') {
                    records.push({ _id: doc.id, ...data });
                }
            });
            return records;
        } catch (e) {
            console.error('[AccountantHistory] Fetch failed:', e);
            return [];
        }
    }

    function applyAndRender() {
        populateUserDropdown();
        applyFilters();
        renderStats();
        renderTable();
    }

    async function load(forceRefresh) {
        readFiltersFromUI();

        // Stale-while-revalidate: nếu có cache, hiển thị NGAY rồi fetch nền
        const cached = !forceRefresh ? readCache() : null;
        const cacheAgeMs = cached ? Date.now() - cached.savedAt : Infinity;

        if (cached) {
            state.rawRecords = cached.records;
            state.loading = false;
            applyAndRender();
            // Nếu cache còn fresh (<60s) và không force, bỏ qua refetch
            if (cacheAgeMs < CACHE_TTL_MS) return;
        } else {
            state.loading = true;
            renderTable();
        }

        // Background fetch
        const records = await fetchRecords();
        if (records.length) {
            state.rawRecords = records;
            writeCache(records);
        }
        state.loading = false;
        applyAndRender();
    }

    function bindFilterEvents() {
        const ids = ['accHistoryActionFilter', 'accHistoryUserFilter'];
        ids.forEach((id) => {
            const el = document.getElementById(id);
            if (el && !el.dataset.bound) {
                el.dataset.bound = '1';
                el.addEventListener('change', () => {
                    readFiltersFromUI();
                    applyFilters();
                    renderStats();
                    renderTable();
                });
            }
        });

        const search = document.getElementById('accHistorySearch');
        if (search && !search.dataset.bound) {
            search.dataset.bound = '1';
            let timer = null;
            search.addEventListener('input', () => {
                clearTimeout(timer);
                timer = setTimeout(() => {
                    readFiltersFromUI();
                    applyFilters();
                    renderStats();
                    renderTable();
                }, 250);
            });
        }

        document.querySelectorAll('#accHistoryFilters .acc-preset-btn').forEach((btn) => {
            if (btn.dataset.bound) return;
            btn.dataset.bound = '1';
            btn.addEventListener('click', () => {
                const preset = btn.dataset.preset;
                const days = btn.dataset.days;
                setDatePreset(preset, days);
                readFiltersFromUI();
                applyFilters();
                renderStats();
                renderTable();
            });
        });

        ['accHistoryStartDate', 'accHistoryEndDate'].forEach((id) => {
            const el = document.getElementById(id);
            if (el && !el.dataset.bound) {
                el.dataset.bound = '1';
                el.addEventListener('change', () => {
                    readFiltersFromUI();
                    applyFilters();
                    renderStats();
                    renderTable();
                });
            }
        });
    }

    function init() {
        bindFilterEvents();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        setTimeout(init, 100);
    }

    window.AccountantHistoryModule = {
        load,
        gotoPage,
    };
})();
