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
        const raw = cache.findByName(q, 24);
        if (!raw.length) {
            list.hidden = true;
            list.innerHTML = '';
            return;
        }
        // Gom CHA–CON (module chung Web2ProductGroup): SP cùng cha/cùng tên nhiều biến
        // thể → 1 mục CHA (thêm TẤT CẢ con) ở TRÊN + các mục CON. SP đơn lẻ → mục thường.
        const PG = window.Web2ProductGroup;
        const groups =
            PG && PG.group
                ? PG.group(raw, { by: 'parent' })
                : raw.map((p) => ({
                      name: p.name,
                      variantCount: 1,
                      variants: [{ code: p.code, orig: p }],
                  }));
        // Ưu tiên nhóm nhiều biến thể (có mục CHA) LÊN ĐẦU, rồi SP đơn lẻ.
        const ordered = groups
            .filter((g) => g.variantCount >= 2)
            .concat(groups.filter((g) => g.variantCount < 2));

        const itemHtml = (p, isChild) => {
            const img = p.imageUrl
                ? `<img src="${SO.escapeHtml(p.imageUrl)}" alt="" />`
                : `<span class="so-suggest-img-placeholder"><i data-lucide="image"></i></span>`;
            const variantBadge = p.variant
                ? `<span class="so-suggest-variant">${SO.escapeHtml(p.variant)}</span>`
                : '';
            // HẾT HÀNG (logic mới 2026-06-28): SP đã bán hết, ẩn khỏi Kho SP + bảng
            // live nhưng VẪN gợi ý ở đây để nhập lại nhanh → badge nhắc "nhập lại".
            const hetHang =
                p.status === 'HET_HANG'
                    ? `<span class="so-suggest-hethang" style="background:#f3f4f6;color:#6b7280;border-radius:5px;padding:0 5px;font-size:11px;font-weight:600;">hết hàng · nhập lại</span>`
                    : '';
            return `<button type="button" class="so-suggest-item${isChild ? ' so-suggest-child' : ''}${p.status === 'HET_HANG' ? ' so-suggest-retired' : ''}" data-suggest-code="${SO.escapeHtml(p.code)}" data-suggest-uid="${uid}">
                    <div class="so-suggest-img">${img}</div>
                    <div class="so-suggest-text">
                        <div class="so-suggest-name">${isChild ? '<span class="so-suggest-child-arrow">↳</span>' : ''}${SO.escapeHtml(p.name)}${variantBadge}</div>
                        <div class="so-suggest-sub">
                            <span class="so-suggest-code">${SO.escapeHtml(p.code)}</span>
                            <span class="so-suggest-stock">Tồn: ${p.stock ?? 0}</span>
                            <span class="so-suggest-price">${SO.fmtVnd(p.price || 0)}</span>
                            ${hetHang}
                        </div>
                    </div>
                </button>`;
        };

        list.innerHTML = ordered
            .map((g) => {
                if (g.variantCount < 2)
                    return itemHtml((g.variants[0] && g.variants[0].orig) || {}, false);
                // Mục CHA: thêm TẤT CẢ biến thể con thành từng dòng.
                const codes = g.variants.map((v) => v.code).filter(Boolean);
                const pcode = PG && PG.parentCode ? PG.parentCode(g.variants) : '';
                const first = (g.variants[0] && g.variants[0].orig) || {};
                const pImg =
                    g.imageUrl || first.imageUrl
                        ? `<img src="${SO.escapeHtml(g.imageUrl || first.imageUrl)}" alt="" />`
                        : `<span class="so-suggest-img-placeholder"><i data-lucide="layers"></i></span>`;
                const parentItem = `<button type="button" class="so-suggest-item so-suggest-parent" data-suggest-parent="${SO.escapeHtml(codes.join(','))}" data-suggest-uid="${uid}">
                    <div class="so-suggest-img">${pImg}</div>
                    <div class="so-suggest-text">
                        <div class="so-suggest-name">${SO.escapeHtml(g.name)}<span class="so-suggest-parent-badge"><i data-lucide="git-branch"></i>cha · ${g.variantCount} biến thể</span></div>
                        <div class="so-suggest-sub">
                            <span class="so-suggest-parent-hint">+ Thêm tất cả ${g.variantCount} biến thể${pcode ? ' · ' + SO.escapeHtml(pcode) : ''}</span>
                        </div>
                    </div>
                </button>`;
                const childItems = g.variants.map((v) => itemHtml(v.orig || {}, true)).join('');
                return parentItem + childItems;
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
                if (btn.dataset.suggestParent) {
                    // CHA → thêm tất cả biến thể con thành từng dòng.
                    SO.applyParentSuggestionToRow(
                        uid,
                        btn.dataset.suggestParent.split(',').filter(Boolean)
                    );
                } else {
                    // CON / SP đơn lẻ → điền dòng hiện tại theo biến thể đã chọn.
                    SO.applySuggestionToRow(uid, btn.dataset.suggestCode);
                }
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

    // Đổ data 1 SP (từ Kho) vào 1 row modal. Quy đổi giá VND→tiền tab (rate).
    // `fillVariant`: chọn từ suggest = pick tường minh → ĐIỀN biến thể mới (ghi đè).
    SO._fillRowFromProduct = function _fillRowFromProduct(row, p, fillVariant) {
        if (!row || !p) return;
        const _tab = window.SoOrderStorage.getActiveTab(SO.state);
        row.productName = p.name || '';
        row.matchedCode = p.code;
        // Chọn SP con từ suggest → điền theo BIẾN THỂ MỚI (ghi đè biến thể cũ).
        if (fillVariant ? p.variant != null : p.variant && !row.variant)
            row.variant = p.variant || '';
        if (p.category) row.category = p.category;
        // Kho SP lưu giá VND (canonical). Tab ngoại tệ (CNY rate 3500) → quy đổi
        // VND ÷ rate ra tiền tab. Tab VND (rate 1) giữ nguyên.
        if (Number(p.originalPrice)) row.costPrice = SO.fromVnd(p.originalPrice, _tab);
        if (Number(p.price)) row.sellPrice = SO.fromVnd(p.price, _tab);
        if (p.imageUrl && !row.productImage) row.productImage = p.imageUrl;
    };

    SO.applySuggestionToRow = function applySuggestionToRow(uid, code) {
        const p = window.Web2ProductsCache?.findByCode?.(code);
        if (!p) return;
        const row = SO.modalRows.find((r) => r.uid === uid);
        if (!row) return;
        SO._fillRowFromProduct(row, p, true); // pick tường minh → điền biến thể mới
        SO.renderModalRows();
        // Re-focus name input after rerender
        setTimeout(() => {
            const inp = document.querySelector(
                `#soModalProductsBody input[data-field="productName"][data-uid="${uid}"]`
            );
            if (inp) inp.focus();
        }, 30);
    };

    // Chọn SP CHA từ suggest → THÊM TẤT CẢ biến thể con thành TỪNG DÒNG: dòng hiện
    // tại = con đầu, các con còn lại chèn ngay dưới (kế thừa NCC + ảnh HĐ của đơn).
    // Gắn chung productGroupId → Kho gom 1 cha + N con khi Lưu Nháp + bảng gom khối.
    SO.applyParentSuggestionToRow = function applyParentSuggestionToRow(uid, codes) {
        if (!Array.isArray(codes) || !codes.length) return;
        const cache = window.Web2ProductsCache;
        const idx = SO.modalRows.findIndex((r) => r.uid === uid);
        if (idx === -1) return;
        const cur = SO.modalRows[idx];
        const prods = codes.map((c) => cache?.findByCode?.(c)).filter(Boolean);
        if (!prods.length) return;
        const groupId =
            cur.productGroupId ||
            'pg-' + SO.modalRowCounter + '-' + Math.random().toString(36).slice(2, 7);
        // Dòng hiện tại = con đầu.
        SO._fillRowFromProduct(cur, prods[0], true);
        cur.productGroupId = groupId;
        // Các con còn lại = dòng mới chèn ngay dưới, kế thừa NCC + đơn + ảnh HĐ.
        const newRows = prods.slice(1).map((p) => {
            const row = SO._newModalRow({
                supplier: cur.supplier,
                invoiceGroupId: cur.invoiceGroupId,
                invoiceImage: cur.invoiceImage,
                productGroupId: groupId,
            });
            SO._fillRowFromProduct(row, p, true);
            return row;
        });
        SO.modalRows.splice(idx + 1, 0, ...newRows);
        SO.renderModalRows();
        if (window.notificationManager?.show)
            window.notificationManager.show(
                `Đã thêm ${prods.length} biến thể của "${cur.productName}"`,
                'success'
            );
    };
})();
