// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | Read these files before coding, update dev-log after changes.
/**
 * SoluongWarehouseSync — Realtime TPOS → soluong-live product sync (shared).
 *
 * TPOS thay đổi tên / hình / số lượng → TPOS Socket.IO listener (Render) sync
 * web_warehouse → broadcast SSE topic "web_warehouse" → module này nhận, re-fetch
 * sản phẩm liên quan (theo template, GIỮ logic biến thể) và cập nhật Firebase RTDB
 * → mọi tab/máy đang mở soluong-live tự cập nhật (không cần refresh).
 *
 * Dùng chung cho index.html (main.js) + soluong-list.html (soluong-list.js).
 *
 * SSE payload (envelope): { key: 'web_warehouse', data: { action, ... } }
 *   - action 'sync_complete' + data.templateIds[]  → refresh đúng template đó
 *   - action 'sync_complete' (incremental/full, KHÔNG templateIds) → refresh toàn bộ cart (throttle)
 *   - action 'image_update'  + tposTemplateId/tposProductId → refresh + bust cache ảnh
 *   - action 'deactivated'   → chỉ toast (không tự xoá khỏi cart khi đang live)
 *
 * Cart item shape (Firebase soluongProducts/<key>):
 *   { Id (variant id), NameGet, ProductTmplId (template id), QtyAvailable,
 *     soldQty (local — GIỮ NGUYÊN), remainingQty, imageUrl, lastRefreshed }
 */

(function () {
    'use strict';

    const SSE_URL =
        'https://chatomni-proxy.nhijudyshop.workers.dev/api/realtime/sse?keys=web_warehouse';

    const EVENT_DEBOUNCE_MS = 1500; // gom nhiều event TPOS bắn liên tiếp
    const FULL_REFRESH_THROTTLE_MS = 8000; // tránh refresh-all dồn dập khi sync lớn

    // Reconcile-on-load: bắt thay đổi TPOS xảy ra khi KHÔNG tab nào mở (vd qua đêm).
    // Throttle qua localStorage (chung index + list cùng origin) để không hammer mỗi lần load.
    const RECONCILE_AT_KEY = 'soluongWhReconcileAt';
    const RECONCILE_MIN_INTERVAL_MS = 10 * 60 * 1000; // tối đa 1 lần / 10 phút / trình duyệt
    const RECONCILE_START_DELAY_MS = 3000; // chờ Firebase load cart xong

    function num(v) {
        const n = Number(v);
        return Number.isFinite(n) ? n : 0;
    }

    // Version token theo nội dung URL ảnh (raw) — dùng cache-bust ảnh TPOS-direct.
    function verOf(url) {
        if (window.WarehouseAPI && typeof window.WarehouseAPI.imageVersion === 'function') {
            return window.WarehouseAPI.imageVersion({ image_url: url });
        }
        if (!url) return '';
        let h = 5381;
        for (let i = 0; i < url.length; i++) h = ((h << 5) + h + url.charCodeAt(i)) | 0;
        return (h >>> 0).toString(36);
    }

    // Cache ảnh template lấy TPOS-direct (per session) để khỏi gọi lặp.
    const tposTemplateImgCache = new Map(); // templateId(Number) -> imageUrl|''
    const TPOS_PROXY = 'https://chatomni-proxy.nhijudyshop.workers.dev';

    /**
     * Lấy ImageUrl của template trực tiếp từ TPOS (giống product-warehouse loadVariantImages).
     * Dùng khi web_warehouse chưa có ảnh nào cho template (vd SP mới chưa sync ảnh).
     * Cần window.tokenManager (token TPOS chia sẻ qua Firestore). Lỗi/không token → ''.
     */
    async function getTposTemplateImage(templateId) {
        if (!templateId) return '';
        if (tposTemplateImgCache.has(templateId)) return tposTemplateImgCache.get(templateId);
        let img = '';
        try {
            const tm = window.tokenManager;
            if (tm && typeof tm.authenticatedFetch === 'function') {
                const url = `${TPOS_PROXY}/api/odata/ProductTemplate(${templateId})?$expand=ProductVariants`;
                const resp = await tm.authenticatedFetch(url, {
                    headers: { Accept: 'application/json' },
                });
                if (resp && resp.ok) {
                    const detail = await resp.json();
                    img = detail.ImageUrl || '';
                    if (!img && Array.isArray(detail.ProductVariants)) {
                        const withImg = detail.ProductVariants.find((v) => v.ImageUrl);
                        if (withImg) img = withImg.ImageUrl;
                    }
                }
            }
        } catch (_) {
            /* không token / lỗi mạng → giữ placeholder */
        }
        tposTemplateImgCache.set(templateId, img);
        return img;
    }

    /**
     * @param {Object} opts
     * @param {Object} opts.database - firebase.database() instance
     * @param {() => Object} opts.getProducts - trả về object soluongProducts (live ref)
     * @param {() => boolean} [opts.isSyncing] - true khi đang apply thay đổi từ Firebase
     * @param {(changedKeys: string[]) => void} opts.onUpdated - gọi sau khi cập nhật để re-render
     * @param {(msg: string, level?: string) => void} [opts.toast]
     * @returns {{ stop: () => void }}
     */
    function start(opts) {
        const { database, getProducts, onUpdated } = opts;
        const isSyncing = opts.isSyncing || (() => false);
        const toast = opts.toast || (() => {});

        if (!database || typeof getProducts !== 'function') {
            console.warn('[WarehouseSync] start() thiếu database/getProducts — bỏ qua');
            return { stop() {} };
        }
        if (!window.WarehouseAPI) {
            console.warn('[WarehouseSync] WarehouseAPI chưa load — bỏ qua');
            return { stop() {} };
        }

        let source = null;
        let debounceTimer = null;
        let lastFullRefreshAt = 0;
        let pendingTemplateIds = new Set();
        let pendingAll = false;
        let pendingImageBust = false;

        function scheduleFlush() {
            if (debounceTimer) clearTimeout(debounceTimer);
            debounceTimer = setTimeout(flush, EVENT_DEBOUNCE_MS);
        }

        async function flush() {
            debounceTimer = null;
            const all = pendingAll;
            const ids = pendingTemplateIds;
            const bust = pendingImageBust;
            pendingTemplateIds = new Set();
            pendingAll = false;
            pendingImageBust = false;

            const ts = Date.now();
            try {
                if (all) {
                    if (ts - lastFullRefreshAt < FULL_REFRESH_THROTTLE_MS) return;
                    lastFullRefreshAt = ts;
                    await refresh(null, ts, bust);
                } else if (ids.size > 0) {
                    await refresh(ids, ts, bust);
                }
            } catch (err) {
                console.warn('[WarehouseSync] flush error:', err);
            }
        }

        /**
         * Re-fetch và cập nhật sản phẩm liên quan.
         * @param {Set<number>|null} idSet - template/product ids cần refresh; null = toàn bộ cart
         * @param {number} ts - timestamp dùng cho cache-bust ảnh
         * @param {boolean} forceImageBust - luôn bump lastRefreshed (event ảnh: URL không đổi nhưng bytes đổi)
         */
        async function refresh(idSet, ts, forceImageBust) {
            const products = getProducts() || {};
            const keys = Object.keys(products);
            if (keys.length === 0) return;

            // Lọc key bị ảnh hưởng + gom theo template (giữ logic biến thể: 1 fetch/template)
            const groups = new Map(); // templateKey -> { repIds: Set, keys: [] }
            for (const key of keys) {
                const p = products[key];
                if (!p) continue;
                const tmplId = p.ProductTmplId || p.Id;
                const affected =
                    idSet === null || idSet.has(Number(p.ProductTmplId)) || idSet.has(Number(p.Id));
                if (!affected) continue;

                const gk = String(tmplId);
                if (!groups.has(gk)) groups.set(gk, { repIds: [], keys: [] });
                const g = groups.get(gk);
                g.keys.push(key);
                if (p.Id) g.repIds.push(p.Id);
            }

            if (groups.size === 0) return;

            const changedKeys = [];

            for (const [gk, group] of groups) {
                // Lấy data tươi cho cả template (product + tất cả biến thể anh em đang active)
                let result = null;
                for (const repId of group.repIds) {
                    try {
                        result = await window.WarehouseAPI.getProductAsTpos(repId);
                    } catch (_) {
                        result = null;
                    }
                    if (result && result.product) break;
                }
                if (!result || !result.product) continue;

                // Map variantId -> data tươi (gồm cả product chính)
                const freshById = new Map();
                const collect = (obj) => {
                    if (obj && obj.Id != null) freshById.set(Number(obj.Id), obj);
                };
                collect(result.product);
                (result.variants || []).forEach(collect);

                // Ảnh sản phẩm (template) + version: biến thể KHÔNG có ảnh riêng lấy ảnh này.
                let templateImg = '';
                let templateImgVer = '';
                if (result.product && (result.product.imageUrl || result.product.ImageUrl)) {
                    templateImg = result.product.imageUrl || result.product.ImageUrl;
                    templateImgVer = result.product.imageVersion || '';
                }
                if (!templateImg) {
                    const sib = (result.variants || []).find(
                        (v) => v && (v.imageUrl || v.ImageUrl)
                    );
                    if (sib) {
                        templateImg = sib.imageUrl || sib.ImageUrl;
                        templateImgVer = sib.imageVersion || '';
                    }
                }
                // Fallback TPOS-direct (giống product-warehouse): template chưa có ảnh trong
                // web_warehouse (vd SP mới) → lấy ImageUrl template trực tiếp từ TPOS.
                if (!templateImg) {
                    templateImg = await getTposTemplateImage(Number(gk));
                    templateImgVer = templateImg ? verOf(templateImg) : '';
                }

                for (const key of group.keys) {
                    const p = products[key];
                    if (!p) continue;
                    const fresh = freshById.get(Number(p.Id));
                    if (!fresh) continue; // biến thể bị xoá/ngừng — giữ nguyên, không phá cart

                    const newName = fresh.NameGet || p.NameGet;
                    // Biến thể không có ảnh riêng → fallback ảnh sản phẩm (template)
                    const hasOwnImg = !!(fresh.imageUrl || fresh.ImageUrl);
                    const newImg =
                        (hasOwnImg ? fresh.imageUrl || fresh.ImageUrl : templateImg) || '';
                    const newImgVer = (hasOwnImg ? fresh.imageVersion || '' : templateImgVer) || '';
                    const newQty = num(fresh.QtyAvailable);

                    const nameChanged = newName !== p.NameGet;
                    // Phát hiện ảnh đổi: URL proxy hằng số nên so cả imageVersion (theo nội dung).
                    const imgChanged =
                        (!!newImg && newImg !== p.imageUrl) ||
                        (!!newImgVer && newImgVer !== (p.imageVersion || ''));
                    const qtyChanged = newQty !== num(p.QtyAvailable);

                    if (!nameChanged && !imgChanged && !qtyChanged && !forceImageBust) continue;

                    // Áp dụng — GIỮ soldQty, recompute remainingQty
                    if (nameChanged) p.NameGet = newName;
                    if (imgChanged) {
                        if (newImg) p.imageUrl = newImg;
                        p.imageVersion = newImgVer;
                    }
                    if (qtyChanged) p.QtyAvailable = newQty;

                    let soldQty = num(p.soldQty);
                    if (soldQty > num(p.QtyAvailable)) {
                        soldQty = num(p.QtyAvailable);
                        p.soldQty = soldQty;
                    }
                    p.remainingQty = num(p.QtyAvailable) - soldQty;
                    p.lastRefreshed = ts; // bust cache ảnh (?v=)

                    changedKeys.push(key);

                    if (!isSyncing()) {
                        database
                            .ref(`soluongProducts/${key}`)
                            .update({
                                NameGet: p.NameGet,
                                imageUrl: p.imageUrl || null,
                                imageVersion: p.imageVersion || null,
                                QtyAvailable: num(p.QtyAvailable),
                                soldQty: num(p.soldQty),
                                remainingQty: num(p.remainingQty),
                                lastRefreshed: ts,
                            })
                            .catch((err) =>
                                console.error('[WarehouseSync] Firebase update error:', err)
                            );
                    }
                }
            }

            if (changedKeys.length > 0) {
                console.log(`[WarehouseSync] Cập nhật ${changedKeys.length} sản phẩm từ TPOS`);
                try {
                    onUpdated(changedKeys);
                } catch (err) {
                    console.warn('[WarehouseSync] onUpdated error:', err);
                }
            }
        }

        function onMessage(e) {
            let payload;
            try {
                payload = JSON.parse(e.data);
            } catch (_) {
                return;
            }
            const data = payload && payload.data;
            const action = data && data.action;
            if (!action) return;

            if (action === 'sync_complete') {
                const stats = data.stats || {};
                const changed = num(stats.inserted) + num(stats.updated);
                if (changed > 0) {
                    const parts = [];
                    if (stats.inserted) parts.push(`+${stats.inserted} mới`);
                    if (stats.updated) parts.push(`${stats.updated} cập nhật`);
                    toast(`TPOS đồng bộ: ${parts.join(', ')}`, 'success');
                }
                if (Array.isArray(data.templateIds) && data.templateIds.length > 0) {
                    data.templateIds.forEach((id) => pendingTemplateIds.add(Number(id)));
                } else {
                    // incremental/full — không biết template nào → refresh toàn bộ cart
                    pendingAll = true;
                }
                scheduleFlush();
                return;
            }

            if (action === 'image_update') {
                pendingImageBust = true;
                const tId = data.tposTemplateId;
                const pId = data.tposProductId;
                if (tId) pendingTemplateIds.add(Number(tId));
                if (pId) pendingTemplateIds.add(Number(pId));
                if (!tId && !pId) pendingAll = true;
                toast('TPOS cập nhật ảnh sản phẩm', 'info');
                scheduleFlush();
                return;
            }

            if (action === 'deactivated') {
                toast(`TPOS ngừng sản phẩm (${data.count || 1} biến thể)`, 'warning');
                return;
            }
        }

        try {
            source = new EventSource(SSE_URL);
            source.addEventListener('update', onMessage);
            source.onerror = () => {
                // EventSource tự reconnect
                console.warn('[WarehouseSync] SSE disconnected, auto-reconnect…');
            };
            console.log('[WarehouseSync] Listening web_warehouse SSE');
        } catch (err) {
            console.warn('[WarehouseSync] EventSource setup failed:', err);
        }

        // Reconcile-on-load: đối chiếu cart hiện tại với TPOS (bắt thay đổi khi không tab nào mở).
        let reconcileTimer = setTimeout(() => {
            reconcileTimer = null;
            let last = 0;
            try {
                last = Number(localStorage.getItem(RECONCILE_AT_KEY)) || 0;
            } catch (_) {}
            if (Date.now() - last < RECONCILE_MIN_INTERVAL_MS) return;
            try {
                localStorage.setItem(RECONCILE_AT_KEY, String(Date.now()));
            } catch (_) {}
            console.log('[WarehouseSync] Reconcile-on-load: đối chiếu cart với TPOS…');
            refresh(null, Date.now(), false).catch((e) =>
                console.warn('[WarehouseSync] reconcile error:', e)
            );
        }, RECONCILE_START_DELAY_MS);

        const handle = {
            // Đối chiếu thủ công toàn bộ cart với TPOS (bỏ qua throttle).
            refreshAll() {
                return refresh(null, Date.now(), false);
            },
            stop() {
                if (debounceTimer) clearTimeout(debounceTimer);
                if (reconcileTimer) clearTimeout(reconcileTimer);
                debounceTimer = null;
                reconcileTimer = null;
                if (source) {
                    try {
                        source.close();
                    } catch (_) {}
                    source = null;
                }
            },
        };
        try {
            window.__soluongWhSync = handle; // cho phép gọi tay từ console: __soluongWhSync.refreshAll()
        } catch (_) {}
        return handle;
    }

    window.SoluongWarehouseSync = { start };
})();
