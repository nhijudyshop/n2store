// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | Read these files before coding, update dev-log after changes.
// =====================================================
// PRODUCT QUICK-PICK — INVENTORY TRACKING (Web 1.0)
// Cây bút ở ô STT → mở POPUP tìm SP từ kho (WarehouseAPI,
// GET /api/v2/web-warehouse/search — Web 1.0-safe). Chọn NHIỀU SP bằng
// checkbox → "Xác nhận" → chèn các SP đã chọn thành dòng mới NẰM DƯỚI
// dòng được bấm (window.insertProductRowsBelow → crud-operations.js).
//
// Popup canh giữa màn hình (overlay) cho dễ thao tác trên iPad — không còn
// dropdown nhỏ bám theo ô dễ lệch vị trí.
//
// Lưu ý layer: trang inventory-tracking là Web 1.0 → KHÔNG import web2/.
// Dùng window.WarehouseAPI (đã load sẵn trong index.html).
// =====================================================

(function () {
    'use strict';

    const DEBOUNCE_MS = 220;
    const MIN_CHARS = 1;
    const MAX_RESULTS = 20;

    let _overlay = null; // overlay element (in <body>)
    let _panel = null; // dialog card inside overlay
    let _ctx = null; // { invoiceId, productIdx }
    let _timer = null; // debounce timer for search
    let _activeIdx = -1; // keyboard-highlighted result index
    let _selected = new Map(); // key -> { key, name } (persists across searches)
    let _outsideHandler = null;
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
    // Khóa duy nhất cho 1 kết quả (ưu tiên mã SP, fallback tên).
    function _key(r) {
        return r.product_code || _normName(r) || '';
    }

    // ---- open / close ----
    function openProductPicker(invoiceId, productIdx, _btnEl) {
        close(); // chỉ 1 popup tại 1 thời điểm
        if (!window.WarehouseAPI || typeof window.WarehouseAPI.search !== 'function') {
            window.notificationManager?.error('Kho sản phẩm chưa sẵn sàng');
            return;
        }
        _ctx = { invoiceId: String(invoiceId), productIdx: parseInt(productIdx, 10) };
        _selected = new Map();
        _activeIdx = -1;

        _overlay = document.createElement('div');
        _overlay.className = 'iqp-overlay';
        _overlay.innerHTML =
            '<div class="iqp-panel" role="dialog" aria-modal="true">' +
            '<div class="iqp-header"><span class="iqp-title">Thêm SP từ kho → chèn dưới dòng này</span>' +
            '<button type="button" class="iqp-x" aria-label="Đóng">✕</button></div>' +
            '<input type="text" class="iqp-input" placeholder="Tìm SP từ kho (mã / tên)…" autocomplete="off" spellcheck="false">' +
            '<div class="iqp-results"><div class="iqp-hint">Gõ để tìm sản phẩm trong kho…</div></div>' +
            '<div class="iqp-footer">' +
            '<button type="button" class="iqp-cancel">Hủy</button>' +
            '<button type="button" class="iqp-confirm" disabled>Xác nhận (0)</button>' +
            '</div></div>';
        document.body.appendChild(_overlay);
        _panel = _overlay.querySelector('.iqp-panel');

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

        // Toggle checkbox (event delegation) — click bất kỳ đâu trên item.
        results.addEventListener('change', (e) => {
            const cb = e.target.closest('.iqp-check');
            if (!cb) return;
            const item = cb.closest('.iqp-item');
            if (!item) return;
            _toggleSelect(item.dataset.key || '', item.dataset.name || '', cb.checked);
            item.classList.toggle('iqp-item--checked', cb.checked);
        });

        _panel.querySelector('.iqp-x').onclick = () => close();
        _panel.querySelector('.iqp-cancel').onclick = () => close();
        _panel.querySelector('.iqp-confirm').onclick = () => _confirm();

        // Click ra ngoài card → đóng
        _outsideHandler = (e) => {
            if (_overlay && e.target === _overlay) close();
        };
        setTimeout(() => _overlay.addEventListener('mousedown', _outsideHandler), 0);

        // Escape toàn cục
        _keyHandler = (e) => {
            if (e.key === 'Escape') {
                e.preventDefault();
                close();
            }
        };
        document.addEventListener('keydown', _keyHandler, true);

        input.focus();
    }

    function _toggleSelect(key, name, checked) {
        if (!key) return;
        if (checked) _selected.set(key, { key, name });
        else _selected.delete(key);
        _updateConfirmBtn();
    }

    function _updateConfirmBtn() {
        if (!_panel) return;
        const btn = _panel.querySelector('.iqp-confirm');
        if (!btn) return;
        const n = _selected.size;
        btn.textContent = `Xác nhận (${n})`;
        btn.disabled = n === 0;
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
            // Enter trên item đang highlight → tick/bỏ tick (không đóng popup).
            const target =
                _activeIdx >= 0 ? items[_activeIdx] : items.length === 1 ? items[0] : null;
            const cb = target && target.querySelector('.iqp-check');
            if (cb) {
                cb.checked = !cb.checked;
                _toggleSelect(target.dataset.key || '', target.dataset.name || '', cb.checked);
                target.classList.toggle('iqp-item--checked', cb.checked);
            }
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
        const key = _key(r);
        const checked = _selected.has(key);
        const price = parseFloat(r.selling_price) || 0;
        const qty = parseFloat(r.tpos_qty_available) || 0;
        const img = window.WarehouseAPI.proxyImageUrl(r);
        const imgHtml = img
            ? `<img class="iqp-img" src="${_escAttr(img)}" alt="" loading="lazy">`
            : '<span class="iqp-img iqp-img--empty"></span>';
        return (
            `<label class="iqp-item${checked ? ' iqp-item--checked' : ''}" data-key="${_escAttr(key)}" data-name="${_escAttr(name)}" data-code="${_escAttr(code)}">` +
            `<input type="checkbox" class="iqp-check"${checked ? ' checked' : ''}>` +
            imgHtml +
            '<span class="iqp-info">' +
            `<span class="iqp-line1"><strong>${_escHtml(code)}</strong> — ${_escHtml(name)}</span>` +
            '<span class="iqp-line2">' +
            `<span class="iqp-price">${_fmtVnd(price)} đ</span>` +
            `<span class="iqp-qty${qty <= 0 ? ' iqp-qty--zero' : ''}">Tồn: ${_escHtml(qty)}</span>` +
            '</span></span></label>'
        );
    }

    // ---- confirm → chèn các SP đã chọn thành dòng mới dưới dòng hiện tại ----
    async function _confirm() {
        if (!_ctx) {
            close();
            return;
        }
        const names = [..._selected.values()].map((s) => (s.name || '').trim()).filter(Boolean);
        const { invoiceId, productIdx } = _ctx;
        close(); // đóng UI ngay cho mượt
        if (!names.length) return;

        if (typeof window.insertProductRowsBelow === 'function') {
            await window.insertProductRowsBelow(invoiceId, productIdx, names);
        } else {
            window.notificationManager?.error('Không thể thêm sản phẩm (thiếu hàm chèn dòng)');
        }
    }

    function close() {
        clearTimeout(_timer);
        if (_outsideHandler && _overlay) {
            _overlay.removeEventListener('mousedown', _outsideHandler);
        }
        _outsideHandler = null;
        if (_keyHandler) {
            document.removeEventListener('keydown', _keyHandler, true);
            _keyHandler = null;
        }
        if (_overlay && _overlay.parentNode) _overlay.parentNode.removeChild(_overlay);
        _overlay = null;
        _panel = null;
        _ctx = null;
        _selected = new Map();
        _activeIdx = -1;
    }

    // Expose for inline onclick handler trong STT cell.
    window.openProductPicker = openProductPicker;
    window.closeProductPicker = close;

    console.log('[INV-QUICK-PICK] Product quick-pick (multi-select) loaded');
})();
