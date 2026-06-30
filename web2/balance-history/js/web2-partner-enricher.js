// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | WEB2.0 — enrich balance-history rows với trạng thái KH Web 2.0.
// =====================================================================
// Web2PartnerEnricher — quét bảng giao dịch, batch fetch KH Web 2.0
// (kho KH Web 2.0 — Web2CustomerStore / /api/web2/customers) theo phone,
// render status pill (Bom hàng/Cảnh báo/Nguy hiểm/VIP) + link "Mở thẻ KH"
// cho mỗi row đã link với KH.
// =====================================================================

(function () {
    'use strict';

    if (typeof window === 'undefined') return;

    // Memory-only cache; kho KH Web 2.0 là source of truth, không persist.
    const cache = new Map();
    let pendingPhones = new Set();
    let flushTimer = null;
    let observerActive = false;

    function normPhone(p) {
        const s = String(p || '').replace(/\D/g, '');
        if (!s) return '';
        if (s.startsWith('84') && s.length >= 11) return '0' + s.slice(2);
        return s;
    }

    function escapeHtml(value) {
        if (window.Web2Escape && window.Web2Escape.escapeHtml)
            return window.Web2Escape.escapeHtml(value);
        if (value === null || value === undefined) return '';
        return String(value)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    function statusPillHtml(partner) {
        const Api = window.PartnerCustomerApi;
        if (!Api) return '';
        const status = partner.Status || 'Normal';
        const text = partner.StatusText || Api.STATUS_TEXT?.[status] || '';
        if (!text || status === 'Normal') return ''; // chỉ show khi khác Bình thường (giảm nhiễu)
        const cls = (Api.statusClass?.(status) || '').replace('pc-status-', 'bh-web2-status-');
        return `<span class="bh-web2-status-pill ${cls}" title="Trạng thái KH Web 2.0">${escapeHtml(text)}</span>`;
    }

    function linkHtml(partner) {
        const id = partner?.Id;
        const url = id ? `../customers/index.html` : '../customers/index.html';
        return `<a class="bh-web2-link" href="${url}" target="_blank" rel="noopener" title="Mở thẻ KH Web 2.0"><i data-lucide="external-link"></i></a>`;
    }

    function enrichRow(row) {
        if (!row || row.__web2Enriched) return;
        const phone = normPhone(row.getAttribute('data-customer-phone'));
        if (!phone || phone.length < 9) return;
        const partner = cache.get(phone);
        if (partner === undefined) {
            pendingPhones.add(phone);
            scheduleFlush();
            return;
        }
        if (partner === null) {
            row.__web2Enriched = true;
            return; // not found in kho KH Web 2.0
        }
        const cell = row.querySelector('[data-web2-customer-cell="1"]');
        if (!cell) return;
        // Check exist
        if (cell.querySelector('.bh-web2-enrich')) {
            row.__web2Enriched = true;
            return;
        }
        const wrap = document.createElement('span');
        wrap.className = 'bh-web2-enrich';
        // 2026-06-03: bỏ nút "Mở thẻ KH" (↗) — click tên KH mở modal chi tiết thay thế.
        wrap.innerHTML = statusPillHtml(partner);
        cell.appendChild(wrap);
        row.__web2Enriched = true;
        if (window.lucide?.createIcons) window.lucide.createIcons();
    }

    function scheduleFlush() {
        if (flushTimer) return;
        flushTimer = setTimeout(flush, 250);
    }

    async function flush() {
        flushTimer = null;
        if (!window.PartnerCustomerApi?.listByPhones) return;
        if (!pendingPhones.size) return;
        const phones = Array.from(pendingPhones);
        pendingPhones.clear();
        try {
            const map = await window.PartnerCustomerApi.listByPhones(phones, { chunkSize: 30 });
            for (const phone of phones) {
                cache.set(phone, map.get(phone) || null);
            }
            // Re-enrich all rows
            document.querySelectorAll('tr[data-customer-phone]').forEach((row) => enrichRow(row));
        } catch (e) {
            console.warn('[Web2PartnerEnricher] flush fail:', e.message);
            for (const phone of phones) {
                if (!cache.has(phone)) cache.set(phone, null);
            }
        }
    }

    function scanAll() {
        document.querySelectorAll('tr[data-customer-phone]').forEach((row) => enrichRow(row));
    }

    function startObserver() {
        if (observerActive) return;
        const target =
            document.getElementById('w2bhTbody') ||
            document.getElementById('transactionTableBody') ||
            document.body;
        const mo = new MutationObserver(() => {
            // Debounce slight to coalesce bulk DOM updates
            if (flushTimer) return;
            requestAnimationFrame(() => scanAll());
        });
        mo.observe(target, { childList: true, subtree: true });
        observerActive = true;
    }

    function init() {
        if (!window.PartnerCustomerApi) {
            console.warn('[Web2PartnerEnricher] PartnerCustomerApi chưa load — skip');
            return;
        }
        scanAll();
        startObserver();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

    // Expose for manual trigger / testing
    window.Web2PartnerEnricher = {
        scanAll,
        flush,
        cache,
    };
})();
