# Web 2.0 Flow Audit — Round 2 (2026-06-26)

> 2 workflow audit (delivery/reconcile + native→PBH/bulk/wallets/kpi). 13 defect xác nhận.

## Trạng thái

- ✅ **FIXED + integration-tested** (HIGH+MEDIUM, money/stock): #1 ví thu hộ áp-lại over-mint, #2 KNH... (xem R1), delivery sync on cancel, from-pbh dedupe, Sửa COD 2nd reject, create-time ví race lock, merged-PBH KPI revoke, dashboard net revenue, split merged-guard.
- ✅ **TẤT CẢ 13 FIXED** (kể cả 5 LOW: pollDeposits lookback, bulk-confirm native sync, processWithdraw 23505-recovery, returns deposit idemKey, matchSupplier ambiguity → manual). + SAVEPOINT chống poison tx delivery-sync.

## Chi tiết 13 finding

### [HIGH] [✅ FIXED] reconcile — applyWalletToUnpaidPbhs re-deduct on a partially wallet-paid PBH is swallowed by withdraw idempotency but still recorded as a new deduction → wallet over-mint on cancel

- 📄 `render.com/routes/fast-sale-orders.js` :56-66 (\_applyWalletToPbh), 80-128 (applyWalletToUnpaidPbhs), called from render.com/routes/sepay-webhook-core.js:91-95 and render.com/routes/v2/web2-balance-history.js:147
- 🔧 Make \_applyWalletToPbh honor idempotency AND stop colliding distinct deductions: (1) capture const wr = await processWithdraw(...); if (wr.alreadyProcessed) return out unchanged (deducted=0) so the caller never double-records; AND (2) use a unique referenceId per deduction instead of bare pbh.number (e.g. `${pbhRow.number}:${Date.now()}` or a monotonic seq), so a genuine second top-up deduction to the same PBH is NOT mistaken for the create-time one. Mirror the reassign pattern (web2-balance-his

### [MEDIUM] [✅ FIXED] delivery — PBH cancel/return does not sync linked delivery_invoices → delivery board shows a live shipment for a voided, restocked, refunded order

- 📄 `render.com/routes/delivery-invoices.js (and fast-sale-orders.js /cancel, reconcile.js return-failed, web2-returns.js)` :delivery-invoices.js:259 (only read of fast_sale_orders); fast-sale-orders.js cancel path (~2426 \_cancelPbhInTx) and web2-returns.js have ZERO references to delivery_invoices (grep returns nothing)
- 🔧 In the PBH-cancel transaction (fast-sale-orders.js \_cancelPbhInTx) and reconcile.js return-failed, after setting fast_sale_orders.state='cancel', also run within the SAME client/tx: `UPDATE delivery_invoices SET state='cancel', state_history = state_history || jsonb_build_object('from',state,'to','cancel','at',extract(epoch from now())*1000,'by','(pbh-cancel)') WHERE fso_number=$1 AND state NOT IN ('delivered','returned','cancel')` and emit web2:delivery. Conversely (lower priority) decide and d

### [MEDIUM] [✅ FIXED] delivery — from-pbh has no per-PBH dedupe — unlimited duplicate delivery invoices, each snapshotting full lines + full COD (over-stated quantity; latent COD double-count if delivery COD is ever summed)

- 📄 `render.com/routes/delivery-invoices.js` :251-355 (router.post('/from-pbh')); only guard is fso.state==='cancel' at 262-263
- 🔧 Add a guard in from-pbh before INSERT: if no explicit b.deliveryLines subset is provided (i.e. delivering the whole PBH), reject when a non-cancelled/non-returned delivery_invoice already exists for fso_number (SELECT 1 ... WHERE fso_number=$1 AND state NOT IN ('cancel','returned') LIMIT 1 → 409 'PBH đã có phiếu giao'). For genuine split shipping, track remaining quantity per line against prior deliveries and cap snapshotted qty/COD to the residual, so the sum of delivery COD/qty across a PBH ne

### [MEDIUM] [✅ FIXED] reconcile — Second 'Sửa COD / trừ công nợ khách' on the same source order is swallowed by withdraw dedupe but a phiếu still records the debit → wallet vs ledger desync

- 📄 `render.com/routes/web2-returns.js` :615-664 (van_de_shipper branch)
- 🔧 After processWithdraw, if (wd?.alreadyProcessed === true) reject with httpStatus 409 ('Đơn này đã có phiếu Sửa COD trừ công nợ — không thể trừ lần 2') or use a per-phiếu-unique referenceId (e.g. `${sCode}:${code}` or `${sCode}:${Date.now()}`) so distinct COD reductions on the same order each perform a real debit, and set walletCredited based on the actual withdrawn amount (0 when swallowed) rather than unconditionally -codReduction.

### [HIGH] [✅ FIXED] native-to-pbh — Wallet apply at PBH create reads STALE residual and does not lock the PBH row → races with deposit-driven applyWalletToUnpaidPbhs → wallet over-deducted / residual clobbered

- 📄 `render.com/routes/fast-sale-orders.js` :2156-2179 (TX2) and \_applyWalletToPbh 52-79
- 🔧 Inside TX2, before calling \_applyWalletToPbh, re-read and lock the PBH row in the same client: `const fresh = await client.query('SELECT * FROM fast_sale_orders WHERE id=$1 FOR UPDATE', [r.rows[0].id]);` and pass `fresh.rows[0]` (with its CURRENT residual) into \_applyWalletToPbh, then base payment_amount/wallet_deducted increments and residual on that locked value. This makes the create-time apply and applyWalletToUnpaidPbhs serialize on the same fast_sale_orders row lock, so the second path obs

### [HIGH] [✅ FIXED] pbh-bulk — Cancelling a MERGED PBH (bulk or single) from the PBH page never revokes its KPI — inflated actual_confirmed persists after restock+refund

- 📄 `render.com/routes/fast-sale-orders.js` :2620-2636 (def); called 929 (bulk-cancel) and 2602 (single cancel)
- 🔧 Make \_emitRevokeKpi split the source_code on '+' and revoke for all member codes, mirroring native-orders.js:2404-2416. Replace the single-value query with: `const codes = String(orderCode).split('+').map(s=>s.trim()).filter(Boolean); if(!codes.length) return;` then `WHERE e.order_code = ANY($1::text[]) AND e.event_type='actual_confirmed' AND NOT EXISTS(... )` passing `[codes]`. This is idempotent (the NOT EXISTS revokes_event_id guard already prevents double-revoke) and fixes both the bulk-canc

### [HIGH] [✅ FIXED] kpi — Dashboard revenue (today + 7d) never subtracts returns → overstates doanh thu

- 📄 `render.com/routes/v2/dashboard-kpi.js` :34-67
- 🔧 Subtract returns from the revenue figures. Add a parallel query summing web2_returns.total_amount (status='active') bucketed by VN day from created_at (BIGINT epoch ms via to_timestamp(created_at/1000) AT TIME ZONE 'Asia/Ho_Chi_Minh'), then set revenue_today = gross_done_today - refund_today and subtract per-day in revenue_7d. Mirror pbh-reports #12 (web2_returns status='active', NOT the dead refunds table). Minimum acceptable alternative: also return out.refund_today / out.refund_7d so the clie

### [MEDIUM] [✅ FIXED] native-to-pbh — from-native-order split=true bypasses the merged-PBH membership guard → a merged member can mint a standalone PBH that double-deducts stock + wallet

- 📄 `render.com/routes/fast-sale-orders.js` :1691-1721 (merged check gated by `existingPbhs.length===0 && !splitMode`) and 1738-2002
- 🔧 Run the merged-PBH membership check for split mode too (when src.status !== 'cancelled'): move the source_code membership query (1704-1721) so it executes whenever there is a live merged PBH containing src.code, and reject split (or fall through to idempotent) if found — i.e. change the guard to also cover splitMode for non-cancelled orders, e.g. `if (!splitMode || src.status !== 'cancelled') { /* check merged membership; if member of a live merged PBH → 409 'đơn đã nằm trong PBH gộp' */ }`. Mir

### [MEDIUM] [✅ FIXED] supplier-wallet-deposit — pollDeposits advances lastDepositSync past UNMATCHED deposits → NCC refund permanently lost if supplier name not yet in wallet at poll time

- 📄 `web2/supplier-wallet/js/supplier-wallet-api.js` :104
- 🔧 Advance lastDepositSync only past deposits that were successfully applied OR explicitly recognized-but-ignored. Simplest robust fix: persist a per-sepayId 'seen but unmatched' set and on each poll re-scan unmatched deposits against the current supplier list (re-fetch with a small lookback window instead of a hard high-water mark), so a later-created supplier still picks up its earlier refund. At minimum, do not advance lastDepositSync past a deposit that matched no supplier.

### [LOW] [✅ FIXED] pbh-bulk — POST /bulk-confirm (mark-DONE) omits native-order status sync that single /confirm performs

- 📄 `render.com/routes/fast-sale-orders.js` :827-849 (\_bulkStateChange); 863 (route)
- 🔧 Either remove the dead /bulk-confirm route, or make \_bulkStateChange for newState==='done' iterate the returned orders and call `syncNativeOrderStatusFromPbh(pool, row, 'done')` (+ emit web2:native-orders SSE) per order, matching the single /confirm handler, so a future re-enable of the bulk button does not silently desync native order status.

### [LOW] [✅ FIXED] customer-wallet — processWithdraw has no 23505 race-recovery (asymmetric with processDeposit) — concurrent same-referenceId withdraws across pooled connections surface a raw 500 instead of alreadyProcessed

- 📄 `render.com/services/web2-wallet-service.js` :343-450 (processWithdraw); contrast 307-337 (processDeposit 23505 recovery)
- 🔧 Mirror the processDeposit recovery: wrap the processWithdraw runWithTx in try/catch; on e.code==='23505' && !isClient, re-query web2_wallet_transactions WHERE type='WITHDRAW' AND reference_id=$1 AND reference_type=$2 and return {wallet, transaction: dup, alreadyProcessed:true}. Keep throwing for client (caller tx already aborted).

### [LOW] [✅ FIXED] customer-wallet — Returns create/cancel call processDeposit with both sourceId AND sepayId null → the credit has reference_id=NULL and NO idempotency key, relying solely on surrounding row locks

- 📄 `render.com/routes/web2-returns.js` :1062-1073 (van_de_khach create), 1349-1359 (cancel COD refund)
- 🔧 Pass the return `code` as sourceId so the deposit gets reference_type='balance_history' (or add a dedicated 'return-credit' refType) with reference_id=code, making it idempotent and covered by a unique index. For cancel-refund, pass the return code too. This converts the time-window guard into a hard DB invariant.

### [LOW] [✅ FIXED] supplier-wallet-deposit — matchSupplier name-substring matching can credit a NCC refund to the wrong supplier (no per-supplier sepayId binding)

- 📄 `web2/supplier-wallet/js/supplier-wallet-storage.js` :327
- 🔧 Bind matched supplier into the idempotency identity is wrong (would allow double credit); instead make attribution explicit: when content matches ≥2 candidate suppliers, skip auto-credit and surface for manual assignment, and provide a manual re-route action that reverses the mis-attributed payment (symmetric return/correction tx) rather than relying on substring heuristics alone.
