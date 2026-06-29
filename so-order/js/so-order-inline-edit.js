// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | WEB2.0 module.
// Sổ Order — dblclick inline cell edit + supplier/variant pickers on demand. MOVE-only.

(function () {
    'use strict';

    const SO = (window.SoOrder = window.SoOrder || {});

    SO.onCellDoubleClick = function onCellDoubleClick(e) {
        // Bỏ qua dblclick lên image (đã có click-mở-lightbox riêng cho preview;
        // image cells trống và non-empty đều cần mở image modal — handle qua TD).
        const td = e.target.closest('td[data-cell-field]');
        if (!td) return;
        const field = td.dataset.cellField;
        const rowId = td.dataset.rowId;
        const shipmentId = td.dataset.shipmentId;
        if (!field || !rowId || !shipmentId) return;
        if (SO._isRowLocked(rowId, shipmentId)) {
            SO.notify('Dòng "Đã nhận" — không chỉnh sửa được', 'warning');
            return;
        }
        if (SO.INLINE_IMAGE_FIELDS.has(field)) {
            // Don't trigger lightbox — preventDefault on image bubbling
            e.preventDefault();
            e.stopPropagation();
            SO.openInlineImageModal(rowId, shipmentId, field);
            return;
        }
        if (!SO.INLINE_EDIT_FIELDS.has(field)) return;
        // Guard: nếu cell đang trong inline edit mode → kệ
        const key = `${rowId}|${field}`;
        if (SO.inlineCellEditingKey === key) return;
        SO.inlineCellEditingKey = key;
        SO.beginInlineCellEdit(td, rowId, shipmentId, field);
    };

    SO.beginInlineCellEdit = function beginInlineCellEdit(td, rowId, shipmentId, field) {
        const tab = window.SoOrderStorage.getActiveTab(SO.state);
        const sh = tab.shipments.find((s) => s.id === shipmentId);
        const r = sh?.rows.find((x) => x.id === rowId);
        if (!r) return;
        const origHtml = td.innerHTML;
        const restore = () => {
            td.innerHTML = origHtml;
            SO.inlineCellEditingKey = null;
            if (window.lucide?.createIcons) window.lucide.createIcons();
        };
        // Biến thể → dùng Web2VariantPicker (chọn loại + nhập biến thể theo món,
        // ghép " + " cho BỘ). Popover fixed neo theo cell. Fallback: input cũ.
        if (field === 'variant' && window.Web2VariantPicker) {
            SO._beginVariantPickerEdit(td, rowId, shipmentId, r, tab, restore);
            return;
        }
        const commit = (rawValue) => {
            let value = rawValue;
            if (field === 'qty' || field === 'sellPrice' || field === 'costPrice') {
                // Giá có thể đã format (1.000) → parse số thật; qty không format.
                value =
                    (field !== 'qty' && window.Web2NumberInput
                        ? Web2NumberInput.parse(value)
                        : Number(value)) || 0;
                if (field === 'sellPrice' || field === 'costPrice') {
                    value = SO._maybeExpandVndShorthand(value, tab);
                }
            } else if (typeof value === 'string') {
                value = value.trim();
            }
            // Variant không bắt buộc tồn tại trong Kho Biến Thể (so-order là
            // draft đơn, có thể gõ size mới chưa khai báo).
            // Capture delta TRƯỚC khi update (cho qty change → sync Kho).
            let pendingAdj = null;
            if (field === 'qty') {
                const oldQty = Number(r.qty) || 0;
                const delta = (Number(value) || 0) - oldQty;
                if (delta !== 0) {
                    pendingAdj = { ...SO._rowToKhoMatch(r), delta };
                }
            }
            window.SoOrderStorage.updateRow(SO.state, tab.id, shipmentId, rowId, {
                [field]: value,
            });
            if (pendingAdj && pendingAdj.name) SO.adjustKhoPending([pendingAdj]);
            if (field === 'supplier' && value) SO._ensureSupplierAsync(value);
            SO.pushSync();
            SO.inlineCellEditingKey = null;
            SO.renderAll();
            SO.flashRow(rowId);
        };

        let inputHtml;
        if (field === 'qty') {
            inputHtml = `<input class="so-edit-input so-edit-num" type="number" min="0" step="1" value="${Number(r.qty) || 0}" autofocus />`;
        } else if (field === 'sellPrice' || field === 'costPrice') {
            inputHtml = `<input class="so-edit-input so-edit-num" type="text" inputmode="decimal" data-w2num="decimal" value="${Number(r[field]) || 0}" autofocus />`;
        } else if (field === 'status') {
            const opts = Object.entries(SO.STATUS_LABELS)
                .map(
                    ([val, lbl]) =>
                        `<option value="${val}" ${val === (r.status || 'draft') ? 'selected' : ''}>${SO.escapeHtml(lbl)}</option>`
                )
                .join('');
            inputHtml = `<select class="so-edit-select" autofocus>${opts}</select>`;
        } else if (field === 'variant') {
            inputHtml = `<div class="so-edit-variant-wrap">
                <input class="so-edit-input" type="text" value="${SO.escapeHtml(r.variant || '')}" placeholder="Pick từ kho…" autocomplete="off" autofocus />
                <div class="so-edit-variant-dropdown" hidden></div>
            </div>`;
        } else if (field === 'supplier') {
            inputHtml = `<div class="so-supplier-pick-wrap">
                <input class="so-edit-input" type="text" value="${SO.escapeHtml(r.supplier || '')}" placeholder="Pick từ Ví NCC…" autocomplete="off" autofocus />
                <div class="so-supplier-dropdown" hidden></div>
            </div>`;
        } else {
            inputHtml = `<input class="so-edit-input" type="text" value="${SO.escapeHtml(r[field] || '')}" autofocus />`;
        }
        td.innerHTML = inputHtml;
        // Ô giá inline → format 1.000 ngay khi gõ (chỉ áp cho input có data-w2num).
        if (window.Web2NumberInput) Web2NumberInput.attachAll(td);
        const el = td.querySelector('input, select');
        if (!el) {
            restore();
            return;
        }
        el.focus();
        if (typeof el.select === 'function' && el.tagName === 'INPUT') el.select();

        let committed = false;
        const finish = () => {
            if (committed) return;
            committed = true;
            commit(el.value);
        };
        el.addEventListener('change', finish);
        el.addEventListener('blur', (e) => {
            // Blur sang item trong dropdown picker (cùng td) → KHÔNG commit text
            // gõ dở; click của item sẽ set giá trị picker rồi finish(). Tránh race
            // setTimeout đua mousedown khi click chậm. relatedTarget = phần tử nhận
            // focus (null khi click mở scrollbar/desktop → vẫn commit như cũ).
            if (e.relatedTarget && td.contains(e.relatedTarget)) return;
            setTimeout(() => {
                // Fallback an toàn: relatedTarget không tin được trên vài browser →
                // nếu focus đã nhảy vào dropdown trong td thì vẫn skip.
                if (document.activeElement && td.contains(document.activeElement)) return;
                if (!committed) finish();
            }, 150);
        });
        el.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                finish();
            } else if (e.key === 'Escape') {
                e.preventDefault();
                committed = true; // skip blur commit
                restore();
            }
        });

        if (field === 'variant') {
            const dropdown = td.querySelector('.so-edit-variant-dropdown');
            const refresh = () => {
                const cache = window.Web2VariantsCache;
                if (!cache) {
                    dropdown.hidden = true;
                    return;
                }
                const items = cache.findByValue((el.value || '').trim(), 10);
                if (!items.length) {
                    dropdown.innerHTML = `<div class="so-variant-empty">
                        Kho rỗng. <a href="../web2/variants/index.html" target="_blank">Thêm →</a>
                    </div>`;
                    dropdown.hidden = false;
                    return;
                }
                dropdown.innerHTML = items
                    .map((v) => {
                        const grp = v.groupName
                            ? `<span class="so-variant-group">${SO.escapeHtml(v.groupName)}</span>`
                            : '';
                        return `<button type="button" class="so-variant-item" data-val="${SO.escapeHtml(v.value)}">
                            <span class="so-variant-val">${SO.escapeHtml(v.value)}</span>${grp}
                        </button>`;
                    })
                    .join('');
                dropdown.hidden = false;
                dropdown.querySelectorAll('.so-variant-item').forEach((btn) => {
                    btn.addEventListener('mousedown', (e) => e.preventDefault());
                    btn.addEventListener('click', () => {
                        el.value = btn.dataset.val;
                        finish();
                    });
                });
            };
            el.addEventListener('focus', refresh);
            el.addEventListener('input', refresh);
            refresh();
        }

        if (field === 'supplier') {
            SO._ensureSupplierCacheSubscription();
            SO.attachSupplierPickerOnDemand(el, {
                onPick: (val) => {
                    el.value = val;
                    finish();
                    SO._ensureSupplierAsync(val);
                },
            });
        }
    };

    // Inline edit ô Biến Thể bằng Web2VariantPicker (popover fixed neo theo cell).
    // Chọn loại (Áo/Quần…) + nhập biến thể từng món → lưu { variant, category }.
    // KHÔNG auto-expand cartesian ở đây (tránh nhân đôi SL của dòng đang sửa) —
    // expand nhiều dòng là tính năng lúc TẠO (modal/Kho SP), không phải lúc sửa.
    SO._beginVariantPickerEdit = function _beginVariantPickerEdit(
        td,
        rowId,
        shipmentId,
        r,
        tab,
        restore
    ) {
        const rect = td.getBoundingClientRect();
        const W = 340;
        const pop = document.createElement('div');
        pop.className = 'so-vp-popover';
        const left = Math.max(8, Math.min(rect.left, window.innerWidth - W - 8));
        const top = Math.min(rect.bottom + 4, window.innerHeight - 80);
        pop.style.cssText = `position:fixed;z-index:99999;left:${left}px;top:${top}px;width:${W}px;max-width:calc(100vw - 16px);background:#fff;border:1px solid #e2e8f0;border-radius:12px;box-shadow:0 16px 40px rgba(15,23,42,.22);padding:12px;`;
        document.body.appendChild(pop);
        td.classList.add('so-vp-editing');

        const ctl = window.Web2VariantPicker.mount(pop, {
            compact: true,
            category: r.category || '',
            value: r.variant || '',
        });
        setTimeout(() => ctl.focus(), 40);

        let done = false;
        const cleanup = () => {
            document.removeEventListener('mousedown', onDocDown, true);
            document.removeEventListener('keydown', onKey, true);
            try {
                ctl.destroy();
            } catch (e) {}
            pop.remove();
            td.classList.remove('so-vp-editing');
        };
        const cancel = () => {
            if (done) return;
            done = true;
            cleanup();
            restore();
        };
        const commit = () => {
            if (done) return;
            done = true;
            const variant = ctl.getVariant();
            const category = ctl.getCategory();
            cleanup();
            if (variant === (r.variant || '') && category === (r.category || '')) {
                restore();
                return;
            }
            window.SoOrderStorage.updateRow(SO.state, tab.id, shipmentId, rowId, {
                variant,
                category,
            });
            SO.pushSync();
            SO.inlineCellEditingKey = null;
            SO.renderAll();
            SO.flashRow(rowId);
        };
        const onDocDown = (e) => {
            if (pop.contains(e.target) || td.contains(e.target)) return;
            commit();
        };
        const onKey = (e) => {
            if (e.key === 'Escape') {
                e.preventDefault();
                cancel();
            } else if (e.key === 'Enter' && !e.isComposing) {
                const t = e.target;
                if (t && t.classList && t.classList.contains('w2vp-input')) {
                    e.preventDefault();
                    commit();
                }
            }
        };
        // Defer để cú dblclick mở KHÔNG bị bắt là "click ngoài" → đóng ngay.
        setTimeout(() => {
            document.addEventListener('mousedown', onDocDown, true);
            document.addEventListener('keydown', onKey, true);
        }, 0);
    };

    // Commit 1 field từ bulk edit mode. Re-use validation (variant) +
    // pushSync + flashRow giống dblclick path để hành vi nhất quán.
    // Quick-input shorthand: gõ "100" cho VND tự hiểu là 100.000.
    // Chỉ áp dụng khi tiền tệ tab là VND và giá > 0 và giá < 1000.
    SO._maybeExpandVndShorthand = function _maybeExpandVndShorthand(value, tab) {
        const v = Number(value) || 0;
        if (!tab || tab.currency !== 'VND') return v;
        if (v > 0 && v < 1000) return v * 1000;
        return v;
    };

    // Variant picker dropdown — chỉ kích hoạt khi user thực sự focus vào input
    // variant trong bulk edit mode. Tránh build dropdown cho tất cả rows upfront.
    SO.attachVariantPickerOnDemand = function attachVariantPickerOnDemand(input) {
        if (input.__variantPickerBound) return;
        input.__variantPickerBound = true;
        const wrap = input.closest('.so-edit-variant-wrap');
        const dropdown = wrap?.querySelector('.so-edit-variant-dropdown');
        if (!dropdown) return;
        const refresh = () => {
            const cache = window.Web2VariantsCache;
            if (!cache) {
                dropdown.hidden = true;
                return;
            }
            const items = cache.findByValue((input.value || '').trim(), 10);
            if (!items.length) {
                dropdown.innerHTML = `<div class="so-variant-empty">
                    Kho rỗng. <a href="../web2/variants/index.html" target="_blank">Thêm →</a>
                </div>`;
                dropdown.hidden = false;
                return;
            }
            dropdown.innerHTML = items
                .map((v) => {
                    const grp = v.groupName
                        ? `<span class="so-variant-group">${SO.escapeHtml(v.groupName)}</span>`
                        : '';
                    return `<button type="button" class="so-variant-item" data-val="${SO.escapeHtml(v.value)}">
                        <span class="so-variant-val">${SO.escapeHtml(v.value)}</span>${grp}
                    </button>`;
                })
                .join('');
            dropdown.hidden = false;
            dropdown.querySelectorAll('.so-variant-item').forEach((btn) => {
                btn.addEventListener('mousedown', (e) => e.preventDefault());
                btn.addEventListener('click', () => {
                    input.value = btn.dataset.val;
                    dropdown.hidden = true;
                    SO.commitBulkEditField(
                        input.dataset.rowId,
                        input.dataset.shipmentId,
                        'variant',
                        input.value
                    );
                });
            });
        };
        input.addEventListener('focus', refresh);
        input.addEventListener('input', refresh);
        input.addEventListener('blur', (e) => {
            // Blur sang button trong cùng wrap (dropdown) → giữ dropdown để click
            // commit. relatedTarget null/ngoài wrap → ẩn (giữ hành vi cũ + timeout
            // fallback cho browser không set relatedTarget).
            if (e.relatedTarget && wrap?.contains(e.relatedTarget)) return;
            setTimeout(() => {
                if (document.activeElement && wrap?.contains(document.activeElement)) return;
                if (dropdown) dropdown.hidden = true;
            }, 150);
        });
    };

    // Thu thập danh sách supplier names có trong state hiện tại (mọi tab),
    // để merge vào dropdown gợi ý — đảm bảo tên đã dùng trong soOrder hiển thị
    // ngay cả khi cache Ví NCC chưa load xong / chưa có Firestore.
    SO._currentStateSuppliers = function _currentStateSuppliers() {
        const names = new Set();
        const tabs = SO.state?.tabs || [];
        for (const tab of tabs) {
            for (const sh of tab.shipments || []) {
                for (const r of sh.rows || []) {
                    const s = (r.supplier || '').trim();
                    if (s) names.add(s);
                }
            }
        }
        return Array.from(names);
    };

    // Gắn dropdown gợi ý NCC cho 1 input. Idempotent (mỗi input chỉ gắn 1 lần).
    // Hỗ trợ:
    //   - Phím ↑↓ chọn item, Enter để commit (nếu có item active), Escape ẩn.
    //   - Hiển thị badge "Tạo mới" cho text chưa có trong Ví NCC.
    //   - opts.dropdownEl: element dropdown đi kèm (nếu input nằm sẵn trong
    //     `.so-supplier-pick-wrap > .so-supplier-dropdown`, tự dò bằng closest).
    //   - opts.onPick(name): callback khi user chọn item (mặc định chỉ set value).
    SO.attachSupplierPickerOnDemand = function attachSupplierPickerOnDemand(input, opts) {
        if (!input || input.__supplierPickerBound) return;
        input.__supplierPickerBound = true;
        const wrap = input.closest('.so-supplier-pick-wrap');
        const dropdown = opts?.dropdownEl || wrap?.querySelector('.so-supplier-dropdown');
        if (!dropdown) return;
        let activeIdx = -1;
        let lastItems = [];

        const renderDropdown = () => {
            const cache = window.Web2SuppliersCache;
            const q = (input.value || '').trim();
            const extras = SO._currentStateSuppliers();
            const items = cache ? cache.search(q, 10, extras) : extras.slice(0, 10);
            lastItems = items;
            activeIdx = -1;
            const isNew = q.length > 0 && !(cache?.has(q) || extras.some((n) => n === q));
            const itemsHtml = items
                .map(
                    (
                        name
                    ) => `<button type="button" class="so-supplier-item" data-val="${SO.escapeHtml(name)}">
                        <span class="so-supplier-item-name">${SO.escapeHtml(name)}</span>
                        <span class="so-supplier-item-existing">Ví NCC</span>
                    </button>`
                )
                .join('');
            const createHtml =
                isNew && q.length >= 1
                    ? `<button type="button" class="so-supplier-item is-create" data-val="${SO.escapeHtml(q)}" data-create="1">
                        <span class="so-supplier-item-name">+ Tạo NCC "${SO.escapeHtml(q)}"</span>
                        <span class="so-supplier-item-new">Mới</span>
                    </button>`
                    : '';
            if (!items.length && !createHtml) {
                dropdown.innerHTML = `<div class="so-supplier-empty">Chưa có NCC nào — gõ tên để tạo mới.</div>`;
            } else {
                dropdown.innerHTML = createHtml + itemsHtml;
            }
            dropdown.hidden = false;
            // Wire item clicks. mousedown preventDefault để input không blur
            // trước khi click register.
            dropdown.querySelectorAll('.so-supplier-item').forEach((btn) => {
                btn.addEventListener('mousedown', (e) => e.preventDefault());
                btn.addEventListener('click', () => {
                    const val = btn.dataset.val;
                    input.value = val;
                    dropdown.hidden = true;
                    if (opts?.onPick) opts.onPick(val);
                });
            });
        };

        const updateActiveHighlight = () => {
            const items = dropdown.querySelectorAll('.so-supplier-item');
            items.forEach((el, i) => el.classList.toggle('is-active', i === activeIdx));
            const el = items[activeIdx];
            if (el && typeof el.scrollIntoView === 'function') {
                el.scrollIntoView({ block: 'nearest' });
            }
        };

        input.addEventListener('focus', renderDropdown);
        input.addEventListener('input', renderDropdown);
        // Render ngay nếu input đã focus (vd: inline edit attach SAU khi focus
        // fired). Cho phép dropdown hiện ngay khi user dblclick để edit.
        if (document.activeElement === input) renderDropdown();
        input.addEventListener('keydown', (e) => {
            const items = dropdown.querySelectorAll('.so-supplier-item');
            if (!items.length) return;
            if (e.key === 'ArrowDown') {
                e.preventDefault();
                activeIdx = (activeIdx + 1) % items.length;
                updateActiveHighlight();
            } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                activeIdx = activeIdx <= 0 ? items.length - 1 : activeIdx - 1;
                updateActiveHighlight();
            } else if (e.key === 'Enter') {
                if (activeIdx >= 0 && items[activeIdx]) {
                    e.preventDefault();
                    items[activeIdx].click();
                }
            } else if (e.key === 'Escape') {
                dropdown.hidden = true;
            }
        });
        input.addEventListener('blur', (e) => {
            // Blur sang item trong dropdown → giữ để click commit (mousedown của
            // item đã preventDefault). relatedTarget ngoài dropdown/wrap → ẩn.
            const inPicker = (n) => n && (dropdown.contains(n) || wrap?.contains(n));
            if (e.relatedTarget && inPicker(e.relatedTarget)) return;
            setTimeout(() => {
                if (inPicker(document.activeElement)) return;
                if (dropdown) dropdown.hidden = true;
            }, 150);
        });
    };

    // Subscribe to cache changes (only once) so any modal-open re-render
    // picks up newly-added suppliers. Lazy-bound to avoid running before
    // Web2SuppliersCache.init().
    SO._supplierCacheSubscribed = false;
    SO._ensureSupplierCacheSubscription = function _ensureSupplierCacheSubscription() {
        if (SO._supplierCacheSubscribed) return;
        if (!window.Web2SuppliersCache?.subscribe) return;
        SO._supplierCacheSubscribed = true;
        window.Web2SuppliersCache.subscribe(() => {
            // Nếu modal đang mở, refresh dropdown của input đang focus.
            const focused = document.activeElement;
            if (focused?.matches?.('input[name="supplier"]')) {
                focused.dispatchEvent(new Event('input', { bubbles: false }));
            }
        });
    };

    // Fire-and-forget: đảm bảo NCC tồn tại trong NGUỒN CHUNG Ví NCC
    // (Web2SuppliersCache → POST /api/web2-supplier-wallet/suppliers → bảng
    // web2_supplier_meta). Idempotent. Mọi trang Web 2.0 cần NCC đều đi qua cache
    // này → 1 nguồn duy nhất = trang Ví NCC (supplier-wallet).
    SO._ensureSupplierAsync = function _ensureSupplierAsync(name) {
        if (!name) return;
        const cache = window.Web2SuppliersCache;
        if (!cache?.ensure) return;
        cache.ensure(name).catch((e) => {
            console.warn('[so-order] supplier ensure fail:', e?.message || e);
        });
    };

    // Tạo NCC mới NGAY khi user chọn/gõ trong picker (click "+ Tạo NCC …" hoặc
    // pick từ list) + báo kết quả. Trước đây picker modal không truyền onPick →
    // click "+ Tạo NCC" chỉ điền input, KHÔNG gọi ensure → "tạo mới chưa được".
    SO._ensureSupplierWithFeedback = async function _ensureSupplierWithFeedback(name) {
        const trimmed = String(name || '').trim();
        if (!trimmed) return;
        const cache = window.Web2SuppliersCache;
        if (!cache?.ensure) return;
        if (cache.has && cache.has(trimmed)) return; // đã có sẵn → no-op, không báo
        try {
            const res = await cache.ensure(trimmed);
            if (res?.ok && res.created) {
                SO.notify(`Đã tạo NCC "${trimmed}" vào Ví NCC`, 'success');
            } else if (res && res.ok === false) {
                SO.notify(
                    `Không tạo được NCC "${trimmed}": ${res.error || res.reason || 'lỗi server'}`,
                    'error'
                );
            }
        } catch (e) {
            SO.notify(`Không tạo được NCC "${trimmed}": ${e?.message || e}`, 'error');
        }
    };
})();
