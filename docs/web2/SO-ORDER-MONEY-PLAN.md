<!-- #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | WEB2.0 — kế hoạch feature tiền/chi phí/thanh toán so-order. -->

# Kế hoạch: so-order — Chi phí + Thanh toán CK + Stat cards + Tab Đợt

> Trạng thái: **DESIGN LOCKED 2026-06-28** (user chốt 4 quyết định). Build theo stage, commit từng stage. Đây là tracker sống — tick ✅ khi xong từng stage.

## Quyết định đã chốt (user)

1. **Tab Đợt = tab CẤP 2 dưới địa danh.** Địa danh (HÀ NỘI/HƯƠNG CHÂU) GIỮ tiền tệ + tỷ giá. Dưới dải tab địa danh, thêm dải tab **Đợt**: đợt **mới nhất ở đầu**, **"Tất cả" ở cuối**. Chọn đợt → lọc bảng + stat cards + thanh toán theo đợt đó; "Tất cả" = tổng hợp mọi đợt.
2. **CÒN LẠI = còn phải thanh toán** = `(TỔNG HĐ + TỔNG CP) − TỔNG TT`.
3. **THANH TOÁN CK ghi vào module NCC** — POST `web2_supplier_ledger` (type=`payment`) kèm `ref={tabId, shipmentId, batch, source:'so-order'}`. Mỗi thanh toán gắn 1 NCC; đợt nhiều NCC → chọn NCC khi thêm. → Ví NCC + Công nợ NCC tự trừ nợ, realtime.
4. **Chi phí (CP) = danh sách dòng**: mỗi dòng `{id, label, amount, note}` (vd Ship nội địa / Phí gom / Thuế). Bố cục cạnh "Ghi chú CP" sẵn có.

## Mô hình tiền (đơn vị)

- so-order lưu tiền theo **tab currency** + `tab.rate`; ledger NCC lưu **VND canonical**. Quy đổi bằng `toVnd`/`rateToVnd(tab.currency, tab)` khi so sánh.
- **Stat cards (theo đợt đang chọn, hoặc tổng nếu "Tất cả")** — hiển thị theo tab currency + ≈VND:
    - **TỔNG KG** = Σ `weightKg` (getShipmentAdjustTotals).
    - **TỔNG HĐ** = Σ `contractAmount` (Tiền HĐ) các đơn trong đợt.
    - **TỔNG CP** = Σ `expenses[].amount` (mới).
    - **TỔNG TT** = Σ payments ledger có `ref.shipmentId` thuộc đợt (đọc /state, lọc ref).
    - **CÒN LẠI** = (HĐ + CP) − TT. Màu đỏ nếu > 0 (design-quality: không pill đồng nhất).

## Nguồn (research 2026-06-28, file:line)

- Blob: `web2_so_order.data` JSONB; route `render.com/routes/web2-so-order.js` (/get :76, /save :120). Mở rộng shape thoải mái (beta).
- Shipment shape + per-đơn adjust: `so-order/js/so-order-storage.js:536-580` setOrderAdjustment (discount/shipping/weightKg/caseCount/contractAmount theo invoiceGroupId), `:582+` getShipmentAdjustTotals.
- Footer totals: `so-order/js/so-order-render.js:791-825` renderFooterTotals.
- Tab strip render: `so-order/js/so-order-render.js:26-51` renderTabStrip; markup `so-order/index.html:74-134`.
- Ledger NCC: table `web2_supplier_ledger` (`render.com/routes/web2-supplier-wallet.js:76-90`), POST `/tx` (:212-419) type=payment, idempotent `tx_id`, `ref` JSONB freeform, `moveName` PAY/<year>/<seq>. GET `/state` (:123-177) trả wallets{supplier:{transactions[]}}.
- Client helper post payment: `web2/supplier-debt/js/supplier-debt-api.js:174-218 recordPayment()` (reuse được).
- Debt math (tham khảo): `web2/supplier-debt/js/supplier-debt-api.js:244-395` = Σ(received qty×cost) − giảm + ship − payments − returns, **per NCC**. (Lưu ý: contractAmount/HĐ KHÔNG vào debt hiện tại — feature này hiển thị HĐ riêng.)
- SSE: subscribe `web2:supplier-wallet` để TT đồng bộ; `web2:so-order` cho CP/đợt.

## Stages

- [x] **S1 — Data model (blob)** ✅ 2026-06-28: thêm `sh.expenses:[{id,label,amount,note,createdAt}]` + APIs `addExpense/updateExpense/deleteExpense/getShipmentExpenseTotal` (so-order-storage.js, additive + lazy default; storage bumped `?v=20260628v`). Chưa có consumer UI (S3/S4 sẽ dùng).
- [ ] **S2 — Tab Đợt cấp 2**: state `activeBatchId` per-device (như activeTabId); render dải tab đợt (đợt = nhóm shipment theo batch, mới nhất đầu, "Tất cả" cuối) dưới tab địa danh; lọc `renderTableBody` theo đợt đang chọn. Sort + "Tất cả".
- [ ] **S3 — Stat cards**: thay `.so-totals` bằng dải 5 card (KG/HĐ/CP/TT/CÒN LẠI) theo đợt đang chọn; aggregator mới `getBatchTotals(batch)` (HĐ+KG từ adjust, CP từ expenses, TT từ ledger cache). CÒN LẠI màu đỏ nếu >0.
- [ ] **S4 — CP UI**: danh sách dòng chi phí trong modal "Sửa lô" cạnh per-order meta (#soPerOrderMetaWrap) + dòng tóm tắt CP ở shipment header. Inline add/edit/delete (Web2NumberInput cho amount).
- [ ] **S5 — THANH TOÁN CK**: panel/modal "Thanh toán CK" theo đợt (date + amount + note + chọn NCC nếu >1). POST ledger qua recordPayment (await + loading + rollback toast — money op exception). Đọc lại /state lọc ref→TỔNG TT. Subscribe `web2:supplier-wallet` refresh. Audit log.
- [ ] **S6 — Verify**: browser-test full (tạo đợt, thêm CP, thanh toán CK → kiểm Ví/Công nợ NCC trừ đúng, stat cards khớp, cross-page).

## Gotchas

- Money op KHÔNG dùng Web2Optimistic fire-and-forget (CLAUDE.md rule 8) — giữ await + loading + rollback.
- Payment idempotent `tx_id` sinh lúc mở modal (tránh double-click/đa máy). `moveName` server tự sinh.
- Đợt nhiều NCC: TT per (đợt + NCC). Hiển thị TT tổng đợt = Σ payments mọi NCC của đợt.
- FX: CÒN LẠI quy về VND để so payment (ledger VND) vs HĐ/CP (tab currency × rate).
- "Tất cả" tab: stat cards = tổng mọi đợt; bảng = toàn bộ (như hiện tại).
