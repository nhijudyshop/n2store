// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | WEB2.0 module.
// Sổ Order — orchestrator: init() boots state + caches + wires handlers + DOMContentLoaded. Re-export qua window.SoOrder. MOVE-only refactor từ file 5931 dòng.

(function () {
    'use strict';

    const SO = (window.SoOrder = window.SoOrder || {});

    SO.init = async function init() {
        // Skeleton trong lúc await load (IDB + Firestore seed) → hết "nháy trống" lần đầu.
        const _tb0 = document.getElementById('soTableBody');
        if (_tb0) {
            _tb0.innerHTML = Array.from({ length: 4 })
                .map(
                    () =>
                        '<tr class="so-skel-row"><td colspan="20" style="padding:10px 14px">' +
                        '<span class="w2-skel" style="display:block;height:42px;border-radius:10px"></span></td></tr>'
                )
                .join('');
        }
        // P1 2026-05-30: load() giờ async (IDB read). Await trước khi render.
        SO.state = await window.SoOrderStorage.load();
        SO.applyEditTableModeUi();
        SO.renderAll();

        // Deep-link focus: ?tab=<id> → switch tab; ?supplier=<name> → scroll + flash.
        // Runs after renderAll() so the DOM is ready. Web2Deeplink may be absent
        // (defensive guard) but is loaded before this script in index.html.
        (function _applyDeeplink() {
            const dl = window.Web2Deeplink;
            if (!dl) return;
            const _dlTab = dl.param('tab');
            const _dlSup = dl.param('supplier');
            if (!_dlTab && !_dlSup) return;
            // normalize('NFC'): param URL có thể decode ra NFD (dấu tách rời) còn data
            // lưu NFC → toLowerCase() không khớp. Chuẩn hoá cả 2 vế về NFC.
            const norm = (s) => (s || '').normalize('NFC').trim().toLowerCase();
            const target = _dlSup ? norm(_dlSup) : null;

            // Tìm tab + shipment chứa NCC trong state (so-order chỉ render TAB ACTIVE,
            // shipment có thể collapse → NCC ở tab khác / đợt thu gọn không có trong DOM).
            let owningTab = null;
            let owningSh = null;
            if (target) {
                for (const t of SO.state.tabs || []) {
                    for (const sh of t.shipments || []) {
                        if ((sh.rows || []).some((r) => norm(r.supplier) === target)) {
                            owningTab = t;
                            owningSh = sh;
                            break;
                        }
                    }
                    if (owningTab) break;
                }
            }
            // Tab đích: ưu tiên ?tab= hợp lệ, else tab chứa NCC.
            const wantTabId =
                _dlTab && (SO.state.tabs || []).some((t) => t.id === _dlTab)
                    ? _dlTab
                    : owningTab
                      ? owningTab.id
                      : null;

            const findInDom = () => {
                const rows = document.querySelectorAll(
                    '#soTableBody tr.so-data-row[data-supplier]'
                );
                for (const tr of rows) {
                    if (norm(tr.dataset.supplier) === target) return tr;
                }
                return null;
            };

            // FIX deep-link (2026-06-14): pull Postgres khi init chạy SAU _applyDeeplink
            // → reset activeTabId về cũ, làm switch tab 1 lần bị ghi đè. Retry tối đa
            // 6× / ~2.4s: mỗi lần RE-ASSERT tab đích + mở shipment, rồi scroll khi row
            // xuất hiện. Robust với cả timing lẫn reset; tự dừng khi tìm thấy.
            let tries = 0;
            const tick = () => {
                tries++;
                let changed = false;
                if (wantTabId && SO.state.activeTabId !== wantTabId) {
                    SO.state.activeTabId = wantTabId;
                    window.SoOrderStorage.setLocalActiveTab(wantTabId); // deep-link → per-device
                    changed = true;
                }
                if (owningSh && owningSh.collapsed) {
                    owningSh.collapsed = false;
                    changed = true;
                }
                // Deep-link tới NCC: bỏ lọc đợt (về "Tất cả") để dòng không bị ẩn.
                if (
                    target &&
                    window.SoOrderStorage.getActiveBatch(SO.state.activeTabId) !==
                        window.SoOrderStorage.ALL_BATCH
                ) {
                    window.SoOrderStorage.setActiveBatch(
                        SO.state.activeTabId,
                        window.SoOrderStorage.ALL_BATCH
                    );
                    changed = true;
                }
                if (changed) {
                    window.SoOrderStorage.save(SO.state);
                    SO.renderAll();
                }
                if (!target) return; // chỉ ?tab= → switch xong là đủ
                const found = findInDom();
                if (found) {
                    found.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    found.classList.add('w2-deeplink-flash');
                    setTimeout(() => found.classList.remove('w2-deeplink-flash'), 2400);
                    return;
                }
                if (tries < 6) {
                    setTimeout(tick, 400);
                    return;
                }
                if (window.notificationManager?.show) {
                    window.notificationManager.show(
                        'Không thấy dòng nào của NCC: ' + _dlSup,
                        'info'
                    );
                }
            };
            tick();
        })();

        SO.wireToolbar();
        SO.wireInlineImageModal();
        SO.wireModalTotals();
        SO.wireFooterInputs();
        if (SO.wireExpensesEditor) SO.wireExpensesEditor(); // CP inline (Sửa lô)
        if (SO.wirePaymentPanel) SO.wirePaymentPanel(); // Thanh toán CK (đợt)
        if (window.lucide?.createIcons) window.lucide.createIcons();

        // Web2ProductsCache — bật suggestion + badge cho modal tạo đơn.
        // Re-render modal rows nếu cache cập nhật (kho SP của máy khác)
        // để badge "Đã có ở kho" và tồn kho luôn đồng bộ realtime.
        //
        // SSE NOTE: KHÔNG cần subscribe trực tiếp 'web2:products' ở đây — cache
        // đã tự subscribe topic đó (web2-products-cache _setupRealtime) và emit
        // cho subscriber bên dưới. Badge tồn/"Đã có ở kho" tự cập nhật realtime
        // xuyên máy qua đúng 1 nguồn (cache), tránh double-listen.
        if (window.Web2ProductsCache) {
            window.Web2ProductsCache.init().then(() => {
                window.Web2ProductsCache.subscribe(() => {
                    if (SO.modalRows.length) {
                        // Chỉ cập nhật meta để không mất focus đang nhập
                        for (const r of SO.modalRows) SO.updateRowMeta(r.uid);
                    }
                });
            });
        }

        // Web2VariantsCache — bật picker cho cột Biến Thể.
        if (window.Web2VariantsCache) {
            window.Web2VariantsCache.init();
        }

        // Web2SuppliersCache — bật picker NCC cho input modal + inline edit.
        // Idempotent, fail-safe: nếu Firestore offline → cache rỗng, dropdown
        // chỉ gợi ý từ supplier names có trong state hiện tại.
        if (window.Web2SuppliersCache) {
            window.Web2SuppliersCache.init().catch(() => {});
        }

        // Firestore sync — local-first (so-order only):
        //   1. Init load Firestore once → seed localStorage + state
        //   2. Mutations: pushSync() debounced 400ms (no realtime listener)
        //   3. Pull-on-focus: visibilitychange/focus → Sync.pullOnce()
        //   4. Flush pending push on hide/unload
        // No onSnapshot — avoids re-render flicker on every local write.
        if (window.SoOrderStorage.Sync) {
            // Remote handler re-loads via SoOrderStorage.load() so the
            // migration (uiInitialized default-collapse, columnVisibility
            // back-fill, shipment shape heal) is always applied to any
            // FB-sourced data — otherwise raw payload would clobber the
            // post-migration state with un-migrated fields.
            const remoteHandler = async () => {
                // Tránh clobber edit đang gõ (audit LOW 2026-06-20): đang focus ô nhập
                // trong app → hoãn re-render, pull-on-focus (visibilitychange/focus)
                // lần sau sẽ áp remote. Conflict (có pending push) đã được
                // conflictHandler xử lý riêng nên đây chỉ là cửa sổ "đang gõ chưa push".
                const ae = document.activeElement;
                if (ae && (/^(INPUT|TEXTAREA|SELECT)$/.test(ae.tagName) || ae.isContentEditable)) {
                    return;
                }
                SO.state = await window.SoOrderStorage.load();
                SO.renderAll();
            };
            const conflictHandler = (loaded) => {
                // Local push pending while a newer remote arrived. Tell user
                // — let them choose to refresh (drop local edits) or keep
                // typing (their flush will overwrite remote).
                SO.notify(
                    'Có thay đổi từ máy khác. Refresh để xem (mất các sửa chưa lưu) hoặc giữ chỉnh sửa hiện tại.',
                    'warning'
                );
            };
            const ok = await window.SoOrderStorage.Sync.init(remoteHandler, conflictHandler);
            if (ok) {
                SO.state = await window.SoOrderStorage.load();
                SO.renderAll();
                // Push back so Firestore picks up the first-visit
                // migration (uiInitialized = true, default collapses).
                SO.pushSync();
            }

            // Pull when tab becomes visible (returning from another tab);
            // flush pending push when tab hides (so closing doesn't drop
            // the last debounced write).
            document.addEventListener('visibilitychange', () => {
                if (document.visibilityState === 'visible') {
                    window.SoOrderStorage.Sync.pullOnce();
                } else {
                    window.SoOrderStorage.Sync.flush();
                }
            });
            window.addEventListener('focus', () => {
                window.SoOrderStorage.Sync.pullOnce();
            });
            window.addEventListener('beforeunload', () => {
                window.SoOrderStorage.Sync.flush();
            });
        }
    };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', SO.init);
    } else {
        SO.init();
    }
})();
