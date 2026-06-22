# Web 2.0 — Per-record History Rollout Tracker

> Auto từ audit workflow 2026-06-22. Module: `Web2AuditLog.openRecord({entityId, entity?, title})`. Backend sink: `recordAuditEvent`.
> ✅ XONG | ⬜ chưa | 🔌 cần wire backend route vào sink trước

## Đã xong (reference)

- ✅ native-orders (entity=native-order, 🕘 per-đơn)
- ✅ so-order (entity=so-order, nút Lịch sử toolbar)

## Cần history — frontend-only (data đã chảy: sink ĐÃ wire hoặc đã trong union)

- ⬜ products — entity=`product` id=`row.code` (union web2_product_history) → Thêm nút 🕘 vào cụm action THAO TÁC mỗi dòng bảng (cạnh nút Sửa/Xóa). Bấm → gọi Web2AuditLo
- ⬜ product-category — entity=`productcategory` id=`r.code || r.name` (sink) → Thêm nút 🕘 vào cụm thao tác mỗi dòng (cạnh nút Sửa/Xóa đã có sẵn ở page-builder). Bấm → gọ
- ⬜ customers — entity=`customer` id=`row.id` (sink) → Thêm nút 🕘 'Lịch sử' vào menu hành động (dropdown) trên mỗi dòng khách hàng trong bảng (#w
- ⬜ web2/purchase-refund — entity=`purchase-refund` id=`row.code` (sink) → Thêm nút 🕘 Lịch sử vào cụm action bên trái mỗi dòng phiếu trong danh sách (section.pr-list
- ⬜ web2/reconcile — entity=`pbh` id=`pbh.number` (union fast_sale_order_history) → Reconcile đã có audit log riêng (pbh_fulfillment_logs table). Thêm nút 🕘 Lịch sử để xem au
- ⬜ web2/returns — entity=`return` id=`row.code` (sink) → Returns trang có 3 tab (Tạo, Danh sách, Chờ duyệt). Tab Danh sách (panel-list) hiển thị ta
- ⬜ fastsaleorder-invoice — entity=`pbh` id=`o.number` (union fast_sale_order_history) → Nút 🕘 lịch sử hiện tại đã có trong action cùm mỗi dòng (pbh-render.js dòng 71), gọi PbhApp
- ⬜ delivery-zone — entity=`deliveryzone` id=`record.code` (sink) → Thêm nút 🕘 vào cụm action trong danh sách bảng (page-builder render bảng tự động từ config
- ⬜ kpi — entity=`kpi-assignment` id=`campaign_name` (sink) → Tab 'Lịch sử thao tác' (already in HTML index.html line 52-54, wired to kpi-dashboard.js).
- ⬜ printer-settings — entity=`printer` id=`p.id` (sink) → thêm nút 🕘 vào cụm action mỗi dòng thẻ máy in (prn-card), bên cạnh Test/In thử/Sửa/Xóa. Se

## Cần history — wire backend route vào sink TRƯỚC (🔌) rồi frontend

- 🔌 variants — entity=`variant` id=`v.id` route=`['web2-variants.js']` → Thêm nút 🕘 vào cụm THAO TÁC mỗi dòng bảng (cạnh nút Sửa/Ẩn/Xóa). Bấm → gọi Web2A
- 🔌 customer-wallet — entity=`customer-wallet-qr` id=`card.customer_id (hoặc phone khi chưa có QR)` route=`['v2/web2-customer-wallet.js']` → Trang hiển thị card-list (div#cwList render từ web2-customer-wallet-render.js).
- 🔌 supplier-wallet — entity=`supplier-wallet-transaction` id=`supplier (tên NCC) hoặc row.tx_id (nếu drill-down từng giao dịch)` route=`['web2-supplier-wallet.js']` → Trang hiển thị card-list NCC (div#swList). Thêm nút 🕘 'Giao dịch' trên card head
- 🔌 supplier-debt — entity=`supplier-debt-payment` id=`'main' hoặc row.supplier:date:txId (mỗi payment record)` route=`['web2-supplier-wallet.js']` → Trang hiển thị table báo cáo công nợ NCC (dạng ledger: opening/debit/credit/endi
- 🔌 web2/fastsaleorder-refund — entity=`refund` id=`row.number` route=`['render.com/routes/refunds.js']` → Trang Trả hàng (fastsaleorder-refund) hiển thị bảng data-table (id=rfTable) với
- 🔌 fastsaleorder-delivery — entity=`delivery-invoice` id=`o.number` route=`['delivery-invoices.js']` → Trang này là danh sách phiếu giao hàng (dlv-app.js). Có nút thao tác (chi tiết,
- 🔌 jt-tracking — entity=`jt-tracking` id=`row.billcode` route=`['web2-jt-tracking.js']` → Thêm nút 🕘 vào cụm action mỗi dòng bảng danh sách vận đơn (file jt-tracking-rend
- 🔌 fb-posts — entity=`fb-post` id=`draft.id` route=`['web2-fb-posts.js']` → Thêm tab 'Lịch sử' trong danh sách bài draft/scheduled (panel-drafts, hàng mỗi d
- 🔌 balance-history — entity=`balance-transaction` id=`row.id` route=`['v2/web2-balance-history.js']` → Add history button (clock icon) to action group in each table row, next to link
- 🔌 order-tags — entity=`order-tag` id=`card.code` route=`['web2-order-tags.js']` → Add history button (clock icon) to card footer or header (.ot-card-foot), next t
- 🔌 users — entity=`web2-user` id=`u.id` route=`['web2-users.js']` → thêm nút 🕘 vào cụm action mỗi dòng bảng người dùng (row.actions), bên cạnh nút s
- 🔌 live-control — entity=`campaign` id=`state.campaignId` route=`['web2-campaign-products.js']` → Thêm nút 🕘 hoặc tab Lịch sử vào section Header (bên cạnh nút 'Tạo' / 'Mở TV'). C
- 🔌 livestream-poller — entity=`poller-config` id=`page_id` route=`['web2-live-comments.js']` → Thêm tab Lịch sử hoặc nút 🕘 tại mỗi dòng trang (bên cạnh nút 'Bật'/'Tắt' và 'Xoá

## Không cần (tool/dashboard/report/config thuần)

- payment-confirm, ck-dashboard, notifications, pancake-settings, zalo, users-permissions, dashboard, overview, report-delivery, report-revenue, system, services-dashboard, admin-sse-monitor, multi-tool, live-tv, fb-ads-stats, fb-insights, photo-editor, photo-studio, product-card, product-counter, video-beauty, video-maker, login
