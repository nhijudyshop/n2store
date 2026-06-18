// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | WEB2.0 module.
// Sổ Order — floating suggest/picker panels (SP suggest + variant suggest, portal anchored). MOVE-only.

(function () {
    'use strict';

    const SO = (window.SoOrder = window.SoOrder || {});

    SO.showSuggest = function showSuggest(uid, query) {
        const list = SO._getFloatPanel('suggest');
        list.dataset.uid = uid;
        const cache = window.Web2ProductsCache;
        if (!cache) return;
        const q = (query || '').trim();
        // Chỉ gợi ý khi user đã gõ ≥ 1 ký tự — tránh popup mặc định khi focus.
        if (!q) {
            list.hidden = true;
            list.innerHTML = '';
            return;
        }
        const items = cache.findByName(q, 8);
        if (!items.length) {
            list.hidden = true;
            list.innerHTML = '';
            return;
        }
        list.innerHTML = items
            .map((p) => {
                const img = p.imageUrl
                    ? `<img src="${SO.escapeHtml(p.imageUrl)}" alt="" />`
                    : `<span class="so-suggest-img-placeholder"><i data-lucide="image"></i></span>`;
                const variantBadge = p.variant
                    ? `<span class="so-suggest-variant">${SO.escapeHtml(p.variant)}</span>`
                    : '';
                return `<button type="button" class="so-suggest-item" data-suggest-code="${SO.escapeHtml(p.code)}" data-suggest-uid="${uid}">
                    <div class="so-suggest-img">${img}</div>
                    <div class="so-suggest-text">
                        <div class="so-suggest-name">${SO.escapeHtml(p.name)}${variantBadge}</div>
                        <div class="so-suggest-sub">
                            <span class="so-suggest-code">${SO.escapeHtml(p.code)}</span>
                            <span class="so-suggest-stock">Tồn: ${p.stock ?? 0}</span>
                            <span class="so-suggest-price">${SO.fmtVnd(p.price || 0)}</span>
                        </div>
                    </div>
                </button>`;
            })
            .join('');
        // Portal panel ở <body> → neo fixed theo input, không bị modal-body clip.
        const inputEl = document.querySelector(
            `#soModalProductsBody input[data-field="productName"][data-uid="${uid}"]`
        );
        list._anchor = inputEl || null;
        SO._bindModalScrollCloseDropdowns();
        SO._anchorFloatPanel(list, inputEl);
        list.hidden = false;
        list.querySelectorAll('.so-suggest-item').forEach((btn) => {
            btn.addEventListener('mousedown', (e) => e.preventDefault()); // keep input focus
            btn.addEventListener('click', () => {
                const code = btn.dataset.suggestCode;
                SO.applySuggestionToRow(uid, code);
                SO.hideSuggest(uid);
            });
        });
        if (window.lucide?.createIcons) window.lucide.createIcons();
    };

    SO.hideSuggest = function hideSuggest(uid) {
        const list = SO._floatPanels.suggest;
        if (list && (!uid || list.dataset.uid === uid)) {
            list.hidden = true;
            list.innerHTML = '';
            list._anchor = null;
        }
    };

    // ──────────────────────────────────────────────────────────────────
    // REDO 2026-06-16: dropdown gợi ý SP + picker biến thể trong modal Tạo
    // Đơn Hàng render TRỰC TIẾP vào <body> (portal) + position:fixed neo theo
    // input rect. Dứt điểm bug "bị che / lệch": modal body (`.so-modal-body-v2`)
    // có ĐỒNG THỜI `overflow:auto` (clip absolute) VÀ `contain: layout style
    // paint` (phá toạ độ fixed) → mọi dropdown đặt TRONG modal body đều dính 1
    // trong 2. Là CON CỦA BODY → không ancestor nào contain/clip → luôn hiện
    // đủ. max-height cap theo chỗ trống thực → list tự scroll trong panel.
    // ──────────────────────────────────────────────────────────────────
    SO._floatPanels = { suggest: null, variant: null };
    SO._getFloatPanel = function _getFloatPanel(kind) {
        let el = SO._floatPanels[kind];
        if (el && el.isConnected) return el;
        el = document.createElement('div');
        el.className =
            (kind === 'variant' ? 'so-variant-dropdown' : 'so-suggest-dropdown') +
            ' so-float-dropdown';
        el.hidden = true;
        document.body.appendChild(el);
        SO._floatPanels[kind] = el;
        return el;
    };

    // Neo panel fixed ngay dưới input (flip lên trên nếu thiếu chỗ). Cap
    // max-height theo khoảng trống thực → list scroll nội bộ, không tràn/cắt.
    SO._anchorFloatPanel = function _anchorFloatPanel(panel, input) {
        if (!input || !input.isConnected) {
            panel.hidden = true;
            return;
        }
        const r = input.getBoundingClientRect();
        if (r.bottom < 0 || r.top > window.innerHeight) {
            panel.hidden = true; // input cuộn khỏi vùng nhìn
            return;
        }
        const GAP = 4;
        const spaceBelow = window.innerHeight - r.bottom - GAP - 8;
        const spaceAbove = r.top - GAP - 8;
        const flipUp = spaceBelow < 160 && spaceAbove > spaceBelow;
        panel.style.position = 'fixed';
        panel.style.left = Math.round(r.left) + 'px';
        panel.style.right = 'auto';
        panel.style.width = Math.round(r.width) + 'px';
        panel.style.minWidth = Math.round(r.width) + 'px';
        if (flipUp) {
            panel.style.top = 'auto';
            panel.style.bottom = Math.round(window.innerHeight - r.top + GAP) + 'px';
            panel.style.maxHeight = Math.max(120, Math.min(300, spaceAbove)) + 'px';
        } else {
            panel.style.bottom = 'auto';
            panel.style.top = Math.round(r.bottom + GAP) + 'px';
            panel.style.maxHeight = Math.max(120, Math.min(300, spaceBelow)) + 'px';
        }
    };

    // Reposition panel đang mở khi scroll (capture → bắt cả modal-body scroll) /
    // resize. Tên giữ `_bindModalScrollCloseDropdowns` cho caller cũ, nhưng giờ
    // là RE-ANCHOR (không đóng) → popup bám input mượt khi cuộn.
    SO._floatReflowBound = false;
    SO._bindModalScrollCloseDropdowns = function _bindModalScrollCloseDropdowns() {
        if (SO._floatReflowBound) return;
        SO._floatReflowBound = true;
        const reflow = () => {
            for (const kind of ['suggest', 'variant']) {
                const panel = SO._floatPanels[kind];
                if (panel && !panel.hidden && panel._anchor) {
                    SO._anchorFloatPanel(panel, panel._anchor);
                }
            }
        };
        window.addEventListener('scroll', reflow, true);
        window.addEventListener('resize', reflow);
    };

    // Ẩn sạch 2 panel (gọi khi đóng modal Tạo Đơn Hàng).
    SO._hideFloatPanels = function _hideFloatPanels() {
        for (const kind of ['suggest', 'variant']) {
            const p = SO._floatPanels[kind];
            if (p) {
                p.hidden = true;
                p.innerHTML = '';
                p._anchor = null;
            }
        }
    };

    SO.showVariantSuggest = function showVariantSuggest(uid, query) {
        const list = SO._getFloatPanel('variant');
        list.dataset.uid = uid;
        const cache = window.Web2VariantsCache;
        if (!cache) return;
        // Gợi ý theo token CUỐI sau "/" → đang build "Đen / d" thì search "d"
        // (accent-insensitive qua findByValue: "d"→Đen/Đỏ, "den"→Đen). Token rỗng
        // ("Đen / ") → findByValue('') trả TẤT CẢ biến thể để chọn tiếp.
        const lastTok = String(query || '')
            .split('/')
            .pop()
            .trim();
        const items = cache.findByValue(lastTok, 8);
        // Hint nhập nhanh nhiều biến thể — luôn hiện để user biết cú pháp "/".
        // Bấm → chèn " / " vào input giúp bắt đầu danh sách.
        const multiHint = `<button type="button" class="so-variant-multi-hint" data-uid="${uid}">
                <i data-lucide="layers"></i>
                <span>Nhiều biến thể? Gõ <b>Đen / S / M / L</b> → tạo nhiều SP (bấm để thêm “ / ”)</span>
            </button>`;
        let body;
        if (!items.length) {
            // so-order cho phép biến thể TỰ DO (không bắt buộc có trong Kho) →
            // nói rõ thay vì chỉ "chưa khớp".
            body = `<div class="so-variant-empty">
                ${lastTok ? `Dùng “<b>${SO.escapeHtml(lastTok)}</b>” làm biến thể tự do, hoặc ` : ''}<a href="../web2/variants/index.html" target="_blank">thêm vào Kho Biến Thể →</a>
            </div>`;
        } else {
            body = items
                .map((v) => {
                    const grp = v.groupName
                        ? `<span class="so-variant-group">${SO.escapeHtml(v.groupName)}</span>`
                        : '';
                    return `<button type="button" class="so-variant-item" data-uid="${uid}" data-val="${SO.escapeHtml(v.value)}">
                        <span class="so-variant-val">${SO.escapeHtml(v.value)}</span>
                        ${grp}
                    </button>`;
                })
                .join('');
        }
        list.innerHTML = multiHint + body;
        if (window.lucide?.createIcons) window.lucide.createIcons();
        // Portal panel ở <body> → neo fixed theo input, không bị modal-body clip.
        const inputEl = document.querySelector(
            `#soModalProductsBody input[data-field="variant"][data-uid="${uid}"]`
        );
        list._anchor = inputEl || null;
        SO._bindModalScrollCloseDropdowns();
        SO._anchorFloatPanel(list, inputEl);
        list.hidden = false;
        list.querySelectorAll('.so-variant-item').forEach((btn) => {
            btn.addEventListener('mousedown', (e) => e.preventDefault());
            btn.addEventListener('click', () => {
                const row = SO.modalRows.find((r) => r.uid === uid);
                if (!row) return;
                const input = document.querySelector(
                    `#soModalProductsBody input[data-field="variant"][data-uid="${uid}"]`
                );
                if (input) {
                    // Append vào token CUỐI → đang build "Đen / " + chọn "Đỏ" = "Đen / Đỏ".
                    const segs = (input.value || '').split('/');
                    segs[segs.length - 1] = btn.dataset.val;
                    input.value = segs.map((s) => s.trim()).join(' / ');
                    row.variant = input.value;
                    SO._updateVariantMultiPreview(uid, input.value);
                    input.focus();
                } else {
                    row.variant = btn.dataset.val;
                }
                list.hidden = true;
            });
        });
        // Hint nhập nhiều biến thể: bấm → chèn " / " để bắt đầu list, giữ focus.
        const hintBtn = list.querySelector('.so-variant-multi-hint');
        if (hintBtn) {
            hintBtn.addEventListener('mousedown', (e) => e.preventDefault());
            hintBtn.addEventListener('click', () => {
                if (!inputEl) return;
                const cur = inputEl.value.trim();
                inputEl.value = cur ? `${cur} / ` : '';
                inputEl.dispatchEvent(new Event('input', { bubbles: true }));
                inputEl.focus();
            });
        }
    };

    SO.hideVariantSuggest = function hideVariantSuggest(uid) {
        const list = SO._floatPanels.variant;
        if (list && (!uid || list.dataset.uid === uid)) {
            list.hidden = true;
            list.innerHTML = '';
            list._anchor = null;
        }
    };

    SO.applySuggestionToRow = function applySuggestionToRow(uid, code) {
        const p = window.Web2ProductsCache?.findByCode?.(code);
        if (!p) return;
        const row = SO.modalRows.find((r) => r.uid === uid);
        if (!row) return;
        row.productName = p.name || '';
        row.matchedCode = p.code;
        // Autofill variant từ Kho SP (field độc lập, không lấy từ note).
        // Chỉ ghi đè nếu user chưa nhập variant — tránh nuốt input đang gõ.
        if (p.variant && !row.variant) row.variant = p.variant;
        // Kho SP lưu giá VND (canonical, 1 nguồn). Tab có thể là ngoại tệ (vd CNY
        // rate 3500) → PHẢI quy đổi VND ÷ rate ra tiền tab khi đổ vào dòng đơn.
        // Tab VND (rate 1) giữ nguyên. (Trước đây gán thẳng VND → tab CNY hiển
        // thị gấp ~3500×, và Lưu Nháp lại ×rate → corrupt giá kho. Fix 2026-06-16.)
        const _tab = window.SoOrderStorage.getActiveTab(SO.state);
        if (Number(p.originalPrice)) row.costPrice = SO.fromVnd(p.originalPrice, _tab);
        if (Number(p.price)) row.sellPrice = SO.fromVnd(p.price, _tab);
        if (p.imageUrl && !row.productImage) row.productImage = p.imageUrl;
        SO.renderModalRows();
        // Re-focus name input after rerender
        setTimeout(() => {
            const inp = document.querySelector(
                `#soModalProductsBody input[data-field="productName"][data-uid="${uid}"]`
            );
            if (inp) inp.focus();
        }, 30);
    };
})();
