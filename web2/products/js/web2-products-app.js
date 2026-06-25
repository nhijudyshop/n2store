// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | WEB2.0 module.
/**
 * Web2 Products — main app: render bảng + CRUD qua modal.
 *
 * [SPLIT 2026-06-18] file gốc 2010 dòng → 6 module (MOVE-only, không đổi behavior):
 *   web2-products-state.js   — STATE + constants + utils + supplier/color cache
 *   web2-products-render.js  — rows/pagination/counters + usage + bulk + load()
 *   web2-products-modal.js   — create/edit/history modal + import + variant picker
 *   web2-products-actions.js — toggleActive / remove / copyCode / printBarcode
 *   web2-products-filters.js — search/filter/limit + goPage
 *   web2-products-app.js     — orchestrator (init/events/SSE) + window.Web2ProductsApp
 * Tất cả module share state/helper qua namespace nội bộ window.Web2ProductsCore (W).
 * PHẢI load theo thứ tự state → render → modal → actions → filters → app.
 */

(function () {
    'use strict';

    const W = window.Web2ProductsCore;
    if (!W) {
        console.error('[Web2Products] Web2ProductsCore chưa load — kiểm tra thứ tự script.');
        return;
    }
    const STATE = W.STATE;
    const $ = W.$;
    const tbody = W.tbody;
    const modal = W.modal;
    const notify = W.notify;
    const cssEscape = W.cssEscape;

    // ---------- Init ----------
    // SSE realtime — auto sync khi server thông báo mutation.
    // Subscribe 3 topic:
    //   - web2:products → CRUD trực tiếp (create/update/delete/stock adjust)
    //   - web2:fast-sale-orders → tạo PBH deduct stock + sync state
    //   - web2:native-orders → đổi status đơn → ảnh hưởng badge "ĐANG DÙNG"
    //
    // Strategy:
    //   - Event 'update' + code cụ thể có trong page hiện tại → fetch chỉ SP đó
    //     và update tại chỗ (KHÔNG full load → KHÔNG giật bảng + KHÔNG re-sort).
    //   - Event 'create' / 'delete' / không code → full load (cần ảnh hưởng total).
    //   - fast-sale-orders / native-orders → chỉ ảnh hưởng badge "ĐANG DÙNG" →
    //     gọi _loadUsageForCurrentPage() (cell-level update, không nháy bảng).
    // ⚠ Cần 2 timer RIÊNG biệt — KHÔNG share giữa fullLoad vs refreshUsageOnly.
    // Khi PBH tạo, server fire 3 topics liên tiếp:
    //   web2:native-orders status-bumped → muốn refreshUsageOnly
    //   web2:products pbh-stock-deduct  → muốn debouncedFullLoad (stock thay đổi)
    //   web2:fast-sale-orders from-native-order → muốn refreshUsageOnly
    // Nếu share timer → web2:fast-sale-orders event đến SAU sẽ clearTimeout của
    // debouncedFullLoad → stock cell không update, chỉ usage update.
    let _sseReloadTimer = null;
    let _sseUsageTimer = null;
    let _sseWired = false;
    function _setupSse() {
        if (!window.Web2SSE?.subscribe) return;
        if (_sseWired) return; // idempotent: chỉ subscribe 1 lần (tránh xử lý event đôi nếu init chạy lại)
        _sseWired = true;

        const debouncedFullLoad = () => {
            if (_sseReloadTimer) clearTimeout(_sseReloadTimer);
            _sseReloadTimer = setTimeout(() => {
                _sseReloadTimer = null;
                W.load();
            }, 500);
        };

        window.Web2SSE.subscribe('web2:products', async (msg) => {
            const { action, code, codes } = msg.data || {};
            // affected = mọi code bị đổi (bulk op gửi codes[], CRUD đơn gửi code).
            const affected = codes && codes.length ? codes : code ? [code] : [];
            console.log(
                '[Web2Products-SSE] web2:products',
                action,
                affected.length ? affected.join(',') : '(no code)'
            );

            // create/delete đổi TỔNG số dòng / phân trang → buộc full reload.
            if (action === 'create' || action === 'delete') {
                if (action === 'delete' && code) STATE.selectedCodes.delete(code);
                debouncedFullLoad();
                return;
            }

            // upsert-pending (so-order "Lưu (Nháp)") có thể TẠO SP MỚI. Nếu có code
            // CHƯA nằm trong data trang hiện tại → SP mới → full reload để HIỆN NGAY.
            // (patch-in-place bỏ qua code không on-page → SP mới vô hình đến khi F5 —
            // bug user báo 2026-06-25 "phải F5 mới thấy SP tạo bên so order").
            if (
                action === 'upsert-pending' &&
                affected.some((c) => !STATE.products.some((p) => p.code === c))
            ) {
                debouncedFullLoad();
                return;
            }

            // Mọi action update-like (update / confirm-purchase / confirm-purchase-partial
            // / upsert-pending / adjust-stock / adjust-pending / mark-printed): patch
            // CHỈ các row bị đổi tại chỗ → KHÔNG full reload → KHÔNG giật bảng.
            if (affected.length) {
                try {
                    const res = await W._updateRowsBatch(affected);
                    if (res.handled) return; // đã patch (hoặc không có code nào on-page)
                } catch (e) {
                    console.warn('[Web2Products-SSE] batch in-place failed, fallback:', e?.message);
                }
            }
            // Không xác định được code (vd backfill-supplier codes=null) → full reload an toàn.
            debouncedFullLoad();
        });

        // Topic fast-sale-orders / native-orders → chỉ ảnh hưởng cell "ĐANG DÙNG"
        // → refresh usage map mà không re-render bảng (cell-level update in-place).
        // Dùng _sseUsageTimer RIÊNG, KHÔNG share với _sseReloadTimer của fullLoad.
        const refreshUsageOnly = () => {
            if (_sseUsageTimer) clearTimeout(_sseUsageTimer);
            _sseUsageTimer = setTimeout(() => {
                _sseUsageTimer = null;
                W._loadUsageForCurrentPage();
            }, 600);
        };
        window.Web2SSE.subscribe('web2:fast-sale-orders', () => {
            console.log('[Web2Products-SSE] fast-sale-orders → refresh usage');
            refreshUsageOnly();
        });
        window.Web2SSE.subscribe('web2:native-orders', () => {
            console.log('[Web2Products-SSE] native-orders → refresh usage');
            refreshUsageOnly();
        });
    }

    // Deep-link handler: ?code=<khocode> — pre-filter, scroll, flash, open edit.
    // Called after the initial load() resolves so STATE.products is populated.
    function _handleDeeplink() {
        const _dlCode = window.Web2Deeplink?.param('code');
        if (!_dlCode) return;

        // Pre-filter so the row is visible in STATE.products.
        const searchEl = $('#filterSearch');
        if (searchEl) searchEl.value = _dlCode;
        STATE.search = _dlCode;
        STATE.page = 1;

        // Reload with the filter, then act on the result.
        W.load().then(() => {
            const row = tbody()?.querySelector(`tr[data-code="${cssEscape(_dlCode)}"]`);
            if (!row) {
                window.notificationManager?.show('Không tìm thấy SP mã: ' + _dlCode, 'warning');
                return;
            }
            // Scroll + highlight flash.
            row.scrollIntoView({ behavior: 'smooth', block: 'center' });
            row.classList.add('w2-deeplink-flash');
            setTimeout(() => row.classList.remove('w2-deeplink-flash'), 2400);
            // Open edit modal (openEdit guards via STATE.products find).
            W.openEdit(_dlCode);
        });
    }

    function init() {
        if (window.lucide) lucide.createIcons();
        $('#btnCreateProduct')?.addEventListener('click', W.openCreate);
        // Import dữ liệu CSV/JSON + tải file mẫu (NGUỒN CHUNG Web2Import).
        $('#btnImportProducts')?.addEventListener('click', () => {
            if (!window.Web2Import) return notify('Module nhập dữ liệu chưa load', 'error');
            window.Web2Import.open(W._productImportConfig());
        });
        $('#btnSampleProducts')?.addEventListener('click', () => {
            if (!window.Web2Import) return notify('Module nhập dữ liệu chưa load', 'error');
            window.Web2Import.downloadSample(W._productImportConfig());
        });
        _setupSse();

        // Bulk selection wiring (P1 2026-05-30)
        // - Delegate change event trên tbody cho mọi checkbox SP
        // - Select-all header checkbox toggle visible rows
        // - Bulk bar buttons (clear + print)
        tbody()?.addEventListener('change', (e) => {
            const inp = e.target.closest('input[data-select-code]');
            if (!inp) return;
            W._toggleSelect(inp.dataset.selectCode, inp.checked);
        });
        $('#selectAllProducts')?.addEventListener('change', (e) => {
            W._selectAllVisible(e.target.checked);
        });
        $('#w2pBulkClear')?.addEventListener('click', W._clearSelection);
        $('#w2pBulkPrint')?.addEventListener('click', W._bulkPrint);

        // Upload + Ctrl+V paste + drag-drop cho field ảnh trong modal.
        // Khi nhận ảnh → ghi base64 vào input #pmImage + cập nhật preview.
        if (window.Web2Effects?.attachImageDropTarget) {
            // Click picker đã bỏ — chỉ dùng Ctrl+V / kéo thả + hover-to-focus.
            // Image tự động compress về JPEG ~500KB, max 1200×1200, hard limit 10MB.
            window.Web2Effects.attachImageDropTarget('#pmImageDrop', {
                onResult(url) {
                    const inp = $('#pmImage');
                    if (inp) inp.value = url;
                    W.updateImagePreview(url);
                },
                notify,
            });
        }

        // Variant picker — pick từ Kho Biến Thể, block free-text mới.
        if (window.Web2VariantsCache) {
            window.Web2VariantsCache.init().then(() => {
                W._wireVariantPicker();
                // Re-render hint khi kho biến thể cập nhật
                window.Web2VariantsCache.subscribe(() => W._renderCombinedHint());
            });
        }

        // NCC dropdown — nguồn chung Ví NCC. Init + refresh dropdown realtime khi
        // NCC đổi (tạo ở so-order / supplier-debt / Ví NCC → SSE web2:supplier-wallet).
        if (window.Web2SuppliersCache) {
            window.Web2SuppliersCache.init()
                .then(() => {
                    window.Web2SuppliersCache.subscribe(() => {
                        // Cache đã tự refresh names → rebuild dropdown (vô hại khi modal ẩn).
                        W.loadSuppliersFromSoOrder(true).then(() => {
                            if ($('#pmSupplier')) W.populateSupplierDropdown();
                        });
                    });
                })
                .catch(() => {});
        }
        $('#filterSearch')?.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') W.applyFilters();
        });
        $('#filterSearchClear')?.addEventListener('click', () => {
            const el = $('#filterSearch');
            if (el) {
                el.value = '';
                STATE.search = '';
                STATE.page = 1;
                W.load();
            }
        });
        // Live filter — chips change áp dụng ngay, search input cũng auto khi Enter.
        $('#filterActive')?.addEventListener('change', W.applyFilters);
        $('#filterLimit')?.addEventListener('change', W.applyFilters);

        // Modal
        $('#btnCloseProductModal')?.addEventListener('click', W.closeModal);
        $('#btnCancelProduct')?.addEventListener('click', W.closeModal);
        $('#btnSaveProduct')?.addEventListener('click', W.saveModal);
        $('#pmSuggestCode')?.addEventListener('click', W.suggestProductCode);
        // Auto-regenerate mã KHI: NCC / Tên / Biến thể thay đổi (mode tạo mới).
        // Mode edit: pmCode disabled → KHÔNG đổi mã (mã là khóa chính, không sửa).
        // Debounce 300ms để không gen liên tục mỗi keystroke
        let _autoRegenTimer = null;
        const autoRegen = () => {
            if (STATE.editingCode) return; // edit: mã đã lock, không regenerate
            clearTimeout(_autoRegenTimer);
            _autoRegenTimer = setTimeout(() => W.suggestProductCode(true), 300);
        };
        $('#pmSupplier')?.addEventListener('change', autoRegen);
        $('#pmName')?.addEventListener('input', autoRegen);
        $('#pmVariantColor')?.addEventListener('input', autoRegen);
        $('#pmVariantColor')?.addEventListener('change', autoRegen);
        $('#pmVariantSize')?.addEventListener('input', autoRegen);
        $('#pmVariantSize')?.addEventListener('change', autoRegen);
        // Intentionally NOT closing on overlay click — protect in-progress data.
        // Only X button / Hủy button / ESC close the modal.
        document.addEventListener('keydown', (e) => {
            if (!modal()?.classList.contains('active')) return;
            if (e.key === 'Escape') return W.closeModal();
            // Enter để lưu nhanh (trừ khi đang gõ textarea hoặc đang chọn dropdown).
            if (e.key === 'Enter' && !e.isComposing) {
                const tag = document.activeElement?.tagName;
                if (tag !== 'TEXTAREA' && tag !== 'SELECT' && tag !== 'BUTTON') {
                    e.preventDefault();
                    W.saveModal();
                }
            }
        });

        // Image preview on input
        $('#pmImage')?.addEventListener('input', (e) =>
            W.updateImagePreview(e.target.value.trim())
        );

        // Task 6: lightweight real-time required-field feedback on blur.
        // Toggle .field-error border class — no full validation framework needed.
        const _requiredBlur = (id) => {
            const el = $(id);
            if (!el) return;
            el.addEventListener('blur', () => {
                el.classList.toggle('field-error', el.value.trim() === '');
            });
            el.addEventListener('input', () => {
                if (el.value.trim()) el.classList.remove('field-error');
            });
        };
        _requiredBlur('#pmName');
        _requiredBlur('#pmCode');

        W.load().then(_handleDeeplink);

        // Realtime cross-machine sync — SSE handler đã set up ở _setupSse() và
        // làm in-place update cho 'update' event, full load cho 'create/delete'.
        // Cache subscriber chỉ giữ cho legacy Firestore tickler ('tickle' reason).
        // KHÔNG nên gọi load() trên 'refresh' vì pushTickle/loadList nội bộ
        // cũng emit 'refresh' → tạo loop full-reload sau mỗi mutation local.
        if (window.Web2ProductsCache) {
            window.Web2ProductsCache.init().then(() => {
                window.Web2ProductsCache.subscribe((reason) => {
                    if (reason === 'tickle') W.load();
                });
            });
        }
    }

    // Public API — byte-identical method set với bản gốc (15 inline onclick +
    // accessor cho web2-product-detail.js). Mỗi method delegate vào module tương ứng.
    window.Web2ProductsApp = {
        load: W.load,
        openEdit: W.openEdit,
        toggleActive: W.toggleActive,
        remove: W.remove,
        copyCode: W.copyCode,
        goPage: W.goPage,
        openUsagePopover: W.openUsagePopover,
        openHistory: W.openHistory,
        printBarcode: W.printBarcode,
        // Accessors cho drawer chi tiết (web2-product-detail.js — feature riêng).
        getProduct: (code) => STATE.products.find((p) => p.code === code) || null,
        getUsage: (code) => STATE.usage[code] || null,
        PROXY_BASE: W.PROXY_BASE,
    };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
