// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | WEB2.0 module.
// Sổ Order — kho-SP sync (assign codes, upsert/adjust pending, stock checks, kho match). MOVE-only.

(function () {
    'use strict';

    const SO = (window.SoOrder = window.SoOrder || {});

    /**
     * Đối chiếu các dòng vừa lưu với Kho SP Web 2.0:
     *   - SP đã có (matched theo code hoặc tên chuẩn hóa) → bổ sung tab.label
     *     vào trường `note` nếu chưa có (sticky tag), không ghi đè.
     *   - SP chưa có → POST tạo mới với note = tab.label (HÀ NỘI / HƯƠNG CHÂU).
     * Best-effort: lỗi network không chặn flow chính, chỉ warn.
     */
    // Sinh mã SP theo rule (Web2ProductCode) cho danh sách items sắp upsert vào
    // Kho. Mỗi item cần {name, variant}. Gắn item.code = mã rule (vd HNAODEN,
    // HCAO2). PREFIX lấy theo TAB Sổ Order đang active (HÀ NỘI→HN / HƯƠNG CHÂU→HC),
    // KHÔNG phải cột NCC per-row. Mã CHỈ áp dụng khi server INSERT SP mới — SP đã
    // có (match name+variant) giữ mã cũ. Lỗi → bỏ code, server tự sinh.
    // Mirror logic getColorShortMap + suggestProductCode của web2-products-app.js.
    SO._assignKhoCodes = function _assignKhoCodes(items) {
        if (!window.Web2ProductCode || !Array.isArray(items) || !items.length) return items;
        // colorShortMap từ Kho Biến Thể — NGUỒN CHUNG Web2VariantsCache.getColorShortMap
        // (P5 2026-06-15, memoize). Fallback inline nếu cache cũ chưa có method.
        let colorShortMap = {};
        try {
            const vc = window.Web2VariantsCache;
            if (vc?.getColorShortMap) {
                colorShortMap = vc.getColorShortMap();
            } else if (vc?.getAll) {
                for (const v of vc.getAll()) {
                    if (!/màu/i.test(v.groupName || '')) continue;
                    if (!v.shortCode) continue;
                    const stripped = String(v.value || '')
                        .replace(/^\s*M[àáạăâ]u\s+/iu, '')
                        .trim();
                    const key = window.Web2ProductCode.toAsciiUpper(stripped);
                    if (key) colorShortMap[key] = v.shortCode;
                }
            }
        } catch (_) {
            /* variants cache chưa sẵn — bỏ qua, suggest fallback extract từ tên */
        }
        // PREFIX mã SP lấy theo TAB Sổ Order (HÀ NỘI→HN / HƯƠNG CHÂU→HC), KHÔNG
        // phải cột NCC per-row. Mọi SP nhận trong 1 lô đều thuộc tab đang active.
        const tabLabels = [];
        try {
            for (const t of SO.state?.tabs || []) {
                const lbl = (t.label || '').trim();
                if (lbl) tabLabels.push(lbl);
            }
        } catch (_) {
            /* state chưa sẵn */
        }
        const supplierPrefixMap = window.Web2ProductCode.buildPrefixMap(tabLabels);
        // Tab không xác định → prefix literal "KHO".
        supplierPrefixMap['KHO'] = 'KHO';
        // Label tab đang active = nguồn prefix cho mọi SP của lô này.
        let activeTabLabel = '';
        try {
            activeTabLabel = (window.SoOrderStorage.getActiveTab(SO.state)?.label || '').trim();
        } catch (_) {
            /* state chưa sẵn */
        }
        // existingCodes từ Kho — push mã mới sinh vào để counter không trùng trong batch
        let existingCodes = [];
        try {
            existingCodes = (window.Web2ProductsCache?.getAll?.() || [])
                .map((p) => p.code)
                .filter(Boolean);
        } catch (_) {
            existingCodes = [];
        }
        for (const it of items) {
            if (!it || !it.name) continue;
            // Prefix theo TAB active (không phải cột NCC). Tab không xác định →
            // "KHO" → mã KHO+LOẠI+MÀU+SIZE (vd KHOAODEN) thay vì KHO-<rnd> server sinh.
            const supplierName = activeTabLabel || 'KHO';
            // override màu/size từ biến thể đã chọn (priority hơn extract từ tên SP).
            // ⚠ Biến thể so-order là chuỗi GỘP "Màu / Size" (vd "Đen / XL") →
            // findByValueExact("Đen / XL") = null (cache lưu "Đen", "XL" RIÊNG).
            // → trước đây override fail → mã rớt màu/size → trùng (HCQUAN/HCQUAN2/
            // HCQUAN3 cho 3 SP khác variant). FIX: tách "/" tra cứu TỪNG phần.
            let overrideColorShort = null;
            let overrideSizeShort = null;
            if (it.variant && window.Web2VariantsCache?.findByValueExact) {
                const parts = String(it.variant)
                    .split('/')
                    .map((s) => s.trim())
                    .filter(Boolean);
                // Variant 1 giá trị (không có "/") → vẫn lookup nguyên chuỗi.
                const lookups = parts.length ? parts : [String(it.variant).trim()];
                for (const part of lookups) {
                    const v = window.Web2VariantsCache.findByValueExact(part);
                    if (!v || !v.shortCode) continue;
                    const grp = (v.groupName || '').toLowerCase();
                    if (grp.includes('size') || grp.includes('cỡ') || grp.includes('co')) {
                        overrideSizeShort = v.shortCode.toUpperCase();
                    } else {
                        overrideColorShort = v.shortCode.toUpperCase();
                    }
                }
            }
            try {
                const result = window.Web2ProductCode.suggest({
                    supplierName,
                    productName: it.name,
                    variant: it.variant || '',
                    existingCodes,
                    supplierPrefixMap,
                    colorShortMap,
                    overrideColorShort,
                    overrideSizeShort,
                });
                if (result && result.code) {
                    it.code = result.code;
                    existingCodes.push(result.code);
                }
            } catch (_) {
                /* thiếu NCC / lỗi sinh mã → để server tự sinh (giữ hành vi cũ) */
            }
        }
        return items;
    };

    // UI-first NOTE: hàm này ĐÃ là background best-effort — caller cập nhật
    // local Sổ Order state + renderAll() + notify success NGAY (đồng bộ), rồi
    // mới gọi syncRowsToKho(...).catch(()=>{}) chạy nền. Local Sổ Order là source
    // of truth; Kho SP là mirror dẫn xuất. KHÔNG wrap qua Web2Optimistic.run:
    //   - UI đã apply trước khi gọi → không có gì để "apply optimistic" thêm.
    //   - Rollback push Kho không có ý nghĩa (không undo được row Sổ Order đã ghi).
    //   - Đổi return Promise→undefined sẽ phá hợp đồng .catch() của các call site.
    SO.syncRowsToKho = async function syncRowsToKho(rows, tab, orderSupplier) {
        if (!window.Web2ProductsApi || !window.Web2ProductsCache) return;
        const cache = window.Web2ProductsCache;
        await cache.init();
        const label = (tab && tab.label) || '';
        const trimLabel = label.trim();
        if (!trimLabel) return;
        // Lưu Nháp → upsert-pending: SP mới = CHO_MUA, SP cũ stock=0 → CHO_MUA,
        // pending_qty += qty trong cả 2 case.
        const items = rows
            .map((r) => {
                const name = (r.productName || '').trim();
                const qty = Number(r.qty) || 0;
                if (!name || qty <= 0) return null;
                const variant = (r.variant || '').trim();
                const sellVnd = Math.round((Number(r.sellPrice) || 0) * (Number(tab.rate) || 1));
                const costVnd = Math.round((Number(r.costPrice) || 0) * (Number(tab.rate) || 1));
                return {
                    name,
                    variant: variant || null,
                    qty,
                    sellPrice: sellVnd,
                    costPrice: costVnd,
                    // NCC nằm ở sharedFields (per-đơn), modalRow không có field
                    // supplier → phải nhận orderSupplier để mã SP có prefix NCC
                    // đúng (vd XSAAODEN) thay vì fallback KHO.
                    supplier: (r.supplier || orderSupplier || '').trim() || null,
                    imageUrl: r.productImage || null,
                    note: trimLabel,
                    // 2026-06-16: tiền tệ gốc lúc nhập → kho lưu để hover hiện giá
                    // gốc (vd CNY). Kho VND canonical; originRate = số VND/1 đơn vị.
                    originCurrency: tab.currency || 'VND',
                    originRate: Number(tab.rate) || 1,
                };
            })
            .filter(Boolean);
        if (!items.length) return;
        // Sinh mã SP theo rule (Web2ProductCode) trước khi upsert — SP mới sẽ có
        // mã dạng HNAODEN thay vì KHO-rnd ngẫu nhiên do server sinh.
        SO._assignKhoCodes(items);
        try {
            const res = await window.Web2ProductsApi.upsertPending(items);
            const created = res?.created || 0;
            const updated = res?.updated || 0;
            cache.pushTickle({ action: 'sync-from-so-order' });
            if (created) {
                SO.notify(`Đã tạo ${created} SP CHỜ MUA vào Kho SP`, 'info');
            }
            if (updated) {
                SO.notify(`Đã cập nhật ${updated} SP (pending qty)`, 'info');
            }
            // upsertPending trả success:true KỂ CẢ khi item lẻ lỗi (action:'error',
            // vd mã trùng SP khác). KHÔNG để trôi im lặng — báo user để re-sync.
            const errored = (res?.items || []).filter((it) => it && it.action === 'error');
            if (errored.length) {
                console.warn(
                    '[so-order] syncRowsToKho: %d SP lỗi sync vào Kho',
                    errored.length,
                    errored.map((e) => ({ name: e.name, error: e.error }))
                );
                SO.notify(
                    `${errored.length} SP KHÔNG sync được vào Kho (mã trùng SP khác?) — kiểm tra lại`,
                    'warning'
                );
            }
        } catch (e) {
            console.warn('[so-order] syncRowsToKho upsertPending:', e.message);
            SO.notify('Lỗi sync SP vào Kho: ' + e.message, 'error');
        }
    };

    /**
     * Đẩy delta pending_qty về Kho khi user xóa/sửa qty của row đã từng được
     * Lưu Nháp (đã sync vào Kho).
     *   adjustments = [{ name, variant, supplier, delta }]
     * Best-effort: lỗi network không chặn flow chính, chỉ warn.
     *
     * UI-first NOTE: như syncRowsToKho — đã là background best-effort, caller
     * cập nhật local + render TRƯỚC rồi mới gọi. KHÔNG wrap Web2Optimistic.run
     * (không có optimistic apply / rollback có nghĩa, giữ return Promise cho
     * các call site).
     */
    SO.adjustKhoPending = async function adjustKhoPending(adjustments) {
        if (!window.Web2ProductsApi || !adjustments?.length) return;
        const items = adjustments.filter(
            (a) => a && a.name && Number.isFinite(Number(a.delta)) && Number(a.delta) !== 0
        );
        if (!items.length) return;
        try {
            const res = await window.Web2ProductsApi.adjustPending(items);
            if (window.Web2ProductsCache) {
                window.Web2ProductsCache.pushTickle({ action: 'adjust-from-so-order' });
            }
            const deleted = (res?.results || []).filter((r) => r.action === 'deleted').length;
            if (deleted) {
                SO.notify(`Đã dọn ${deleted} SP ghost (pending=0, stock=0) khỏi Kho`, 'info');
            }
            if (res?.warnings?.length) {
                console.warn('[so-order] adjustKhoPending warnings:', res.warnings);
            }
        } catch (e) {
            console.warn('[so-order] adjustKhoPending error:', e.message);
            SO.notify('Lỗi sync giảm pending về Kho: ' + e.message, 'error');
        }
    };

    SO._rowToKhoMatch = function _rowToKhoMatch(r) {
        return {
            name: (r.productName || '').trim(),
            variant: (r.variant || '').trim() || null,
            supplier: (r.supplier || '').trim() || null,
        };
    };

    SO._noteHasLabel = function _noteHasLabel(note, label) {
        if (!note || !label) return false;
        const parts = String(note)
            .split('|')
            .map((s) => s.trim().toLowerCase());
        return parts.includes(label.toLowerCase());
    };

    SO._generateKhoCode = function _generateKhoCode(name) {
        // Sinh mã ngắn dạng KHO-<short hash>-<timestamp36>. Mã không phụ
        // thuộc tên (WEB2-style) — sẽ unique cao, không trùng giữa nhiều
        // máy nhờ phần timestamp + random.
        const base =
            String(name || '')
                .normalize('NFD')
                .replace(/[̀-ͯ]/g, '')
                .replace(/đ/g, 'd')
                .replace(/[^a-zA-Z0-9]/g, '')
                .toUpperCase()
                .slice(0, 6) || 'SP';
        const ts = Date.now().toString(36).toUpperCase().slice(-5);
        const rnd = Math.random().toString(36).toUpperCase().slice(2, 5);
        return `${base}-${ts}${rnd}`;
    };

    /** Cache đã có data trong memory chưa? Dùng trước khi gọi async check
     *  để bỏ qua loading state nếu lookup sẽ instant.
     *  P1 2026-05-30: ưu tiên flag `isReady()` (init xong, kể cả kho rỗng).
     *  Fallback `getAll().length > 0` cho version cache cũ chưa expose flag. */
    SO._isStockCacheReady = function _isStockCacheReady() {
        const cache = window.Web2ProductsCache;
        if (!cache) return false;
        try {
            if (typeof cache.isReady === 'function' && cache.isReady()) return true;
            return cache.getAll().length > 0;
        } catch {
            return false;
        }
    };

    /** Sync version — chỉ chạy được khi cache ready. Trả null nếu không. */
    SO._checkRowsHaveStockSync = function _checkRowsHaveStockSync(rows) {
        if (!SO._isStockCacheReady()) return null;
        const matches = (rows || [])
            .map((r) => {
                const m = SO._rowToKhoMatch(r);
                return m.name ? { name: m.name, variant: m.variant || null } : null;
            })
            .filter(Boolean);
        if (!matches.length) return { hasStock: false, items: [] };
        const cache = window.Web2ProductsCache;
        const all = cache.getAll();
        const norm = cache._normalize;
        const stockIndex = new Map();
        for (const p of all) {
            if (Number(p.stock || 0) <= 0) continue;
            const key = norm(p.name) + '|' + norm(p.variant || '');
            const arr = stockIndex.get(key);
            if (arr) arr.push(p);
            else stockIndex.set(key, [p]);
        }
        const flagged = [];
        for (const m of matches) {
            const key = norm(m.name) + '|' + norm(m.variant || '');
            const hits = stockIndex.get(key);
            if (!hits) continue;
            for (const p of hits) {
                flagged.push({
                    code: p.code,
                    name: p.name,
                    variant: p.variant,
                    supplier: p.supplier,
                    stock: p.stock,
                    pending: p.pendingQty || 0,
                });
            }
        }
        return { hasStock: flagged.length > 0, items: flagged };
    };

    // P1 2026-05-30: kiểm tra rows sắp xóa có dính SP đã nhận hàng (stock>0)
    // không. TRƯỚC ĐÂY: N×HTTP fetch tuần tự (~300-800ms/SP) — vấn đề kiến
    // trúc, không phải search algo. BÂYGIỜ: dùng Web2ProductsCache (đã
    // pre-load TẤT CẢ SP vào in-memory Map khi page init, auto refresh qua
    // SSE web2:products), build HashMap O(1) key = normalize(name)+'|'+
    // normalize(variant), lookup instant. Tổng time: <1ms thay vì 2400ms.
    // Caller nên thử _checkRowsHaveStockSync() trước để bỏ qua loading state.
    SO._checkRowsHaveStock = async function _checkRowsHaveStock(rows) {
        const matches = (rows || [])
            .map((r) => {
                const m = SO._rowToKhoMatch(r);
                return m.name ? { name: m.name, variant: m.variant || null } : null;
            })
            .filter(Boolean);
        if (!matches.length) return { hasStock: false, items: [] };
        const cache = window.Web2ProductsCache;
        if (!cache) return { hasStock: false, items: [], skipped: true };
        try {
            // Idempotent — chỉ đợi nếu chưa init xong. Sau lần đầu là no-op.
            await cache.init();
            const all = cache.getAll();
            const norm = cache._normalize;
            // Build inverted index 1 lần per call: O(N) products → Map(key→[products]).
            // Group vì hiếm khi name+variant trùng nhưng vẫn handle. Chỉ index SP
            // còn stock > 0 → loại bỏ luôn 90% records cho lookup nhanh hơn.
            const stockIndex = new Map();
            for (const p of all) {
                if (Number(p.stock || 0) <= 0) continue;
                const key = norm(p.name) + '|' + norm(p.variant || '');
                const arr = stockIndex.get(key);
                if (arr) arr.push(p);
                else stockIndex.set(key, [p]);
            }
            const flagged = [];
            for (const m of matches) {
                const key = norm(m.name) + '|' + norm(m.variant || '');
                const hits = stockIndex.get(key);
                if (!hits) continue;
                for (const p of hits) {
                    flagged.push({
                        code: p.code,
                        name: p.name,
                        variant: p.variant,
                        supplier: p.supplier,
                        stock: p.stock,
                        pending: p.pendingQty || 0,
                    });
                }
            }
            return { hasStock: flagged.length > 0, items: flagged };
        } catch (e) {
            console.warn('[so-order] checkRowsStock cache fail:', e.message);
            return { hasStock: false, items: [], skipped: true };
        }
    };
})();
