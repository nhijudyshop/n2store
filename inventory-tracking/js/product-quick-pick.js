// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | Read these files before coding, update dev-log after changes.
// =====================================================
// PRODUCT QUICK-PICK — INVENTORY TRACKING (Web 1.0)
// Cây bút ở ô STT → mở ô tìm nhanh sản phẩm từ kho (WarehouseAPI,
// GET /api/v2/web-warehouse/search — Web 1.0-safe) → chọn 1 SP →
// điền TÊN sản phẩm vào ô "Mã hàng" (product.maSP) + lưu qua shipmentsApi.
//
// Lưu ý layer: trang inventory-tracking là Web 1.0 → KHÔNG import web2/.
// Dùng window.WarehouseAPI (đã load sẵn trong index.html) — không phải
// Web2ProductsCache của so-order (Web 2.0).
// =====================================================

(function () {
    'use strict';

    const DEBOUNCE_MS = 220;
    const MIN_CHARS = 1;
    const MAX_RESULTS = 20;

    let _panel = null; // floating panel element (in <body>)
    let _ctx = null; // { invoiceId, productIdx }
    let _timer = null; // debounce timer for search
    let _activeIdx = -1; // keyboard-highlighted result index
    let _outsideHandler = null;
    let _scrollHandler = null;
    let _keyHandler = null;

    // ---- escape helpers ----
    function _escAttr(s) {
        return String(s == null ? '' : s)
            .replace(/&/g, '&amp;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;');
    }
    function _escHtml(s) {
        return String(s == null ? '' : s)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;');
    }
    function _fmtVnd(n) {
        const v = Math.round(parseFloat(n) || 0);
        return typeof formatNumber === 'function' ? formatNumber(v) : v.toLocaleString('vi-VN');
    }
    // name_get của TPOS hay có dạng "[CODE] tên thật" → bỏ tiền tố [...] khỏi tên.
    function _normName(r) {
        const raw = r.name_get || r.product_name || '';
        return raw.replace(/^\s*\[[^\]]*\]\s*/, '').trim() || raw;
    }

    // ---- open / close ----
    function openProductPicker(invoiceId, productIdx, btnEl) {
        close(); // chỉ 1 panel tại 1 thời điểm
        if (!window.WarehouseAPI || typeof window.WarehouseAPI.search !== 'function') {
            window.notificationManager?.error('Kho sản phẩm chưa sẵn sàng');
            return;
        }
        _ctx = { invoiceId: String(invoiceId), productIdx: parseInt(productIdx, 10) };

        _panel = document.createElement('div');
        _panel.className = 'iqp-panel';
        _panel.innerHTML =
            '<input type="text" class="iqp-input" placeholder="Tìm SP từ kho (mã / tên)…" autocomplete="off" spellcheck="false">' +
            '<div class="iqp-results"><div class="iqp-hint">Gõ để tìm sản phẩm trong kho…</div></div>';
        document.body.appendChild(_panel);

        // Anchor dưới ô "Mã hàng" của chính dòng đó (fallback: nút bút / dòng).
        const tr = btnEl && btnEl.closest ? btnEl.closest('tr') : null;
        const anchorEl = (tr && tr.querySelector('td.col-sku')) || btnEl || tr || document.body;
        _position(anchorEl);

        const input = _panel.querySelector('.iqp-input');
        const results = _panel.querySelector('.iqp-results');

        input.addEventListener('input', () => {
            _activeIdx = -1;
            clearTimeout(_timer);
            const q = input.value.trim();
            if (q.length < MIN_CHARS) {
                results.innerHTML = '<div class="iqp-hint">Gõ để tìm sản phẩm trong kho…</div>';
                return;
            }
            results.innerHTML = '<div class="iqp-loading">Đang tìm…</div>';
            _timer = setTimeout(() => _search(q, results), DEBOUNCE_MS);
        });
        input.addEventListener('keydown', _onInputKeydown);

        // Chọn 1 kết quả (event delegation)
        results.addEventListener('click', (e) => {
            const item = e.target.closest('.iqp-item');
            if (item) _pick(item.dataset.name || '');
        });

        // Click ra ngoài → đóng
        _outsideHandler = (e) => {
            if (_panel && !_panel.contains(e.target)) close();
        };
        // defer 1 tick để không bắt chính cú click mở panel
        setTimeout(() => document.addEventListener('mousedown', _outsideHandler, true), 0);

        // Panel fixed → scroll sẽ lệch vị trí ⇒ đóng khi scroll. {passive} theo anti-lag.
        _scrollHandler = () => close();
        window.addEventListener('scroll', _scrollHandler, { passive: true, capture: true });

        // Escape toàn cục (kể cả khi focus rời input)
        _keyHandler = (e) => {
            if (e.key === 'Escape') {
                e.preventDefault();
                close();
            }
        };
        document.addEventListener('keydown', _keyHandler, true);

        input.focus();
    }

    function _onInputKeydown(e) {
        const items = _panel ? Array.from(_panel.querySelectorAll('.iqp-item')) : [];
        if (e.key === 'Escape') {
            e.preventDefault();
            close();
        } else if (e.key === 'ArrowDown') {
            e.preventDefault();
            if (!items.length) return;
            _activeIdx = Math.min(_activeIdx + 1, items.length - 1);
            _highlight(items);
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            if (!items.length) return;
            _activeIdx = Math.max(_activeIdx - 1, 0);
            _highlight(items);
        } else if (e.key === 'Enter') {
            e.preventDefault();
            if (_activeIdx >= 0 && items[_activeIdx]) _pick(items[_activeIdx].dataset.name || '');
            else if (items.length === 1) _pick(items[0].dataset.name || '');
        }
    }

    function _highlight(items) {
        items.forEach((el, i) => el.classList.toggle('iqp-active', i === _activeIdx));
        if (_activeIdx >= 0 && items[_activeIdx]) {
            items[_activeIdx].scrollIntoView({ block: 'nearest' });
        }
    }

    async function _search(q, results) {
        let rows = [];
        try {
            rows = await window.WarehouseAPI.search(q, MAX_RESULTS);
        } catch (err) {
            console.warn('[INV-QUICK-PICK] search error:', err && err.message);
        }
        if (!_panel) return; // đã đóng giữa chừng
        if (!Array.isArray(rows) || rows.length === 0) {
            results.innerHTML = '<div class="iqp-empty">Không tìm thấy sản phẩm phù hợp</div>';
            return;
        }
        results.innerHTML = rows.map(_renderItem).join('');
    }

    function _renderItem(r) {
        const code = r.product_code || '';
        const name = _normName(r);
        const price = parseFloat(r.selling_price) || 0;
        const qty = parseFloat(r.tpos_qty_available) || 0;
        const img = window.WarehouseAPI.proxyImageUrl(r);
        const imgHtml = img
            ? `<img class="iqp-img" src="${_escAttr(img)}" alt="" loading="lazy">`
            : '<span class="iqp-img iqp-img--empty"></span>';
        return (
            `<button type="button" class="iqp-item" data-name="${_escAttr(name)}" data-code="${_escAttr(code)}">` +
            imgHtml +
            '<span class="iqp-info">' +
            `<span class="iqp-line1"><strong>${_escHtml(code)}</strong> — ${_escHtml(name)}</span>` +
            '<span class="iqp-line2">' +
            `<span class="iqp-price">${_fmtVnd(price)} đ</span>` +
            `<span class="iqp-qty${qty <= 0 ? ' iqp-qty--zero' : ''}">Tồn: ${_escHtml(qty)}</span>` +
            '</span></span></button>'
        );
    }

    // ---- pick → fill TÊN sản phẩm vào ô "Mã hàng" (maSP) + lưu ----
    async function _pick(name) {
        if (!_ctx) {
            close();
            return;
        }
        const chosen = (name || '').trim();
        const { invoiceId, productIdx } = _ctx;
        close(); // đóng UI ngay cho mượt

        if (!chosen) return;

        const dot = _findDot(invoiceId);
        if (!dot || !Array.isArray(dot.sanPham) || !dot.sanPham[productIdx]) {
            window.notificationManager?.error('Không tìm thấy sản phẩm để cập nhật');
            return;
        }

        const product = dot.sanPham[productIdx];
        const prev = product.maSP;
        if (chosen === prev) return; // không đổi

        // UI-first: cập nhật model + ô hiển thị ngay, rồi lưu nền, lỗi thì rollback.
        product.maSP = chosen;
        _updateSkuCell(invoiceId, productIdx, chosen);

        try {
            const api = typeof shipmentsApi !== 'undefined' ? shipmentsApi : window.shipmentsApi;
            await api.update(invoiceId, {
                sanPham: dot.sanPham,
                tongMon: dot.tongMon,
                tongTienHD: dot.tongTienHD,
            });
            if (typeof flattenNCCData === 'function') flattenNCCData();
            window.notificationManager?.success('Đã điền tên SP vào Mã hàng');
        } catch (err) {
            console.error('[INV-QUICK-PICK] save error:', err);
            product.maSP = prev; // rollback model
            _updateSkuCell(invoiceId, productIdx, prev || '');
            window.notificationManager?.error(
                'Không thể lưu: ' + ((err && err.message) || err)
            );
        }
    }

    function _findDot(invoiceId) {
        const gs = typeof globalState !== 'undefined' ? globalState : window.globalState;
        if (!gs || !Array.isArray(gs.nccList)) return null;
        for (const ncc of gs.nccList) {
            const dot = (ncc.dotHang || []).find((d) => String(d.id) === String(invoiceId));
            if (dot) return dot;
        }
        return null;
    }

    // Cập nhật text ô "Mã hàng" tại chỗ, GIỮ lại nút bút sửa / badge PO-draft.
    function _updateSkuCell(invoiceId, productIdx, value) {
        let td = null;
        try {
            const sel = `td.col-sku[data-invoice-id="${CSS.escape(String(invoiceId))}"][data-product-idx="${productIdx}"]`;
            td = document.querySelector(sel);
        } catch (_) {
            /* CSS.escape không hỗ trợ → fallback dưới */
        }
        if (!td) {
            td = Array.from(document.querySelectorAll('td.col-sku')).find(
                (c) =>
                    String(c.dataset.invoiceId) === String(invoiceId) &&
                    String(c.dataset.productIdx) === String(productIdx)
            );
        }
        if (!td) return;
        const deco = Array.from(
            td.querySelectorAll(':scope > .btn-edit-cell, :scope > .po-draft-badge')
        )
            .map((el) => el.outerHTML)
            .join('');
        td.innerHTML = (value === '' ? '-' : _escHtml(value)) + deco;
        if (window.lucide?.createIcons) window.lucide.createIcons();
    }

    // ---- positioning (fixed; tránh overflow:auto của bảng cắt) ----
    function _position(anchorEl) {
        if (!_panel || !anchorEl) return;
        const rect = anchorEl.getBoundingClientRect();
        const vw = window.innerWidth;
        const vh = window.innerHeight;
        const width = Math.min(Math.max(rect.width, 360), vw - 24);
        let left = rect.left;
        if (left + width > vw - 12) left = Math.max(12, vw - 12 - width);

        _panel.style.position = 'fixed';
        _panel.style.left = left + 'px';
        _panel.style.width = width + 'px';
        _panel.style.zIndex = '10050';

        const spaceBelow = vh - rect.bottom;
        const spaceAbove = rect.top;
        if (spaceBelow >= 240 || spaceBelow >= spaceAbove) {
            _panel.style.top = rect.bottom + 4 + 'px';
            _panel.style.bottom = '';
            _panel.style.maxHeight = Math.max(200, spaceBelow - 16) + 'px';
        } else {
            _panel.style.top = '';
            _panel.style.bottom = vh - rect.top + 4 + 'px';
            _panel.style.maxHeight = Math.max(200, spaceAbove - 16) + 'px';
        }
    }

    function close() {
        clearTimeout(_timer);
        if (_outsideHandler) {
            document.removeEventListener('mousedown', _outsideHandler, true);
            _outsideHandler = null;
        }
        if (_scrollHandler) {
            window.removeEventListener('scroll', _scrollHandler, { capture: true });
            _scrollHandler = null;
        }
        if (_keyHandler) {
            document.removeEventListener('keydown', _keyHandler, true);
            _keyHandler = null;
        }
        if (_panel && _panel.parentNode) _panel.parentNode.removeChild(_panel);
        _panel = null;
        _ctx = null;
        _activeIdx = -1;
    }

    // Expose for inline onclick handler trong STT cell.
    window.openProductPicker = openProductPicker;
    window.closeProductPicker = close;

    console.log('[INV-QUICK-PICK] Product quick-pick loaded');
})();
