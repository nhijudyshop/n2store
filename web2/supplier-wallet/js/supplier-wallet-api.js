// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | WEB2.0 module.
// Ví NCC — data layer: aggregation từ Sổ Order + server ledger calls (qua
// SupplierWalletStorage → /api/web2-supplier-wallet) + SePay deposit poll.
//
// Tách khỏi render/actions. Tham chiếu state + utils qua namespace `window.__SW`.

(function () {
    'use strict';

    const SW = (window.__SW = window.__SW || {});
    const _dbg = SW._dbg;

    // ---------- Aggregation ----------
    // 2026-06-16 (money-model): công nợ NCC phát sinh khi NHẬN HÀNG (received /
    // partial_received), KHÔNG phải lúc đặt ('ordered' đã khai tử). Net mỗi đơn =
    //   Σ(giá nhập × qty_bill × rate) − giảm giá + phí ship (per invoiceGroupId).
    // qty_bill: received → qty đặt đủ; partial_received → đúng phần đã nhận
    // (r.qtyReceived). 1 đơn (invoiceGroupId) = 1 NCC → adjustment gán thẳng NCC đó.
    function aggregateSuppliers(state) {
        const result = {};
        if (!state || !Array.isArray(state.tabs)) return result;
        const ensure = (supplier) => {
            if (!result[supplier]) {
                result[supplier] = { supplier, totalPurchased: 0, purchases: [] };
            }
            return result[supplier];
        };
        for (const tab of state.tabs) {
            const rate = SW.rateToVnd(tab.currency, tab);
            for (const sh of tab.shipments || []) {
                const groupSupplier = {}; // invoiceGroupId → NCC (đơn có hàng đã nhận)
                for (const r of sh.rows || []) {
                    const supplier = (r.supplier || '').trim();
                    if (!supplier) continue;
                    const st = r.status || 'draft';
                    if (st !== 'received' && st !== 'partial_received') continue; // chỉ tính khi đã nhận
                    const orderedQty = Number(r.qty) || 0;
                    const qty =
                        st === 'partial_received'
                            ? Math.min(Number(r.qtyReceived) || 0, orderedQty)
                            : orderedQty;
                    if (qty <= 0) continue;
                    const costVnd = (Number(r.costPrice) || 0) * rate;
                    const subtotal = qty * costVnd;
                    ensure(supplier).totalPurchased += subtotal;
                    ensure(supplier).purchases.push({
                        rowId: r.id,
                        shipmentId: sh.id,
                        tabId: tab.id,
                        tabLabel: tab.label,
                        date: sh.date,
                        productName: r.productName || '',
                        variant: r.variant || '',
                        qty,
                        costVnd,
                        subtotal,
                        status: st,
                    });
                    groupSupplier[r.invoiceGroupId || r.id] = supplier;
                }
                // Giảm giá / phí ship per-đơn — chỉ áp cho đơn có hàng ĐÃ NHẬN.
                const adjMap = sh.orderAdjustments || {};
                for (const [gid, sup] of Object.entries(groupSupplier)) {
                    const a = adjMap[gid];
                    if (!a) continue;
                    const net = (-(Number(a.discount) || 0) + (Number(a.shipping) || 0)) * rate;
                    if (net) ensure(sup).totalPurchased += net;
                }
            }
        }
        return result;
    }

    // Merge derived totals into wallet state. Update `totalPurchased` per supplier.
    function mergeAggregation(wallet, agg) {
        const allSuppliers = new Set([...Object.keys(wallet.wallets || {}), ...Object.keys(agg)]);
        let mutated = false;
        for (const supplier of allSuppliers) {
            const w = window.SupplierWalletStorage.getOrCreateWallet(wallet, supplier);
            const a = agg[supplier];
            const newTotal = a ? Math.round(a.totalPurchased) : 0;
            if (w.totalPurchased !== newTotal) {
                w.totalPurchased = newTotal;
                mutated = true;
            }
            window.SupplierWalletStorage.recalcBalance(w);
        }
        return mutated;
    }

    // ---------- Sync ----------
    function pushSync() {
        if (window.SupplierWalletStorage?.Sync) {
            window.SupplierWalletStorage.Sync.push(SW.walletState);
        }
    }

    // ---------- Deposits (SePay refund từ NCC → giảm balance) ----------
    async function pollDeposits() {
        const since = Number(SW.walletState.lastDepositSync) || 0;
        const deposits = await window.SupplierWalletStorage.fetchDeposits(since);
        if (!Array.isArray(deposits) || !deposits.length) return;
        const added = await window.SupplierWalletStorage.applyDeposits(SW.walletState, deposits);
        const maxTs = deposits.reduce((m, d) => Math.max(m, Number(d.ts) || 0), since);
        if (maxTs > since) {
            SW.walletState.lastDepositSync = maxTs;
            window.SupplierWalletStorage.save(SW.walletState);
        }
        if (added > 0) {
            SW.notify(`Cập nhật ${added} refund SePay từ NCC`, 'success');
            pushSync();
            SW.renderList();
            if (SW.activeSupplier && !document.getElementById('swDetailModal').hidden) {
                SW.openDetail(SW.activeSupplier);
            }
        }
    }

    // ---------- Load so-order data + merge + render ----------
    async function loadAndRender(caller) {
        SW.soOrderData = await window.SupplierWalletStorage.loadSoOrderData();
        // H5 fix 2026-06-11: loadSoOrderData() trả null khi lỗi load — nếu vẫn
        // aggregate/merge sẽ set totalPurchased=0 cho MỌI NCC rồi save + pushSync
        // đẩy state hỏng lên Firestore. Nguồn null → KHÔNG mutate/push, render
        // với state hiện có.
        if (SW.soOrderData == null) {
            console.warn(
                '[supplier-wallet] loadSoOrderData null — skip merge, render state hiện có'
            );
            _dbg(`loadAndRender(${caller || '?'}): soOrderData=NULL → skip merge`);
        } else {
            SW.suppliers = aggregateSuppliers(SW.soOrderData);
            const mutated = mergeAggregation(SW.walletState, SW.suppliers);
            _dbg(
                `loadAndRender(${caller || '?'}): soOrder tabs=${SW.soOrderData.tabs?.length}`,
                `agg NCC=${Object.keys(SW.suppliers).length}`,
                `walletState NCC=${Object.keys(SW.walletState.wallets || {}).length}`,
                `mutated=${mutated}`
            );
            if (mutated) {
                window.SupplierWalletStorage.save(SW.walletState);
                pushSync();
            }
        }
        SW.renderList(`loadAndRender:${caller || '?'}`);
        // Poll SePay deposits (refund từ NCC → giảm balance)
        pollDeposits().catch(() => {});
    }

    SW.aggregateSuppliers = aggregateSuppliers;
    SW.mergeAggregation = mergeAggregation;
    SW.pushSync = pushSync;
    SW.pollDeposits = pollDeposits;
    SW.loadAndRender = loadAndRender;
})();
