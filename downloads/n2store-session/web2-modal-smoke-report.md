# Web 2.0 Modal Smoke — click như user thật (mở modal Sửa + Lưu) — 2026-06-12

> Harness: persistent Playwright session (extension loaded) + HTTP API, click thật từng trang trong menu Web 2.0 (35 trang).
> Flow mỗi trang: nav → hook console.error/pageerror + wrap fetch (bắt mutation) → tìm nút Sửa (.act-edit / [data-act=edit] / title Sửa / icon pencil) → click → detect modal → bấm Lưu (CHỈ nút an toàn Lưu/Cập nhật — không đụng Xóa/Duyệt/Nạp/Rút/Gửi) → bắt status mutation + modal đóng.
> Bài học detector: (1) `offsetParent !== null` cho false-negative với modal `position: fixed` (w2p-popup); (2) modal class không chứa "modal" (`pm-overlay`) cần selector bổ sung; (3) nút title chứa "sửa" có thể là Lịch-sử/toggle (false positive).

## ✅ Modal Sửa + Lưu hoạt động (mutation 200, modal đóng, 0 lỗi) — 7 trang

| Trang                 | Nút                       | Mutation                                              |
| --------------------- | ------------------------- | ----------------------------------------------------- |
| web2/products         | .act-edit → Lưu           | PATCH 200 `web2-products/HCMM2DEN`                    |
| web2/variants         | .act-edit → Lưu           | PATCH 200 `web2-variants/123`                         |
| web2/customers        | [data-act=edit] → Lưu     | PATCH 200 `web2/customers/2556`                       |
| web2/product-category | [data-act=edit] → Lưu     | PATCH 200 `web2/productcategory/update/CAT-TEST-LINK` |
| web2/delivery-zone    | [data-act=edit] → Lưu     | PATCH 200 `web2/deliveryzone/update/ship-tinh`        |
| web2/supplier-debt    | title Sửa → "Lưu ghi chú" | POST 200 `web2-supplier-wallet/suppliers`             |
| web2/printer-settings | [data-act=edit] → Lưu     | PATCH 200 `web2/printer/update/prn_2bc6286f`          |

## ✅ Đúng thiết kế (không phải bug)

- **fastsaleorder-invoice (PBH)**: row không có nút Sửa (PBH đã chốt). Modal "Chi tiết" (popup w2p, position:fixed) mở tốt — hiện "Phiếu bán hàng NJ-20260609-0004".
- **so-order**: edit **inline** (toggle "edit toàn bảng" → renderAll; double-click ô để sửa lẻ), KHÔNG dùng modal. Đợt "Đã nhận" khoá read-only (`edit = editTableMode && r.status !== 'received'` — so-order-app.js:776) — view hiện tại chỉ có đợt Đã nhận nên 0 ô editable là ĐÚNG nghiệp vụ.
- **balance-history**: 50 rows, action là nghiệp vụ tiền (Gán KH / Duyệt) — cố ý KHÔNG bấm trong smoke (money ops).
- **purchase-refund**: 6 rows, flow picker/duyệt — không có row-edit modal.

## ⬜ Trống data → không có gì để edit (trang load sạch, 0 lỗi)

native-orders ("Không có đơn nào khớp bộ lọc"), customer-wallet, supplier-wallet, returns, reconcile.

## 🔐 Cần đăng nhập Web 2.0 (browser test chưa có `web2_auth` token — hành vi ĐÚNG sau đợt G auth)

users ("Chưa có user nào."), kpi, notifications — list gate bằng x-web2-token; muốn test sâu phải login Web2Auth trong browser test.

## ⬜ Dashboard / report / admin — không có edit UI (đúng)

overview, dashboard-kpi, audit-log, ck-dashboard, photo-studio, users-permissions, admin-sse-monitor, services-dashboard, report-revenue, report-delivery, livestream-poller, pancake-settings, fastsaleorder-refund, fastsaleorder-delivery, live-chat, chat-pancake.

## Kết luận

- **0 lỗi console / page error trên cả 35 trang. 0 mutation lỗi (4xx/5xx/NETERR).**
- 3 trang bị flag ban đầu (pbh-invoice, so-order, printer-settings) đều là **false positive của harness**, đã verify tay từng trang → hoạt động đúng.
- Raw JSON: `/tmp/web2-modal-smoke-results.json` (vòng 1), harness: `/tmp/web2-modal-smoke.cjs` + `/tmp/web2-modal-smoke2.cjs`.
