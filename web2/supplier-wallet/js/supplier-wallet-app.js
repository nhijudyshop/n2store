// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | WEB2.0 module.
// Ví NCC — app controller (orchestrator).
//
// Flow:
//   1. Load so-order data (read-only) → derive purchases per supplier
//   2. Load wallet state (with cleanup) → merge w/ derived
//   3. Render list cards
//   4. Detail drawer: chi tiết 1 NCC + tabs (purchases / history)
//   5. Return modal: chọn row(s) → tạo transaction `return`
//   6. Payment modal: nhập số tiền → tạo transaction `payment`
//
// REFACTOR 2026-06-18: tách thành 5 module nhỏ (state / api / render / actions /
// app). File này chỉ điều phối init + wire UI events + SSE. Logic nghiệp vụ +
// state nằm trong `window.__SW` (namespace nội bộ — KHÔNG public API). Public
// surface giữ NGUYÊN: chỉ window.SW_DEBUG + window.__swDebugLog (debug, do
// supplier-wallet-state.js đặt). Trang KHÔNG có inline onclick / external caller.

(function () {
    'use strict';

    const SW = (window.__SW = window.__SW || {});
    const _dbg = SW._dbg;
    const notify = SW.notify;

    function wireUi() {
        document.getElementById('swSearch').addEventListener('input', SW.renderList);
        document.getElementById('swSort').addEventListener('change', SW.renderList);
        // 2026-06-16: nút "Đồng bộ" đã bỏ — trang tự load realtime qua SSE (_sseConnect).
        document.getElementById('swCreateBtn')?.addEventListener('click', SW.openCreateModal);
        document.getElementById('swCreateConfirmBtn')?.addEventListener('click', SW.confirmCreate);
        document.getElementById('swCreateName')?.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                SW.confirmCreate();
            }
        });
        document.querySelectorAll('#swDetailModal .sw-tab').forEach((b) => {
            b.addEventListener('click', () => {
                SW.detailTab = b.dataset.detailTab;
                SW.renderDetailTabs();
            });
        });
        document.getElementById('swReturnBtn').addEventListener('click', SW.openReturnModal);
        document.getElementById('swReturnConfirmBtn').addEventListener('click', SW.confirmReturn);
        // 2026-06-28: swPayBtn / swPayConfirmBtn đã bỏ (thanh toán không còn ở Ví NCC).
        // Return modal interactions
        const returnBody = document.getElementById('swReturnBody');
        returnBody.addEventListener('change', (e) => {
            if (
                e.target.classList.contains('sw-return-check') ||
                e.target.classList.contains('sw-return-qty')
            ) {
                SW.recalcReturnTotal();
            }
        });
        returnBody.addEventListener('input', (e) => {
            if (e.target.classList.contains('sw-return-qty')) SW.recalcReturnTotal();
        });
        document.getElementById('swReturnSelectAll').addEventListener('change', (e) => {
            document.querySelectorAll('#swReturnBody .sw-return-check').forEach((c) => {
                c.checked = e.target.checked;
            });
            SW.recalcReturnTotal();
        });
        // Close handlers
        document.querySelectorAll('[data-sw-close]').forEach((el) => {
            el.addEventListener('click', () => {
                el.closest('.sw-modal')?.setAttribute('hidden', '');
            });
        });
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                document
                    .querySelectorAll('.sw-modal:not([hidden])')
                    .forEach((m) => (m.hidden = true));
            }
            // Task 6: Enter-to-submit for swReturnModal (swPayModal đã bỏ 2026-06-28).
            // swCreateModal already handles Enter on its own input.
            // Skip when isComposing (IME) or focus is in a <textarea>.
            if (e.key !== 'Enter' || e.isComposing) return;
            if (e.target.tagName === 'TEXTAREA') return;
            const openModal = document.querySelector('#swReturnModal:not([hidden])');
            if (!openModal) return;
            e.preventDefault();
            openModal.querySelector('.btn-primary')?.click();
        });
    }

    async function init() {
        _dbg('init: START');
        // P1 2026-05-30: SupplierWalletStorage.load() giờ async (IDB read)
        SW.walletState = await window.SupplierWalletStorage.load();
        _dbg(
            `init: loaded cache (IDB/localStorage) → wallets=${Object.keys(SW.walletState.wallets || {}).length}`,
            Object.keys(SW.walletState.wallets || {}).slice(0, 12)
        );
        const purged = window.SupplierWalletStorage.cleanupOldTransactions(SW.walletState);
        if (purged) window.SupplierWalletStorage.save(SW.walletState);
        wireUi();
        // Task 6 (2026-06-14): loading placeholder trước khi fetch so-order + aggregate.
        const _listEl = document.getElementById('swList');
        if (_listEl && !Object.keys(SW.walletState.wallets || {}).length) {
            _listEl.innerHTML =
                '<div style="padding:20px;text-align:center;color:#64748b;display:flex;flex-direction:column;align-items:center;gap:12px">' +
                Array.from({ length: 3 })
                    .map(
                        () =>
                            '<div class="w2-skel" style="width:100%;max-width:520px;height:76px;border-radius:12px"></div>'
                    )
                    .join('') +
                '<span style="font-size:13px;font-weight:500">Đang tải danh sách NCC…</span>' +
                '</div>';
        }
        // Web2ProductsCache để match productName → code khi adjust stock lúc trả hàng.
        // Init async không chặn render — return modal có check optional.
        if (window.Web2ProductsCache?.init) {
            window.Web2ProductsCache.init().catch(() => {});
        }
        await SW.loadAndRender('init');
        // Deep-link: ?supplier=<name> → auto-open detail drawer.
        // normalize('NFC'): tên NCC giữa các trang có thể khác Unicode form (NFC/NFD)
        // → so khớp trực tiếp `wallets[param]` fail. Tìm key đúng theo NFC.
        const _dlSup = window.Web2Deeplink?.param('supplier');
        if (_dlSup) {
            const nfc = (s) => (s || '').normalize('NFC').trim().toLowerCase();
            const target = nfc(_dlSup);
            const key = SW.walletState.wallets[_dlSup]
                ? _dlSup
                : Object.keys(SW.walletState.wallets || {}).find((k) => nfc(k) === target);
            if (key) {
                SW.openDetail(key);
            } else {
                notify('Không tìm thấy NCC: ' + _dlSup, 'warning');
            }
        }
        // Firestore sync
        const ok = await window.SupplierWalletStorage.Sync.init((remote) => {
            _dbg(
                `Sync.init REMOTE callback → replace walletState`,
                `remote wallets=${Object.keys(remote?.wallets || {}).length}`
            );
            SW.walletState = remote;
            window.SupplierWalletStorage.cleanupOldTransactions(SW.walletState);
            // FIX 2026-06-16: remote ledger thiếu totalPurchased (derive từ Sổ
            // Order) → re-merge aggregation đã có trong RAM để khỏi đè 0₫.
            if (SW.suppliers && Object.keys(SW.suppliers).length) {
                SW.mergeAggregation(SW.walletState, SW.suppliers);
            }
            SW.renderList('Sync.remote-callback');
            if (SW.activeSupplier && !document.getElementById('swDetailModal').hidden) {
                SW.openDetail(SW.activeSupplier);
            }
        });
        _dbg(`Sync.init resolved ok=${ok}`);
        if (ok) {
            SW.walletState = await window.SupplierWalletStorage.load();
            _dbg(
                `init: post-Sync reload from storage → wallets=${Object.keys(SW.walletState.wallets || {}).length}`
            );
            // FIX 2026-06-16: ledger server (Sync) KHÔNG lưu `totalPurchased` (nó
            // được DERIVE từ Sổ Order). Sau khi Sync ghi đè storage, walletState
            // mới có totalPurchased=0 cho mọi NCC → render bare sẽ "đè 0₫" lên số
            // thật vừa hiện ở render #1. Phải re-aggregate Sổ Order vào state mới
            // (giống path SSE ledger-reload) thay vì renderList trần.
            if (SW.suppliers && Object.keys(SW.suppliers).length) {
                const m = SW.mergeAggregation(SW.walletState, SW.suppliers);
                _dbg(`init: re-merge so-order agg sau Sync (mutated=${m})`);
                if (m) window.SupplierWalletStorage.save(SW.walletState);
            }
            SW.renderList('init:post-sync-reload');
            SW.pushSync();
        }
        if (window.lucide?.createIcons) window.lucide.createIcons();
        _sseConnect();
    }

    // SSE: realtime auto-refresh khi SePay webhook nhận tiền (refund từ NCC).
    // Server pipeline (hub Web 2.0): SePay webhook → web2-wallet-service →
    // web2WalletEvents → realtime-sse-web2.js broadcast key 'web2:wallet:<phone>'.
    // Subscribe wildcard 'web2:wallet:*' (server match prefix 'web2:wallet')
    // để nhận mọi event. Topic cũ 'wallet:all' KHÔNG tồn tại trên hub web2.
    //
    // Khác biệt với customer-wallet: NCC ít khi chuyển tiền cho shop (chỉ khi
    // refund/hoàn), nên rate event thấp. Cùng pattern, debounce 800ms.
    function _sseConnect() {
        if (!window.Web2SSE?.subscribe) {
            console.warn('[SupplierWallet-SSE] Web2SSE not loaded — skip realtime');
            return;
        }
        if (SW._sseUnsubs.length) return;

        // 1. web2:wallet:* — SePay deposit (refund từ NCC), wildcard prefix match
        SW._sseUnsubs.push(
            window.Web2SSE.subscribe('web2:wallet:*', (msg) => {
                if (SW._ssePollTimer) clearTimeout(SW._ssePollTimer);
                SW._ssePollTimer = setTimeout(async () => {
                    SW._ssePollTimer = null;
                    const phone = msg?.data?.phone;
                    const amount = msg?.data?.transaction?.amount;
                    console.log(
                        '[SupplierWallet-SSE] wallet_update:',
                        phone,
                        amount ? amount.toLocaleString('vi-VN') + 'đ' : ''
                    );
                    await SW.pollDeposits();
                }, 800);
            })
        );

        // PHASE A2: web2:products — stock change từ so-order / web2/products ảnh
        // hưởng công nợ NCC. Khi adjust-stock / upsert-pending / confirm-purchase
        // → reload supplier aggregation.
        const scheduleAggregateReload = (label) => () => {
            if (SW._sseReloadTimer) clearTimeout(SW._sseReloadTimer);
            SW._sseReloadTimer = setTimeout(async () => {
                SW._sseReloadTimer = null;
                console.log('[SupplierWallet-SSE] aggregate reload triggered by:', label);
                await SW.loadAndRender('sse:' + label);
            }, 1200);
        };
        SW._sseUnsubs.push(
            window.Web2SSE.subscribe('web2:products', scheduleAggregateReload('web2:products'))
        );
        // 2026-06-16: web2:so-order — đơn Sổ Order đổi (tạo/sửa/đổi status
        // draft→"Đã Đặt"/nhận/xóa) ảnh hưởng "Tổng mua" + danh sách NCC. Status
        // change KHÔNG fire web2:products (chỉ ghi web2_so_order) → phải nghe topic
        // này để aggregation tươi realtime, không cần bấm "Đồng bộ".
        SW._sseUnsubs.push(
            window.Web2SSE.subscribe('web2:so-order', scheduleAggregateReload('web2:so-order'))
        );
        // ĐỢT E: web2:supplier-wallet giờ là topic CHÍNH của server ledger —
        // máy khác ghi payment/return/tạo NCC → re-pull /state TRƯỚC rồi mới
        // derive lại so-order (loadAndRender một mình chỉ render ledger cũ).
        SW._sseUnsubs.push(
            window.Web2SSE.subscribe('web2:supplier-wallet', () => {
                if (SW._sseReloadTimer) clearTimeout(SW._sseReloadTimer);
                SW._sseReloadTimer = setTimeout(async () => {
                    SW._sseReloadTimer = null;
                    console.log('[SupplierWallet-SSE] ledger reload (web2:supplier-wallet)');
                    await window.SupplierWalletStorage.Sync.init();
                    SW.walletState = await window.SupplierWalletStorage.load();
                    await SW.loadAndRender('sse:ledger');
                    if (SW.activeSupplier && !document.getElementById('swDetailModal').hidden) {
                        SW.openDetail(SW.activeSupplier);
                    }
                }, 800);
            })
        );
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
