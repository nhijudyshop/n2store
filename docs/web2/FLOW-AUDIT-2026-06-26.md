# Web 2.0 Flow Audit — 2026-06-26

> Nguồn: workflow audit 19 agent (trace 6 luồng + adversarial verify). 12 defect xác nhận.
> Luồng: nhận hàng → tạo PBH → hủy PBH → trả hàng KH → thu về PBH → trả hàng NCC + 2 report.

## Trạng thái

- ✅ **Đã fix** (contained, đã test): #1, #8 (nhận hàng), #9 (hủy PBH restock), #10 (report kho merge), #12 (report doanh thu refunds KPI). #11 (comment) cập nhật.
- ⏳ **Defer — cần focused + integration test seeded flow** (đụng money/stock transaction, KHÔNG rush): #2/#7 (KNH double-restock), #6 (native partial restock), #3/#4/#5 (ví NCC over-mint / cap).

## Chi tiết 12 finding

### #1 [HIGH] [✅ FIXED] — receive

**Confirm-receive deficit lookup drops supplier → cross-supplier stock misattribution + wrong-code confirm**

- 📄 `so-order/js/so-order-receive.js` :582-600 (lookup), 596-597 (code overwrite)
- 🔎 confirmReceiveFromModal builds freshState via `_lookupProductStateForRows(itemsToProcess.map(it => ({ id: it.key, productName: it.name, variant: it.variant })))` — supplier is NOT passed (line 583-587). Inside \_lookupProductStateForRows (lines 51-54) the supplier key `sk = nv + '|' + norm(r.supplier||'')` becomes `nv|''` which misses idxBySup, so it falls back to `idxByNV.get(nv)` = FIRST product with that name+variant across ALL suppliers (first-match-wins, line 47). The server treats (name,variant,supplier) as distinct identities (web2-products.js:1432 match adds supplier; comment 'A1AODO ≠
- 🔧 Pass supplier into the confirm-path lookup so it uses the same (name|variant|supplier) index as the modal: change line 583-587 to `itemsToProcess.map((it) => ({ id: it.key, productName: it.name, variant: it.variant, supplier: it.supplier }))`. This makes \_lookupProductStateForRows hit idxBySup and return the correct per-NCC product's code/pendingQty, so it.code (line 597) and upsertQty (line 599) target the right web2_products row.

### #2 [HIGH] [⏳ DEFER] — return-customer

**khong_nhan_hang (full return) double-restocks units already returned via a prior thu_ve_1_phan (stock leak)**

- 📄 `render.com/routes/web2-returns.js` :699, 941-943
- 🔎 For subType='khong_nhan_hang', items is set to the FULL source order_lines: `items = src.items.filter(...)` (line 699). At lines 941-943 `_applyStock(client, items, method, +1)` restocks every order line in full and NEVER consults the source PBH's `returned_line_qty`. But a prior `thu_ve_1_phan` on the same PBH already (a) added +stock for the returned qty (line 942 in that path) and (b) recorded `returned_line_qty[code] += q` on the PBH (lines 949-978) precisely so cancel-time restock would not double count. The dup-guard at lines 808-813 only blocks two active `khong_nhan_hang` per source or
- 🔧 In the khong_nhan_hang branch, before \_applyStock, subtract any already-returned qty recorded on the source PBH. When sourceOrderType='pbh', within the transaction read source PBH `returned_line_qty` (FOR UPDATE, as already done for thu_ve_1_phan at lines 955-959) and reduce each item's restock quantity by the recorded returned amount: `restockItems = items.map(it => ({...it, quantity: Math.max(0, it.quantity - (returnedMap[it.productCode]||0))}))`, then call `_applyStock(client, restockItems, method, +1)`. Because khong_nhan_hang sets stock_restored=TRUE and zeroes the line, also clear return

### #3 [HIGH] [⏳ DEFER] — supplier-refund

**quick-refund supplier return is NOT capped by received quantity → stock leak + supplier-wallet over-mint**

- 📄 `render.com/routes/purchase-refund.js` :461-487 (else branch), 546 (deductStock); client web2/purchase-refund/js/purchase-refund-actions.js:210, web2/purchase-refund/js/purchase-refund-api.js:172-173
- 🔎 The only live supplier-return UI path (purchase-refund quick/bulk) clamps return qty ONLY by current web2_products.stock (actions.js:210 `Math.min(item.stock, qty)`; api.js:172 `stock = matched.stock`), and sends `products` keyed by product CODE with NO `rowReturns`. web2_products.stock is one row per (name+variant) CODE, SHARED across all suppliers/shipments (so-order-kho-sync.js stockIndex keyed by name|variant; receive does stock += received per code). So if 'Áo Trắng' was received 5 from supplier A + 5 from supplier B (stock=10), a user on supplier A's refund can return qty=10 (passes clie
- 🔧 Make quick-refund enforce a per-so-order-row received cap on the live (code-keyed) path, not just an amount cap. Build a server-authoritative remaining-returnable map per CODE = Σ received (loadSoOrderCostByCodeMap already joins so-order received rows to product code; extend it / add loadSoOrderReceivedQtyByCodeMap) MINUS already-returned for that code (sum web2_supplier_meta.returned_row_ids across rows mapping to that code, or a new per-code returned counter). In the else branch, reject/cap when `lqty > (receivedByCode[code] - alreadyReturnedByCode[code])`. Additionally have the purchase-ref

### #4 [HIGH] [⏳ DEFER] — supplier-refund

**Cross-page desync: purchase-refund returns never update returned_row_ids → Ví NCC lets the same goods be returned again**

- 📄 `render.com/routes/purchase-refund.js` :461-487; consumer web2/supplier-wallet/js/supplier-wallet-actions.js:107-109 & supplier-wallet-api.js:46-58
- 🔎 The supplier-wallet return modal computes remaining-returnable per row as `received - returnedRowIds[rowId].qty` (supplier-wallet-actions.js:33-34 `already = returnedRowIds[p.rowId].qty; remaining = p.qty - already`) and the server /tx caps newQty by received and persists into web2_supplier_meta.returned_row_ids. But the LIVE purchase-refund quick-refund path (the primary UI) returns goods WITHOUT ever writing returned_row_ids (the rowReturns branch at line 582 is never reached because the UI sends no rowReturns — actions.js:249-264 / 448-463 omit it). So after a user returns 5 units of a row
- 🔧 Unify the two return paths on one cap source. Easiest correct fix: have purchase-refund quick-refund resolve each product CODE back to its so-order rows and write returned_row_ids (qty+amount) under the same row.id keys the supplier-wallet path uses, inside the same transaction (the lib already loads so-order rows; reuse it to map code→rowId(s) and allocate the returned qty across received rows). Then both the purchase-refund cap and the supplier-wallet `remaining = received - returnedRowIds.qty` read the same accumulated state, preventing double-return.

### #5 [HIGH] [⏳ DEFER] — supplier-refund

**Amount cost-cap silently fails-open whenever any line's cost is unresolved, allowing wallet over-credit on the live path**

- 📄 `render.com/routes/purchase-refund.js` :470-486
- 🔎 In the no-rowReturns else branch, `allHaveCost` is set false and the loop `break`s the moment ONE line's cost can't be resolved from so-order (costByCode.get(lcode) missing — happens whenever a product's name+variant doesn't normalize-match a received so-order row, e.g. SP synced before so-order match, renamed variant, or so-order wiped). When allHaveCost=false the entire amount cap is skipped (`if (allHaveCost && costCap>0 && amount > costCap*1.01)`), so the ledger credits the FULL client-supplied amount with no cap. Combined with the price the UI sends being `item.price` (actions.js:260 send
- 🔧 Cap per-line independently instead of all-or-nothing: for each line apply min(client lineAmount, qty×costByCode[code]) where cost is known, and for lines with unknown cost fall back to a conservative bound (e.g. require cost or reject that line) rather than skipping the cap for the entire phiếu. Mirror the per-row cappedRowAmount logic already used in the rowReturns branch (line 626-632) on the code-keyed branch.

### #6 [HIGH] [⏳ DEFER] — report-revenue

**Partial customer return (thu_ve_1_phan) against a NATIVE order over-restocks when the linked PBH is later cancelled**

- 📄 `render.com/routes/web2-returns.js` :941-978 (stock credited at 941-943; returned_line_qty guard at 949-954)
- 🔎 On create of a thu_ve_1_phan return, stock IS credited whenever the source already deducted stock: for sourceOrderType==='native' line 932-938 sets `sourceDeductedStock = pbhChk.rows.length > 0` (a live PBH exists), then line 941-943 `if (sourceDeductedStock) await _applyStock(client, items, method, +1)` adds the returned qty to web2_products.stock. The compensating `returned_line_qty` write that protects against double restock is gated `sourceOrderType === 'pbh'` ONLY (line 949-954: `subType==='thu_ve_1_phan' && sourceOrderType === 'pbh' && ...`). So when the partial return references the NAT
- 🔧 Drop the `sourceOrderType === 'pbh'` restriction on the returned_line_qty write. When `subType==='thu_ve_1_phan' && sourceDeductedStock` and the source is a native order, resolve the live PBH(s) for that native code (same query already used at lines 932-938 / 928) and add the returned qty into each PBH's returned_line_qty (allocating per code), exactly as the pbh branch does. Mirror the reverse on DELETE (lines 1381-1410) for the native-sourced case too. Alternatively, record returned_line_qty keyed on whichever PBH(s) actually hold the line, regardless of whether the return referenced the nat

### #7 [HIGH] [⏳ DEFER] — report-warehouse

**KNH (không nhận hàng) over-restocks the qty already returned by a prior thu_ve_1_phan → phantom stock leak**

- 📄 `render.com/routes/web2-returns.js` :699, 941-943 (items source 697-699; \_applyStock +1 at 942)
- 🔎 For subType='khong_nhan_hang', items = src.items.filter(...) where \_resolveSourceOrder (line 314-374) returns the FULL order_lines / native products quantities and never subtracts returned_line_qty. The handler then calls `_applyStock(client, items, method, +1)` (line 942) adding the full ordered qty back to stock. But thu_ve_1_phan on the same source already restocked part of it: it does \_applyStock(+1) for the partial qty AND, for pbh-source, records returned_line_qty[code] (lines 949-978) — yet KNH ignores returned_line_qty entirely. Scenario: PBH line X qty=10 (stock -10 at create). thu_ve
- 🔧 In the KNH branch, mirror restockOrderLines: before \_applyStock(+1), read the source PBH's returned_line_qty (for pbh-source) and subtract it from each item's quantity so already-returned units are not restocked again. For native source, track partial returns per source order (e.g. a returned_qty map on native_orders or sum of active thu_ve_1_phan items for that source_order_code) and subtract likewise. Alternatively, block creating KNH when an active thu_ve_1_phan exists for the same source_order_code (extend the dup-check at lines 808-820 to also detect prior partial returns and reconcile),

### #8 [MEDIUM] [✅ FIXED] — receive

**Pending double-count when Web2ProductsCache.refresh()/lookup fails on confirm-receive of an already-partially-received row**

- 📄 `so-order/js/so-order-receive.js` :580-600 (try/catch fallback), 598-600
- 🔎 The H15 double-pending guard depends ENTIRELY on freshState being populated. Lines 580-592 wrap `Web2ProductsCache.refresh()` + lookup in try/catch; on ANY failure (network, cache error) freshState stays an empty Map, so `ps` is undefined and line 600 falls back to `upsertQty = it.qty` (the FULL ordered qty) — it does NOT subtract it.alreadyReceived or it.remainingPending that the modal already computed. For a row previously partially received (web2_products already has pending = remaining, e.g. ordered 10, got 5, pending=5), upsert-pending then does `pending_qty += 10` (web2-products.js:1526)
- 🔧 When freshState lookup fails, do NOT blindly upsert the full ordered qty. Use the already-known modal state as the floor: `const upsertQty = ps ? Math.max(0, received - Number(ps.pendingQty||0)) : Math.max(0, received - Number(it.remainingPending||it.qty||0));` so the top-up never exceeds what is actually missing. Better: if the SP already has a code (it.code from the modal lookup) skip upsert entirely and go straight to confirm-purchase-partial, OR abort with an error toast instead of falling back to the qty-gốc path that re-introduces the H15 phantom pending.

### #9 [MEDIUM] [✅ FIXED] — pbh-create-cancel

**Stock leak on cancel: returned_line_qty subtracted per-LINE instead of per-CODE when a PBH has duplicate-code order_lines**

- 📄 `render.com/routes/fast-sale-orders.js` :601-613 (restockOrderLines); duplicate-code lines produced at 1717-1730 + 1760-1778 (from-native-order)
- 🔎 restockOrderLines loops order_lines and computes restockQty = max(0, line.qty - returnedMap[code]) PER LINE, where returnedMap = orderRow.returned_line_qty keyed by code. If two order_lines share the same productCode (which from-native-order reliably creates: it appends each b.returnLines item as a SEPARATE 0đ line at 1764 with productCode = rl.productCode, and does NOT dedup src.products), the per-code returned qty is subtracted once for EACH duplicate line. Example: PBH has line A {X, qty 2} and line B {X, qty 0-priced exchange, qty 2}; a thu_ve_1_phan on this PBH sets returned_line_qty[X]=1
- 🔧 Aggregate line quantities per code BEFORE subtracting the per-code returned qty exactly once. Replace the per-line loop in restockOrderLines (601-613) with: build needByCode = Map(code -> Σ line.qty) from order_lines; then for each [code, totalQty]: restockQty = max(0, totalQty - (Number(returnedMap[code])||0)); if >0 UPDATE web2_products stock += restockQty WHERE code=code; push {code, qty}. This makes restock correct regardless of duplicate-code lines and matches the per-code semantics of returned_line_qty. (Alternatively, also dedup order_lines by code in from-native-order like the merge pa

### #10 [MEDIUM] [✅ FIXED] — report-warehouse

**Warehouse report buy↔sell never merge: receive/sync flows do not persist matchedCode on so-order rows**

- 📄 `render.com/routes/web2-warehouse-report.js` :138, 141-143 (buy key from r.matchedCode); 184-191 (sell key from productCode)
- 🔎 The report keys MUA VÀO by `code = normCode(r.matchedCode)` → 'C:'+code, falling back to 'N:'+name|variant when matchedCode is empty. BÁN RA is keyed by productCode → 'C:'+code (PBH order_lines always carry productCode, confirmed fast-sale-orders.js:1720, native-orders.js:2884). But the receive flow (so-order/js/so-order-receive.js confirmReceiveFromModal) only calls updateRow with {status, qtyReceived} (lines 705-708) and never writes the resolved kho code back to row.matchedCode; so-order-kho-sync.js syncRowsToKho/\_assignKhoCodes likewise never persist it; so-order-render.js resolves the cod
- 🔧 Persist the resolved kho code onto the so-order row at receive/sync time: in confirmReceiveFromModal write `matchedCode: codeByKey.get(it.key)` in the updateRow patch (it already has codeByKey), and have syncRowsToKho store the upsert result code onto the row. Alternatively, make the report join name-keyed buy rows to web2_products by normalized (name,variant)→code (reuse lib/web2-so-order-qty.js loadSoOrderCostByCodeMap's codeByKey approach) before bucketing, so buy and sell collapse onto the same code key and pick up canonical supplier/region.

### #11 [LOW] [📝 COMMENT] — pbh-create-cancel

**Stale/incorrect KNOWN-LIMITATION comment misdescribes residual restock risk for thu_ve_1_phan**

- 📄 `render.com/routes/web2-returns.js` :854-858
- 🔎 The comment claims that because thu_ve_1_phan does not reduce PBH order_lines, 'nếu SAU ĐÓ huỷ TOÀN BỘ PBH nguồn thì restockOrderLines restock cả dòng đã trả → over-restock'. This is inaccurate: the returned_line_qty mechanism added the SAME day (web2-returns.js:944-977 writing returned_line_qty, consumed by fast-sale-orders.js:597-606) already subtracts the returned qty at restock time, so for the normal single-line case there is NO over-restock. The genuine residual defect is the OPPOSITE — an UNDER-restock (leak) in the duplicate-code case (see finding 1). Leaving the comment as-is hides th
- 🔧 Update the comment to reflect reality: over-restock is prevented by returned_line_qty; the remaining edge case is under-restock when the source PBH carries duplicate-code order_lines (the returnLine appended at fast-sale-orders.js:1764 collides with a sale line). Point to the per-code aggregation fix in restockOrderLines (finding 1) as the resolution.

### #12 [LOW] [✅ FIXED] — report-revenue

**pbh-reports /summary refunds total still reads the dead legacy `refunds` table, never web2_returns**

- 📄 `render.com/routes/pbh-reports.js` :87-98 (rf query) and 122-126 (response)
- 🔎 The 'Trả hàng hoàn thành' KPI sums `SELECT COUNT(*), SUM(amount_refund) FROM refunds WHERE state='completed'`. The entire legacy refunds flow is retired: POST /api/refunds/from-pbh returns 410 (refunds.js:236-242) and the real customer-return data now lives in web2_returns (web2-returns.js). So this KPI reflects only stale pre-migration rows and will read 0 / frozen for all current returns, understating refund activity. Not a data-corruption bug (read-only), but the dashboard number is wrong/misleading.
- 🔧 Point the refunds KPI at web2_returns (e.g. SUM(wallet_credited) or total_amount for status='active' within window, or COUNT by sub_type) instead of the dead `refunds` table, matching the source the rest of Web 2.0 actually writes to.
