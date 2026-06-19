// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | WEB2.0 module.
// Native Orders — product picker cache/search/add-line + variant map. MOVE-only.

(function () {
    'use strict';
    const NO = (window.NativeOrders = window.NativeOrders || {});

    // ---------- Product picker helpers ----------
    // All active products cached once per modal open — search is client-side
    // so Vietnamese diacritics don't matter ("ao nau" matches "ÁO NÂU M").
    NO.EDIT_PRODUCTS_CACHE = null;

    // Map mã SP → biến thể (size/màu) để in PBH cho đơn CŨ (chưa lưu variant trên
    // order line). Populate lazily 1 lần từ kho SP. Đơn mới đã carry variant sẵn.
    NO.PRODUCT_VARIANT_MAP = null;

    NO.ensureVariantMap = async function ensureVariantMap() {
        if (NO.PRODUCT_VARIANT_MAP) return NO.PRODUCT_VARIANT_MAP;
        const map = {};
        try {
            const list =
                NO.EDIT_PRODUCTS_CACHE && NO.EDIT_PRODUCTS_CACHE.length
                    ? NO.EDIT_PRODUCTS_CACHE
                    : (await window.NativeOrdersApi.searchProducts({ search: '', limit: 1000 }))
                          .products || [];
            for (const p of list) {
                if (p && p.code && p.variant) map[p.code] = p.variant;
            }
        } catch (e) {
            console.warn('[native-orders] ensureVariantMap failed:', e.message);
        }
        NO.PRODUCT_VARIANT_MAP = map;
        return map;
    };

    NO._pickerOutsideClick = function _pickerOutsideClick(e) {
        const picker = NO.$('#productPickerResults');
        if (!picker) return;
        if (!e.target.closest('.product-picker') && !e.target.closest('#productPickerResults')) {
            picker.style.display = 'none';
        }
    };

    // Strip Vietnamese diacritics + đ/Đ → lowercased plain ASCII
    NO.stripVi = function stripVi(s) {
        return (s || '')
            .normalize('NFD')
            .replace(/[̀-ͯ]/g, '')
            .replace(/đ/g, 'd')
            .replace(/Đ/g, 'D')
            .toLowerCase()
            .trim();
    };

    NO.loadEditProductsCache = async function loadEditProductsCache() {
        try {
            const resp = await window.NativeOrdersApi.searchProducts({ search: '', limit: 1000 });
            NO.EDIT_PRODUCTS_CACHE = resp.products || [];
        } catch (e) {
            console.warn('[picker] loadEditProductsCache failed:', e.message);
            NO.EDIT_PRODUCTS_CACHE = [];
        }
    };

    NO._renderPickItem = function _renderPickItem(p) {
        const existing = NO.EDIT_LINES.find((l) => l.productCode === p.code);
        const qtyBadge = existing
            ? `<span class="pick-qty-badge"><i data-lucide="shopping-cart"></i>SL: ${existing.quantity}</span>`
            : '';
        const img = p.imageUrl
            ? `<img src="${NO.escapeHtml(p.imageUrl)}" class="pick-img" onerror="this.style.display='none';this.nextElementSibling.style.setProperty('display','inline-flex');">
               <span class="pick-img-ph" style="display:none;"><i data-lucide="image"></i></span>`
            : `<span class="pick-img-ph"><i data-lucide="image"></i></span>`;
        return `
            <div class="pick-item ${existing ? 'in-order' : ''}" data-code="${NO.escapeHtml(p.code)}" onclick="NativeOrdersApp.addLineFromPicker('${NO.escapeHtml(p.code)}')" title="Bấm để thêm vào đơn">
                ${qtyBadge}
                ${img}
                <div class="pick-info">
                    <div class="pick-name">${NO.escapeHtml(p.name)}</div>
                    <div class="pick-code">Mã: ${NO.escapeHtml(p.code)}</div>
                </div>
                <div class="pick-price">${(p.price || 0).toLocaleString('vi-VN')}đ</div>
                <button class="pick-add-btn" onclick="event.stopPropagation();NativeOrdersApp.addLineFromPicker('${NO.escapeHtml(p.code)}')"><i data-lucide="plus"></i></button>
            </div>`;
    };

    NO.searchPickerProducts = function searchPickerProducts(q) {
        const box = NO.$('#productPickerResults');
        if (!box) return;

        // Cache still loading
        if (NO.EDIT_PRODUCTS_CACHE === null) {
            box.innerHTML = `<div class="picker-loading"><div class="spinner"></div>Đang tải kho SP...</div>`;
            box.style.display = 'block';
            return;
        }
        if (!NO.EDIT_PRODUCTS_CACHE.length) {
            box.innerHTML = `<div class="picker-empty">Kho SP trống — <a href="../web2/products/index.html" target="_blank">mở kho tạo SP</a></div>`;
            box.style.display = 'block';
            return;
        }

        const qn = NO.stripVi(q);
        const filtered = qn
            ? NO.EDIT_PRODUCTS_CACHE.filter(
                  (p) => NO.stripVi(p.code).includes(qn) || NO.stripVi(p.name).includes(qn)
              )
            : NO.EDIT_PRODUCTS_CACHE;
        const items = filtered.slice(0, 20);

        if (!items.length) {
            box.innerHTML = `<div class="picker-empty">Không tìm thấy SP khớp "${NO.escapeHtml(q)}". <a href="../web2/products/index.html" target="_blank">Mở kho →</a></div>`;
            box.style.display = 'block';
            return;
        }
        box.innerHTML = items.map(NO._renderPickItem).join('');
        box.style.display = 'block';
        if (window.lucide) lucide.createIcons();
    };

    NO.addLineFromPicker = function addLineFromPicker(code) {
        const box = NO.$('#productPickerResults');
        const item = box?.querySelector(`.pick-item[data-code="${CSS.escape(code)}"]`);
        if (!item) return;
        // Reconstruct minimal product from DOM
        const name = item.querySelector('.pick-name')?.textContent.trim();
        const priceText = item.querySelector('.pick-price')?.textContent || '0';
        const price = Number(priceText.replace(/[^\d]/g, '')) || 0;
        const imgEl = item.querySelector('.pick-img');
        const imageUrl = imgEl?.getAttribute('src') || null;
        // Biến thể (size/màu) không có trong DOM picker → lookup từ cache kho SP.
        const cachedProd = (NO.EDIT_PRODUCTS_CACHE || []).find((x) => x.code === code) || {};
        const variant = cachedProd.variant || '';

        const existing = NO.EDIT_LINES.find((l) => l.productCode === code);
        if (existing) {
            existing.quantity = (Number(existing.quantity) || 0) + 1;
            existing.total = existing.quantity * existing.price;
        } else {
            // KPI Sprint 0: capture WHO added cho audit + ledger event emit.
            // userInfo từ Web2UserInfo (server-validated Web2Auth token).
            const userInfo = window.Web2UserInfo?.get('native-orders') || {};
            NO.EDIT_LINES.push({
                productCode: code,
                name,
                variant,
                price,
                quantity: 1,
                imageUrl,
                note: '',
                total: price,
                addedAt: Date.now(),
                // Nguồn: 'native' = SP add trực tiếp từ picker trong modal sửa đơn.
                source: 'native',
                addedBy: userInfo.userName || null,
                addedById: userInfo.userId || null,
                // Idempotency UUID — server emit KPI event với key unique theo cái này
                clientEventId: 'evt_' + Date.now() + '_' + Math.random().toString(36).slice(2, 10),
            });
        }
        NO.renderOrderLines();

        // Update badge on the picked item
        const badge = item.querySelector('.pick-qty-badge');
        const newQty = NO.EDIT_LINES.find((l) => l.productCode === code).quantity;
        if (badge) {
            badge.innerHTML = `<i data-lucide="shopping-cart"></i>SL: ${newQty}`;
        } else {
            item.classList.add('in-order');
            item.insertAdjacentHTML(
                'afterbegin',
                `<span class="pick-qty-badge"><i data-lucide="shopping-cart"></i>SL: ${newQty}</span>`
            );
        }
        if (window.lucide) lucide.createIcons();
    };
})();
