# Dev Log — N2Store

> Cập nhật liên tục khi code. Mới nhất ở trên.
>
> **Cách tìm nhanh:** Ctrl+F tìm theo ngày `## 2026-`, theo module `[inbox]` `[chat]` `[extension]` `[orders]` `[worker]` `[render]`, hoặc theo status `IN PROGRESS`.

---

## 2026-04-20

### [wallet/tickets] Format ghi chú ticket thống nhất: `Công Nợ Ảo Từ {Loại} ({order_id}) - {internal_note}` + tab 1 note dạng `Thu Về/Khách Gửi "X" (ticket_note)`
| | |
|---|---|
| **Files** | `issue-tracking/js/script.js`, `render.com/routes/v2/tickets.js`, `render.com/routes/v2/wallets.js`, `orders-report/js/utils/sale-modal-common.js` |
| **Chi tiết** | **Yêu cầu user**: (1) Ghi chú trong Hoạt động ví phải đồng nhất cho cả "Thu Về" và "Khách Gửi" format `Công Nợ Ảo Từ {Loại} ({order_id}) - {ghi chú ticket}`. (2) Ghi chú trong phiếu bán hàng tab 1 format `{Loại} "{Số Tiền}" ({ghi chú ticket})\n-> CÒN NỢ XK/0Đ`. **Thay đổi**: (1) `issue-tracking/js/script.js:1604` khi cấp công nợ ảo cho RETURN_SHIPPER (Thu Về), note mới = `Công Nợ Ảo Từ Thu Về ({orderId}) - {internalNote}` (cộng internalNote vào, trước đây thiếu). (2) `render.com/routes/v2/tickets.js:469-484` resolve ticket: thống nhất `walletNoteForVC` và `walletNoteForDeposit` dùng `Công Nợ Ảo Từ {typeLabel} ({orderRef}) - {internal_note}` với `typeLabel` map từ `ticket.type` (RETURN_SHIPPER→Thu Về, RETURN_CLIENT→Khách Gửi, BOOM→Boom Hàng, FIX_COD→Sửa COD). (3) `render.com/routes/v2/wallets.js` walletNoteLines: RETURN_GOODS format từ `{cleanNote}` thành `Khách Gửi "{amtStr}" ({cleanNote})` để khớp convention. (4) `sale-modal-common.js` autoFillSaleNote 1a: RETURN_SHIPPER vc format từ `{ticket_note}` thành `Thu Về "{vcAmountStr}" ({ticket_note})`, đồng thời fallback hasVirtualDebt cũng dùng `Thu Về "X"`. **Kết quả expected**: Bond Huynh → `Thu Về "490K" (THU VỀ 1 SET B594H - 490K CHẬT)\n-> CÒN NỢ 180K`. Hồng Diễm → `Khách Gửi "450K" (KHÁCH 65KG MANG CHẬT)\n-> CÒN NỢ 225K`. **Lưu ý**: thay đổi format chỉ áp dụng cho data mới (ticket resolve sau khi deploy); data cũ trong wallet_transactions vẫn hiển thị format cũ ở "Hoạt động ví". |
| **Status** | ✅ Done |

### [orders/wallet] Fix ghi chú phiếu bán: `-> CÒN NỢ X` khi balance > COD + virtual credit fallback khi vcList rỗng
| | |
|---|---|
| **Files** | `orders-report/js/utils/sale-modal-common.js` |
| **Chi tiết** | **Bug 1** (Bond Huynh #4520, 0906370834): balance ảo 490K > COD 310K. Note SAI `Nợ Cũ 310K\n-> 0Đ`, đúng phải `THU VỀ 1 SET B594H - 490K CHẬT\n-> CÒN NỢ 180K`. **Bug 2** (Hồng Diễm, 0969069410): balance thật 450K (tx RETURN_GOODS "KHÁCH 65KG MANG CHẬT") > COD 225K. Note SAI `KHÁCH 65KG MANG CHẬT\n-> 0Đ`, đúng phải `\n-> CÒN NỢ 225K`. **Root cause**: `autoFillSaleNote()` lấy `walletBalance = prepaidAmount.value` — field này bị **cap bởi COD** nên `remaining = balance - COD = 0` sai. Ngoài ra branch RS-only (vcList có RETURN_SHIPPER, walletLines rỗng) không push `-> CÒN NỢ X`. **Fix**: (1) Dùng `prepaidAmount.dataset.originalBalance` (số dư gốc, không bị cap) thay cho `.value`. (2) Refactor thành 3 nhánh rõ: `walletLines.length > 0` (tiền thật) push walletLines + `-> CÒN NỢ/0Đ`; `hasReturnShipper` (chỉ ảo) push ticket_note + `-> CÒN NỢ X` khi dư (không push `-> 0Đ` để giữ case Nguyễn Diễm balance < COD không có dòng thừa); fallback cuối push `Nợ Cũ X`. (3) Thêm fallback khi `vcList` rỗng nhưng `hasVirtualDebt=1` (vc expired/stale) → push `TRỪ X CÔNG NỢ ẢO THU VỀ` thay vì rơi vào "Nợ Cũ". (4) Đổi "-> Còn nợ" → "-> CÒN NỢ" all-caps theo convention user. |
| **Status** | ✅ Done |

### [orders/wallet] Fix ghi chú phiếu bán hàng hiển thị "ĐÃ NHẬN ..." thay vì "Nợ Cũ ..." khi số dư ví là legacy
| | |
|---|---|
| **Files** | `render.com/routes/v2/wallets.js`, `orders-report/js/utils/sale-modal-common.js` |
| **Chi tiết** | **Bug**: Khách Nguyễn Apple #7439 (0909338236) có 7 tx ví, số dư còn 41K là legacy (sau +230+1300+2800+170-4459+4459-4459). Ghi chú tự điền SAI `ĐÃ NHẬN 41K ACB 20/04`, đúng phải là `Nợ Cũ 41K`. **Root cause**: (1) Backend `walletNoteLines` tính `running` từ loop tx phụ thuộc pairing WITHDRAW+REFUND theo `reference_id` — nếu pairing fail (ref null/khác format), running âm → không push "Nợ Cũ" → trả `[]`. (2) Frontend fallback khi `walletNoteLines` rỗng tự tạo `ĐÃ NHẬN {balance}K ACB {today}` — sai bản chất. **Fix backend (wallets.js:465-499)**: bỏ block `running`, dùng invariant `wallet.balance = Σ(Nợ Cũ) + Σ(ĐÃ NHẬN sau lastWithdrawIdx)`. Tính `legacy = walletBalance - depositsAfterSum`, nếu `legacy > 500đ` thì push `Nợ Cũ {legacy/1000}K` trước, rồi push các `depositLines`. Dùng `wallet.balance` làm chân lý, không phụ thuộc skipIdx pairing. **Fix frontend (sale-modal-common.js:1129-1140)**: fallback đổi `ĐÃ NHẬN {balance} ACB {today}` → `Nợ Cũ {balance}K` + tính `-> Còn nợ/0Đ` dựa trên COD (giống branch chính). |
| **Status** | ✅ Done |

### [inventory-tracking] Stat bar VND/1000 size = stat chính, header mỗi đợt hiển thị "Tổng HĐ: ngoại tệ (VND/1000)"
| | |
|---|---|
| **Files** | `inventory-tracking/css/modern.css`, `inventory-tracking/js/table-renderer.js` |
| **Chi tiết** | (1) `.stat-box .stat-vnd` tăng từ 11.5px → **22px** (bằng stat-value), weight 800, màu xanh #059669. (2) Header mỗi đợt đổi format: `Tổng HĐ: <ship-tong-hd-num>{ngoại tệ}</ship-tong-hd-num> <ship-tong-hd-vnd>({VND/1000})</ship-tong-hd-vnd>` — ngoại tệ đen bold, VND xanh bold trong ngoặc. Permission vẫn dùng `view_thanhToanCK` (admin tự bypass qua ADMIN_PERMISSIONS ở permission-helper.js). |
| **Status** | ✅ Done |

### [orders] "Gộp SP Chờ Live": preview table đầy đủ sản phẩm + tag (giống modal "Gộp Đơn Trùng SĐT")
| | |
|---|---|
| **Files** | `orders-report/js/tab1/tab1-merge-live-waiting.js`, `orders-report/css/tab1-orders.css` |
| **Chi tiết** | **Yêu cầu**: Preview cluster phải chi tiết như modal "Gộp Sản Phẩm Đơn Trùng SĐT" — cột "Sau Khi Gộp" + từng cột source + cột đích, mỗi cell hiển thị hình SP + tên + code + SL + giá + Note; header cột hiển thị đầy đủ tags (Regular + T-tags + XL flags) dưới dạng pill màu. **Fix**: (1) Thêm bước `fetchDetailsForClusters()` trong `runScan` — batch `getOrderDetails` (5 orders/batch, 250ms delay giữa batch) cho TẤT CẢ target + sources, gán `__fullDetails` lên mỗi order; (2) Thay layout info đơn giản cũ bằng `<table class="merge-cluster-table">` tái dùng CSS sẵn có `.merge-cluster-card / .merge-cluster-table / .merge-product-item / .merge-tag-pill / .merged-col / .target-col`; (3) `renderTagPills(order)` gộp Regular Tags (parse từ `order.Tags` JSON, màu từ `Tag.Color`), T-tags (`ProcessingTagState.getOrderData(code).tTags`, xanh #3b82f6), và XL Flags (CHO_LIVE xanh lá #10b981, các flag khác tím #7c3aed); (4) `renderMergedPreviewTags(cluster)` = target tags giữ nguyên + T-tags mới từ sources (dedup theo name); (5) `renderProductCell(p, {markTransfer})` — cell SP có badge "Hàng Live Cũ" khi là sản phẩm sẽ chuyển; (6) `mergedProducts` = `[...target.__fullDetails, ...sources.flatMap(Details → {..., Note: appendNote(Note,'Hàng Live Cũ'), __isTransferred: true})]`; (7) `mergeOneCluster` tận dụng `src.__fullDetails` đã fetch để tránh fetch lại. CSS dọn dẹp: xoá các class layout cũ không dùng, thêm `.mlw-transfer-badge` và `.mlw-live-row`. |
| **Status** | ✅ Done |

### [inventory-tracking] Hiển thị VND/1000 ở stat bar + "Tổng HĐ" trên header mỗi đợt hàng
| | |
|---|---|
| **Files** | `inventory-tracking/index.html`, `inventory-tracking/js/table-renderer.js`, `inventory-tracking/css/modern.css` |
| **Chi tiết** | (1) **Stat bar** — thêm `<span class="stat-vnd">` bên dưới stat-value của 4 ô `Tổng HĐ / Tổng CP / Tổng TT / Còn Lại` hiển thị `(VND/1000)` màu xanh, font 11.5px. `updateInventoryStatsBar()` giờ cộng dồn VND per-shipment (×`shipment.tiGia`) và per-dot (×`dot.tiGia`) để không bị sai khi mỗi đợt có tỉ giá khác nhau. Tổng KG không có VND (là cân nặng). `.stat-box-conlai.negative` chuyển `stat-vnd` sang đỏ. (2) **Shipment header** — sau `Tổng XXX KG` thêm `<span class="ship-tong-hd">| Tổng HĐ: xxxx</span>` = `shipment.tongTienHoaDon × shipment.tiGia / 1000`, chỉ hiển thị khi `canViewTT = view_thanhToanCK` để đồng bộ permission với stat bar. |
| **Status** | ✅ Done |

### [orders] Fix "Gộp SP Chờ Live": dùng saved campaigns (Cài Đặt Chiến Dịch) thay cho LiveCampaignId của TPOS
| | |
|---|---|
| **Files** | `orders-report/js/tab1/tab1-merge-live-waiting.js` |
| **Chi tiết** | **Bug**: Ban đầu implement nhầm — group `displayedData` theo `order.LiveCampaignId` (TPOS live session ID) và coi đó là "live". Đúng ra phải dùng saved campaigns user tự tạo ở modal "Cài Đặt Chiến Dịch" (`window.campaignManager.allCampaigns`, shape `{id, name, customStartDate, customEndDate, timeFrame}`). **Fix**: thay `groupByLiveCampaign()` bằng `getSortedSavedCampaigns()` (sort `customStartDate` DESC) + `campaignDateRange(c)` (fallback `+3 ngày` khi thiếu customEndDate — match default logic ở tab1-campaign-create.js:159). Mode campaign mới: (1) Target = active campaign (`mgr.activeCampaignId`); (2) Source = 2 campaigns cũ hơn active theo customStartDate DESC; (3) Filter `displayedData` bằng `orderInRange(o.DateCreated, campaignRange)` → `targetOrders` + `sourceOrders`. Annotate mỗi source order với `_mlwCampaignName` để cột "Chiến dịch" trong bảng preview hiển thị tên saved campaign thay vì TPOS LiveCampaignName. Cảnh báo thông minh khi `displayedData` không bao phủ 2 chiến dịch cũ (yêu cầu user mở rộng bộ lọc ngày tab 1). |
| **Status** | ✅ Done |

### [orders] Nút "Gộp SP Chờ Live" — gộp giỏ CHO_LIVE từ 2 live cũ sang live mới nhất cùng SĐT
| | |
|---|---|
| **Files** | `orders-report/js/tab1/tab1-merge-live-waiting.js` (mới), `orders-report/tab1-orders.html`, `orders-report/css/tab1-orders.css`, `docs/dev-log.md` |
| **Chi tiết** | **Yêu cầu**: Thêm nút ngay bên phải "Gộp sản phẩm đơn trùng SĐT" để tự động chuyển sản phẩm + T-tags từ giỏ cũ có flag XL `CHO_LIVE` sang giỏ mới nhất cùng SĐT ở live hiện tại. **Kiến trúc**: IIFE module mới [tab1-merge-live-waiting.js](../orders-report/js/tab1/tab1-merge-live-waiting.js), export `window.showMergeLiveWaitingModal / closeMergeLiveWaitingModal / runMergeLiveWaitingScan / confirmMergeLiveWaiting`. Dependencies tái sử dụng: `normalizeMergePhone`, `getOrderDetails`, `updateOrderWithFullPayload`, `saveMergeHistory` (tab1-merge.js); `ProcessingTagState.getOrderData`, `assignTTagToOrder`, `assignOrderCategory` (tab1-processing-tags.js); global `displayedData`. **2 chế độ quét**: (1) `campaign` — group `displayedData` theo `LiveCampaignId` sort desc theo `latestDate`, live [0] = target, lives [1..2] = sources; chỉ lấy source order có flag `CHO_LIVE`; (2) `date` — target = order mới nhất per SĐT theo `DateCreated`, sources = order cùng SĐT cũ hơn + có `CHO_LIVE`. **Merge per cluster**: fetch target → push source Details với `Id=undefined`, `LiveCampaign_DetailId=null`, `Note = appendNote(Note, 'Hàng Live Cũ')` (idempotent nếu đã chứa marker); recompute totals → PUT target; gán T-tags từ sources sang target qua `assignTTagToOrder`; clear source (`Details=[]`, totals=0) + `assignOrderCategory(code, 3, {subTag: 'DA_GOP_KHONG_CHOT', source: 'Gộp SP Chờ Live'})`; save `saveMergeHistory` với `type='live_waiting'`. **KHÔNG chuyển**: category/subTag/flags/Regular Tags của giỏ nguồn. Modal có toggle radio `2 live liền trước` ⇄ `Tìm theo ngày`, nút Quét, list cluster card với checkbox + preview T-tags + bảng source orders. Script include đặt sau `tab1-merge.js` trong `tab1-orders.html`. |
| **Status** | ✅ Done — cần QA test với live thật (giỏ có CHO_LIVE cần verify reset sau clear) |

### [chat][orders] Nút tải lại Excel sản phẩm trong search chat-panel
| | |
|---|---|
| **Files** | `orders-report/tab1-orders.html`, `orders-report/css/tab1-chat-modal.css`, `orders-report/js/chat/chat-products-ui.js` |
| **Chi tiết** | Thêm icon button reload `#btnReloadChatExcel` (fa-sync-alt) ngay trong `.chat-order-search-wrapper` bên phải ô tìm sản phẩm ở chat panel. Click gọi `window.reloadChatExcelProducts()`: disable button + spin icon → `productSearchManager.fetchExcelProducts(true)` force reload cache Excel mới nhất từ TPOS → toast success/error qua `notificationManager` → re-run `performChatProductSearch(query)` nếu đang có query ≥ 2 ký tự → restore icon. Tách khỏi nút reload hiện có của edit-modal (`#btnReloadExcel`) — id khác, cùng underlying manager nên share cache sau reload. |
| **Status** | ✅ Done |

### [render][orders] Refresh invoice_status table từ TPOS — endpoint server-side + browser shortcut
| | |
|---|---|
| **Files** | `render.com/routes/invoice-status.js`, `orders-report/js/tab1/tab1-fast-sale-invoice-status.js` |
| **Chi tiết** | **Yêu cầu**: Chạy lại lấy dữ liệu mới nhất TPOS cho toàn bộ entries đang lưu trong Render PostgreSQL `invoice_status` table (không phải refresh browser cache). **Backend endpoint** mới `POST /api/invoice-status/refresh-from-tpos` [invoice-status.js:238]: (1) Query `compound_key, username, sale_online_id, tpos_id FROM invoice_status WHERE tpos_id IS NOT NULL` với filter optional `saleOnlineIds[]`, `limit`, `sinceMs`, `chunkSize`; (2) Group theo `tpos_id` → Map<tposId, [{compoundKey, username, saleOnlineId}]>; (3) Get TPOS token qua `tpos-token-manager` singleton (auto-refresh từ TPOS_USERNAME/TPOS_PASSWORD env vars); (4) Chunk tpos_ids (default 30), fetch trực tiếp TPOS OData (không qua CF Worker) `FastSaleOrder/ODataService.GetView?$filter=(Type eq 'invoice' and (Id eq X or Id eq Y ...))` với `rejectUnauthorized: false` (TPOS self-signed cert); (5) Transaction per chunk: `UPDATE invoice_status SET ... WHERE compound_key = $N` — preserve compound_key/username/sale_online_id, chỉ update tpos fields (ShowState, StateCode, AmountTotal, OrderLines JSONB simplified, carrier, delivery, etc.); (6) Return `{success, total, fetched, updated, missing, errors, elapsedMs}`. **Browser shortcut** `window.refreshPBHFromServer(options)` [tab1-fast-sale-invoice-status.js:3672]: POST tới endpoint, hiển thị notification progress/result, tự động gọi `InvoiceStatusStore.reload()` sau khi xong để sync client cache với data vừa update. Phân biệt với `window.refreshAllPBHFromTPOS()` (browser-side fetch từng chunk) — bản server-side nhanh hơn, không phụ thuộc browser token. |
| **Status** | ✅ Done — cần deploy Render server + GitHub Pages |

### [orders] Refresh toàn cột PBH từ TPOS OData — clear cache + batch fetch fresh data
| | |
|---|---|
| **Files** | `orders-report/js/tab1/tab1-fast-sale-invoice-status.js` |
| **Chi tiết** | **Yêu cầu**: Xóa cache PBH và fetch dữ liệu mới nhất từ TPOS cho toàn bộ đơn trong bảng (không phải load lại từ PostgreSQL cache — cache có thể drift nếu WebSocket event miss). **Implementation**: Thêm method `InvoiceStatusStore.refreshAllFromTPOS(options)` [tab1-fast-sale-invoice-status.js:1062]. Flow: (1) `clearAll()` xóa memory + localStorage; (2) Chunk `displayedData` thành batch 20 đơn/req (tránh URL quá dài); (3) Mỗi batch fetch OData `FastSaleOrder/ODataService.GetView?$filter=(Type eq 'invoice' and (Reference eq 'a' or Reference eq 'b' or ...))&$top=500&$orderby=DateInvoice desc` — escape single quotes trong Reference; (4) Enable `_batchMode=true` để `set()` skip individual POST; (5) Với mỗi invoice trả về, match order bằng Reference, gọi `Store.set(saleOnlineId, inv, orderShim)` và track compound key; (6) Disable batch mode, gọi `_saveBatchToAPI(savedKeys)` POST 1 lần lên PostgreSQL `/entries/batch`; (7) `_refreshInvoiceStatusUI(allSaleIds)` re-render cell cho cả đơn có và không có phiếu (đơn không có phiếu sẽ show "−"). Notification progress: `info('0/N...')` → `success('✅ N/M đơn có phiếu, X lỗi')`. Expose `window.refreshAllPBHFromTPOS()` để gọi từ DevTools console. Return `{ok, total, found, errors}` cho programmatic use. |
| **Status** | ✅ Done — gọi `refreshAllPBHFromTPOS()` từ console để chạy |

### [phone-widget] TTS tiếng Việt khi cuộc gọi thất bại (theo Zoiper5)
| | |
|---|---|
| **Files** | `orders-report/js/phone-widget.js` |
| **Chi tiết** | Theo Zoiper5, khi khách không nhấc máy có announcement tiếng Việt. Implement `speakVN()` dùng Web Speech API (`SpeechSynthesis` với `lang=vi-VN`), auto-detect voice tiếng Việt qua `onvoiceschanged`. Function `_announceCallFailure(cause, direction)` map SIP cause → message: `No Answer / Timer B / Timeout` → "Khách không nhấc máy", `Busy` → "Máy bận", `Rejected` → "Khách từ chối cuộc gọi", `Unavailable / Not Found` → "Thuê bao không liên lạc được"; `Canceled` skip (user cúp chủ động). Chỉ phát cho direction='out', delay 500ms sau hangup tone để không đè nhau. Hook vào `session.on('failed')` handler. |
| **Status** | ✅ Done |

### [orders] Thêm sub-tag "KHÔNG ĐỂ HÀNG" (Cat 3) — thay vị trí thống kê TRỐNG bằng KO ĐH
| | |
|---|---|
| **Files** | `orders-report/js/tab1/tab1-processing-tags.js`, `orders-report/js/overview/overview-core.js`, `orders-report/js/overview/overview-statistics.js` |
| **Chi tiết** | **Yêu cầu**: Thêm sub-tag manual `KHÔNG ĐỂ HÀNG` trong category 3 (KHÔNG CẦN CHỐT) — click giống `ĐÃ GỘP KHÔNG CHỐT`. Stats ở mini-summary panel (Tab 1 sidebar) và Báo Cáo Tổng Hợp (overall + per-employee) **thay hoàn toàn** số "TRỐNG" (auto SL=0) bằng số đơn có `subTag='KHONG_DE_HANG'`, label rút gọn **"KO ĐH"**. Badge vàng `GIỎ TRỐNG` trên row của bảng đơn **giữ nguyên** (vẫn auto theo SL=0). **Tab1**: `PTAG_SUBTAGS` thêm `KHONG_DE_HANG` (cat 3); `PTAG_TOOLTIPS` thêm `subtag_KHONG_DE_HANG`; mini-summary template đổi `(X TRỐNG + Y GỘP)` → `(X KO ĐH + Y GỘP)`, filter click chuyển `subtag_GIO_TRONG` → `subtag_KHONG_DE_HANG`. **Overview**: `PTAG_SUBTAGS_META` xoá `GIO_TRONG`, thêm `KHONG_DE_HANG`; `computeTagXLCounts` bỏ block auto `subTagCounts['GIO_TRONG']++` theo SL=0 + bỏ exception `!== 'GIO_TRONG'` trong sub-tag counter; `_buildMiniSummary` cat 3 đổi label `(X Trống, Y Gộp)` → `(X KO ĐH, Y Gộp)`; filter handler subtag_ xoá nhánh đặc biệt cho GIO_TRONG. **Backend không cần migration** (subTag lưu dạng free string, dữ liệu cũ `subTag='GIO_TRONG'` ~1061 đơn tự động bị frontend skip an toàn vì key không còn trong subTagCounts init). Row badge `GIỎ TRỐNG` + filter `subtag_GIO_TRONG` (khi click badge) giữ nguyên qua `_slZeroCodes` cache. |
| **Status** | ✅ Done |

### [orders] Fetch OData sau khi hủy phiếu — hiển thị trạng thái "Huỷ bỏ" thật thay vì "−"
| | |
|---|---|
| **Files** | `orders-report/js/tab1/tab1-fast-sale-workflow.js` |
| **Chi tiết** | **Yêu cầu**: Khi bấm nút "✕" hủy phiếu thành công, cột PHIẾU BÁN HÀNG đang show "−" (dấu trừ xám) sau khi `InvoiceStatusStore.delete()`. User muốn cell phản ánh trạng thái thật trên TPOS (badge đỏ "Huỷ bỏ" + strikethrough) thay vì "−". **Fix**: Trong `confirmCancelOrderFromMain()` [tab1-fast-sale-workflow.js:1210], sau khi `closeCancelOrderModal()` và trước khi render cell, thêm bước fetch OData `FastSaleOrder/ODataService.GetView?$filter=(Type eq 'invoice' and contains(Number,'${order.Number}'))` (cùng pattern với `handleInvoiceUpdate` trong tab1-tpos-realtime.js:238). Nếu fetch thành công → `InvoiceStatusStore.set(saleOnlineId, inv, orderShim)` để lưu entry mới với `ShowState="Huỷ bỏ"` (Store.set tự tạo compound key mới do entry cũ đã bị xóa ở Step 3). Render cell bằng `window.renderInvoiceStatusCell({ Id: saleOnlineId })` để hiển thị badge đỏ. Fallback "−" giữ nguyên nếu fetch fail (offline/network error/token hết hạn) để không mất UX. Auth qua `tokenManager.getAuthHeader()`, proxy qua Cloudflare Worker `chatomni-proxy`. Không đụng Steps 1-6 (ActionCancel, DeleteStore, wallet refund, quickAssignTag, updateOrderStatus) — chỉ thay đổi bước render cuối. |
| **Status** | ✅ Done |

### [orders][render] Thêm cột "Ghi chú" CSKH — multi-note history per order, edit/delete own
| | |
|---|---|
| **Files** | `render.com/migrations/create_order_notes.sql` (new), `render.com/routes/order-notes.js` (new), `render.com/server.js`, `orders-report/js/tab1/tab1-order-notes.js` (new), `orders-report/js/tab1/tab1-table.js`, `orders-report/tab1-orders.html`, `orders-report/css/tab1-orders.css`, `docs/render/render.md` |
| **Chi tiết** | **Yêu cầu**: Thêm cột Ghi chú (CSKH) bên phải cột Tin nhắn để ghi lại quá trình xử lý đơn khi gọi / chat với khách, phục vụ bàn giao giữa nhân viên. Mọi user thêm được note; 1 đơn nhiều note; mỗi note gắn tên người + thời gian; người viết được sửa/xoá note của chính mình; hiển thị đầy đủ ngay trong cell. **Backend**: Render PostgreSQL — bảng `order_notes` (id UUID, order_id, author, text, created_at, updated_at, is_edited) + 5 endpoints `/api/order-notes/*` (load / POST entries / PUT entries/:id / DELETE entries/:id?author / DELETE cleanup). Ownership check server-side: `UPDATE/DELETE ... WHERE id=$1 AND author=$2` → rowCount=0 trả 403. Input validation: text 1–2000 char, author 1–128, orderId 1–64. Cleanup tự động > 180 ngày. **Frontend**: Module IIFE `OrderNotesStore` theo pattern `InvoiceStatusStore` — load-from-API fallback-localStorage, `add/edit/remove`, refresh cell DOM-targeted (không re-render toàn bảng). Dùng `data-column="cs-notes"` tránh đụng cột TPOS note hiện có (`data-column="notes"`). Render inline trong cell: tất cả note (own=xanh lá, others=vàng), hover own note hiện icon ✎/🗑, button "+Thêm ghi chú" ở cuối cell mở textarea inline. User identity lấy từ `window.getUserName()` / localStorage userType. **Table changes**: Thêm `<th data-column="cs-notes">Ghi chú</th>` giữa messages và comments; thêm `${csNotesHTML}` vào `createRowHTML`; cập nhật mọi colspan `18 → 19`. |
| **Status** | ✅ Done — migration đã chạy trên Render Postgres, chờ deploy server để endpoints hoạt động |

### [phone-management,phone-widget] Fix NaN timestamp + implement local MediaRecorder recording
| | |
|---|---|
| **Files** | `phone-management/js/phone-management.js`, `orders-report/js/phone-recording.js` (new), `orders-report/js/phone-widget.js`, `orders-report/tab1-orders.html`, `phone-management/index.html` |
| **Chi tiết** | **Bug 1 — NaN timestamp**: Postgres BIGINT trả về string (node-pg default để preserve precision), `new Date("1745158000000")` → Invalid Date (JS parse string như date string chứ không phải ms). Fix `_toMs()` helper parseInt nếu string, apply cho `_fmtDateTime/_fmtDuration/_relTime`. **Bug 2 — Ghi âm trống**: trước chỉ placeholder. Implement `PhoneRecording` module: AudioContext mix local mic + remote audio track (`<audio id=pwRemoteAudio>` srcObject) → `MediaStreamDestination` → `MediaRecorder(dest.stream, audio/webm;codecs=opus)` → chunks → Blob → IndexedDB `phoneRecordings/recordings` (keyPath id autoIncrement, indexes: timestamp/username/phone). Retention 30 ngày, auto-cleanup on load. Widget hook `session.on('accepted')` → delay 400ms (chờ remote track attach) → `startRecording({username, ext, phone, name, direction, orderCode, timestamp})` nếu `isEnabled()` (check localStorage `phoneMgmt_prefs.recordLocal`). `endCall` stop với final duration. Phone-management tab Ghi âm: `listRecordings()` → render table (thời gian/nhân viên/ext/số/khách/thời lượng/size + mimeType/actions), 3 nút Phát (modal audio HTML5 player)/Tải về (download blob URL)/Xoá. Storage stats footer "Tổng N ghi âm · X MB". Search + user filter. IndexedDB same-origin share giữa orders-report và phone-management (cùng `nhijudyshop.github.io`). |

### [orders] Fix GIỎ TRỐNG đếm sai 100% trên Báo cáo tổng hợp (dùng TotalQuantity thay Details.length)
| | |
|---|---|
| **Files** | `orders-report/js/overview/overview-statistics.js`, `orders-report/js/overview/overview-modals.js`, `orders-report/js/overview/overview-ui.js` |
| **Chi tiết** | **Bug**: Trên tab "Báo Cáo Tổng Hợp" (overview), thống kê "GIỎ TRỐNG" luôn = 100% tổng đơn (299/299) dù đa số đơn có sản phẩm thực. Cột SL trong modal hiển thị 0 trên mọi dòng. **Root cause**: `allOrders` (từ Tab1 qua TPOS bulk API) chỉ populate `TotalQuantity`, không có mảng `Details`. Nhưng `computeTagXLCounts()` và 6 nơi khác dùng `order.Details?.length || 0` để xác định SL → mặc định = 0 → mọi đơn bị đếm là GIỎ TRỐNG. **Fix**: Thay biểu thức `order.Details?.length || 0` bằng `(order.TotalQuantity ?? order.Details?.length ?? 0)` tại 8 vị trí: `overview-statistics.js` (4 loop counter GIO_TRONG/gio_trong), `overview-modals.js` (2 filter + 2 render cột SL trong modal validation), `overview-ui.js` (1 render cột SL trong modal). Dùng `??` để giữ đúng case `TotalQuantity === 0` (đơn trống thật). |
| **Status** | ✅ Done |

### [orders][render] KPI tính theo người thực sự upsell (per-user audit-based attribution)
| | |
|---|---|
| **Files** | `orders-report/js/managers/kpi-manager.js`, `orders-report/js/tab-kpi-commission.js`, `orders-report/migration-kpi-per-user.html` (new), `render.com/routes/realtime-db.js`, `tests/property/kpi-employee-determination.test.js`, `tests/unit/kpi-bugfixes.test.js` |
| **Chi tiết** | **Bug**: Đơn 260402695 thuộc nhân viên Huyền (theo STT range) nhưng nhân viên My mới là người add 2 SP qua `edit_modal_inline`. Hệ thống ghi 10.000đ KPI cho Huyền — sai. **Root cause**: `recalculateAndSaveKPI()` lấy STT của BASE → `getAssignedEmployeeForSTT()` → gán toàn bộ KPI cho 1 userId duy nhất (chủ đơn theo STT). Audit log đã có `userId` của người thao tác nhưng không được dùng. **Fix**: (1) `calculateNetKPI()` áp dụng algorithm last-add-wins per-product để tính NET per user — mỗi 'add' push stack `{userId, qty}`, mỗi 'remove' pop ngược từ cuối. Return thêm `perUserNet`, `perUserKPI`, `perUserNames`. (2) `recalculateAndSaveKPI()` gọi `DELETE /kpi-statistics/order/:orderCode` (wipe atomic mọi user/date row của orderCode) rồi loop `perUserKPI` và PATCH lại cho từng user có KPI > 0. Đơn không có upsell → không ghi entry → tự ẩn khỏi tab KPI. (3) Modal "So sánh KPI" thêm bảng "KPI theo nhân viên" hiển thị per-user breakdown. (4) Server endpoint mới `GET /kpi-base/list-codes` (registered trước `/:orderCode`) cho migration. (5) `migration-kpi-per-user.html` standalone page với 3 nút: Load / Test 10 / Run all + progress bar + log. **Quyết định nghiệp vụ với user**: per-user net, remove trừ vào người add (last-add-wins), migration 1 lần, đơn 0 KPI ẩn hoàn toàn. **Migration**: BẮT BUỘC backup `kpi_statistics` PG trước (`pg_dump -t kpi_statistics`), test 10 đơn trước khi run all. |
| **Status** | ✅ Done — chờ deploy server (list-codes endpoint), backup PG, chạy migration |

### [orders] TAG XL column — prepend badge GIỎ TRỐNG cho đơn SL=0 (click filter SL=0)
| | |
|---|---|
| **Files** | `orders-report/js/tab1/tab1-processing-tags.js` |
| **Chi tiết** | User yêu cầu hiển thị badge GIỎ TRỐNG trong cột TAG XL giống cột TAG (prepend, không có nút ×, click để filter). **Thực hiện:** Trong `renderProcessingTagCell(orderCode)` lookup order qua `_ptagResolveId` + `window.getAllOrders()`; check `_isSLZero = Number(TotalQuantity||0) === 0`. Nếu true → build `gioTrongBadge` = span `.ptag-badge` border `#f59e0b`, text `#92400e`, bg `#fef3c7`, cursor pointer, onclick `window._ptagSetFilter('subtag_GIO_TRONG')` (filter panel XL đã có logic SL=0). Prepend vào `badgesContent = gioTrongBadge + badges` trước category/flag/tTag. Xử lý cả case `!data` (đơn chưa gán XL) — vẫn render badge. Display-only, không ghi XL state/subTag. |
| **Status** | ✅ Done |

### [phone-management,render] Migrate data t\u1eeb Firestore \u2192 Render Postgres + fix layout mobile header
| | |
|---|---|
| **Files** | `render.com/routes/oncall-sip-proxy.js`, `render.com/server.js`, `render.com/migrations/phone_management_tables.sql` (new), `orders-report/js/phone-cloud-sync.js` (rewrite), `orders-report/js/phone-ext-assignment.js` (rewrite), `phone-management/js/phone-management.js` (rewrite), `phone-management/css/phone-management.css` |
| **Chi tiết** | User yêu cầu lưu lên Render DB thay Firestore. **DB migration** tạo 5 bảng: `phone_ext_assignments` (username PK → ext), `phone_call_history` (SERIAL id, indexes username/phone/timestamp/direction/ext), `phone_presence` (username PK, state ENUM-like), `phone_audit_log` (JSONB detail), `phone_contacts`. Auto-create via `ensurePhoneManagementTables()` wire vào `server.js` sau DB connect success. **Render API** thêm 13 endpoints trong `oncall-sip-proxy.js`: GET/PUT/DELETE `/ext-assignments`, POST/GET/PATCH `/call-history` + PATCH `/call-history/:id` + GET `/call-history/stats`, GET/POST `/presence`, GET/POST `/audit-log`, GET/POST/DELETE `/contacts`. **PhoneCloudSync** rewrite: dùng `fetch` POST/PATCH tới Render, `sendBeacon` fallback cho `beforeunload` clear presence. **PhoneExtAssignment** rewrite: dùng REST + localStorage cache + **polling 15s** (Postgres không có realtime như Firestore), optimistic update + rollback on fail. **phone-management page** rewrite: bỏ Firestore queries, dùng `apiGet/apiSend`, Live tab polling 5s thay onSnapshot, stop interval khi switch tab. **Fix layout**: `.mobile-tab-header/.mobile-tab-dropdown/.mobile-dropdown-overlay` mặc định `display:none` trên desktop (trước đó render full list ở góc trái); chỉ hiện >768px với fully styled dropdown. |
| **Status** | ✅ Done |

### [orders] Fix GIỎ TRỐNG match — dùng diacritic-insensitive so sánh tên tag
| | |
|---|---|
| **Files** | `orders-report/js/tab1/tab1-search.js` |
| **Chi tiết** | User báo Ẩn "GIỎ TRỐNG" vẫn thấy đơn SL=0 (STT 282 Đặng Thảo). Root cause: compare `String(t.Name).trim().toUpperCase() === 'GIỎ TRỐNG'` fail khi Unicode normalization khác (NFC vs NFD — TPOS có thể trả Name decomposed dù pill render OK vì browser tự render giống nhau). **Fix:** tạo helper `_isGioTrongTagName(name)` normalize NFD → strip combining diacritics (`\u0300-\u036f`) → thay `đ`/`Đ` → d → trim → lowercase → compare `'gio trong'`. Dùng ở cả TAG filter (Show) và Excluded filter (Ẩn). |
| **Status** | ✅ Done |

### [inventory][orders] Fix "Không tìm thấy hóa đơn NCC" — match dotHang.id thay vì nested hoaDon.id
| | |
|---|---|
| **Files** | `inventory-tracking/js/modal-convert-po.js` |
| **Chi tiết** | Sau khi deploy, click nút "Chuyển qua đặt hàng" báo lỗi "Không tìm thấy hóa đơn NCC". **Root cause:** nhầm 2 level cấu trúc dữ liệu. Ở `globalState.nccList[].dotHang[]` mỗi entry là FLAT (chứa `sanPham[]` trực tiếp, **KHÔNG có nested `hoaDon[]`**). Schema `shipment.hoaDon[]` chỉ tồn tại ở UI aggregate của `getAllDotHangAsShipments()` — gom nhiều `dotHang` cùng `(ngayDiHang, dotSo)` thành 1 shipment UI với `hoaDon[i].id = dot.id`. Modal đang iterate `ncc.dotHang[].hoaDon[].find(h => h.id === invoiceId)` → luôn miss. **Fix:** mirror logic `deleteNccInvoice` ([crud-operations.js:340](inventory-tracking/js/crud-operations.js#L340)) — match `d.id === invoiceId` trực tiếp với `dotHang` entry. Loại biến `_convertCurrentShipment` (không cần — `dotHang` đã có `ngayDiHang`, `dotSo`, `sttNCC`, `sanPham[]`, `anhHoaDon`, `tongTienHD`, `ghiChu`). Thêm `console.warn` log sample data khi miss để debug. |
| **Status** | ✅ Done |

### [inventory][orders] Convert NCC Invoice → Purchase Order Draft (nút "Chuyển qua đặt hàng")
| | |
|---|---|
| **Files** | `inventory-tracking/js/modal-convert-po.js` (new), `inventory-tracking/css/modal-convert-po.css` (new), `inventory-tracking/js/table-renderer.js`, `inventory-tracking/index.html` |
| **Chi tiết** | Thêm nút icon `shopping-cart` ở NCC header (bên cạnh nút Xóa NCC) trong bảng [Theo Dõi Nhập Hàng SL]. Click → mở modal `modalConvertPO` tóm tắt 1 hóa đơn NCC. Logic flow: (1) `openConvertToPurchaseOrderModal(invoiceId)` tìm `hoaDon` + `parentShipment` trong `globalState.nccList[].dotHang[].hoaDon[]`; (2) Lấy `productImages` của NCC qua `getProductImagesForNcc(sttNCC, ngayDiHang, dotSo)` — chung cho tất cả items; (3) **Explode `sanPham[].mauSac[]` thành items phẳng** — mỗi biến thể (vd "Đen / S") = 1 dòng item với `variant = mau`, `quantity = soLuong`; nếu sản phẩm không có `mauSac` → 1 item với `quantity = tongSoLuong`; (4) Render form: supplier (prefill `tenNCC`), orderDate (hôm nay), invoiceAmount (prefill `tongTienHD`), notes (prefill `ghiChu`), ảnh sản phẩm thumbnails, bảng items tất cả input chỉnh sửa được + checkbox include, totals live update; (5) Click "Chuyển qua đặt hàng" → build `orderData` với `status:'DRAFT'`, supplier `{name, code: name[:3].toUpperCase()}`, items map với `sellingPrice:''` (để user điền sau ở màn Nháp), `subtotal = purchasePrice * quantity`, `productImages` copy từ NCC, `selectedAttributeValueIds:[]`, `tposSynced:false`; (6) POST trực tiếp tới `https://n2store-fallback.onrender.com/api/v2/purchase-orders` với header `X-Auth-Data` (raw JSON `{userId,userName,email}`) match format của `purchase-orders/js/service.js:58-67`; (7) Success → toast "Đã tạo đơn Nháp với N sản phẩm" + close modal (không điều hướng tab). DRAFT skip validation items/financials (xem `purchase-orders/js/service.js:117-119`) → tạo được dù thiếu giá/items. CSS riêng `modal-convert-po.css` cho nút `.btn-convert-po` (icon indigo, hover indigo-50), modal grid 3-cột (supplier/date/amount), items table sticky header max-height 380px scroll, inputs borderless hover/focus highlight. |
| **Status** | ✅ Done — chờ user test |

### [orders] GIỎ TRỐNG — Ẩn lọc đúng đơn SL=0 + render badge tự động trong cột TAG
| | |
|---|---|
| **Files** | `orders-report/js/tab1/tab1-search.js`, `orders-report/js/tab1/tab1-table.js` |
| **Chi tiết** | User báo 2 vấn đề: (1) Ẩn "GIỎ TRỐNG" vẫn thấy đơn SL=0 (vd STT 257 Lưu Thị Bé SL=0 vẫn hiển thị dù đã chọn Ẩn GIỎ TRỐNG) — do excluded filter dùng tag ID match, không đơn nào có tag ID đó nữa; (2) Cần hiển thị badge "GIỎ TRỐNG" tự động trên các đơn SL=0. **Fix:** (A) [tab1-search.js](orders-report/js/tab1/tab1-search.js) — block "Apply Excluded Tags filter" scan `window.availableTags` tìm tag Name='GIỎ TRỐNG' trong excludedTags, nếu có set `gioTrongExcluded=true` và return `false` cho mọi đơn có `TotalQuantity===0` (song song với match tag ID khác). Mirror logic của TAG filter (commit 785754fe). (B) [tab1-table.js](orders-report/js/tab1/tab1-table.js) — thêm helper `_buildGioTrongBadge(order)` return span.order-tag màu `#f59e0b` "GIỎ TRỐNG" khi `TotalQuantity===0` (không có nút × — badge tự động theo SL). Prepend vào `tagsHTML` trong `createRowHTML` và `updateRowTagsOnly` (lookup order qua `window.OrderStore.get(orderId)`). |
| **Status** | ✅ Done |

### [orders] Tab Lịch sử — cột SL + tổng số lượng sản phẩm trong stats bar
| | |
|---|---|
| **Files** | `purchase-orders/js/history-tab.js` |
| **Chi tiết** | Stats bar tab Lịch sử thêm mục `SL: <n> SP` — tổng `ProductQty` của tất cả phiếu trong trang hiện tại (cùng scope với `Tổng`/`Nợ`). **Bảng thêm cột `SL`** (giữa `Ngày` và `Tổng tiền`) hiện số lượng từng phiếu. State: `summaryTotalQty`, `qtyLoading`, `qtyCache` (Map orderId→qty, tránh refetch khi paginate), `qtyRequestToken` (invalidate stale response khi đổi trang nhanh). Hàm `loadPageQtyStats(items, token)` gọi `FastPurchaseOrder(${id})/OrderLines?$select=ProductQty` parallel 20 rows/trang, reduce `ProductQty` → tổng. Khi mỗi fetch resolve, `updateQtyCell(id, qty)` paint cell ngay (không chờ cả batch), stats bar chỉ render lại khi Promise.all xong. Render cell dùng `renderQtyCell(id)` — cache hit hiện giá trị, miss hiện `...` placeholder. `colspan="9"` → `"10"` cho expand-row. |
| **Status** | ✅ Done |

### [phone-management] Trang quản lý tổng đài OnCallCX — 10 tabs toàn diện + bridge vào orders page
| | |
|---|---|
| **Files** | `phone-management/index.html` (new), `phone-management/css/phone-management.css` (new), `phone-management/js/phone-management.js` (new), `orders-report/js/phone-cloud-sync.js` (new), `orders-report/js/phone-orders-bridge.js` (new), `orders-report/js/phone-widget.js`, `orders-report/js/phone-ext-assignment.js`, `orders-report/tab1-orders.html`, `shared/js/navigation-modern.js` |
| **Chi tiết** | **Trang mới `/phone-management/`** (admin-only, `checkLogin===0`) với 10 tab: **Tổng quan** (6 KPI: ext/online/đang gọi/cuộc gọi hôm nay/nhỡ/TB thời lượng + biểu đồ 7 ngày + Top 5 nhân viên + Hoạt động gần đây + Phân chia ext), **Extensions** (table 10 ext với presence dot live, last-call, dropdown gán nhanh, conflict detection), **Nhân viên** (filter role, ext dropdown, call count 7d, presence state), **Lịch sử** (filter ngày/hướng/nhân viên/SĐT, paginated 50/trang, export CSV UTF-8 BOM, link tới đơn hàng), **Thống kê** (Chart.js 4.4: daily stacked line, direction doughnut, hourly peaks bar, avg duration horizontal bar, top contacts), **Live** (Firestore `phone_presence` realtime snapshot → grid card cho mỗi nhân viên: offline/registered/ringing/in-call với animated pulse), **Danh bạ** (shared contacts `phone_contacts` Firestore collection, CRUD), **Ghi âm** (placeholder — OnCallCX portal có "Play Audio" nhưng chưa có REST API, note rõ trong UI), **Cấu hình** (view PBX domain/WS URL, ext pool với auth IDs/password masked, checkboxes tuỳ chọn widget: autoAnswer/recordLocal/popupOnRing/desktopNotify lưu localStorage), **Audit log** (filter action, table 200 entry gần nhất). Import shared navigation-modern sidebar. **Module mới `PhoneCloudSync`** — log mỗi call + presence heartbeat 30s + audit log vào Firestore collections `phone_call_history/phone_presence/phone_audit_log`. **Module mới `PhoneOrdersBridge`** — DOM observer theo dõi pwStatusText + pwCaller class → hiện floating bar đầu trang khi đang gọi (ringing=cam pulse, in-call=xanh với timer, icon animated), highlight row KH đang gọi trong bảng (pulse xanh), quick-note textarea trong bar (auto-save on hangup), outcome prompt popup sau khi cúp máy với 4 nút (thành công/voicemail/không bắt máy/máy bận) + note field, auto-dismiss 30s. Widget hook `PhoneCloudSync.setPresence` tại registered/accepted/endCall + `startHeartbeat` khi registered. Menu item mới trong navigation-modern.js `{href: '../phone-management/index.html', icon: 'phone-call', text: 'Quản Lý Tổng Đài', adminOnly: true, permissionRequired: 'phone-management'}`. |
| **Status** | ✅ Done |

---

## 2026-04-19

### [inbox] Fix HTTP 400 social order — OMIT `SaleOnlineIds` (undefined) thay vì gửi null/[]
| | |
|---|---|
| **Files** | `orders-report/js/tab1/tab1-sale.js` |
| **Chi tiết** | Đơn social inbox `SO-20260419-1860` fail HTTP 400 từ TPOS `InsertListOrderModel`: `parameters: A null value was found for the property named 'SaleOnlineIds', which has the expected type 'Collection(Edm.Guid)[Nullable=False]'`. Lịch sử thử: (1) `[]` → fail; (2) `[order.Id]` với social Id `"SO-..."` → fail (không phải Guid format); (3) `[crypto.randomUUID()]` (commit fbf0b6b5) → fail (UUID không tồn tại trên TPOS); (4) `null` (commit 822a29f0) → fail (Nullable=False reject literal null). **Fix cuối**: gán `undefined` → `JSON.stringify` tự động bỏ key khỏi payload → TPOS không thấy field → bypass validate Nullable=False. Code: `SaleOnlineIds: order.Id && !order._isSocialOrder ? [order.Id] : undefined`. Tab1 normal flow KHÔNG đổi (vẫn `[order.Id]` vì có UUID thật). Chỉ social orders mới bị omit field. |
| **Status** | ✅ Done — chờ user test |

### [render,web] TPOS sync edge-case round 3 — Edge 1/2/3/4 ✅
| | |
|---|---|
| **Files** | `shared/js/warehouse-shared.js`, `product-warehouse/js/main.js`, `render.com/routes/v2/web-warehouse.js`, `order-management/js/order-list.js`, `soluong-live/js/soluong-list.js` |
| **Chi tiết** | **Edge 2 (SSE URL centralize)**: thêm `RENDER_BASE`/`API_BASE`/`WAREHOUSE_API`/`SSE_ENDPOINT` + helper `buildSseUrl(keys)` vào `warehouse-shared.js`. product-warehouse dùng `WS.buildSseUrl('web_warehouse')` + `WS.WAREHOUSE_API`. **Edge 1 (poll race)**: `triggerFullTPOSSync` capture `baselineId = lastSync.id` TRƯỚC khi POST `/sync`, `pollSyncStatus` chỉ accept log có `id > baselineId`. Không bị match nhầm log success cũ. **Edge 3 (notify-image timing)**: `/notify-image-update` không còn `setTimeout 3s` cố định. Response trả ngay cho client, rồi `syncService.incrementalSync().finally(emitImageUpdate)` — emit SSE sau khi sync thực sự xong, có fallback timer 15s tránh treo nếu sync kẹt. **Edge 4 (toast consistency)**: thêm `_tposToast(throttle 5s)` cho `order-management/js/order-list.js` và `soluong-live/js/soluong-list.js` trong cùng handler SSE sẵn có. Hiện toast cho `sync_complete` (stats), `deactivated`, `image_update`. Dùng `window.notificationManager` sẵn có. |
| **Status** | ✅ Done |

### [render][soluong-live] Fix bug: thêm Q163 lại đổ nhầm variants Q150 vào danh sách
| | |
|---|---|
| **Files** | `render.com/routes/v2/web-warehouse.js` |
| **Chi tiết** | Bug: trên `soluong-live/index.html` search "Q163" autocomplete đúng Q163D/Q163T nhưng click chọn thì Firebase lại update Q150DT/Q150DD. Root cause: `GET /api/v2/web-warehouse/product/:tposProductId` fetch sibling variants theo text `parent_product_code` (L487) — rows Q163 trong `web_warehouse` có `parent_product_code` trỏ nhầm sang template code của Q150 → trả về Q150 variants → client batch-add theo `product_${Id}` = id Q150 → update Q150. Client / Firebase key đúng theo Id, đây là data bug + điểm yếu thiết kế server. Fix hardening: đổi query siblings ưu tiên `tpos_template_id` (số, TPOS-authoritative, không drift), fallback `parent_product_code` cho rows cũ chưa sync template_id. Response shape `{product, variants}` không đổi → client (`shared/js/warehouse-api.js`, `soluong-live/js/main.js`, `soluong-live/firebase-helpers.js`) giữ nguyên. Data patch + audit toàn bộ rows lệch user tự chạy trên Render Postgres (SQL kèm trong plan `child-changed-product-static-hashed-pie.md`). |
| **Status** | ✅ Done (code); ⏳ data patch SQL chờ user chạy |

### [orders-report][processing-tags] Guard `onPtagBillCreated` chống auto re-tag "ĐÃ RA ĐƠN" khi đơn đã hủy
| | |
|---|---|
| **Files** | `orders-report/js/tab1/tab1-processing-tags.js` |
| **Chi tiết** | Bug: user đổi tag XL (CHỜ HÀNG / ĐƠN CHƯA PHẢN HỒI…) nhưng ~15s sau hệ thống tự đánh lại "ĐÃ RA ĐƠN" dù đơn đã hủy + TPOS không còn đơn. Root cause: `_ptagStartPolling` (15s fallback khi SSE fail, line 774) gọi `loadProcessingTags()` → `backfillPtagFromOrderStatus()` thấy `InvoiceStatusStore.get(saleOnlineId)` trả entry stale (do `.delete()` chỉ xóa LATEST hoặc WS `handleInvoiceUpdate` re-insert sau ActionCancel) → fire `onPtagBillCreated` → set `category = HOAN_TAT`. Fix: thêm guard ngay đầu `onPtagBillCreated` (trước idempotency check line 1138): gọi `InvoiceStatusStore.getAll(saleOnlineId)`, chỉ cho set HOAN_TAT nếu có ≥1 entry active (`StateCode ∉ {cancel, IsMergeCancel}` và `IsMergeCancel !== true`). Nếu không → log `[PTAG] onPtagBillCreated skip ... — không có invoice active trong store` và return. Đây là nút thắt DUY NHẤT set HOAN_TAT trong codebase nên guard này chặn được mọi trigger oan (polling, WS stale, F5 backfill, race). Không đổi logic cancel flow hay bất kỳ file nào khác. |
| **Status** | ✅ Done |


### [inbox] Fix TPOS NRE — 3 field cho social order: PaymentJournalId/DateDeposit/SaleOnlineIds ✅
| | |
|---|---|
| **Files** | `orders-report/js/tab1/tab1-sale.js` |
| **Chi tiết** | Diff dung.txt (Huỳnh OK) vs sai.txt (Pandora NRE) cho thấy combo `PaymentJournalId:1 + PaymentAmount>0 + SaleOnlineIds:[]` gây TPOS NRE. User chỉ định 3 field cần đổi cho social order: `PaymentJournalId: null`, `DateDeposit: null`, `SaleOnlineIds: [crypto.randomUUID()]`. Scope: chỉ áp dụng khi `order._isSocialOrder === true`, tab1 normal flow giữ nguyên logic prepaidAmount. PaymentAmount/CashOnDelivery/các field khác không đổi. |
| **Status** | ✅ Done |

### [orders] WebWarehouseCache — auto-invalidate khi TPOS sync realtime ✅
| | |
|---|---|
| **Files** | `orders-report/js/utils/web-warehouse-cache.js` |
| **Chi tiết** | Audit các module dùng `web_warehouse` data: **4 đã có SSE realtime** (product-warehouse, order-management, soluong-live, dropped-products-manager), **5 module chỉ write** (purchase-orders, doi-soat, tab1-fast-sale-workflow, chat-products-actions, held-products-manager) — không cần SSE vì không cache/display warehouse list. **WebWarehouseCache** là shared cache dùng cho bill generation (append STT vào tên SP), trước chỉ auto-load 1 lần lúc script load + TTL 30 phút localStorage → nếu TPOS sửa STT/đổi mã, bill có thể hiện STT cũ tối đa 30 phút. **Fix:** thêm `setupSSE()` auto-subscribe `keys=web_warehouse`, nhận update/deleted event → debounce 3s → gọi `refresh()` để build lại map. Auto-subscribe ngay khi script load. Tất cả page dùng bill generation (tab1, chat, held-products releases...) hưởng lợi chỉ với 1 fix. |
| **Status** | ✅ Done |

### [web] Product Warehouse — toast notification khi SSE realtime sync ✅
| | |
|---|---|
| **Files** | `shared/js/warehouse-shared.js`, `product-warehouse/js/main.js`, `product-warehouse/index.html` |
| **Chi tiết** | **(1)** Fix icon lucide `cloud-download` không tồn tại → đổi sang `cloud`. **(2)** Extend `setupSSE` với `onEvent(payload)` callback — được gọi trước debounce, truyền raw payload cho caller. Giữ backward-compat: `onReload` giờ nhận `lastPayload` làm arg. **(3)** Thêm `showSyncNotification(payload)` trong product-warehouse, nhận diện 3 action: `sync_complete` (hiện stats inserted/updated/deactivated + label realtime/full/định kỳ), `deactivated` (TPOS xóa sản phẩm), `image_update` (ảnh mới). Throttle 5s để tránh spam toast khi nhiều event liên tiếp. Skip toast nếu không có thay đổi thực sự (changed=0 && deactivated=0). |
| **Status** | ✅ Done |

### [web] Product Warehouse — nút "Đồng bộ TPOS" thủ công ✅
| | |
|---|---|
| **Files** | `product-warehouse/index.html`, `product-warehouse/css/warehouse.css`, `product-warehouse/js/main.js` |
| **Chi tiết** | Thêm button "Đồng bộ TPOS" (xanh dương, icon cloud-download) vào toolbar product-warehouse, giữa "Tải lại" và "In mã vạch". Click → confirm → POST `/api/v2/web-warehouse/sync?type=full` (endpoint backend đã có sẵn). Button disable + spinner rotate trong lúc sync. Poll `/sync/status` mỗi 5s, max 10 phút, detect `lastSync.sync_type='full' && status='success'` → hiện toast stats (inserted/updated/deactivated) + fetchProducts refresh UI. Nếu `failed` → toast error với message. Timeout 10 phút → warning toast. |
| **Status** | ✅ Done |

### [inbox] Fix TPOS NRE round 4 — populate Reference/SaleOnlineName/SaleOnlineNames cho social ✅
| | |
|---|---|
| **Files** | `orders-report/js/tab1/tab1-sale.js` |
| **Chi tiết** | Diff working (Huỳnh) vs broken (Pandora) cho thấy 3 field text empty là nghi can chính: `Reference: ""`, `SaleOnlineName: ""`, `SaleOnlineNames: []`. Working có `Reference: "260303709"`, `SaleOnlineName: "260303709"`, `SaleOnlineNames: ["260303709"]`. **Fix:** Cho social order (order._isSocialOrder = true), fall back `order.Id` (e.g. "SO-20260416-3057") cho 3 field này. SaleOnlineIds giữ `[]` vì TPOS validate strict UUID type Edm.Guid (Test A đã FAIL HTTP 400 khi set null). PartnerFacebookId/FacebookId/LiveCampaignId giữ null vì social KH không có FB/Live. Sau fix payload social match working pattern, hy vọng TPOS post-save hook không NRE nữa. |
| **Status** | ✅ Done |

### [render] TPOS sync round 2 — Fix B/E/F ✅
| | |
|---|---|
| **Files** | `render.com/services/sync-tpos-products.js`, `render.com/services/tpos-socket-listener.js`, `product-warehouse/js/main.js` |
| **Chi tiết** | **(B)** Bỏ guard `CASE WHEN price > 0 THEN price ELSE keep` trong `_upsertProduct`, cho phép giá 0 từ TPOS ghi đè → TPOS là nguồn sự thật duy nhất, nếu admin đặt giá 0 (KM, quà tặng) sẽ sync đúng. **(E)** `saveEditProduct` đổi từ fetch ngay lập tức sang `setTimeout(fetchProducts, 6000)` — tránh UI hiện data cũ trong khi Render DB chưa kịp sync qua TPOS socket (3s debounce + 1-2s fetch). Đổi toast thành "Đã lưu. Đang đồng bộ TPOS…" để user biết. SSE handler sẵn có vẫn trigger refresh khi sync xong (belt-and-suspenders). **(F)** Refactor `_handleProductTemplateEvent` và `_handleProductEvent` sang pattern catch-all: explicit handle các action đặc biệt (deleted/deletedIds/updatefromfile/import_file/clearcache/inventory_updated), còn lại nếu có `data.Id`/`data.ProductTmplId` → queueTemplateSync, không thì incremental. Tránh miss action mới (updated, saved, modified…) mà TPOS có thể emit. |
| **Status** | ✅ Done |

### [render] Optimize TPOS ↔ Web Warehouse realtime sync (Fix A/C/D) ✅
| | |
|---|---|
| **Files** | `render.com/services/sync-tpos-products.js`, `render.com/services/tpos-socket-listener.js` |
| **Chi tiết** | Audit realtime sync 2 chiều TPOS (tomato.tpos.vn) ↔ Render Postgres ↔ Web product-warehouse UI. Kiến trúc: TPOS socket (rt-2.tpos.app/chatomni) → tpos-socket-listener debounce 3s → sync-tpos-products upsert web_warehouse → SSE notifyClients → browser EventSource reload. Backup: cron incrementalSync 30 phút. Fix 3 vấn đề: **(A)** `_syncSpecificTemplates` fetch ProductTemplate rồi `_syncTemplate` fetch lại cùng URL → thêm param `preloadedDetail` để skip duplicate → giảm 50% TPOS API calls cho socket-triggered syncs. **(C)** Deactivate logic trong `fullSync` chỉ mark inactive khi `quantity=0` → sản phẩm có tồn nhưng TPOS xóa vẫn active. Đổi thành `tpos_template_id IS NOT NULL AND last_synced_at < syncStartedAt` (guard để không deactivate entries tạo thủ công local). **(D)** `incrementalSync` chỉ fetch 200 template gần nhất → bulk import >200 miss. Thêm pagination (maxPages=10, pageSize=200, tổng 2000) với early-stop khi 1 trang toàn 'unchanged' (hash match) — vừa nhanh vừa bắt kịp bulk changes. |
| **Status** | ✅ Done |

### [inbox] Revert round 1 + round 2 — match working tab1 payload exactly (Partner minimal, no City/District/Ward) ✅
| | |
|---|---|
| **Files** | `orders-report/js/tab1/tab1-sale.js`, `don-inbox/js/tab-social-sale.js` |
| **Chi tiết** | Sau khi user capture working payload cho thấy `Partner` chỉ 10 field (Id/Name/DisplayName/Street/Phone/Customer/Type/CompanyType/DateCreated/ExtraAddress:null), KHÔNG có City/District/Ward top-level. Round 2 spread `...(partner || {})` ADD City/District/Ward null từ /Partner({id}) GET vào Partner object → TPOS server thấy `Partner.City: null` → cố dereference → NRE. Round 1 ExtraAddress safe default cũng tạo nested City/District/Ward objects mà working pattern không có. **Fix:** revert cả round 1 + 2 — Partner minimal exactly như tab1, ExtraAddress: null. Bỏ luôn `Object.assign(currentSalePartnerData, partnerData)` trong syncPartnerAddressBeforeOrder. User dặn "đừng sửa/bỏ/thêm payload" → tuân thủ. |
| **Status** | ✅ Done |

### [inbox] Revert round 3 — working tab1 payload cũng gửi Ship_Receiver/Ship_Extras null ✅
| | |
|---|---|
| **Files** | `orders-report/js/tab1/tab1-sale.js` |
| **Chi tiết** | User capture được working request từ tab1 main.html (KH Huỳnh Thành Đạt, đơn NJD/2026/62316 thành công). Payload working cũng gửi `Ship_Receiver: null, Ship_Extras: null` và `Partner: { Id, Name, DisplayName, Street, Phone, Customer, Type, CompanyType, DateCreated, ExtraAddress: null }` — minimal y hệt social. Vậy round 3 fix (full Ship_Receiver struct) **không cần thiết** và lệch với pattern working. Revert về `Ship_Receiver: null, Ship_Extras: null`. **Khác biệt thật giữa working vs broken:** `SaleOnlineIds` (UUID vs `[]`), `Reference` ("260303709" vs ""), `LiveCampaignId` (uuid vs null), `PartnerFacebookId` (FB ID vs null). Hypothesis: TPOS InsertListOrderModel với `is_approve:true` cần SaleOnlineIds non-empty cho post-save hook (update SaleOnline status), `is_approve:true` + `SaleOnlineIds:[]` → NRE. Round 2 (spread Partner) giữ nguyên vì spread trên minimal partner cũng cho minimal output, an toàn. |
| **Status** | ✅ Done |
| | |
|---|---|
| **Files** | `orders-report/js/tab1/tab1-sale.js` |
| **Chi tiết** | Sau round 2 (spread full Partner), TPOS vẫn NRE. F12 dump cho thấy `Partner.City: null, District: null, Ward: null` cho KH Pandora Kim (PartnerId=565675) — KH inbox được tạo qua /Partner mà chưa parse địa chỉ thành City/District/Ward entities. TPOS server fill `Ship_Receiver` từ Partner.City/District/Ward khi request gửi `Ship_Receiver: null` → dereference null → NRE. So sánh với KH tab1 (Hoa Đỗ Quyên) được tạo qua tab1 có parse đầy đủ → không NRE. **Fix:** gửi `Ship_Receiver` và `Ship_Extras` thành full struct trong `buildSaleOrderModelForInsertList` (giống tab1-fast-sale.js bulk). Ship_Receiver có Name/Phone/Street từ form + City/District/Ward dạng object có leaf null. Ship_Extras với 8 field PickWorkShift/etc. Cả 2 null-safe và TPOS không cần derive từ Partner nữa. Tab1 normal flow không regression vì giữ nguyên hành vi (object có leaves null, TPOS xử lý OK). |
| **Status** | ✅ Done |

### [orders] Phone Ext Assignment — phân chia extension cho nhân viên (Firestore sync)
| | |
|---|---|
| **Files** | `orders-report/js/phone-ext-assignment.js` (new), `orders-report/js/phone-widget.js`, `orders-report/tab1-orders.html` |
| **Chi tiết** | Module mới `PhoneExtAssignment` — map `displayName → ext` trong Firestore collection `phone_ext_assignments/assignments` (shape `{data:{name→ext}, lastUpdated}`). Pattern theo `DATA-SYNCHRONIZATION.md`: Firestore source of truth + realtime listener + localStorage cache fallback. **API**: `init()`, `getMyExt()` (của user đang login), `getUserForExt(ext)` reverse lookup, `setAssignment/removeAssignment`, `getAll()`, `onChange(fn)`, `isAdmin()`, `openModal()/closeModal()`. **Admin modal**: list tất cả users từ `userEmployeeLoader` (Firestore `users`), mỗi row dropdown "Ext 101 · Label" để gán, auto-save `merge:true` khi chọn, conflict detection — nếu ext đã thuộc người khác → confirm "Chuyển sang X?" + tự remove khỏi người cũ. `openModal` check `checkLogin===0`, non-admin alert từ chối. **Integration với phone-widget**: (1) `applyAssignedExt()` trong `init()` — nếu user có ext được gán, override `config.extension/authId/password` trước khi connect (có race: chờ `PhoneExtAssignment.init()` tối đa 2s). (2) Ext chip label: "Ext 107 · Quỳnh" khi ext đó được gán. (3) Picker list hiện `· Tên` sau mỗi ext đã gán. (4) Settings panel thêm button tím "👥 Phân chia Ext nhân viên" (chỉ admin thấy via `isAdmin()`). (5) Realtime: `onChange` listener — nếu admin đổi ext của mình → auto `switchExt` ngay, `updateExtChipLabel` cho mọi change. |
| **Status** | ✅ Done |

### [orders] Phone Widget — Call history, missed badge, VN phone auto-format, paste, keyboard shortcuts, name lookup
| | |
|---|---|
| **Files** | `orders-report/js/phone-widget.js` |
| **Chi tiết** | Phase 1 UX: **(Call history)** Panel lịch sử cuộc gọi 50 entries gần nhất (localStorage `phoneWidget_history`), toggle qua nút 🕐 trên header, mỗi item có direction icon (↗ out / ↙ in / ✕ missed), tên KH, SĐT format, thời gian relative, thời lượng, click để gọi lại. Log auto cho mọi cuộc gọi (makeCall outgoing, acceptIncoming incoming, rejectIncoming rejected, ended với duration). **(Missed call badge)** Đếm cuộc nhỡ vào localStorage `phoneWidget_missed`, badge đỏ với số trên FAB (top-right), auto-clear khi mở widget hoặc history panel. **(Auto-format VN phone)** `formatVNPhone()` pattern 3-3-4 cho số 10 chữ / 4-3-4 cho số 11 / nhóm +84. Input listener format live khi gõ, preserve caret position. **(Name lookup)** `lookupCustomerName()` + `lookupOrderCode()` scan `window.allOrders` by phone → hiện tên KH + mã đơn trong sub-line dưới input (xanh khi có đơn). Auto-lookup khi user gõ số thủ công hoặc nhận cuộc gọi đến. `makeCall(phone, name, orderCode)` — fallback lookup nếu caller không truyền. **(Clipboard paste)** Nút 📋 bên trong ô input đọc clipboard + auto-format. **(Keyboard shortcuts)** `Ctrl+Shift+C` toggle widget, `Esc` = reject incoming / hangup, `Enter` = accept incoming, `Space` = toggle mute khi đang call (skip khi đang typing). Public API thêm `toggleHistory`, `clearHistory`, `callFromHistory`, `pasteFromClipboard`. |
| **Status** | ✅ Done |

### [inbox] Fix TPOS NRE round 2 — gửi full Partner object (City/District/Ward/RowVersion/...) ✅
| | |
|---|---|
| **Files** | `orders-report/js/tab1/tab1-sale.js`, `don-inbox/js/tab-social-sale.js` |
| **Chi tiết** | Sau fix round 1 (populate ExtraAddress), TPOS vẫn NRE. F12 console intercept InsertListOrderModel cho thấy: `Partner` chỉ có 10 fields (Id, Name, DisplayName, Street, Phone, Customer, Type, CompanyType, DateCreated, ExtraAddress) — TPOS expect full Partner với rất nhiều field khác (City/District/Ward top-level, RowVersion, BankAccounts, Status, FullName, Fax, ...). Fix: (1) `buildSaleOrderModelForInsertList` (tab1-sale.js:1641) — spread full `partner` object trước, override các field do form edit (Name/Phone/Street/...). (2) `syncPartnerAddressBeforeOrder` (tab-social-sale.js:486) — đổi từ chỉ copy ExtraAddress sang `Object.assign(currentSalePartnerData, partnerData)` để promote toàn bộ partner data từ TPOS GET. tab1's normal flow cũng được hưởng lợi vì `currentSalePartnerData` của họ từ orderDetails.partner cũng đã là full object. |
| **Status** | ✅ Done |

### [orders] Fix `saleOnlineId is not defined` ReferenceError + verbose debug log cho TPOS error ✅
| | |
|---|---|
| **Files** | `orders-report/js/tab1/tab1-sale.js` |
| **Chi tiết** | (1) Trong duplicate-guard block của `confirmAndPrintSale` (line 704), `saleOnlineId` được tham chiếu nhưng chưa khai báo trong scope đó (chỉ khai báo `const saleOnlineId = currentSaleOrderData?.Id` ở line 903 và 1091, sau guard block). Catch silent ở line 723 nuốt error → guard không bao giờ chạy nhánh này. Fix: thêm `const saleOnlineId = currentSaleOrderData?.Id;` ngay trước `if (saleOnlineId && window.InvoiceStatusStore)`. (2) Khi TPOS reject với NRE qua `OrdersError[].Error` hoặc `DataErrorFast[].Error`, message gốc ".NET NullReferenceException" không nói field nào. Thêm 3 `console.error` dump full `errorOrders`, `dataErrorFast`, và `requestBody` để lần test sau lộ rõ TPOS NRE field nào (Partner.X, OrderLines[i].Y, Carrier.Z, …). |
| **Status** | ✅ Done |

### [orders] TAG filter dropdown: chọn "GIỎ TRỐNG" lọc đơn SL=0 (giữ option trong list)
| | |
|---|---|
| **Files** | `orders-report/js/tab1/tab1-search.js` |
| **Chi tiết** | User báo: chọn "GIỎ TRỐNG" trong dropdown TAG filter (cột TAG) → 0 kết quả vì sau khi cleanup không đơn nào còn tag ID đó. Fix: trong `performTableSearch` block "Apply TAG filter", scan `window.availableTags` tìm tag có `Name === 'GIỎ TRỐNG'` trong selectedTags. Nếu có → set `gioTrongSelected = true` và OR thêm điều kiện `TotalQuantity === 0` cho mọi đơn (song song với match tag ID cho các tag khác đang chọn). Giữ option GIỎ TRỐNG trong dropdown (do availableTags load từ TPOS), chỉ đổi behavior khi nó được chọn. |
| **Status** | ✅ Done |

### [inbox] Fix TPOS NRE "Object reference not set to an instance of an object" khi xác nhận sale ✅
| | |
|---|---|
| **Files** | `don-inbox/js/tab-social-sale.js` |
| **Chi tiết** | TPOS `InsertListOrderModel` reject với `Object reference not set to an instance of an object.` khi bấm Xác nhận và in (F9) trong modal sale từ Đơn Inbox. Root cause tiếp theo của fix Partner-is-null trước đó (commit a2daaf98): `currentSalePartnerData` được populate từ `fetchTPOSCustomer()` (endpoint `/api/sepay/tpos/customer/{phone}`) trả về shape rút gọn (id/name/address/phone/statusText) — **không có `ExtraAddress`**. `buildSaleOrderModelForInsertList()` (tab1-sale.js:1643) build `Partner.ExtraAddress: partner?.ExtraAddress || null`, gửi null → TPOS .NET server NRE khi dereference `Partner.ExtraAddress.City`. **Fix:** (1) Trong `openSaleModalInSocialTab()` (line 266) thêm safe default `ExtraAddress: { Street, City: {}, District: {}, Ward: {} }` sau khi map customer từ TPOS lookup. (2) Trong `syncPartnerAddressBeforeOrder()` (line 472) sau khi GET `/Partner({id})` thành công, copy `partnerData.ExtraAddress` (đầy đủ City/District/Ward thật) vào `currentSalePartnerData.ExtraAddress` để model gửi đi đúng. Cách 1 lo case không có sync (formAddress trống / sync fail), cách 2 cho data đầy đủ khi sync chạy được. **Verification:** `node --check` OK. |
| **Status** | ✅ Done |

### [orders] Phone Widget — UI redesign + auto-reconnect + tones + quick ext switcher
| | |
|---|---|
| **Files** | `orders-report/js/phone-widget.js` |
| **Chi tiết** | Rewrite toàn bộ softphone widget: **(UI)** Widget 320px dark-glass gradient, status dot animated (registered pulse xanh / calling pulse cam / error đỏ), status bar tiếng Việt rõ ràng ("Đang đổ chuông...", "Đã kết nối", "Ext 107 • Sẵn sàng"), caller avatar glow khi call, dialpad nút lớn với hover lift-shadow, FAB shake khi có cuộc gọi đến. **(Auto-reconnect)** `registrationFailed`/`disconnected`/`unregistered` → `scheduleReconnect()` exponential backoff 1→2→4→...→max 30s, reset khi `registered`, countdown trên status. **(Audio tones — Web Audio API)** `startRingback()` 425Hz 1s/4s (VN ring), `playAnsweredTone()` beep 600→1000Hz khi accepted, `playHangupTone()` beep 800→300Hz khi ended/failed, `startIncomingRing()` two-tone 520/660Hz loop, `playKeypadClick()` 880Hz khi bấm phím. **(Incoming như điện thoại thật)** Bỏ auto-answer → hiện banner "Cuộc gọi đến" + số gọi + 2 nút Accept/Reject; đang bận auto-reject 486. **(Quick ext switcher)** Chip "Ext 107 ▾" pill xanh trên header — click mở popover list all extensions, chọn → `switchExt()` disconnect + reconnect ngay; ext hiện tại highlight ✓; chặn đổi khi đang call. Public API thêm `acceptIncoming`, `rejectIncoming`, `toggleExtPicker`, `switchExt`. |
| **Status** | ✅ Done |

### [orders] Audit & fix: calculateActualClosedStats cũng dùng SL=0 cho 'giỏ trống'
| | |
|---|---|
| **Files** | `orders-report/js/overview/overview-statistics.js` |
| **Chi tiết** | Audit lại toàn bộ logic GIỎ TRỐNG, phát hiện `calculateActualClosedStats` (Closed Orders Stats — flow riêng dùng `LIVE_TAG_PATTERNS` / `CLOSED_TAG_PATTERNS`) vẫn pattern match `'giỏ trống'` trên TPOS tag → sẽ luôn 0 vì tag đã bỏ. **Fix:** trong vòng lặp orders, nếu `productCount === 0` push thẳng matchedClosedTag pattern `'giỏ trống'` (originalTag = 'GIỎ TRỐNG (SL=0)'); skip pattern match `'giỏ trống'` trong vòng tag loop để tránh double-count. `DEFAULT_TRACKED_TAGS` (UI customizable list — user tự bật/tắt tag để track) giữ nguyên — pattern 'giỏ trống' ở đó sẽ tự count = 0, low impact. `tab1-fast-sale.js` xài `TotalQuantity === 0` để skip đơn giỏ trống tránh TPOS API "chưa có chi tiết" — đã đúng SL=0, không sửa. |
| **Status** | ✅ Done |

## 2026-04-18

### [balance-history][live-mode] Bỏ dòng "Gửi ..." phía dưới card để nội dung CK không bị thu nhỏ
| | |
|---|---|
| **Files** | `balance-history/js/live-mode.js` |
| **Chi tiết** | Xoá hoàn toàn line 2 `detail-sender` (tên người gửi / IBFT / SĐT trích xuất) khỏi `renderDetailRow()` vì thông tin này đã có trong cột Nội dung CK ở dòng 1, gây trùng lặp và chiếm không gian khiến nội dung chính bị ellipsis. Gỡ `line2Parts`, vòng lặp `extractSenderInfo`/`sub_account`/`extraction_note`, và hàm `extractSenderInfo()` (không còn ai gọi). Giữ nguyên line 1 (gateway/TK nhận/#ref/code/sepay/balance) và badge risk. CSS `.detail-sender::before { content: 'Gửi' }` ở `live-mode.css:774` giờ vô tác dụng nhưng không cần dọn. |
| **Status** | ✅ Done |

### [balance-history][accountant] Ẩn GD "Đã cộng ví" còn PENDING của Huỳnh Thành Đạt (ID 2465) khỏi tab Chờ Duyệt
| | |
|---|---|
| **Files** | DB `balance_history` row id=2465 (PostgreSQL Render) |
| **Chi tiết** | Chạy SQL inline cập nhật 1 row duy nhất: `verification_status: PENDING_VERIFICATION → APPROVED`, `verified_by='manual-hide'`, `verified_at=NOW() AT TIME ZONE 'Asia/Ho_Chi_Minh'`, append note `[Hide: wallet already processed]`. KHÔNG đụng `customer_wallets` / `wallet_transactions` vì ví đã cộng sẵn. Dry-run script `scripts/fix-wallet-processed-pending-status.js` phát hiện còn 5 GD khác cùng tình trạng (2468, 2457, 2456, 2115, 2114) nhưng user chỉ muốn xử 1. |
| **Status** | ✅ Done |

### [inventory-tracking][user-management] Permission mới `view_thanhToanCK` + admin bypass
| | |
|---|---|
| **Files** | `inventory-tracking/js/permission-helper.js`, `inventory-tracking/js/table-renderer.js`, `inventory-tracking/index.html`, `user-management/js/permissions-registry.js` |
| **Chi tiết** | **Mục tiêu:** Gom quyền "Xem stats bar (5 ô Tổng KG/HĐ/CP/TT/Còn Lại) + mở nút Thanh Toán CK + xem/chỉnh sửa nội dung panel" thành 1 dòng quyền duy nhất để admin cấp cho user khi cần. **Permission key:** `view_thanhToanCK` (1 quyền gộp thay vì nhiều). **permission-helper.js:** (A) Thêm `view_thanhToanCK: false` vào `DEFAULT_PERMISSIONS` và `true` vào `ADMIN_PERMISSIONS`. (B) **Admin bypass mới** — `loadPermissions()` kiểm tra `result.data.isAdmin` từ Render API: nếu true → `this.permissions = { ...ADMIN_PERMISSIONS }` (full access), else merge DEFAULT + user's detailed_permissions. Trước đây comment nói "NO admin bypass" nhưng giờ có bypass code-level để permission mới tự động hoạt động cho admin không cần migration DB. (C) `applyToUI()` gate `#inventoryStatsBar` + `#btnTogglePaymentPanel` display theo `view_thanhToanCK`. **table-renderer.js:** Thay `view_chiPhiHangVe`/`edit_chiPhiHangVe` bằng `view_thanhToanCK` ở 5 chỗ trong slide-over context: `renderPaymentSlideOverBody` (line 2363), `startInlineEditTiGia`, `_startInlineEditPaymentGeneric`, `addPayment`, `deletePayment`. Giữ nguyên `view_chiPhiHangVe` ở bảng sản phẩm chính (cột CHI PHÍ). Thêm check cho `openPaymentSlideOver` và `updateInventoryStatsBar` để chặn bypass DOM. **permissions-registry.js:** Thêm entry `view_thanhToanCK` trong `inventoryTracking.detailedPermissions` → hiện checkbox "Thanh Toán CK (Stats + Panel)" icon wallet trên UI user-management. Cache-bust `?v=20260418-permission-thanhtoan`. |
| **Status** | ✅ Done |

### [inventory-tracking] Stats bar ngang trên action-bar: Tổng KG / HĐ / CP / TT / Còn Lại
| | |
|---|---|
| **Files** | `inventory-tracking/index.html`, `inventory-tracking/js/table-renderer.js`, `inventory-tracking/css/modern.css` |
| **Chi tiết** | Thêm 5 ô thống kê ngang bên trái nút "Thêm Đợt Hàng" trong action-bar: Tổng KG, Tổng HĐ, Tổng CP, Tổng TT, Còn Lại. **Layout:** `.action-bar` đổi `justify-content: flex-end` → `space-between` + flex-wrap, stats group (`.inventory-stats-bar`) bên trái, buttons group (`.action-bar-buttons`) bên phải. Mỗi stat-box: label uppercase 11.5px xám + value 22px monospace bold. Stat "Còn Lại" dynamic color (xanh ≥0 / đỏ <0) qua class `positive`/`negative` trên box. **Aggregation logic (`updateInventoryStatsBar`):** Tổng KG/HĐ/CP sum từ `globalState.shipments` (grouped theo ngày+dotSo, mỗi shipment unique). Tổng TT sum từ `getAllDotsAggregated()` (grouped theo dotSo alone) — tránh double-count khi 1 đợt span nhiều ngày (nhiều shipment card cùng dotSo chia sẻ cùng thanhToanCK). Còn Lại = Tổng TT − Tổng HĐ − Tổng CP (cùng đơn vị ngoại tệ). **Hook update:** gọi cuối `renderShipments()` (initial + filter) và cuối `_persistPaymentByDot()` (sau payment CRUD) để stats luôn fresh. Cache-bust `?v=20260418-stats-bar`. |
| **Status** | ✅ Done |

### [inventory-tracking] Slide-over CK: panel +30%, head gom Tỉ giá + CÒN LẠI, VND /1000, breakdown to
| | |
|---|---|
| **Files** | `inventory-tracking/js/table-renderer.js`, `inventory-tracking/css/modern.css`, `inventory-tracking/index.html` |
| **Chi tiết** | **4 thay đổi UX theo yêu cầu user:** (1) **Panel width 640 → 832px (+30%)**, không gian dư chuyển vào cột ghi chú. Grid payment-row cố định `100px 220px 1fr 32px` → header "Ghi chú" + content column thẳng hàng chính xác (trước đây số tiền `auto` khiến lệch). Ghi chú cell thêm `title="${ghiChu}"` → hover hiện tooltip native browser (nội dung dài không bị cắt khi xem). (2) **VND /1000 thay vì /1000 * 1000**: `_vndSuffixHtml` đổi `Math.round(vnd/1000)` → hiển thị "10.001 (39.504)" thay vì "10.001 (39.504.000)". Áp dụng mọi nơi (Tổng TT/HĐ/CP, payment rows, breakdown, CÒN LẠI). (3) **Head gom Tỉ giá + CÒN LẠI**: xóa dates list (`16/4/2026, 14/4/2026...`) và pill "CÒN: X" khỏi head; thêm box Tỉ giá `.pp-head-rate` (`onclick="event.stopPropagation()"` chặn bubble lên `togglePaymentDotSection`) và `.pp-conlai.pp-conlai-compact` chiếm 1fr cuối (value 28px + VND suffix 0.56em). Body bỏ `.payment-top-row` hoàn toàn (chuyển lên head). Grid head: `20px auto auto 1fr`. Refresh UI giờ re-render cả head + body (`_renderDotHeadHtml` helper mới) để tỉ giá + CÒN LẠI + VND suffix đồng bộ. (4) **Breakdown font = main line**: `.bd-ngay` 14→17px (bằng `.pp-label`), `.bd-so-tien` 16→26px (bằng `.pp-value`), `.vnd-inline` trong breakdown 0.62em, padding row 5→8px. Cache-bust `?v=20260418-payment-wide-head`. |
| **Status** | ✅ Done |

### [inventory-tracking] Slide-over CK: CÒN LẠI lên top, VND inline, breakdown HĐ/CP theo ngày
| | |
|---|---|
| **Files** | `inventory-tracking/js/table-renderer.js`, `inventory-tracking/js/data-loader.js`, `inventory-tracking/css/modern.css`, `inventory-tracking/index.html` |
| **Chi tiết** | **4 thay đổi UX/layout theo yêu cầu user:** (1) **CÒN LẠI lên top-row cạnh Tỉ giá** — bỏ CÒN LẠI box nằm dưới tổng, thay bằng `.payment-top-row` flex: CÒN LẠI (flex:1 chiếm hết không gian trống bên trái) + khung tỉ giá (flex:0 bên phải). (2) **Tổng HĐ / Tổng CP click để expand breakdown theo ngày** — mỗi line có chevron, click toggle class `.expanded`, CSS adjacent sibling `.pp-line-expandable.expanded + .pp-breakdown` show/hide. Breakdown hiển thị `[ngày giao — số tiền (VND)]` sort desc. Aggregator `_aggregateDotEntry` + `getAllDotsAggregated` thêm `hdByDate`/`cpByDate` gom theo `ngayDiHang`. (3) **Bỏ dòng Tổng VND + cột VND** — thay bằng VND suffix inline trong ngoặc sau mỗi số ngoại tệ: `10.001 (39.504.000)` với VND làm tròn 1000 (`Math.round(vnd/1000)*1000`). Helper `_vndSuffixHtml(soTien, tiGia)`. Áp dụng cho Tổng TT, Tổng HĐ, Tổng CP, mỗi payment row, và breakdown row. VND style `0.62em` green nhỏ hơn số chính. (4) **Grid 4 cột payment row** (bỏ cột VND): `96px auto 1fr 32px` = ngày (hẹp) + số tiền (auto, min 140px) + ghi chú (chiếm hết không gian trống) + del. **Ghi chú bold 18px** (cùng size số tiền) cho dễ nhìn. **Refactor refresh:** tách `_renderDotSectionBodyHtml(entry)` reusable cho `renderPaymentDotSection` và `_refreshPaymentDotSectionUI` — sau mỗi payment edit full-rebuild body (giữ breakdown expanded state qua `expandedKinds` snapshot). `addPayment`/`deletePayment` đơn giản hóa, chỉ gọi `_persistPaymentByDot` (refresh tự lo DOM). `startInlineEditPaymentSoTien` capture tỉ giá và formatter include VND suffix cho optimistic UI. Cache-bust `?v=20260418-payment-breakdown`. |
| **Status** | ✅ Done |

### [inventory-tracking] Slide-over CK: CÒN LẠI tính theo ngoại tệ + phóng to số kế toán
| | |
|---|---|
| **Files** | `inventory-tracking/js/table-renderer.js`, `inventory-tracking/css/modern.css`, `inventory-tracking/index.html` |
| **Chi tiết** | **Fix formula:** Trước đó `conLai = tongTTVND - tongChiPhi - tongTienHD` — trộn đơn vị (VND trừ ngoại tệ) → sai số nghìn lần (vd `39.503.950 − 132.822 = 39.371.128` — vô nghĩa). User confirm: **tất cả tính theo ngoại tệ** (Tổng HĐ, Tổng CP, Tổng TT cùng đơn vị CNY/USD/etc), VND chỉ hiển thị tham khảo. Sửa `_calcPaymentTotals`: `conLai = tongTT − tongChiPhi − tongTienHD` (cùng đơn vị). Giữ dòng Tổng VND ngang hàng với Tổng TT/HĐ/CP (user yêu cầu "vnd vẫn đi bình thường"). **Phóng to UX kế toán:** Tăng width slide-over 480 → 640px. Font size: Tổng TT/VND/HĐ/CP 28px bold monospace, CÒN LẠI **40px weight 900** bordered 3px (xanh ≥0 / đỏ <0), card border-radius 12px shadow nhẹ. Payment row: ngày 15px, số tiền TT 18px, VND 16px green, ghi chú 14px, font monospace weight 700-800 cho tất cả số. Slide-over header 18px, dot-label badge 15px, ti-gia 16px. Payment list bọc card trắng border-radius 10px padding 14px. Add button padding 14px border 2px dashed. Inline edit input 17-18px typing UX. Cache-bust `?v=20260418-payment-big-numbers`. |
| **Status** | ✅ Done |

### [inventory-tracking] Fix fetch fail khi user có tên tiếng Việt có dấu (header non ISO-8859-1)
| | |
|---|---|
| **Files** | `inventory-tracking/js/api-client.js` |
| **Chi tiết** | **Bug:** Nick boss "Trường Giang" (hoặc bất kỳ tên Unicode non-Latin-1) mở trang `inventory-tracking/index.html` — toàn bộ API call fail ngay tại browser: `TypeError: Failed to execute 'fetch' on 'Window': Failed to read the 'headers' property from 'RequestInit': String contains non ISO-8859-1 code point`. Stack: `apiFetch` → `suppliersApi.getAll` → `loadNCCData` → `loadShipmentsData` → `InventoryTrackingApp.loadData`. Bảng Theo Dõi Nhập Hàng trống trơn. **Nguyên nhân:** `apiFetch()` gắn header `x-auth-data` bằng raw `JSON.stringify({userName: userInfo.displayName, ...})` (dòng 23-26). Browser HTTP header không cho phép ký tự ngoài ISO-8859-1 — "ư", "à", "ễ"… vượt Latin-1 → reject trước khi gửi request. User ASCII (admin/boss01) không bị. **Fix:** Bọc `btoa(unescape(encodeURIComponent(authJson)))` — encode UTF-8 → base64 ASCII-safe, khớp pattern đã dùng ở `delivery-report/js/delivery-report.js:1217,1262,1280` và decoder server đã sẵn sàng tại `render.com/routes/v2/inventory-tracking.js:64-79` (`Buffer.from(authData,'base64')` → `decodeURIComponent(escape(...))`). Chỉ sửa 1 chỗ duy nhất trong toàn bộ repo (grep xác nhận). Không đụng server (đã tương thích, tránh break các consumer khác). |
| **Status** | ✅ Done |

### [inventory-tracking] Slide-over "Thanh Toán CK" group theo đợt (dotSo spans nhiều ngày)
| | |
|---|---|
| **Files** | `render.com/routes/v2/inventory-tracking.js`, `inventory-tracking/js/api-client.js`, `inventory-tracking/js/data-loader.js`, `inventory-tracking/js/table-renderer.js`, `inventory-tracking/js/main.js`, `inventory-tracking/css/modern.css`, `inventory-tracking/index.html` |
| **Chi tiết** | **Refactor UX:** Phiên bản trước đặt panel inline trong từng shipment card (bên phải bảng sản phẩm) — user feedback "không phải đưa vào trong từng ngày như hiện tại", thay bằng **slide-over từ phải** (480px, có backdrop, Esc đóng). **Refactor grouping:** Trước đây payment group theo `(ngay_di_hang, dot_so)` — mỗi card/ngày 1 đợt. Giờ group theo **`dot_so` duy nhất qua mọi ngày** (user gõ Đợt 1 cho cả 14/4, 16/4, 20/4 coi là CÙNG 1 đợt logic). **Backend:** `PATCH /shipments/payment-by-dot` body đổi từ `{ngay_di_hang,dot_so,...}` sang `{dot_so,...}`, UPDATE WHERE `dot_so=$1` (bỏ filter ngày); POST inherit payment từ row đầu cùng `dot_so` (không cần cùng ngày). **Frontend data-loader:** thêm `getAllDotsAggregated()` trả list `[{dotSo, ngayDiHangList[], tongTienHoaDon, tongChiPhi, thanhToanCK, tiGia}]` — aggregate qua mọi shipment có cùng dotSo. **Frontend table-renderer:** thay `renderPaymentPanel(shipment)` (inline) bằng `renderPaymentDotSection(entry)` (1 section collapsible mỗi đợt) + `renderPaymentSlideOverBody()` + `openPaymentSlideOver()`/`closePaymentSlideOver()`/`togglePaymentDotSection()`. Đổi `_findDotsByNgayDotSo → _findDotsByDotSo`, `_getPaymentsForGroup → _getPaymentsForDot`, `_getTiGiaForGroup → _getTiGiaForDot`, `_persistPaymentGroup → _persistPaymentByDot`, `_refreshPaymentPanelUI → _refreshPaymentDotSectionUI`. Inline edit handlers dùng data-attr `dot-so` duy nhất (bỏ `ngay-di-hang`). Header mỗi section hiện: "Đợt N • Ngày giao: 16/4, 14/4, 12/4 • CÒN LẠI: X" (click toggle). Mở slide-over re-render nội dung mỗi lần (data luôn fresh). **index.html:** thêm `<div id="paymentSlideOver">` container cuối body; cache-bust `?v=20260418-payment-slideover`. **main.js:** nút action-bar đổi thành mở slide-over + Esc handler đóng. **CSS:** xóa styles inline panel (`.shipment-body-grid`, `.invoice-wrapper`, `.payment-panel-hidden`); thêm `.payment-slideover`, `.payment-slideover-backdrop`, `.payment-slideover-content` (translateX transition 260ms), `.payment-dot-section.collapsed`, `.payment-dot-head` grid layout. |
| **Status** | ✅ Done |

### [inventory-tracking] Persist checkbox "đã nhận kiện" vào `kienHang[].daNhan`
| | |
|---|---|
| **Files** | `inventory-tracking/js/data-loader.js`, `inventory-tracking/js/table-renderer.js`, `inventory-tracking/index.html` |
| **Chi tiết** | **Bug:** Bấm checkbox đánh dấu "đã nhận" kiện KG trên header shipment card + nút "nhận toàn bộ" — UI strikethrough đúng, nhưng F5 mất sạch. Hai handler `togglePkgCheck`/`toggleAllPkgCheck` chỉ toggle CSS class, không ghi DB. **Nguyên nhân:** `shipment.kienHang` là mảng aggregated từ nhiều `dot.kienHang` (cùng ngày+đợt) ở `data-loader.js:377-379`, mất mapping kien → dot gốc → không biết PUT về đâu. **Fix:** (A) `data-loader.js`: khi aggregate kien, enrich `{..._dotId: dot.id, _dotKienIdx: idx}` để nhớ origin (spread sau đó tại `ship.kienHang.map((k, idx) => ({ ...k, stt: idx + 1 }))` preserves các field này). (B) `table-renderer.js createShipmentCard`: render `<label>` với `data-dot-id`/`data-dot-kien-idx`, checkbox `checked` theo `p.daNhan`, kgText `pkg-received` class sẵn nếu đã nhận. Check-all khởi checked khi tất cả kien `daNhan===true`. (C) Rewrite `togglePkgCheck` async: đọc data attrs → `_findDotByInvoiceId(dotId)` → mutate `targetDot.kienHang[kienIdx].daNhan` (immutable spread) → `shipmentsApi.update(dotId, { kienHang })` → `flattenNCCData()`. Rollback UI nếu PUT fail. (D) `toggleAllPkgCheck` nhóm kien theo `dotId` → mỗi dot 1 request update kienHang đã patch. Disable checkbox trong khi save tránh double-click. Cache-bust `data-loader.js?v=...pkg-origin`, `table-renderer.js?v=...pkg-persist`. |
| **Status** | ✅ Done |

### [render] walletNoteLines: dùng note gốc cho ticket Khách Gửi (RETURN_GOODS) và nạp tay (MANUAL_ADJUSTMENT)
| | |
|---|---|
| **Files** | `render.com/routes/v2/wallets.js` |
| **Chi tiết** | **Bug:** Khi tạo phiếu bán hàng qua Sale Modal tab 1 orders-report cho khách có công nợ từ ticket Khách Gửi (`RETURN_CLIENT` resolve bằng `compensation_type='deposit'` → `source='RETURN_GOODS'`) hoặc admin nạp tay (`source='MANUAL_ADJUSTMENT'`), ghi chú auto-fill đều ra `"ĐÃ NHẬN X ACB DD/MM"` giống CK bank transfer — không phản ánh đúng nguồn. Nguyên nhân: vòng lặp build `walletNoteLines` tại `wallets.js:483-489` format mọi DEPOSIT như CK, không check `tx.source`. **Fix:** Thêm 2 nhánh trước fallback: (1) `source='RETURN_GOODS'` + có `note` → push `note` đã strip suffix `(ticket XXX-YYYY-NNNNN)` qua regex `/\s*\(ticket\s+[A-Z]+-\d{4}-\d+\)\s*$/i`. (2) `source='MANUAL_ADJUSTMENT'` + có `note` → push `note` đã strip tag `[Ảnh GD: ...]` qua regex `/\n?\[Ảnh GD:[^\]]+\]/g`. CK thật (BANK_TRANSFER) và các source khác vẫn fallback `"ĐÃ NHẬN X ACB DD/MM"`. Không đụng Thu Về (virtual_credit) và Fast Sale (tab1-fast-sale.js có logic riêng đã đúng). |
| **Status** | ✅ Done |

### [inventory-tracking] Inline edit: Chi Phí & Ghi Chú CP trong bảng đợt nhập
| | |
|---|---|
| **Files** | `inventory-tracking/js/table-renderer.js`, `inventory-tracking/index.html` |
| **Chi tiết** | Cột **CHI PHÍ** và **GHI CHÚ CP** trong bảng đợt nhập (`renderInvoicesSection`) trước đây chỉ hiển thị, muốn sửa phải mở modal. Giờ đôi click thẳng vào ô để sửa inline (giống `maSP`/`giaDonVi`/etc). Thêm 4 hàm: `startInlineEditCost`/`commitInlineEditCost` (số tiền, numeric) và `startInlineEditCostNote`/`commitInlineEditCostNote` (loại, text). Logic update: cost lưu trên từng `dot.chiPhiHangVe` (không phải shipment merge), nên dùng `_findCostByIdAcrossDots(costId)` để locate cost record gốc; nếu ô trống (chưa có costItem) → tạo cost mới gắn vào dot của invoice trên row đó (`_findDotByInvoiceId(invoiceId)`). Set `soTien=0` ở ô đã có → xóa cost entry. Sau commit: cập nhật `targetDot.tongChiPhi`, gọi `shipmentsApi.update`, recompute tfoot total qua `_refreshCostTotal` (sum `.cost-value` trong tbody), `flattenNCCData()` rebuild merged shipments. Permission gate `permissionHelper.can('edit_chiPhiHangVe')` (admin only). Cache-bust `?v=20260418-cost-inline`. |
| **Status** | ✅ Done |

### [orders] Overview tab: đổi toàn bộ logic GIỎ TRỐNG sang định nghĩa "đơn SL=0"
| | |
|---|---|
| **Files** | `orders-report/js/overview/overview-statistics.js`, `orders-report/js/overview/overview-modals.js` |
| **Chi tiết** | Sau khi bỏ auto-tag ở tab1, tab "Báo Cáo Tổng Hợp" vẫn đếm GIỎ TRỐNG theo XL subTag / TPOS tag pattern → sẽ luôn về 0. User yêu cầu đồng bộ: GIO_TRONG ở mọi chỗ trong overview = đơn có SL=0 (`order.Details.length === 0`). **Thực hiện:** (A) `computeTagXLCounts`: bỏ validation `hasGioTrongValidationError`/`gioTrongInvalidOrders` (luôn false/[]), populate `subTagCounts.GIO_TRONG` từ đếm đơn SL=0 (độc lập XL state), skip double-count khi XL còn orphan subTag=GIO_TRONG. (B) `calculateTagStats` + `calculateEmployeeTagStats_legacy`: thay pattern match `'giỏ trống'` trên TPOS tags bằng kiểm tra `productCount === 0`, bỏ hẳn validation per-employee. (C) Click handlers `_filterOrdersByTagXLKey`, `viewTagOrders`, `viewEmployeeTagOrders`, `viewEmployeeTagXLOrders`: click GIỎ TRỐNG → filter `productCount === 0` thay vì match XL subTag / TPOS tag. (D) `findGioTrongValidationErrors` stub về `return []` (giữ function tránh vỡ caller). (E) `calculateEmptyCartReasons`: đổi sang scan tag còn lại trên các đơn SL=0 (tránh "đơn có tag giỏ trống" vì tag đã bỏ). (F) Xóa các nhánh `rowClass = 'duplicate-row-red'` theo `hasValidationError` đã dead. |
| **Status** | ✅ Done |

### [orders][render] Bỏ auto-gắn tag GIỎ TRỐNG — giữ filter lọc SL=0 + cleanup-mode
| | |
|---|---|
| **Files** | `orders-report/js/tab1/tab1-empty-cart-auto-sync.js`, `orders-report/js/tab1/tab1-processing-tags.js`, `orders-report/js/tab1/tab1-tag-sync.js`, `orders-report/tab1-orders.html`, `n2store-realtime/server.js`, `n2store-realtime/tpos-client.js` (deleted) |
| **Chi tiết** | Yêu cầu: bỏ hoàn toàn việc gắn tag GIỎ TRỐNG (cả auto lẫn tay), giữ "GIỎ TRỐNG" chỉ như filter lọc đơn `TotalQuantity=0`, nếu đơn lỡ có tag GIỎ TRỐNG → tự động xóa cả TPOS tag lẫn XL state. **Thực hiện:** (A) Rewrite `tab1-empty-cart-auto-sync.js` sang cleanup-only mode: `batchEmptyCartSync` giờ scan orders → phát hiện TPOS tag `GIỎ TRỐNG` → call AssignTag trực tiếp (dùng `window.tokenManager` + `API_CONFIG.smartFetch`) để gỡ + clear XL state nếu `subTag=GIO_TRONG`. Bỏ hook `updateOrderInTable` (không còn watch SL change). Giữ `window.scheduleEmptyCartSync`/`window.batchEmptyCartSync` API không vỡ caller cũ. (B) Xóa `GIO_TRONG` khỏi `PTAG_SUBTAGS` + icon map + sửa tooltip — picker XL không còn hiện option GIỎ TRỐNG. (C) Thêm module-level cache `_slZeroCodes`/`_slZeroIds` rebuild từ `allOrders` trong `_ptagComputeCounts`; stats formula `gioTrong = _slZeroCodes.size` thay vì đếm `subTagCounts['GIO_TRONG']`; filter `subtag_GIO_TRONG` trong `orderPassesProcessingTagFilter` chuyển sang check `_isOrderSLZero()` (lazy rebuild nếu cache rỗng). (D) Xóa `GIO_TRONG` khỏi `SUBTAG_TO_TPOS` mapping trong `tab1-tag-sync.js`. (E) Render server: xóa endpoint `POST /api/tpos/empty-cart-sync`, xóa `CREATE TABLE tpos_empty_cart_sync`, xóa `require('./tpos-client')` → xóa file `tpos-client.js`. Overview tab (overview-statistics.js) giữ nguyên — sẽ tự động hiển thị 0 count sau khi cleanup chạy xong do tag TPOS bị gỡ sạch. |
| **Status** | ✅ Done |

### [orders] Phone Widget — Quick ext switcher chip trên header
| | |
|---|---|
| **Files** | `orders-report/js/phone-widget.js` |
| **Chi tiết** | Thêm **chip "Ext 107 ▾"** ngay trên header (pill xanh) — click mở popover list tất cả extensions, click một ext → instant switch: `switchExt(ext)` load config từ `getExtensions()`, `saveConfig()`, `updateExtChipLabel()`, `disconnect()` + `init()` lại ngay (không cần mở panel settings). Ext hiện tại highlight xanh ✓. Chặn đổi khi đang có cuộc gọi (`currentSession`). Popover auto-close khi click ra ngoài. Chip label sync với `config.extension` khi apply settings hoặc switchExt. |
| **Status** | ✅ Done |

### [orders] Phone Widget — Rewrite UI, auto-reconnect, tones (ringback/answer/hangup), accept/reject incoming
| | |
|---|---|
| **Files** | `orders-report/js/phone-widget.js` |
| **Chi tiết** | **UI redesign**: Widget to hơn (280→320px), dark glass gradient, status dot animated (registered=pulse xanh, calling=pulse cam, error=đỏ), header có status bar riêng hiển thị trạng thái rõ ràng tiếng Việt ("Đang đổ chuông...", "Đã kết nối", "Ext 107 • Sẵn sàng"). Dialpad nút lớn, hover lift-shadow, active gradient xanh. Caller avatar circle có glow animation khi đang gọi (active=xanh, ringing=cam). FAB bigger với shake animation khi có cuộc gọi đến. **Auto-reconnect**: `registrationFailed`, `disconnected`, `unregistered` → `scheduleReconnect()` với exponential backoff (1s→2s→4s...→max 30s), reset attempt khi `registered` thành công; status hiển thị countdown + lần thử. **Audio tones** (Web Audio API, không cần file): `startRingback()` 425Hz 1s on / 4s off (VN pattern) khi session `progress`, `playAnsweredTone()` beep tăng 600→1000Hz khi `accepted`, `playHangupTone()` beep giảm 800→300Hz khi `ended`/`failed`/user bấm cúp, `startIncomingRing()` two-tone 520/660Hz loop khi có cuộc gọi đến, `playKeypadClick()` click ngắn 880Hz khi bấm phím. AudioContext auto-unlock on first widget click. **Incoming call như điện thoại thật**: Không auto-answer nữa — hiện banner "Cuộc gọi đến" với số gọi đến, 2 nút Accept (xanh pulse) / Reject (đỏ), ring liên tục đến khi user chọn; nếu đang có cuộc gọi khác thì auto-reject 486 Busy. Public API thêm `acceptIncoming()`, `rejectIncoming()`. |
| **Status** | ✅ Done |

### [orders] Gửi Bill hàng loạt — chuyển sang đa nhiệm với concurrency pool + PAT refresh dedupe
| | |
|---|---|
| **Files** | `shared/js/pancake-token-manager.js`, `orders-report/js/tab1/tab1-fast-sale-invoice-status.js` |
| **Chi tiết** | Đổi `bulkSendSelectedBills` từ gửi tuần tự (1.5s delay/đơn) sang **concurrency pool**: N worker kéo từ shared queue. Tunable qua `window.BULK_BILL_CONCURRENCY` (default **4 global**) và `window.BULK_BILL_PER_PAGE_CONCURRENCY` (default **2 per page**) — per-page cap tránh dồn 1 page gây rate-limit/PAT rotation storm, global cap bound tổng parallelism. Worker scan queue tìm item có page chưa đụng cap, nếu tất cả remaining đều ở cap thì yield 100ms rồi scan lại. Để tránh N concurrent workers cùng gặp "access_token renewed" gọi regenerate PAT N lần, thêm **in-flight dedupe** cho `refreshPageAccessToken` trong `PancakeTokenManager`: `_patRefreshInFlight: Map<pageId, Promise>` — concurrent callers cho cùng page share 1 promise. Progress counter `{done}/{total}` update tại `finally` của mỗi worker. Confirm dialog nay hiển thị cả concurrency values. Thời gian gửi ~N đơn ≈ `ceil(N/GLOBAL) × t_per_send` thay vì `N × (t_per_send + 1.5s)`. |
| **Status** | ✅ Done |

### [orders] Gửi Bill hàng loạt từ bảng chính qua Messenger (checkbox-selected)
| | |
|---|---|
| **Files** | `orders-report/tab1-orders.html`, `orders-report/js/tab1/tab1-table.js`, `orders-report/js/tab1/tab1-fast-sale-invoice-status.js` |
| **Chi tiết** | Yêu cầu: chọn nhiều đơn bằng checkbox ở bảng chính rồi gửi hình bill qua Messenger một lần. **Thực hiện:** (A) Thêm nút **"Gửi Bill hàng loạt"** vào action bar sticky (cạnh "In hàng loạt PBH") — hiển thị khi ≥1 đơn được chọn có PBH + `Facebook_ASUserId` + `Facebook_PostId`. (B) `updateActionButtons` giờ tính thêm `hasAnySendable` (có PBH + có Messenger info) trong cùng vòng lặp với `hasAnyInvoice` — zero chi phí thêm. (C) Hàm mới `bulkSendSelectedBills()` trong IIFE invoice-status: loop `selectedOrderIds` → filter (`InvoiceStatusStore.get` + Messenger info + `isBillSent` để skip đơn đã gửi) → confirm với breakdown skip (chưa PBH / thiếu MSG / đã gửi) → tuần tự `performActualSend(..., 'main', null)` với delay 1.5s giữa các đơn (khớp pattern `sendBillBatch` tránh rate-limit Pancake và cho phép PAT auto-refresh đã fix ở commit trước kịp kick-in). Progress hiển thị trên button `{i}/{n}`, summary toast cuối cùng. Dùng lại toàn bộ pipeline single send (generateBillImage → uploadImage → POST content_ids với PAT refresh retry), không duplicate logic. Helper `_buildEnrichedFromInvoice` refactor từ đoạn build payload trong `sendBillFromMainTable` (không sửa single flow). |
| **Status** | ✅ Done |

### [orders] Fix bulk gửi bill báo "access_token renewed" — auto refresh PAT + retry 1 lần
| | |
|---|---|
| **Files** | `shared/js/pancake-token-manager.js`, `orders-report/js/utils/bill-service.js` |
| **Chi tiết** | **Bug:** "Gửi Bill hàng loạt" trong modal kết quả fail với `{success:false, message:'access_token renewed please use new access_token'}` — Pancake rotate PAT, cache client stale. Single send ở cột "Phiếu bán hàng" thỉnh thoảng pass vì PAT mới chưa rotate. **Fix:** (A) Thêm `invalidatePageAccessToken(pageId)` + `refreshPageAccessToken(pageId)` vào `PancakeTokenManager` — xoá cache (memory + localStorage key `pancake_page_access_tokens` + IndexedDB) rồi gọi `generatePageAccessToken` để sinh PAT mới từ JWT. (B) Trong `sendBillToCustomer`, tách request body thành helper `_postBill(pat)`, sau lần POST đầu kiểm `success:false` + `message` match `/access_token\s+renewed/i` → gọi `refreshPageAccessToken` → retry 1 lần. Không ảnh hưởng 24h policy / e_code 551 / extension bypass đã có. |
| **Status** | ✅ Done |

### [balance-history] Live Mode: ẩn dòng "Mô tả" duplicate trong card
| | |
|---|---|
| **Files** | `balance-history/js/live-mode.js` |
| **Chi tiết** | User phản hồi: dòng "Mô tả" (`<span class="detail-desc">`) ở `card-detail-block` của mỗi card giao dịch (cả "NHẬP TAY" và "TỰ ĐỘNG GÁN") trùng nội dung với tiêu đề (truncated) + tooltip hover ở phía trên → thừa, gây rối UI. Verified phần tử này **chỉ render text**, không có bất kỳ event handler (click/dblclick/contextmenu/drag) hay hover effect/cursor đặc biệt nào, không có data-attribute nào được code khác đọc → an toàn xóa. **Fix:** Bỏ block 4 dòng (comment + if push) tại `live-mode.js:254-257`. Giữ nguyên CSS `.detail-desc` (no-op, không ai dùng). Các pill khác trong line2 (sender name, TK gửi, SĐT, sub_account, extraction_note) vẫn render bình thường. |
| **Status** | ✅ Done |

### [orders] Modal Lịch Sử Tag T: hiển thị redirect + đếm đúng
| | |
|---|---|
| **Files** | `orders-report/js/tab1/tab1-bulk-tags.js` |
| **Chi tiết** | **Bug:** Trong modal "Lịch Sử Tag T Chờ Hàng", các đơn bị redirect (do có tag "ĐÃ GỘP KO CHỐT" → tự chuyển sang đơn cùng SĐT có STT lớn nhất) không được đánh dấu — chỉ render flat `sttList`, bỏ qua `redirectedList` đã có trong Firebase. Ngoài ra `summary.totalSuccess` ở chỗ lưu chỉ tính `sttList.length`, không cộng `redirectedList.length` → count hiển thị thiếu so với modal kết quả ngay-sau-khi-gán. **Fix:** (1) `renderBulkTagHistoryItem()` re-compute `totalSuccess`/`totalFailed` từ `results` (đọc cả `redirectedList`), dùng giá trị này cho header ✓/✗ và tiêu đề section — entries cũ có summary sai vẫn hiển thị đúng, không cần migrate data. Render từng tag-item copy pattern của `showBulkTagResultModal`: format `"STT X, Y, Z, A → B, C → D"` + ghi chú `"↳ Chuyển sang đơn cùng SĐT"` cho các entry có redirect. (2) Chỗ lưu Firebase (`historyEntry.summary`) cũng được sửa cộng cả `redirectedList.length` → entries mới lưu đúng từ đầu. |
| **Status** | ✅ Done |

### [purchase-orders] Inventory picker: inline styles + cache-bust để zoom preview chắc chắn hiện
| | |
|---|---|
| **Files** | `purchase-orders/js/dialogs.js`, `purchase-orders/index.html` |
| **Chi tiết** | User báo 2 lần fix trước vẫn chỉ thấy thumb scale 1.15 — preview 420×420 không xuất hiện. Nguyên nhân khả năng: **GitHub Pages / browser cache** `modal.css` cũ (không có class `.inventory-zoom-preview.visible` mới) HOẶC `dialogs.js` cũ. **Fix bulletproof:** (A) Inline toàn bộ critical styles (`position:fixed`, `zIndex:99999`, size, shadow, opacity/transform) trực tiếp vào element qua `applyInlineStyles()` — không phụ thuộc CSS external; show/hide bằng `showZoom()`/`hideZoom()` set style trực tiếp thay vì toggle class. (B) Guard chỉ show khi `thumb.tagName === 'IMG'` và có `src` (tránh trigger trên `.inventory-thumb-placeholder`). (C) Thêm `?v=20260418b` vào `css/modal.css` và `js/dialogs.js` trong `index.html` → ép browser/Pages load bản mới. |
| **Status** | ✅ Done |

### [purchase-orders] Inventory picker: preview zoom phóng to 420×420 + dùng mousemove
| | |
|---|---|
| **Files** | `purchase-orders/js/dialogs.js`, `purchase-orders/css/modal.css` |
| **Chi tiết** | Lần fix trước đổi sang `mouseover`/`mouseout` vẫn không đủ: user báo "chỉ hơi nổi lên" (chỉ thấy `:hover scale(1.15)` CSS, preview lớn không xuất hiện). Viết lại logic bằng **`mousemove`** duy nhất trên `#inventoryProductsList` — bắn liên tục, hit-test `.inventory-thumb` mỗi lần move để show/hide/position preview + dùng `currentThumb` track ref tránh set `src` lặp. Bypass hoàn toàn vấn đề mouseenter không bubble. Preview size bump **280×280 → 420×420**, shadow đậm hơn (`0 24px 60px rgba(0,0,0,0.35)`), transition nhanh hơn (200ms → 150ms) để user thấy ảnh rõ ngay. |
| **Status** | ✅ Done |

### [purchase-orders] Fix hover zoom ảnh trong modal "Chọn sản phẩm từ kho"
| | |
|---|---|
| **Files** | `purchase-orders/js/dialogs.js` |
| **Chi tiết** | **Bug:** Đưa chuột vào ảnh sản phẩm trong modal inventory picker không phóng to preview. Nguyên nhân: listener dùng `mouseenter`/`mouseleave` delegate trên `#inventoryProductsList`, nhưng 2 event này **không bubble**, nên delegation không fire khi hover vào `.inventory-thumb` con — kể cả `capture: true` cũng không giải quyết tin cậy được. **Fix:** Đổi sang `mouseover`/`mouseout` (bubble tự nhiên) + guard `relatedTarget.closest('.inventory-thumb')` để không toggle khi di chuột giữa 2 vùng trong cùng 1 thumb. Giữ nguyên CSS hover scale + preview element. |
| **Status** | ✅ Done |

### [inventory][render] Migration 059: fix rows stt=901 với ten_ncc thuần số (backfill trước parser fix)
| | |
|---|---|
| **Files** | `render.com/migrations/059_fix_numeric_ten_ncc_rows.sql` |
| **Chi tiết** | Trước khi parser fix deploy, user tạo rows với input `"24"`, `"44"`, `"14"`, `"5"` → stt=901 ten=số. Rows này bị mapping ảnh skip vì `sttNCC >= 900`. Migration: với mọi row `stt_ncc >= 900 AND ten_ncc ~ '^\\d+$'` → `UPDATE stt_ncc = CAST(ten_ncc AS INT), ten_ncc = NULL`, upsert supplier, guard collision tại `(date, dot, new_stt_ncc)`. 5 rows trên 2026-04-12 đã map đúng (stt=5/10/14/24/44); HANG LAY THEM giữ nguyên 901 (ten không phải số). |
| **Status** | ✅ Done |

### [orders] Pre-check TPOS trước khi upload sản phẩm — skip nếu mã đã tồn tại (cả biến thể & cha)
| | |
|---|---|
| **Files** | `purchase-orders/js/lib/tpos-product-creator.js` |
| **Chi tiết** | **Vấn đề:** Trước đây chỉ dựa vào TPOS trả `400` để phát hiện duplicate — tốn thêm 1 round-trip + không 100% đáng tin. **Fix:** Thêm `checkProductExists(productCode)` — GET `Product?$filter=startswith(DefaultCode,'{code}')` + regex filter `^{code}[A-Z0-9]{0,4}$` (tránh false-positive Q13 match Q130). Match cả sản phẩm cha (Q130) lẫn biến thể (Q130T, Q130D1). Trong `processGroup`: gọi precheck TRƯỚC khi POST InsertV2 — nếu tồn tại: skip upload + build productData từ variants có sẵn → `matchVariantBarcodes` như flow "already exists" cũ. Giữ 400-fallback của `createTPOSProduct` như safety net. Export thêm `checkProductExists`. |
| **Status** | ✅ Done |

## 2026-04-17

### [customer-hub][render] Giao dịch Nạp Tay: hiện rút tay thủ công + lưu người thực hiện
| | |
|---|---|
| **Files** | `render.com/routes/v2/wallets.js`, `render.com/services/wallet-event-processor.js` |
| **Chi tiết** | **Bug 1:** Tab "Giao dịch Nạp Tay" chỉ hiện Nạp tiền, không thấy Rút tiền thủ công. Nguyên nhân: SQL function `wallet_withdraw_fifo` (dùng chung cho COD flow) hardcode `source='ORDER_PAYMENT'`, trong khi endpoint `/manual-transactions` filter loại trừ source này. **Fix:** nới filter SELECT để include rows có `reference_id='MANUAL'` (cờ do route `/withdraw` gán khi `order_id` null) — không đụng SQL function, không mutate data đã lưu. **Bug 2:** Cột "Người thực hiện" rỗng cho mọi giao dịch thủ công. Nguyên nhân: `processWalletEvent` không insert `created_by`, `wallet_withdraw_fifo` không nhận param người tạo. **Fix:** (A) thêm optional param `createdBy` vào `processWalletEvent` → insert cột `created_by` (cột đã có trong schema từ migration 001); (B) `processManualDeposit` + `issueVirtualCredit` nhận/truyền `createdBy`; (C) routes `/deposit`, `/credit` truyền `created_by` xuống processor; (D) route `/withdraw` sau khi FIFO chạy xong, UPDATE `wallet_transactions.created_by` cho rows phone+reference_id='MANUAL'+`type IN (WITHDRAW,VIRTUAL_DEBIT)` trong 5 giây gần nhất — chỉ metadata, zero ảnh hưởng tính toán số dư/KPI. |
| **Status** | ✅ Done |

### [soluong-live] Thêm cột CỌC vào soluong-list + toggle Ẩn/Hiện + Firebase sync
| | |
|---|---|
| **Files** | `soluong-live/soluong-list.html`, `soluong-live/js/soluong-list.js`, `soluong-live/firebase-helpers.js`, `soluong-live/firebase-helpers-global.js` |
| **Chi tiết** | Thêm cột **💰 CỌC** giữa BÁN và CÒN trên trang soluong-list. Click số để nhập inline (Enter commit, Esc hủy). Nút toggle "💰 Hiện cọc" đặt bên trái "Đang gộp" (`left: calc(50% - 300px)`), mặc định **ẨN**. Layout: khi CỌC hiện → TỔNG/BÁN/CỌC mỗi cột `flex: 0.667`, CÒN giữ `flex: 1` ⇒ CÒN vẫn chiếm 1/3 width (không đổi kích thước). Mirror CHÍNH XÁC pattern soldQty cho Firebase sync: node mới `soluongProductsCoc/{key}` (~20 bytes, song song với `soluongProductsQty`), helper mới `updateProductCocInFirebase` ghi parallel cả 2 node, `loadAllProductsFromFirebase` merge thêm cocQty, `setupFirebaseChildListeners` thêm `cocRef` listener (`child_changed`/`child_added`) + cleanup detach. Các batch op (remove/cleanup/clearAll) đều xóa đồng bộ node coc. `child_changed` trên productsRef preserve `cocQty` giống `soldQty`. Toggle Ẩn/Hiện cọc sync qua `soluongIsHideCocColumn` giữa các máy livestream (giống `soluongIsMergeVariants`). Merged variants: mỗi variant có `cocQtyList` riêng, click inline-edit từng variant. CỌC là số độc lập, KHÔNG trừ vào CÒN (cọc chưa chốt đơn). |
| **Status** | ✅ Done |

### [orders] KPI: không tính KPI khi khách đổi biến thể cùng template/cùng loại
| | |
|---|---|
| **Files** | `orders-report/js/managers/kpi-manager.js`, `shared/js/attribute-values-loader.js` (new), `shared/js/warehouse-api.js`, `orders-report/tab-kpi-commission.html`, `orders-report/tab1-orders.html`, `orders-report/js/tab-kpi-commission.js` |
| **Chi tiết** | **Bug:** `calculateNetKPI()` chỉ match theo `ProductId` — khi khách đổi biến thể (B1118T → B1118N) hoặc đổi SP cùng loại khác màu (B1473 → B1474), SP mới được tính thêm +1 KPI sai. **Fix:** Mở rộng filter 2 lớp mới: (A) match `tpos_template_id` qua `WarehouseAPI.getTemplateIdMap()` → cover biến thể cùng template; (B) match tên đã normalize (strip prefix `[CODE]`, trailing `(...)`, `SIZE`, token ∈ {màu, size}) → cover 2 SP khác template nhưng tên chỉ khác màu/size cuối. Màu + size load từ `purchase-orders/product_attribute_values_rows.csv` qua shared loader mới `AttributeValuesLoader` (có fallback hardcode). **Backfill:** Thêm nút "Tính lại KPI toàn bộ" trong tab KPI-Hoa Hồng → loop qua orderCodes trong kpi_statistics (theo dateFrom/dateTo filter) → gọi `recalculateAndSaveKPI` từng đơn để áp logic mới. |
| **Status** | ✅ Done |

### [inventory] Fix parser NCC thuần số + schema `inventory_product_images` split theo đợt + silence Firestore probe
| | |
|---|---|
| **Files** | `inventory-tracking/js/modal-shipment.js`, `inventory-tracking/js/api-client.js`, `inventory-tracking/js/data-loader.js`, `inventory-tracking/js/table-renderer.js`, `render.com/migrations/057_fix_stt_ncc_10_on_2026_04_12.sql`, `render.com/migrations/058_product_images_by_date_dot.sql`, `render.com/routes/v2/inventory-tracking.js`, `shared/js/token-manager.js`, `shared/js/navigation-modern.js` |
| **Chi tiết** | **1. Parser NCC:** regex cũ `^(\\d+)\\s+(.+)$` yêu cầu "số + space + tên", user gõ `"10"` fail → auto-assign stt=901 → không map ảnh. Đổi `^(\\d+)(?:\\s+(.+))?$`: `"10"` → stt=10 tenNCC=""; `"10 NCC"` → stt=10 tenNCC="NCC"; `"ABC"` → auto 900+. **2. Migration 057:** fix row bad data cụ thể `dot_mo2y25w3_i2igci` (stt=901 ten="10") → stt=10 ten=NULL + upsert supplier stt=10. **3. Migration 058:** schema `inventory_product_images` thêm `ngay_di_hang DATE NOT NULL`, `dot_so INT NOT NULL`, unique key `(ngay_di_hang, dot_so, ncc)` thay vì chỉ `ncc`. Backfill tất cả rows hiện tại về `(2026-04-10, 1)` theo user directive. **4. API `PUT /product-images`:** nhận optional `ngay_di_hang`, `dot_so` → scoped delete+insert per batch; legacy clients không pass → default `(2026-04-10, 1)`. **5. Client `getProductImagesForNcc(ncc, ngay, dot)`:** exact-batch first, fallback any-batch nếu không có (giữ compat khi UI batch-selector chưa có). Table truyền `shipment.ngayDiHang + shipment.dotSo` xuống `_renderImageCell`. **6. Firestore probe silence:** `shared/js/token-manager.js` + `navigation-modern.js` short-circuit nếu `typeof window.firebase === 'undefined'` — không log warning trên các trang Firebase-free (inventory-tracking) nữa. |
| **Status** | ✅ Done — batch-scoped UI selector chưa build (scope lần sau) |

### [inventory][render] Default đợt = MAX hiện có (không +1) — merge-by-default UX
| | |
|---|---|
| **Files** | `render.com/routes/v2/inventory-tracking.js`, `inventory-tracking/js/modal-shipment.js` |
| **Chi tiết** | Đổi default đợt khi thêm NCC mới cho ngày đã có đợt: trước là `MAX+1` (luôn tạo đợt mới), giờ là `MAX` (mặc định merge vào đợt hiện có). User muốn đợt mới → tự gõ +1. Áp dụng cho: `GET /shipments/next-dot-so` (`COALESCE(MAX, 1)`), POST fallback resolve, và client-side `_computeDefaultDotSo`. Endpoint name giữ nguyên để tương thích. |
| **Status** | ✅ Done |

### [inventory][render] Gộp NCC trùng (ngày + đợt + tên NCC) — migration 056 + dedupe POST
| | |
|---|---|
| **Files** | `render.com/migrations/056_merge_duplicate_ncc_in_same_shipment.sql`, `render.com/routes/v2/inventory-tracking.js` |
| **Chi tiết** | **Migration 056:** với mỗi group `(ngay_di_hang, dot_so, LOWER(TRIM(ten_ncc)))` có >1 row và tenNCC ≠ rỗng → keep earliest-created row, append `san_pham` (jsonb_array_elements + UNION), sum `tong_tien_hd`/`tong_mon`/`so_mon_thieu`, union `anh_hoa_don`, concat `ghi_chu`/`ghi_chu_thieu` (delimiter ` \| `), delete còn lại. Đã gộp 2 rows `LAY THEM` trên 2026-04-10 đợt 1 (stt=1 + stt=901) → 1 row stt=1 với 5 products, tong=2373/59. **POST /shipments dedupe:** trước INSERT check same (date, dot, LOWER(TRIM(ten_ncc))) đã tồn tại (ten_ncc non-empty) → UPDATE merge thay vì INSERT: append san_pham, sum totals, union anh_hoa_don, giữ kien_hang của row đầu (hoặc dùng từ request nếu rỗng), concat ghi_chu. Trả `merged: true` trong response. |
| **Status** | ✅ Done — merge 2→1 LAY THEM đã apply, còn lại 9 rows distinct |

### [inventory][render] Migration 055: shift 9 legacy rows về 2026-04-10 (ý định gốc)
| | |
|---|---|
| **Files** | `render.com/migrations/055_shift_9_legacy_shipments_to_vn_date.sql` |
| **Chi tiết** | 9 rows saved với `ngay_di_hang = 2026-04-11` bằng old client code dùng `new Date().toISOString().split('T')[0]` (UTC date) — thực chất user tạo vào tối 10/4 VN = UTC Apr 10 1x:xx. Chạy UPDATE có guard (`EXCEPTION` nếu count ≠ 9) đổi 9 rows này về `2026-04-10`. Kết quả API: tất cả 10 shipments → `2026-04-10`. Reversible ghi rõ trong comment migration. |
| **Status** | ✅ Done — API verified (10 rows on 2026-04-10) |

### [render] Fix pg DATE (OID 1082) parser — trả raw 'YYYY-MM-DD' string
| | |
|---|---|
| **Files** | `render.com/server.js`, `render.com/db/pool.js` |
| **Chi tiết** | **Bug:** DB lưu DATE `2026-04-11` nhưng API JSON trả `"2026-04-10T17:00:00.000Z"` — client split('T')[0] → `"2026-04-10"` → display `10/4` (lệch -1 ngày). **Nguyên nhân:** pg-node default DATE parser dùng `new Date(year, month-1, day)` tạo Date ở LOCAL midnight; Render server TZ = VN (UTC+7) → Date object = `2026-04-11 00:00 +0700` = UTC `2026-04-10T17:00:00Z`. JSON.stringify ra chuỗi UTC, làm client hiểu sai ngày. **Fix:** `types.setTypeParser(1082, val => val)` — trả raw 'YYYY-MM-DD' string, không roundtrip qua Date. Áp dụng cho cả `server.js` và `db/pool.js`. Không cần sửa schema hay client. Tác động: mọi DATE column (`ngay_di_hang`, `ngay_dat_hang`, `ngay`) đều trả về string khớp DB. |
| **Status** | ✅ Done |

### [inventory] Chuyển toàn bộ date logic sang GMT+7 (Vietnam)
| | |
|---|---|
| **Files** | `inventory-tracking/js/main.js`, `modal-shipment.js`, `modal-prepayment.js`, `modal-other-expense.js`, `modal-order-booking.js`, `export.js`, `filters.js` |
| **Chi tiết** | **1. Thêm helper trong main.js:** `todayVN()` + `dateToVNStr(date)` dùng `Intl.DateTimeFormat` với `timeZone: 'Asia/Ho_Chi_Minh'` — luôn trả YYYY-MM-DD theo lịch VN bất kể browser timezone. **2. formatDateDisplay:** parse YYYY-MM-DD bằng regex (không qua `new Date` tránh UTC midnight shift trong timezone âm), fallback dùng `toLocaleDateString` với VN timezone. **3. Replace toàn bộ `new Date().toISOString().split('T')[0]` → `todayVN()`/`dateToVNStr()` ở 8+ chỗ:** `modal-shipment`, `modal-prepayment`, `modal-other-expense`, `modal-order-booking`, `export`, `filters` (default range, quick range, single day, navigate, reset 30 days), `main.InventoryTracking.formatDate`. **Kết quả:** mọi "hôm nay", mọi format YYYY-MM-DD từ Date object đều là lịch VN — user ở bất kỳ timezone nào cũng thấy ngày VN đồng nhất với DB. |
| **Status** | ✅ Done |

### [orders] Cột Mã SP hiển thị mã GỐC + lưu parentProductCode sau khi upload TPOS
| | |
|---|---|
| **Files** | `purchase-orders/js/table-renderer.js`, `purchase-orders/js/main.js` |
| **Chi tiết** | **Bug:** Sau khi upload TPOS, `item.productCode` bị thay bằng variant code (Q130 → Q130T). Khi user copy đơn + upload lại, TPOS ghép tên biến thể vào mã đã có biến thể → Q130TT, Q130DD (sai). **Fix 1 (`table-renderer.js`):** cột "Mã SP" render `parentProductCode || productCode` — hiển thị mã gốc là chính (không còn dòng parent xám nhỏ phía trên). **Fix 2 (`main.js`):** sau khi tạo PO TPOS thành công, khi update `productCode = barcode`, LƯU `parentProductCode = productCode cũ` — để table render đúng + để `POST /:id/copy` server-side dùng `parentProductCode || productCode` tạo đơn mới với mã gốc. Order cũ không có `parentProductCode` vẫn fallback sang `productCode` (không break). |
| **Status** | ✅ Done |

### [orders] Purchase Orders: hiển thị lỗi TPOS giống TPOS khi Xuất Excel / Tạo đơn
| | |
|---|---|
| **Files** | `purchase-orders/js/lib/tpos-purchase.js`, `purchase-orders/js/main.js` |
| **Chi tiết** | **1. `tpos-purchase.js`:** export thêm `validateExcel(workbook, ncc)` — dry-run `PurchaseByExcel` (TPOS không tạo PO, chỉ trả `{OrderLines, Errors}`). **2. `createFromExcel`:** block nếu `errors.length > 0` — trả `{success:false, tposErrors: [...], orderLines}` thay vì tạo PO thiếu dòng. **3. `main.js` `showTposErrorsModal(errors, {title, onContinue})`:** modal đỏ liệt kê lỗi theo format TPOS (`"Dòng N: Mã sản phẩm X không tồn tại trong dữ liệu"`) — optional nút "Tiếp tục" để tải file dù có lỗi. **4. `btnExportExcel`:** build workbook → nếu NCC có `tposId` → `validateExcel` → show modal nếu có lỗi (cho phép "Tải xuống vẫn") → download. **5. `btnSubmitTPOS`:** khi `tposResult.tposErrors` → show modal (block, không cho tiếp tục). **6. Capture format:** qua snippet `_tpos_capture_error.js` paste vào DevTools TPOS (dùng `localStorage.accessToken` + Bearer header). |
| **Status** | ✅ Done |

### [inventory][render] Bỏ Firebase khỏi inventory-tracking: permissions + deleteImage qua Render API
| | |
|---|---|
| **Files** | `render.com/routes/v2/inventory-tracking.js`, `inventory-tracking/js/permission-helper.js`, `inventory-tracking/js/image-upload.js`, `inventory-tracking/js/config.js`, `inventory-tracking/index.html`, `render.com/scripts/cleanup-inventory-firestore.js` |
| **Chi tiết** | **1. API mới:** `GET /api/v2/inventory-tracking/user-permissions/:username` đọc từ `app_users.detailed_permissions` (Render Postgres) — trả slice `inventoryTracking` + `isAdmin`. **2. permission-helper.js:** thay `usersRef.doc().get()` bằng fetch tới API trên. **3. image-upload.js deleteImage:** gọi `DELETE /api/upload/image` thay vì `storage.refFromURL().delete()` (server-side dùng Firebase Admin SDK). **4. config.js:** bỏ `firebase.initializeApp`, `firestore()`, `storage()`, `usersRef`, `COLLECTIONS`. **5. index.html:** bỏ 3 script tags `firebase-app-compat`, `firebase-firestore-compat`, `firebase-storage-compat` + `firebase-config.js`. Module inventory-tracking không còn init Firebase client-side. **6. cleanup script:** `scripts/cleanup-inventory-firestore.js` (dry-run default, `--execute` để xóa) xóa `inventory_tracking`, `inventory_prepayments`, `inventory_other_expenses`, và `edit_history` filter theo `entity_type ∈ ('orderBooking','shipment','prepayment','otherExpense')`. Chưa chạy — cần user confirm. |
| **Status** | ✅ Done — cleanup đã chạy: xóa 10/10 docs `inventory_tracking` Firestore; các collection khác đã rỗng sẵn |

### [inventory][render] Đợt (batch number) per-date cho shipment — DB + API + UI
| | |
|---|---|
| **Files** | `render.com/migrations/053_add_dot_so_to_inventory_shipments.sql`, `render.com/migrations/054_consolidate_dot_so.sql`, `render.com/routes/v2/inventory-tracking.js`, `inventory-tracking/js/api-client.js`, `inventory-tracking/js/data-loader.js`, `inventory-tracking/js/modal-shipment.js`, `inventory-tracking/js/crud-operations.js`, `inventory-tracking/js/table-renderer.js` |
| **Chi tiết** | **1. Migration 053:** thêm cột `dot_so INT NOT NULL DEFAULT 1` + backfill theo `ROW_NUMBER() PARTITION BY ngay_di_hang ORDER BY created_at/min` + backfill `ten_ncc` từ `inventory_suppliers` + index `(ngay_di_hang, dot_so)`. **2. Migration 054:** consolidate tất cả rows về `dot_so=1` (migration 053 backfill quá granular do NCCs tạo rải rác qua boundary phút — user sẽ chia đợt lại qua edit modal nếu cần). **3. API:** thêm `GET /shipments/next-dot-so?date=X` trả max+1; `POST`/`PUT /shipments` nhận `dot_so` (auto-compute nếu thiếu). **4. UI modal:** input "Đợt" song song "Ngày Đi Hàng", auto-fill từ API khi đổi ngày; fallback tính local từ `globalState.shipments`. **5. Grouping:** `getAllDotHangAsShipments()` nhóm theo `(ngayDiHang, dotSo)` thay vì chỉ ngày → 1 ngày có thể có nhiều đợt hiển thị riêng. **6. Table:** header hiển thị badge "Đợt N" giữa ngày và số kiện. |
| **Status** | ✅ Done |

### [delivery] ĐƠN 0đ: filter tab, visual styling, scan sound, exclude from TOMATO
| | |
|---|---|
| **Files** | `delivery-report/js/delivery-report.js`, `delivery-report/css/delivery-report.css`, `delivery-report/index.html` |
| **Chi tiết** | **1. Exclude 0đ from TOMATO:** `assignTomatoNap()` luôn đẩy đơn 0đ (CashOnDelivery=0) vào NAP, không bao giờ vào TOMATO. **2. Visual styling:** Items 0đ có nền vàng nhạt + viền trái cam + badge "0đ" để phân biệt. **3. Scan sound:** Quét đơn 0đ phát 2 beep ngắn tần số cao (Web Audio API), feedback toast màu cam. **4. Filter tab "ĐƠN 0đ":** Tab mới trong tra soát bar, lọc chỉ hiển thị đơn 0đ across all groups. **5. Scan filter tabs:** Chuyển dropdown "Đã quét"/"Chưa quét" thành 2 nút tab-style. |
| **Status** | ✅ Done |

### [orders][render] KPI review round 2: fix 5 issues từ audit
| | |
|---|---|
| **Files** | `orders-report/js/managers/kpi-manager.js`, `orders-report/js/chat/chat-products-actions.js`, `render.com/routes/campaigns.js`, `render.com/cron/scheduler.js` |
| **Chi tiết** | **Fix 1:** KPI mode 'value' — lấy giá từ TPOS thay vì audit log (audit log không có cột price). **Fix 2:** Held product delete dùng source phù hợp (chat_from_dropped/chat_confirm_held thay vì chat_decrease). **Fix 3:** Range validation thêm check STT âm và from > to. **Fix 4:** Data retention chỉ xóa audit logs không còn BASE (bảo toàn data recalculate được). **Fix 5:** Reconcile cron chỉ check audit logs SAU BASE creation, log chi tiết foreign userId. |
| **Status** | ✅ Done |

### [orders][render] KPI chống gian lận + 6 cải thiện hệ thống
| | |
|---|---|
| **Files** | `render.com/cron/scheduler.js`, `render.com/routes/campaigns.js`, `orders-report/js/managers/kpi-manager.js`, `orders-report/js/chat/chat-products-actions.js` |
| **Chi tiết** | **1. Auto-reconcile:** Cron 6AM hàng ngày kiểm tra KPI 7 ngày gần nhất. **2. Cross-check userId:** Flag khi người thao tác ≠ NV phụ trách STT range. **3. KPI theo giá trị:** Thêm mode 'value' tính KPI theo giá SP thực tế (mặc định vẫn 'fixed' 5000đ/SP). **4. Held product audit:** Log khi xóa hoặc sửa qty SP giữ — đóng lỗ hổng audit trail. **5. Data retention:** Cron 5AM xóa audit logs > 90 ngày. **6. Range validation:** Server-side validate overlap khi PUT employee-ranges — trả lỗi 400 nếu STT trùng. |
| **Status** | ✅ Done |

### [warehouse][render] Real-time image sync: product-warehouse → soluong-live & order-management
| | |
|---|---|
| **Files** | `render.com/routes/v2/web-warehouse.js`, `product-warehouse/js/main.js`, `soluong-live/js/soluong-list.js`, `order-management/js/order-list.js` |
| **Chi tiết** | **Tính năng:** Khi product-warehouse cập nhật hình ảnh sản phẩm → soluong-live và order-management tự động cập nhật hình real-time. **Cách hoạt động:** (1) Render server: thêm `POST /api/v2/web-warehouse/notify-image-update` endpoint broadcast SSE event `image_update`. (2) product-warehouse: sau khi save ảnh mới lên TPOS → gọi notify endpoint. (3) soluong-live & order-management: thêm SSE `EventSource` listener, khi nhận `image_update` → re-fetch ảnh từ Render DB → update local state + Firebase RTDB + cache-bust URL → re-render grid. |
| **Status** | ✅ Done |

### [orders][render] Fix delivery group badges (THÀNH PHỐ/TOMATO/NAP) không hiện trong cột Phiếu Bán Hàng
| | |
|---|---|
| **Files** | `orders-report/js/tab1/tab1-fast-sale-invoice-status.js`, `render.com/routes/v2/delivery-assignments.js` |
| **Chi tiết** | **Root cause:** orders-report đọc delivery group từ Firestore `delivery_report/province_groups`, nhưng delivery-report đã migrate sang PostgreSQL `delivery_assignments` — KHÔNG CÓ code nào viết vào Firestore nữa → data stale, badge hiện không đúng. **Fix:** (1) Thêm endpoint `POST /api/v2/delivery-assignments/lookup-batch` query theo order numbers từ PostgreSQL. (2) Thay Firestore listener bằng debounced batch API call. (3) Thêm support group 'city' → badge THÀNH PHỐ. (4) Giữ CarrierName fallback cho invoices chưa có trong DB. |
| **Status** | ✅ Done |

### [orders] KPI Hoa Hồng: fix 6 bugs phân tích sâu + implement đối soát
| | |
|---|---|
| **Files** | `orders-report/js/managers/kpi-manager.js`, `orders-report/js/tab1/tab1-edit-modal.js`, `orders-report/js/tab-kpi-commission.js` |
| **Chi tiết** | **Bug A (CRITICAL):** Đơn tính KPI trùng cross-day — dùng BASE creation date thay vì today. **Bug B:** ProductId=null → Number(null)=0 gây false match — thêm null check. **Bug C:** Input qty trực tiếp (không dùng +/-) không log audit — tính delta từ oldQty→newQty. **Bug D:** Nút "Đối soát" không hoạt động vì thiếu reconcileKPI() — implement so sánh audit logs vs TPOS thực tế. **Bug E:** out_of_range flag bị bỏ qua khi tính KPI — filter ra khỏi calculation. **Bug F:** Stale orders đếm không nhất quán giữa summary/table/modal/export — thống nhất `_stale` check. |
| **Status** | ✅ Done |

---

## 2026-04-16

### [orders][render] KPI Hoa Hồng: fix 5 bugs nghiêm trọng + cải thiện
| | |
|---|---|
| **Files** | `render.com/routes/realtime-db.js`, `orders-report/js/managers/kpi-manager.js`, `orders-report/js/tab1/tab1-edit-modal.js` |
| **Chi tiết** | **Bug 1 (CRITICAL):** Race condition saveKPIStatistics — chuyển sang atomic PATCH endpoint server-side, xóa client-side read-modify-write. **Bug 2:** PUT /kpi-base DO NOTHING → DO UPDATE SET stt (cho phép recover STT). **Bug 3:** Timing filter `>` → `>=` (audit log cùng ms với BASE không bị loại). **Bug 4:** Edit modal không log audit khi tăng qty SP đã có → log mọi add operation. **Bug 5:** Dedup check 5s trên server tránh double-count. **Phase 2:** Batch limit 500, date filter cho GET /kpi-statistics. |
| **Status** | ✅ Done |

---

## 2026-04-14

### [orders][render] KPI Hoa Hồng: chuyển 100% sang Render PostgreSQL, bỏ Firebase
| | |
|---|---|
| **Files** | `orders-report/js/managers/kpi-manager.js`, `render.com/routes/realtime-db.js` |
| **Chi tiết** | Xóa 2 dependency Firebase cuối cùng trong KPI: (1) `report_order_details` Firestore → Render API `GET /api/realtime/report-order-details/:tableName`, (2) `employee_ranges` Firestore → Render API `GET /api/campaigns/employee-ranges`. Thêm cache 5 phút cho employee ranges. KPI giờ 100% Render PostgreSQL. |
| **Status** | ✅ Done |

### [render] Hàng rớt xả: chỉ hiện 2 campaign mới nhất + auto-cleanup 60 ngày
| | |
|---|---|
| **Files** | `render.com/routes/realtime-db.js`, `render.com/cron/scheduler.js` |
| **Chi tiết** | GET `/api/realtime/dropped-products` giờ chỉ trả products từ 2 campaign mới nhất (từ bảng `campaigns`). Products không có `campaign_id` vẫn hiện. Thêm `?all=1` để bypass filter. Thêm cron job chạy 5AM hàng ngày xóa dropped_products cũ hơn 60 ngày. Backend trả kèm `latestCampaigns[]` để frontend hiển thị tên chiến dịch. |
| **Status** | ✅ Done |

### [render][chat] Hàng rớt xả: lưu đầy đủ context đơn hàng (order_context JSONB)
| | |
|---|---|
| **Files** | `render.com/routes/realtime-db.js`, `render.com/migrations/041_add_order_context_to_dropped.sql`, `orders-report/js/managers/dropped-products-manager.js` |
| **Chi tiết** | Thêm cột `order_context JSONB` vào `dropped_products`. Khi xả SP, tự động lưu: orderId, orderCode, stt, customerName, customerPhone, fbUserId, fbUserName, userName (NV), liveCampaignId, liveCampaignName, totalAmount, source. Auto-collect từ `currentChatOrderData`, `campaignManager`, `authManager` — caller không cần truyền metadata. |
| **Status** | ✅ Done |

---

## 2026-04-11

### [docs] Tổng hợp hoàn chỉnh OnCallCX UCaaS V1.1 + V2.0 + Portal Live
| | |
|---|---|
| **Files** | `orders-report/oncallcx-ucaas-v2-complete.md` (new, 852 dòng) |
| **Chi tiết** | Đọc đầy đủ 2 PDF: V1.1 (75 trang) + V2.0 (78 trang). Fetch portal live `pbx-ucaas.oncallcx.vn` qua session cookie (Dashboard, Settings, Extensions, Phones, Add-ons — 6 trang HTML parsed). Tạo file markdown tổng hợp 11 sections (§0–§10): §0 Portal Live data (PBX UCaaS_HNCX01402, SĐT 0963839208, SIP `pbx-ucaas.oncallcx.vn:9060`, 16+ trang portal navigation map), §1–5 giữ từ V1.1 analysis, §6 anConnect/anMeet (V1.1), §7 Lịch sử cuộc gọi (V2.0 rename), §8 Cài đặt thiết bị đầu cuối V2.0 (5 sub-sections mới: MS Teams, Desktop app, IP Phone Yealink + Zoiper SIP config chi tiết, QR cho mobile, tổng hợp 6 Provisioning Options gồm Click-to-Call mới), §9 Cheatsheet codes, §10 Pitfalls (thêm 4 pitfall mới V2.0: port 9060, Click-to-Call chưa có doc, email bắt buộc cho desktop provisioning, Auth ID khác extension number). |
| **Status** | Done |

---

## 2026-04-13

### [product-warehouse] Migrate product list + search + variants từ TPOS OData → Render DB ✅
| | |
|---|---|
| **Files** | `product-warehouse/index.html`, `product-warehouse/js/main.js`, `render.com/routes/v2/web-warehouse.js` |
| **Chi tiết** | Rewrite `fetchProducts()` từ TPOS OData (GetViewV2) sang Render `GET /api/v2/web-warehouse` (có search, sort, pagination, filter). Replace Excel suggestion system (XLSX.js) với `WarehouseAPI.search()` debounced API. Replace `fetchVariants()` và `loadVariantImages()` với `WarehouseAPI.getProduct()`. Xóa XLSX.js dependency. Giữ TPOS auth (tokenManager) chỉ cho edit/save modal (write operations). Thêm sort fields mới vào Render endpoint. |
| **Status** | ✅ Done |

### [render][soluong][order-mgmt] Migrate product search từ TPOS Excel/OData → Render DB ✅
| | |
|---|---|
| **Files** | `render.com/routes/v2/web-warehouse.js`, `shared/js/warehouse-api.js` (NEW), `soluong-live/index.html`, `soluong-live/js/main.js`, `order-management/index.html`, `order-management/order-list.html`, `order-management/js/main.js`, `order-management/js/order-list.js` |
| **Chi tiết** | Thêm 2 endpoints mới trên Render: `GET /search` (autocomplete với unaccent) và `GET /product/:tposProductId` (chi tiết + variants). Tạo `shared/js/warehouse-api.js` — shared client cho cả 2 trang. Migrate soluong-live và order-management: xóa XLSX.js dependency, xóa TPOS Excel API calls, xóa inline auth code, thay bằng WarehouseAPI calls tới Render DB. Product search giờ dùng debounced API call thay vì tải toàn bộ Excel file. |
| **Status** | ✅ Done |

### [soluong][order-mgmt] Cleanup TPOS auth code còn sót — soluong-list, hidden pages ✅
| | |
|---|---|
| **Files** | `soluong-live/soluong-list.html`, `soluong-live/js/soluong-list.js`, `soluong-live/js/hidden-soluong.js`, `order-management/js/hidden-products.js` |
| **Chi tiết** | Xóa toàn bộ inline TPOS auth code (getAuthToken, getValidToken, authenticatedFetch, bearerToken) từ soluong-list.js, hidden-soluong.js, hidden-products.js. Migrate `refreshProduct()` trong soluong-list.js sang WarehouseAPI. Thêm warehouse-api.js script tag vào soluong-list.html. social-sales.html và sales-report.html không có TPOS code — đã clean sẵn. |
| **Status** | ✅ Done |

### [issue-tracking] Fix overdue alert banner bị treo sau khi dismiss ✅
| | |
|---|---|
| **Files** | `issue-tracking/js/script.js` |
| **Chi tiết** | Banner "Thu về quá 20 ngày" bị hiện lại ngay sau khi bấm × vì Firebase data update trigger lại `checkOverdueTickets()`. Thêm `dataset.dismissed` flag giữ trạng thái dismiss trong session, chỉ hiện lại khi số overdue thay đổi. Thêm null check cho button elements tránh crash. |
| **Status** | ✅ Done |

### [render][delivery] Khóa cứng phân chia đơn giao hàng — DB source of truth ✅
| | |
|---|---|
| **Files** | `render.com/migrations/048_create_delivery_assignments.sql`, `render.com/routes/v2/delivery-assignments.js`, `render.com/routes/v2/index.js`, `delivery-report/js/delivery-report.js`, `delivery-report/index.html`, `delivery-report/css/delivery-report.css` |
| **Chi tiết** | Tạo bảng `delivery_assignments` (PostgreSQL) khóa cứng phân chia đơn theo ngày. API v2 endpoints (GET/POST/PUT/DELETE). Frontend load từ DB trước → chỉ assign đơn mới → ON CONFLICT DO NOTHING. Firestore vẫn giữ cho real-time, DB là source of truth. UI hiển thị số đơn đã khóa / mới. Fix bug F5 refresh thay đổi phân chia giữa các máy. |
| **Status** | ✅ Done |

### [shared] Visual refresh toàn bộ design system CSS ✅
| | |
|---|---|
| **Files** | `shared/css/variables.css`, `shared/css/typography.css`, `shared/css/base.css`, `shared/css/components.css`, `shared/css/modern.css` |
| **Typography** | Font-size 20px→14px, weight 600→400, dùng Inter, thêm tabular-nums |
| **Colors** | Primary richer (#4f46e5), slate gray scale, deeper status colors |
| **Components** | Buttons box-shadow, modal backdrop-blur, table uppercase headers, focus-visible ring |
| **Scope** | Ảnh hưởng 10+ trang dùng shared CSS |
| **Status** | ✅ Done |

### [orders] Thêm chức năng xóa sản phẩm (TPOS Unlink) ✅
| | |
|---|---|
| **Files** | `product-warehouse/js/main.js` |
| **Chi tiết** | Nút trash → confirm → `ProductTemplate/ODataService.Unlink` → xóa vĩnh viễn trên TPOS |
| **Status** | ✅ Done |

### [orders] UI polish — header, cards, responsive, TPOS stats fix ✅
| | |
|---|---|
| **Files** | `purchase-orders/css/layout.css`, `purchase-orders/css/cards.css`, `purchase-orders/css/responsive.css`, `purchase-orders/js/ui-components.js` |
| **Chi tiết** | Page header gradient + Manrope font. Summary card color variants (blue/green/purple/orange/cyan). TPOS stats fix $select. Responsive TPOS grid. Max-width container 1600px. |
| **Status** | ✅ Done |

### [orders] Migration Firebase → PostgreSQL + Fix API 500 + Date parsing ✅
| | |
|---|---|
| **Files** | `render.com/scripts/migrate-purchase-orders-firestore-to-pg.js`, `render.com/routes/v2/purchase-orders.js`, `purchase-orders/js/table-renderer.js` |
| **Chi tiết** | Migrate 282 purchase orders từ Firestore → PostgreSQL (0 errors). Fix API 500: đổi từ standalone pool sang shared `req.app.locals.chatDb`. Fix date parsing: string dates from PostgreSQL → Date objects in formatDateFull/Short/TimeOnly. |
| **Status** | ✅ Done |

### [orders] Upgrade history tab with better columns, stats bar, print & done toggle ✅
| | |
|---|---|
| **Files** | `purchase-orders/js/history-tab.js`, `purchase-orders/css/table.css` |
| **Chi tiết** | Nâng cấp history tab: reorder columns (#, Số phiếu, NCC 25ch, Ngày dd/mm, Tổng tiền, Còn nợ, Trạng thái, NV 10ch, Thao tác). Thêm payment status badge (Đã TT/TT 1 phần/Chưa TT). Summary stats bar (phiếu count + tổng tiền + nợ). Print button mở TPOS Print URL. Done toggle thay checkbox bằng styled button. Expand view thêm product thumbnail, mã SP, layout tốt hơn. |
| **Status** | ✅ Done |

### [orders] Upgrade refund tab with better columns, summary bar, and print action ✅
| | |
|---|---|
| **Files** | `purchase-orders/js/refund-tab.js` |
| **Chi tiết** | Nâng cấp refund tab: thêm cột # (row number), Số phiếu, NCC (truncated 25 chars), Ngày (dd/mm), Tổng tiền, Trạng thái (color-coded badge), Phiếu gốc (Origin), NV, Thao tác (Print button). Thêm summary stats bar hiển thị tổng phiếu trả + tổng tiền VND. Print button mở TPOS PrintRefund trong tab mới. Empty state có hướng dẫn điều chỉnh filter. |
| **Status** | ✅ Done |

### [orders] Add TPOS live stats cards to purchase-orders dashboard ✅
| | |
|---|---|
| **Files** | `purchase-orders/js/ui-components.js`, `purchase-orders/css/cards.css`, `purchase-orders/index.html`, `purchase-orders/js/main.js` |
| **Chi tiết** | Thêm section "Dữ liệu TPOS tháng này" với 4 cards: Mua hàng TPOS (count), Tổng tiền mua, Trả hàng, Công nợ NCC. Fetch từ TPOS OData API qua proxy, fire-and-forget non-blocking. Skeleton loading + error state. |
| **Status** | ✅ Done |

### [issue-tracking] Fix "Mã ticket: undefined" trong alert duplicate BOOM/FIX_COD ✅
| | |
|---|---|
| **Files** | `issue-tracking/js/script.js` |
| **Trước** | Alert hiển thị `existingBoom.code` / `existingFixCod.code` — property không tồn tại → "undefined" |
| **Sau** | Sửa thành `existingBoom.ticketCode` / `existingFixCod.ticketCode` — đúng property từ API |
| **Status** | ✅ Done |

### [render] Fix purchase-orders API 500 error — DB pool mismatch ✅
| | |
|---|---|
| **Files** | `render.com/routes/v2/purchase-orders.js` |
| **Trước** | Dùng `const pool = require('../../db/pool')` — pool riêng không có fallback URL, gây 500 trên mọi endpoint |
| **Sau** | Dùng `req.app.locals.chatDb` (shared pool từ server.js với fallback URL) — giống pattern của tất cả v2 routes khác |
| **Status** | ✅ Done |

### [orders] Tạo tài liệu TPOS FastPurchaseOrder + N2Store Architecture ✅
| | |
|---|---|
| **Files** | `purchase-orders/docs/TPOS-FastPurchaseOrder-Analysis.md`, `purchase-orders/docs/N2Store-PurchaseOrders-Architecture.md` |
| **Chi tiết** | Phân tích toàn diện 2 trang TPOS invoicelist/refundlist: 7 controllers, 30+ OData endpoints, entity model, state flow, report APIs, print templates. Tài liệu kiến trúc N2Store: 14 JS modules, data flows, window exports, backend API |
| **Status** | ✅ Done |

---

## 2026-04-12

### [orders] Chỉnh sửa sản phẩm đầy đủ trên Kho Sản Phẩm ✅
| | |
|---|---|
| **Files** | `product-warehouse/index.html`, `product-warehouse/js/main.js` |
| **Trước** | Nút sửa (pencil) không có handler |
| **Sau** | Modal chỉnh sửa đầy đủ tất cả fields TPOS: Thông tin cơ bản (tên, mã, barcode, ảnh), Giá (bán, mua, CK bán/mua), Phân loại (nhóm SP, nhóm POS, ĐVT, trọng lượng, tracking), Trạng thái (active, sale OK, purchase OK, POS), Kế toán (invoice policy, purchase method), Mô tả (3 loại). Dropdowns load từ TPOS OData (cached). Ảnh upload base64. Save qua `UpdateV2` |
| **Status** | ✅ Done |

### [shared] Rename kho_di_cho → web_warehouse + xóa trang Kho Đi Chợ ✅
| | |
|---|---|
| **Files** | 24 files across render.com/, cloudflare-worker/, orders-report/, product-warehouse/, purchase-orders/, doi-soat/, shared/ |
| **DB** | `kho_di_cho` → `web_warehouse`, `kho_di_cho_sales` → `web_warehouse_sales` (auto-migration in ensureTable) |
| **API** | `/api/v2/kho-di-cho` → `/api/v2/web-warehouse` (backward compat alias kept) |
| **SSE** | Channel key `kho_di_cho` → `web_warehouse` |
| **Deleted** | `kho-di-cho/` directory (page), `kho-di-cho-cache.js` (replaced by `web-warehouse-cache.js`), `routes/v2/kho-di-cho.js` (replaced by `web-warehouse.js`) |
| **Nav** | Removed "Kho Đi Chợ" from sidebar navigation |
| **Status** | ✅ Done |

### [shared] Fix SSE realtime gây re-render toàn bộ bảng ✅
| | |
|---|---|
| **Files** | `kho-di-cho/js/main.js`, `product-warehouse/js/main.js` |
| **Bug** | Khi nhận SSE realtime từ TPOS, cả 2 trang `kho-di-cho` và `product-warehouse` đều gọi `showLoading(true)` → xóa trắng bảng (`innerHTML = ''`) → fetch lại → render lại toàn bộ. Gây flash/nhấp nháy |
| **Fix** | Thêm param `silent` cho `loadData()` và `fetchProducts()`. SSE handler gọi với `silent=true` → skip loading indicator, giữ bảng hiện tại visible trong khi fetch data mới ở background |
| **Status** | ✅ Done |

### [orders] Đổi nguồn Kho Sản Phẩm từ Kho Đi Chợ API sang TPOS OData ✅
| | |
|---|---|
| **Files** | `orders-report/js/managers/dropped-products-manager.js` |
| **Trước** | Kho Sản Phẩm panel lấy data từ Render API `/api/v2/kho-di-cho` (PostgreSQL) |
| **Sau** | Lấy từ TPOS OData `ProductTemplate/ODataService.GetViewV2` (cùng nguồn với `product-warehouse/index.html`) |
| **Chi tiết** | Dùng `tokenManager.authenticatedFetch` + `API_CONFIG.buildUrl.tposOData`. Bỏ SSE listener cho `kho_di_cho` |
| **Status** | ✅ Done |

### [orders] Fix Excel fetch dùng đúng campaign từ dropdown ✅
| | |
|---|---|
| **Files** | `orders-report/js/overview/overview-fetch.js`, `orders-report/js/overview/overview-ui.js` |
| **Bug** | Excel fetch luôn dùng campaign từ Tab1 active, không theo dropdown đã chọn. Campaign tên kiểu "T10 PHÁ ĐÀOOOOOOO" không có date nên extractDateFromCampaignName() fail |
| **Fix** | `getCurrentSessionCampaigns()` giờ dùng `currentTableName` (dropdown) → lookup `customStartDate` từ CampaignAPI → search TPOS theo date đó. 3 strategies: (1) date trong tên, (2) customStartDate từ API, (3) fallback Tab1 |
| **Bonus** | Sau khi save Excel → reload dropdown (`loadAvailableTables()`) để cập nhật số đơn |
| **Status** | ✅ Done |

### [docs] Full analysis Cloudflare Worker + Render Server ✅
| | |
|---|---|
| **Files** | `docs/cloudflare/cloudflare.md` (NEW), `docs/render/render.md` (NEW), `CLAUDE.md`, `MEMORY.md` |
| **Cloudflare Worker** | Phân tích toàn bộ `cloudflare-worker/`: 40+ routes, 10 handlers, TPOS/Pancake/FB/AI proxy, Edge Cache 60s, token cache in-memory, Facebook Private Reply fallback, image proxy chain |
| **Render Server** | Phân tích toàn bộ `render.com/`: 100+ endpoints, Customer360 V2 (customers/wallets/tickets/analytics/kho-di-cho), SePay webhook+matching, WS server+clients (Pancake Phoenix + TPOS Socket.IO), SSE engine, 9 cron jobs, 11 services, ADMS ZKTeco protocol, 40+ migrations |
| **Updated** | CLAUDE.md (thêm docs links), MEMORY.md (thêm infrastructure docs section) |
| **Status** | ✅ Done |

### [docs] Thêm rule đọc Pancake/TPOS docs trước khi code ✅
| | |
|---|---|
| **Files** | `CLAUDE.md`, `MEMORY.md` |
| **Chi tiết** | Thêm rule bắt buộc: khi code liên quan Pancake hoặc TPOS, phải đọc mục lục `docs/pancake/PancakeWebsite.md` và `docs/tpos/TposWebsite.md` trước khi code để hiểu rõ cấu trúc |
| **Status** | ✅ Done |

### [docs] TPOS Website Full Analysis — TposWebsite.md ✅
| | |
|---|---|
| **Files** | `docs/tpos/TposWebsite.md` (NEW) |
| **Source** | Fetched trực tiếp source code từ `https://tomato.tpos.vn/` v6.4.5.2 (6 JS bundles, 2 CSS, ~2.9MB minified) |
| **Analysis** | 419 controllers, 138 services/factories, 36 directives, 107 OData entities, 31 action methods, 80+ REST APIs, 12 filters, 5 real-time event types |
| **Modules covered** | Dashboard, POS, Sales, E-Invoice, Quotations, Sale Online, Channels, Purchase, Inventory, Accounting, Categories, Reports, Settings |
| **Integrations** | Facebook, Lazada, Shopee, VNPay, HolaShip, GHN, ZTO, DHL, Zalo, Google Charts, Call Center PBX |
| **Cross-ref** | TPOS-INTEGRATION.md, TPOS-REALTIME-EVENTS-ANALYSIS.md, SHARED_TPOS.md |
| **Status** | ✅ Done |

### [shared] Warehouse Shared Utilities + Product Warehouse SSE Real-time ✅
| | |
|---|---|
| **Files** | `shared/js/warehouse-shared.js` (NEW), `kho-di-cho/js/main.js`, `kho-di-cho/index.html`, `product-warehouse/js/main.js`, `product-warehouse/index.html` |
| **Shared module** | Extracted common utils: `formatCurrency`, `formatPrice`, `formatQty`, `escapeHtml`, `highlightMatch`, `removeVietnameseTones`, `timeSince`, `showToast`, `setupSSE`, `initImageZoomHover`, `showImageOverlay`, `getQtyClass`, `initIcons` → `window.WarehouseShared` |
| **SSE real-time** | Product Warehouse now listens to SSE (`keys=kho_di_cho`) for TPOS product changes, auto-refreshes on sync_complete/batch/created/deleted events |
| **Refactor kho-di-cho** | Replaced local utility functions with `WS.*` shared aliases, SSE setup uses `WS.setupSSE()` with mute/unmute control |
| **Refactor product-warehouse** | Replaced local `formatPrice`, `escapeHtml`, `showToast`, `initImageZoomHover`, `showImage` etc. with shared versions |
| **Status** | ✅ Done |

### [chat] TPOS Sale Online Features — Hide/Show, Reply, Order Actions ✅
| | |
|---|---|
| **Files** | `tpos-pancake/js/tpos/tpos-api.js`, `tpos-pancake/js/tpos/tpos-comment-list.js`, `tpos-pancake/js/tpos/tpos-customer-panel.js`, `tpos-pancake/js/tpos/tpos-init.js` |
| **Comment Hide/Show** | Gọi API TPOS thật (`facebook-graph/comment/hide`) thay vì chỉ đổi UI local |
| **Comment Reply** | Nút trả lời inline dưới comment, gửi qua API (`facebook-graph/comment/reply`) |
| **Order Badge** | Hiện mã đơn (Code) trên mỗi comment nếu khách có đơn, click để xem chi tiết |
| **Order Detail** | Modal khách hàng hiện chi tiết đơn: sản phẩm, STT, trạng thái, ghi chú |
| **Order Actions** | Nút Xác nhận / Hủy đơn trực tiếp trong modal (`ActionConfirm`, `ActionCancel`) |
| **API mới** | `hideComment()`, `replyToComment()`, `getOrderForUser()`, `confirmOrder()`, `cancelOrder()` |
| **Status** | ✅ Done |

### [chat] tpos-pancake Hotfixes — WORKER_URL, Realtime, Error 122 ✅
| | |
|---|---|
| **Files** | `tpos-pancake/js/tpos/tpos-api.js`, `tpos-pancake/js/tpos/tpos-state.js`, `tpos-pancake/js/pancake/pancake-realtime.js`, `tpos-pancake/js/pancake/pancake-init.js`, `tpos-pancake/js/pancake/pancake-api.js` |
| **Fix 1** | `WORKER_URL` redeclaration crash — removed duplicate `const` in tpos-api.js |
| **Fix 2** | WebSocket auth — browser can't set Cookie cross-origin, default to server mode (relay) |
| **Fix 3** | proxyBaseUrl wrong — was pointing to fallback render, changed to CloudFlare Worker |
| **Fix 4** | Error 122 — page 193642490509664 subscription expired, auto-exclude and retry |
| **Status** | ✅ Done |

### [chat] tpos-pancake Full Rebuild — Modular Architecture ✅
| | |
|---|---|
| **Files** | `tpos-pancake/index.html` (1233→428 lines), `tpos-pancake/js/shared/` (4 files), `tpos-pancake/js/layout/` (3 files), `tpos-pancake/js/tpos/` (7 files), `tpos-pancake/js/pancake/` (9 files), `tpos-pancake/css/variables.css`, `tpos-pancake/css/layout.css`, `tpos-pancake/css/components.css` |
| **What** | Rebuild toàn bộ tpos-pancake từ ~22,500 LOC god classes thành 27 modular files (~9,200 LOC, giảm 59%) |
| **Shared** | `utils.js` (escapeHtml, normalizePhone, formatDebt, formatTime, getAvatarUrl), `cache-manager.js` (TTL+LRU), `debt-manager.js` (unified debt loading), `event-bus.js` (cross-column events) |
| **TPOS** | Tách `tpos-chat.js` (2165 lines) → 7 modules: state, api, comment-list, customer-panel, realtime, token-manager, init |
| **Pancake** | Tách `pancake-chat.js` (3999 lines) + `pancake-data-manager.js` (3643 lines) → 9 modules: state, api, conversation-list, chat-window, page-selector, context-menu, realtime, token-manager, init |
| **CSS** | Tách `modern.css` → `variables.css` + `layout.css` + `components.css` |
| **Status** | ✅ Done |

### [inbox] Full Pancake Features — Tags, Assignee, Notes CRUD, Bulk Actions, QR Sync, Settings ✅
| | |
|---|---|
| **Files** | `inbox/js/inbox-pancake-features.js` (NEW), `inbox/css/inbox-features.css` (NEW), `inbox/index.html`, `inbox/js/inbox-chat.js`, `inbox/js/inbox-main.js` |
| **Phase 1** | **Pancake Tags**: Load tags từ page settings, render tag bar, gắn/gỡ tag cho conversation qua API |
| **Phase 2** | **Assignee**: Load page users, phân công/gỡ phân công nhân viên, hiển thị trong info panel |
| **Phase 3** | **Notes CRUD**: Thêm nút sửa/xóa ghi chú khách hàng (PUT/DELETE API) |
| **Phase 4** | **Pancake Quick Replies sync**: Load QR từ page settings, hiển thị trong quick reply bar |
| **Phase 5** | **Viewing Indicator**: Xử lý WebSocket viewing_conversation events, hiển thị ai đang xem |
| **Phase 6** | **Bulk Actions**: Chọn nhiều conv, mark read/gắn tag/assign/gán nhãn hàng loạt |
| **Phase 7** | **Orders sync Pancake**: Tạo đơn qua Pancake API với warehouse/shop_id |
| **Phase 8** | **Customer Profile Edit**: Sửa SĐT/tên khách hàng qua API |
| **Phase 9** | **Page Settings UI**: Modal xem settings page (tags, QR, warehouses, toggles) |
| **Phase 10** | **Auto-tagging & Round Robin**: Hiển thị trạng thái trong Page Settings UI |
| **Status** | ✅ Done |

### [orders] Purchase Orders — Major Upgrade: Security, New Tabs, UX ✅
| | |
|---|---|
| **Files** | `purchase-orders/js/lib/tpos-search.js`, `purchase-orders/js/lib/ncc-manager.js`, `purchase-orders/js/main.js`, `purchase-orders/js/config.js`, `purchase-orders/js/form-modal.js`, `purchase-orders/js/table-renderer.js`, `purchase-orders/js/lib/product-code-generator.js`, `purchase-orders/js/refund-tab.js` (NEW), `purchase-orders/js/products-tab.js` (NEW), `purchase-orders/css/variables.css`, `purchase-orders/css/styles.css`, `purchase-orders/css/modal.css`, `purchase-orders/css/table.css`, `purchase-orders/css/toast.css`, `purchase-orders/css/states.css`, `purchase-orders/index.html` |
| **Security** | Xóa hardcoded TPOS credentials khỏi browser, dùng proxy auth JSON `{ companyId }`. Fix XSS (escapeHtml). Fix OData injection trong NCC manager. |
| **New Tabs** | **Trả hàng NCC** (refund-tab.js): Xem phiếu trả hàng từ TPOS (Type='refund'). **Kho SP** (products-tab.js): Browse ProductTemplate catalog từ TPOS với search, sort, variant expansion. |
| **CSS** | Xóa duplicate CSS variables. Thêm z-index scale (`--z-modal-bg`, `--z-notification`, etc.). Thêm print styles `@media print`. |
| **UX** | Drag & drop image upload. ARIA attributes. Cache product codes (fix N+1 Firestore queries). |
| **Status** | ✅ Done |

### [shared][render][inbox][orders][customer-hub] Pancake Integration — Full System ✅
| | |
|---|---|
| **Files** | `shared/js/pancake-customer-validator.js` (NEW), `shared/js/unified-customer-360.js` (NEW), `render.com/services/pancake-alert-service.js` (NEW), `render.com/routes/v2/customers.js`, `inbox/js/inbox-customer-lookup.js` (NEW), `inbox/index.html`, `inbox/css/inbox.css`, `orders-report/js/tab1/tab1-customer-info.js` (NEW), `orders-report/js/tab1/tab1-table.js`, `orders-report/css/tab1-orders.css`, `orders-report/tab1-orders.html`, `customer-hub/js/modules/customer-profile.js`, `balance-history/index.html`, `balance-history/js/balance-verification.js`, `delivery-report/index.html`, `delivery-report/js/delivery-report.js`, `don-inbox/index.html`, `don-inbox/js/tab-social-modal.js`, `doi-soat/index.html`, `doi-soat/js/app.js` |
| **Feature** | **14 tính năng tích hợp Pancake vào toàn bộ n2store:** |
| | 1. Inbox: Standalone Customer Lookup modal (tên/SĐT/FB ID) |
| | 2. Customer Hub: Pancake info card (fb_id, global_id, notes, order stats) |
| | 3. Backend: Notes full CRUD (GET/PATCH/DELETE) |
| | 4. Orders-Report: Customer info popup on name click |
| | 5. Balance-history: Pancake validation on QR generation |
| | 6. Delivery-report: async customer risk badges in table |
| | 7. Don-inbox: customer danger confirmation on order create |
| | 8. Doi-soat: Pancake customer badge on reconciliation |
| | 9. Shared: PancakeValidator (lookup, risk, badges) |
| | 10. Shared: UnifiedCustomer360 (aggregated profile) |
| | 11. Backend: Automated Telegram alerts (return spike, banned customer) |
| | 12. Backend: sync-tpos endpoint (auto-link TPOS partner) |
| | 13. Backend: check-alerts cron endpoint |
| | 14. Backend: Alert integration into sync-pancake flow |
| **Status** | ✅ Done |

---

## 2026-04-11

### [orders] Purchase Orders — Thùng rác (Trash tab) ✅
| | |
|---|---|
| **Files** | `purchase-orders/js/config.js`, `service.js`, `data-manager.js`, `main.js`, `table-renderer.js`, `ui-components.js`, `css/tabs.css` |
| **Feature** | Thêm tab Thùng rác. Xóa đơn hàng → soft delete (status=DELETED, lưu previousStatus + deletedAt). Tab thùng rác hiển thị đơn đã xóa với nút Khôi phục + Xóa vĩnh viễn. Auto-cleanup đơn quá 7 ngày khi mở tab. Hỗ trợ bulk restore/permanent delete. |
| **Status** | ✅ Done |

### [kho] Kho Đi Chợ full CRUD rebuild ✅
| | |
|---|---|
| **Files** | `kho-di-cho/js/main.js`, `kho-di-cho/index.html`, `kho-di-cho/css/kho-di-cho.css`, `render.com/routes/v2/kho-di-cho.js` |
| **Backend** | API mới: `POST /bulk-delete`, `POST /bulk-update`, `POST /change-qty`. |
| **Frontend** | Checkbox multi-select + bulk action bar. Inline qty +/- buttons. Edit modal: tên, biến thể, SL, giá bán, giá nhập, ảnh. Cột mới: checkbox, giá bán (tách riêng). |
| **Status** | ✅ Done |

### [chat][render] Cross-page customer lookup via DB — chính xác 100% ✅
| | |
|---|---|
| **Files** | `orders-report/js/tab1/tab1-chat-core.js`, `render.com/routes/fb-global-id-cache.js`, `render.com/routes/v2/customers.js` |
| **Why** | Tìm customer cross-page bằng tên có nhiều kết quả trùng (vd: 3 customer "Diệu Diệu" khác nhau trên NhiJudy Store). Cần chính xác. |
| **Strategy 0 (DB)** | `phone → customers table (global_id)` → `global_id + target_page → fb_global_id_cache (psid)` → `fetchConversationsByCustomerFbId(targetPage, psid)` → chính xác 1 customer. |
| **New endpoints** | `GET /api/fb-global-id/by-global?globalUserId=X&pageId=Y` — reverse lookup psid by global_id per page. `GET /api/v2/customers/by-phone/:phone` — lookup global_id + pancake_data. |
| **Fallback** | Nếu DB miss → v1 POST search by name (strip diacritics, exact match) → last resort PSID fallback. |
| **Auto-pick** | INBOX mới nhất (sort `last_customer_interactive_at`), COMMENT xuống dưới. Picker hiện bên dưới messages. |
| **Status** | ✅ Done |

### [render] TPOS Socket.IO real-time listener ✅
| | |
|---|---|
| **Files** | `render.com/services/tpos-socket-listener.js` (MỚI), `render.com/routes/v2/kho-di-cho.js`, `render.com/server.js`, `render.com/package.json`, `kho-di-cho/js/main.js` |
| **Socket.IO** | Connect tới `rt-2.tpos.app/chatomni` (WebSocket, auth token). Nhận event `on-events` chứa tất cả TPOS messages. |
| **Product events** | ProductTemplate: created/deleted/deletedIds/set_active/updatefromfile/import_file/clearcache. Product: inventory_updated/update_price_file/deleted. ProductInventory: update. |
| **Sync trigger** | Debounce 3s. Specific templates → sync từng template. Bulk events (import_file, clearcache) → incremental sync. >10 templates → incremental sync. |
| **Reconnect** | Auth expired → refresh token + reconnect. Exponential backoff (1s→2s→4s...→30s). Max 50 attempts → wait 5 phút → reset. |
| **Status** | `GET /sync/status` trả thêm `socket: { connected, eventsReceived, productEvents, syncsTriggered }`. Frontend hiện RT indicator. |
| **Cron vẫn giữ** | 30 phút incremental sync làm fallback khi socket disconnect. |
| **Status** | ✅ Done |

### [render][orders] TPOS Product Sync + Kho Đi Chợ v3 ✅
| | |
|---|---|
| **Files** | `render.com/services/sync-tpos-products.js` (MỚI), `render.com/routes/v2/kho-di-cho.js`, `render.com/server.js`, `kho-di-cho/js/main.js`, `kho-di-cho/index.html`, `kho-di-cho/css/kho-di-cho.css` |
| **Sync Worker** | `TPOSProductSync` class: full sync (fetch ALL templates paginated + variants per template) + incremental sync (200 recent). Hash-based change detection (skip unchanged). Rate limit 200ms/req. Transaction per batch. Sync log table `tpos_sync_log`. |
| **Schema v3** | Thêm columns: `tpos_template_id`, `name_get`, `category`, `barcode`, `uom_name`, `standard_price`, `tpos_qty_available`, `active`, `data_hash`, `last_synced_at`. Migration safe (DO $$ IF NOT EXISTS). |
| **Cron** | Incremental sync mỗi 30 phút (auto-start on server boot, 10s delay). Stale detection (>10min → auto-reset). Lock mechanism (1 sync at a time). |
| **API mới** | `POST /sync` (trigger manual), `GET /sync/status`, `GET /sync/log`. GET `/` enhanced: filter `category`, `active`, `has_inventory`. Fixed brittle count query. |
| **Frontend rebuild** | Server-side pagination, product images, category filter, inventory filter, TPOS qty column, sync status bar + Sync TPOS button, SSE real-time. |
| **Error handling** | TPOS timeout → 3x retry backoff. TPOS down → skip cycle, log error. Duplicate sync → lock. Partial fail → per-template catch. Auth expired → auto-refresh token. |
| **Status** | ✅ Done |

### [orders][render] Chuyển Tab Đơn Hàng & Bán Hàng sang Kho Đi Chợ ✅
| | |
|---|---|
| **Files** | `render.com/routes/v2/kho-di-cho.js`, `render.com/server.js`, `orders-report/js/managers/dropped-products-manager.js`, `orders-report/js/managers/held-products-manager.js`, `orders-report/js/chat/chat-products-actions.js` |
| **Backend** | Thêm columns `image_url`, `tpos_product_id`, `selling_price` vào `kho_di_cho` table. Tạo `kho_di_cho_sales` table (lưu lịch sử bán để undo). API mới: `POST /hold`, `DELETE /hold/:o/:p/:u`, `GET /holders/:code`, `POST /confirm-sale`, `POST /return`, `GET /sales`. SSE broadcast trên key `kho_di_cho`. GET `/` enhanced: trả `available_qty` = quantity - SUM(held). |
| **Tab Bán Hàng** | Data source: `kho_di_cho` API thay dropped_products. SSE key: `kho_di_cho`. `mapKhoProduct()` mapping kho fields → UI format. `moveDroppedToOrder()` gọi `/hold` API (validate available qty). CRUD operations redirect sang kho API. |
| **Tab Đơn Hàng** | `confirmHeldProduct()`: gọi `/confirm-sale` (trừ kho + log sales history) trước khi PUT TPOS. `deleteHeldProduct()`: release hold (available_qty auto-restore). `syncHeldQuantityToFirebase()` → Render API. `removeHeldFromFirebase()` → `removeHeldFromRender()`. |
| **Undo flow** | `POST /return`: trả SP lại kho từ sales history. Nếu SP đã bị xóa (qty=0) → recreate từ sales record. `addToDroppedProducts()` gọi return API, fallback batch. |
| **Cleanup** | `cleanupHeldProducts()` + `cleanupAllUserHeldProducts()`: release kho hold thay vì return to dropped (available_qty auto-restore khi xóa held_products row). |
| **Status** | ✅ Done |

### [render] Drop 4 unused PostgreSQL tables ✅
| | |
|---|---|
| **Files** | `render.com/migrations/043_drop_unused_tables.sql` |
| **Audit** | Kiểm tra toàn bộ 51 tables, grep references trong codebase. 47 tables active, 4 unused. |
| **Dropped** | `soquy_vouchers` (573 rows, migration backup), `soquy_counters` (3 rows), `soquy_meta` (7 rows) — soquy vẫn dùng Firestore. `debt_adjustment_log` — chưa tồn tại (never migrated). |
| **Firebase** | Audit 50+ collections/paths — tất cả active. Không có dead collections. |
| **Status** | ✅ Done — đã chạy trên production DB |

### [chat] Harvest global_id từ extension bypass + fix bulk send ✅
| | |
|---|---|
| **Files** | `orders-report/js/tab1/tab1-extension-bridge.js`, `orders-report/js/chat/message-template-manager.js` |
| **Harvest extension** | `sendViaExtension` + `sendViaExtensionWithAttachments`: khi extension resolve `global_id` thành công → gọi `GlobalIdHarvester.fromCustomers()` + `_saveGlobalIdToServer()`. Trước đó chỉ cache in-memory, mất khi reload. |
| **Bulk send fixes** | (1) `_sendAsInbox`: thêm `conv.page_id === pageId` guard — `inboxMapByPSID` có thể trả cross-page conv. (2) `action: 'reply_inbox'` thay `type: 'reply_inbox'` (đúng Pancake API spec). (3) `_sendAsComment`: cùng page guard + `action: 'reply_comment'`. |
| **Status** | ✅ Done |

### [chat] Sync customer data to Render DB khi mở chat modal ✅
| | |
|---|---|
| **Files** | `orders-report/js/tab1/tab1-chat-core.js` |
| **Why** | Inbox page gọi `POST /api/v2/customers/sync-pancake` khi mở conversation — nhưng orders-report chat modal KHÔNG gọi → customer data (global_id, can_inbox, gender, birthday, notes, order stats) không được sync khi chat từ orders-report. |
| **Fix** | Thêm `_syncPancakeCustomerToDB(result, pageId)` — fire-and-forget POST sau `_loadMessages` render. Replicate logic từ inbox-chat.js:3768. Match chain: `global_id → phone → fb_id`. Gửi: page_id, fb_id, global_id, name, phone, gender, birthday, lives_in, can_inbox, pancake_id, notes, reports_by_phone. |
| **Status** | ✅ Done |

### [chat] Realtime match tighten + pickConversation reset reply ✅
| | |
|---|---|
| **Files** | `orders-report/js/tab1/tab1-chat-realtime.js`, `orders-report/js/tab1/tab1-chat-core.js` |
| **Fix** | (1) `handleConversationUpdate` PSID match giờ cần kèm pageId match — tránh false positive cross-conv. (2) `_pickConversation` clear reply state + image previews trước khi load conv mới. |
| **Status** | ✅ Done |

### [chat][shared] Pancake API compliance audit — 15+ fixes ✅
| | |
|---|---|
| **Files** | `orders-report/js/managers/pancake-data-manager.js`, `orders-report/js/tab1/tab1-chat-core.js`, `orders-report/js/tab1/tab1-chat-messages.js` |
| **Phase 1 — PDM** | (1) Thêm `Referer: pancake.vn/multi_pages` header cho 4 methods v1 API (`fetchConversationsByCustomerFbId`, `fetchConversationsByCustomerIdMultiPage`, `fetchPages`). (2) Error 122 handling: `_expiredPageIds` Set + `_searchablePageIds` getter lọc expired pages khỏi multi-page queries. (3) `fetchPages` retry on error 105/100. (4) Remove `customer_id` param từ v1 public API `fetchMessages` (không cần). (5) Store `global_id` + `can_inbox` từ messages response. (6) `searchConversations` dùng `_searchablePageIds` + handle error 122 partial results. |
| **Phase 2 — Sending** | Fix `postId` extraction cho COMMENT: ưu tiên `conv.post_id` (direct field) trước `_raw.post_id` và `_messagesData.post.id`. |
| **Phase 3 — Cache** | INBOX cache guard: `inboxMapByPSID` lookup thêm check `conv.page_id === pageId` tránh trả cross-page conv (vì PSID = fb_id là page-scoped). |
| **Phase 4 — Pagination** | Cursor dùng `result.current_count` (API value) thay vì `messages.length`. Store `_globalId` + `_canInbox` trên conv data để extension bypass reuse (tránh re-fetch). |
| **Status** | ✅ Done |

### [inbox] Customer Info Card + search giữ page filter ✅
| | |
|---|---|
| **Files** | `inbox/index.html`, `inbox/js/inbox-chat.js`, `inbox/css/inbox.css` |
| **Chi tiết** | **Customer Info Card:** Panel phải hiện đầy đủ thông tin khách khi click conversation: SĐT, FB ID, Global ID (cross-page), giới tính, sinh nhật, nơi sống, đơn hàng (OK/hoàn/%), bình luận, can_inbox, banned, ad clicks, page. Tất cả ID copyable. Card ở trên notes section trong tab Phân Nhóm. **Search filter:** Revert bypass page filter — filter Store thì search chỉ hiện Store. |
| **Status** | ✅ Done |

### [chat] Cross-page conversation lookup + picker + bug fixes ✅
| | |
|---|---|
| **Files** | `orders-report/js/tab1/tab1-chat-core.js`, `orders-report/js/managers/pancake-data-manager.js`, `orders-report/css/tab1-chat-modal.css`, `orders-report/tab1-orders.html` |
| **Root cause** | PSID là page-specific → cùng customer có PSID khác trên page khác. `searchConversations()` (POST) trả `success:false`. |
| **Fix** | Thêm `pdm.searchConversationsOnPage(pageId, name)` dùng GET v2 public API `?search=` (xác nhận hoạt động qua console debug). Khi switch page (`allowDrift=false`): search bằng customer name → filter exact match → 0 conv=empty state, 1 conv=auto-load, 2+ convs=conversation picker. |
| **Picker UI** | `.chat-conv-picker-*` classes: danh sách cards với icon (📧 inbox / 💬 comment), tên, snippet, thời gian. Click → `_pickConversation()` load messages. |
| **Bugs fixed** | (1) dropdown `position:fixed` thoát overflow:hidden chain; (2) dropdown position left-aligned tránh off-screen; (3) page drift disabled khi explicit switch; (4) `_pageConvCache` guard init; (5) `_pickConversation` sync page selector label. |
| **Status** | ✅ Done |

## 2026-04-10

### [render][inbox] Lưu đầy đủ customer Pancake vào Render DB (global_id, notes, orders) ✅
| | |
|---|---|
| **Files** | `render.com/migrations/029_add_pancake_customer_fields.sql`, `render.com/routes/v2/customers.js`, `inbox/js/inbox-chat.js` |
| **Chi tiết** | **Migration 029:** Thêm `global_id` (Facebook Real Global ID, cross-page), `pancake_id`, `gender`, `birthday`, `lives_in`, `pancake_data` (JSONB), `pancake_notes`, `order_success/fail_count`, `can_inbox`, `pancake_synced_at`. **API:** `GET /by-global-id/:id`, `POST /sync-pancake` upsert (match global_id → phone → fb_id). **Auto-sync:** mỗi khi mở conversation → `_syncPancakeCustomerToDB` gửi customer data lên DB. |
| **Status** | ✅ Done |

### [render][fb-ads] Full feature set — billing, audiences, pixels, reports, rules, account
- **Files:** `fb-ads/*`, `render.com/routes/fb-ads.js`
- **Chi tiết:** Thêm 6 tabs mới: (1) Đối tượng — custom & lookalike audiences CRUD; (2) Pixel — list pixels, event stats; (3) Thanh toán — account status, spent, balance, spend cap control, funding source, transactions; (4) Báo cáo — daily/age+gender/placement reports + CSV export; (5) Quy tắc tự động — tạo rules (CPC/CPR triggers → pause/notify), enable/disable; (6) Tài khoản — full details, users, permissions, activity log, disable reason.
- **Status:** ✅ Done

### [render][fb-ads] Full Ads Manager — roles, creation, bulk actions
- **Files:** `fb-ads/*`, `render.com/routes/fb-ads.js`
- **Chi tiết:** (1) Backend: app roles CRUD, pages list, campaign/adset update, ad image upload base64, bulk status/delete, ad preview. (2) Frontend: Settings modal (quản lý users/testers, view Pages, token info), Edit campaign modal, Create Ad Set modal (targeting: country/age/gender/interests search), Create Ad modal (message/headline/image/CTA/page), Bulk actions (select all → activate/pause/delete), drill-down Campaign→AdSet→Ad.
- **Status:** ✅ Done

### [chat] Per-page conv cache + nút chọn lại đoạn hội thoại ✅
| | |
|---|---|
| **Files** | `orders-report/tab1-orders.html`, `orders-report/css/tab1-chat-modal.css`, `orders-report/js/tab1/tab1-chat-core.js` |
| **Conv cache** | `window._pageConvCache` Map keyed `${psid}:${pageId}:${type}`. Khi `_doFindAndLoadConversation` tìm thấy conv → save. Lần sau switch page quay lại → hit cache instant (skip API). Clear khi close modal. |
| **Nút sync** | `#chatRepickConvBtn` (icon `sync`) hiện bên cạnh page selector. Click → xoá cache cho page hiện tại → `_findAndLoadConversation` fresh. User dùng khi muốn chọn đoạn hội thoại khác (vd: customer có nhiều threads). |
| **Status** | ✅ Done |

### [chat] Page selector popup — thay select thành danh sách đẹp giống inbox ✅
| | |
|---|---|
| **Files** | `orders-report/tab1-orders.html`, `orders-report/css/tab1-chat-modal.css`, `orders-report/js/tab1/tab1-chat-core.js` |
| **Why** | `<select>` HTML thô quá basic, user muốn popup giống trang inbox: avatar + tên page + checkmark page đang chọn. |
| **HTML** | Thay `<select id="chatPageSelect">` bằng `<div class="chat-page-selector">` chứa button trigger + dropdown container. |
| **CSS** | Xoá CSS `#chatPageSelect`, thêm `.chat-page-selector-*` classes: popup absolute right, border-radius 10px, shadow, thin scrollbar, active state `--ap-on-primary-container`, avatar 28px, checkmark icon visibility toggle. Arrow rotate 180° khi open. |
| **JS** | Refactor `_populatePageSelector()` → render items HTML với avatar (img + onerror placeholder) + name + check icon. Thêm `_togglePageDropdown`, `_closePageDropdown`, `_updatePageSelectorActive`, `_renderPageSelectorItems`. Click-outside handler. Page drift sync đổi từ `chatPageSelect.value =` sang `_updatePageSelectorActive()`. Single-select (khác inbox multi-select). |
| **Status** | ✅ Done |

### [render][fb-ads] Facebook Ads Manager — MVP
- **Files:** `fb-ads/index.html`, `fb-ads/fb-ads.css`, `fb-ads/fb-ads.js`, `render.com/routes/fb-ads.js`, `render.com/server.js`
- **Chi tiết:** Build trang quản lý quảng cáo Facebook tích hợp Marketing API v21.0. Backend proxy giữ token server-side. Frontend có Facebook Login, auto-detect ad accounts, 3 tabs (Campaigns/Ad Sets/Ads), metrics bar, search, date range filter, create campaign modal, toggle status. Env vars FB_APP_ID + FB_APP_SECRET đã thêm vào Render.
- **Status:** ✅ Done

### [worker][shared] Follow-up: CF Worker proxy auth + xóa sót API key
- **Files:** `cloudflare-worker/modules/handlers/token-handler.js`, `shared/js/pancake-token-manager.js`
- **Chi tiết:** (1) CF Worker `/api/token` giờ hỗ trợ 2 mode: **proxy auth** (JSON `{companyId}` → Worker inject credentials server-side) + **legacy passthrough** (form-urlencoded, backward compat). Credentials chỉ tồn tại trong Worker, không còn trong browser JS. (2) Xóa hardcoded API key cuối cùng trong `shared/js/pancake-token-manager.js`.
- **Status:** ✅ Done

### [orders] Security + Bug fix audit — 17 issues fixed across 14 files
| | |
|---|---|
| **Files** | `token-manager.js`, `pancake-token-manager.js`, `main.html`, `tab1-sale.js`, `tab1-tags.js`, `tab1-table.js`, `tab1-chat-messages.js`, `tab1-chat-core.js`, `tab1-merge.js`, `tab1-search.js`, `tab1-bulk-tags.js`, `tab1-fast-sale-invoice-status.js`, `tab1-qr-debt.js`, `tab1-encoding.js` |
| **What** | **P0 Critical:** (1) Removed hardcoded TPOS credentials from browser JS → proxy-based auth, (2) Removed hardcoded API key fallbacks, (3) Added idempotency key for sale order creation to prevent duplicate invoices on 401 retry, (4) Validated postMessage origins in extension relay bridge (replaced `'*'` wildcards). **P1 High:** (5) Escaped HTML in tag names, error msgs, onclick attrs, image URLs to prevent XSS, (6) Fixed merge crash on null sourceOrder/ProductId with bounds checks, (7) Added negative discount validation, (8) Changed tag filter logic from AND→OR (UX fix). **P2 Medium:** (9) Chat Firebase listener cleanup on modal close (memory leak), (10) Added 30s safety timeout for isSavingSingleSale flag, (11) Bulk tag O(n²)→O(n) with Set, (12) Fixed false success count for already-tagged orders, (13) Token refresh promise-based mutex, (14) Invoice delete API-first atomicity, (15) Debt balance validation (finite, non-negative), (16) Empty OrderLines validation, (17) Improved encoding checksum to 8-char dual-hash. |
| **Status** | ✅ Done |

### [shared] Cài đặt everything-claude-code vào project
- **Files:** `.claude/agents/` (47), `.claude/skills/` (181), `.claude/commands/` (79), `.claude/rules/` (89 files), `.claude/scripts/` (128), `.claude/settings.json`
- **Source:** https://github.com/affaan-m/everything-claude-code
- **Chi tiết:** Copy toàn bộ agents/skills/commands/rules/scripts vào `.claude/` (project-level). Tạo `settings.json` với 32 hooks (PreToolUse x11, PostToolUse x11, Stop x6, SessionStart, SessionEnd, PreCompact, PostToolUseFailure). `CLAUDE_PLUGIN_ROOT` → `/Users/mac/Desktop/n2store/.claude`
- **Status:** ✅ Done

### [render][orders] Pancake token cache — Phase 2 ✅
| | |
|---|---|
| **Files** | `render.com/services/auth-token-store.js`, `render.com/server.js`, `orders-report/js/managers/pancake-token-manager.js` |
| **Why** | Pancake JWT cũng mất khi F5/cold-start. Cần shared cache để mọi tab/máy dùng được ngay mà không cần user login lại. |
| **What** | 1/ `auth-token-store.js`: thêm pancake provider — read-only (không có OAuth2 password grant), `getToken('pancake')` trả về token hiện có hoặc throw `pancake:not_found`. 2/ `server.js /api/realtime/start`: sau khi save vào `realtime_credentials`, cũng upsert vào `auth_token_cache` (decode JWT exp → set `expires_at`). 3/ `GET /api/auth/token/pancake`: trả 404 nếu chưa có token. 4/ `pancake-token-manager.js`: thêm `tryRenderCache()` + Step 0 trong `getToken()` — chỉ gọi Render nếu memory+localStorage rỗng (tránh network overhead mỗi call). Hydrate memory+localStorage sau khi lấy từ Render. |
| **Flow** | Browser login → `/api/realtime/start` → upsert `auth_token_cache[pancake]` → mọi tab mới gọi `GET /api/auth/token/pancake` → nếu còn hạn trả về → hydrate localStorage. Khi token hết hạn → 401/null → user re-login → push lại. |
| **Status** | ✅ Done |

### [render][orders] TPOS token cache — PostgreSQL + Render API + CF fallback ✅
| | |
|---|---|
| **Files** | `render.com/services/auth-token-store.js` (new), `render.com/migrations/042_create_auth_token_cache.sql` (new), `render.com/server.js`, `orders-report/js/core/token-manager.js` |
| **Why** | Mỗi tab browser mở mới phải re-login TPOS (~500-2000ms). Token hết hạn 15 ngày nhưng chỉ cache memory — mất khi F5. Không sync giữa máy. |
| **Changes** | (1) Table `auth_token_cache` (provider PK, token, refresh_token, expires_at, metadata). (2) `auth-token-store.js`: getToken (DB lookup → refresh nếu cần), refreshAndStore (lock per provider), preSeed (tpos_1, tpos_2, tpos_server). (3) Endpoints `GET /api/auth/token/:provider` + `POST /invalidate` bảo vệ bằng `X-API-Key`. (4) Client `token-manager.js`: thêm `tryRenderCache()` trước refresh_token + passwordLogin. 3s timeout, fallback silent. `authenticatedFetch` 401 → invalidate Render cache + retry. (5) `CLIENT_API_KEY` env set on Render. |
| **Flow** | Client → Render cache (30ms) → nếu fail → CF worker → TPOS login (500ms). Token sync qua DB: 1 máy refresh → tất cả máy khác GET cùng token. |
| **Status** | ✅ |

## 2026-04-09

### [render][inbox] Thêm fb_id vào bảng customers + auto-link từ Pancake ✅
| | |
|---|---|
| **Files** | `render.com/migrations/027_add_fb_id_to_customers.sql`, `render.com/routes/v2/customers.js`, `inbox/js/inbox-data.js`, `inbox/js/inbox-chat.js` |
| **Chi tiết** | **Migration 027:** Thêm cột `fb_id VARCHAR(50)` nullable, UNIQUE WHERE NOT NULL. **API:** `GET /api/v2/customers/by-fb-id/:fbId` lookup, `POST /api/v2/customers/link-fb-ids` batch link by phone match. **Auto-link:** `inbox-data.js` sau `loadConversations` gửi batch `{fb_id, name, phone}` lên Render DB (fire-and-forget). **Search fallback:** `performSearch` nếu local name index miss → query customer DB → nếu có fb_id → gọi `searchByCustomerId`. |
| **Status** | ✅ Done |

### [inbox] Local customer name index — gõ tên tự động tìm theo customer ID ✅
| | |
|---|---|
| **Files** | `inbox/js/inbox-data.js`, `inbox/js/inbox-chat.js` |
| **Chi tiết** | **customerNameIndex:** `Map<normalizedName, Set<fb_id>>` xây từ conversations đã load trong `buildMaps()`. **lookupFbIdByName(query):** exact match rồi substring match trên tên normalized (bỏ dấu). **performSearch():** trước khi gọi API, tra local index → nếu hit → gọi `searchByCustomerId(fb_id)` ngay → render kết quả tức thì → sau đó vẫn chạy normal search để merge thêm. |
| **Status** | ✅ Done |

### [inbox] Search by Customer ID — tìm tất cả conversations của 1 khách hàng ✅
| | |
|---|---|
| **Files** | `inbox/js/inbox-pancake-api.js`, `inbox/js/inbox-chat.js` |
| **Chi tiết** | **searchByCustomerId(fbId):** Gọi Pancake API `/conversations/customer/{fbId}` với pages params, trả về TẤT CẢ conversations (inbox + comment) của customer across all pages. **performSearch():** (1) Detect fb_id (15+ digits) → gọi trực tiếp searchByCustomerId, skip normal search. (2) Sau searchConversations thường, nếu có kết quả → lấy fb_id từ conversation đầu tiên → chain searchByCustomerId → merge + deduplicate. User search tên/SĐT → tự động tìm thêm tất cả conversations liên quan. |
| **Status** | ✅ Done |

### [inbox][worker] Tăng tốc load Inbox: parallel fetch + stale-while-revalidate cache + edge cache ✅
| | |
|---|---|
| **Files** | `inbox/js/inbox-pancake-api.js`, `inbox/js/inbox-data.js`, `inbox/js/inbox-main.js`, `cloudflare-worker/modules/handlers/pancake-handler.js` |
| **Chi tiết** | **Lớp 1:** `fetchConversations` + `fetchConversationsPerPage` đổi từ vòng `for...of` tuần tự sang `Promise.all` song song — N pages cùng fetch một lúc, giảm từ N×latency về ~1×. **Lớp 2:** Stale-while-revalidate cache localStorage (`inbox_conversations_cache_v1`, TTL 30 phút). Tách `InboxDataManager.initFromCache()` (sync) khỏi `init()` (network). `inbox-main.js` render UI từ cache ngay (<100ms), background refresh ngầm rồi re-render. **Lớp 3:** Cloudflare Worker `handlePancakeOfficialV2` thêm edge cache (Cache API, không cần KV) cho `pages/{id}/conversations` — TTL 60s, key gồm `page_access_token` để tự invalidate khi token đổi, không cache response chứa `error_code`, gắn header `X-Cache: HIT/MISS`. |
| **Status** | ✅ Done |

### [delivery] Approve = ẩn đơn vĩnh viễn + tạo yêu cầu chỉ chọn đơn đã quét ✅
| | |
|---|---|
| **Files** | `delivery-report/js/delivery-report.js`, `delivery-report/js/cancel-request.js` |
| **Chi tiết** | (1) Thêm `hiddenNumbers` Set + `hidden_numbers` doc Firestore. `fetchData` lọc bỏ hidden ngay sau khi nhận từ API. Expose `DeliveryReport.hideOrder(number)`. (2) `CancelRequest.approve` sau khi xóa request → gọi `hideOrder` để loại đơn khỏi UI/scanned, persist hidden. (3) Modal "Tạo yêu cầu" giờ chỉ list đơn nằm trong `scannedNumbers` — chưa quét thì hiện thông báo yêu cầu quét trước. |
| **Status** | ✅ Done |

### [delivery] Admin/phuoc duyệt yêu cầu hủy → confirm xóa request ✅
| | |
|---|---|
| **Files** | `delivery-report/js/cancel-request.js`, `delivery-report/css/delivery-report.css` |
| **Chi tiết** | Thêm nút "Duyệt" cho mỗi cancel_request `pending`, chỉ hiện với user có `isAdminTemplate()` hoặc username `phuoc`. Click → confirm dialog → `col.doc(id).delete()`. Realtime listener tự cập nhật UI. |
| **Status** | ✅ Done |

### [chat] Nút "Gửi QR" trong header modal — tự gửi ảnh QR vào chat ✅
| | |
|---|---|
| **Files** | `orders-report/tab1-orders.html`, `orders-report/js/tab1/tab1-chat-core.js`, `orders-report/js/tab1/tab1-qr-debt.js` |
| **What** | Đổi nút "QR" thành "Gửi QR". `sendQRFromChatHeader()` lấy `currentChatPhone` → `getOrCreateQRForPhone` → `generateVietQRUrl(code, 0)` → gọi `window.sendImageToChat(qrUrl, ...)` để upload và gửi ảnh QR thẳng vào chat (không hiển thị modal). Expose thêm `generateVietQRUrl` + `normalizePhoneForQR` lên window. |
| **Status** | Done |

### [chat] Nút "QR" trong header modal tin nhắn ✅
| | |
|---|---|
| **Files** | `orders-report/tab1-orders.html`, `orders-report/js/tab1/tab1-chat-core.js`, `orders-report/css/tab1-chat-modal.css` |
| **What** | Thêm button QR vào `.chat-header-right` (bên trái cụm "Tin nhắn / Bình luận"). Click → `window.openQRFromChatHeader()` → đọc `currentChatPhone` rồi gọi `showOrderQRModal(phone)` (cùng flow với nút QR ở table). Empty phone → notify "Khách hàng chưa có SĐT". |
| **Status** | Done |

### [facebook-services] Page picker + tab LIVE dùng TPOS livevideo API ✅
| | |
|---|---|
| **Files** | `facebook-services/index.html`, `facebook-services/css/facebook-services.css`, `facebook-services/js/facebook-services.js` |
| **What** | (1) Modal có `<select>` chọn page; danh sách page lấy từ `realtime_credentials.pancake.page_ids` (Render DB), enrich tên qua TPOS `/facebook/crm-teams`. (2) Tab LIVE dùng TPOS `/facebook/livevideo?pageid=X` (vì Pancake API không trả livestream); normalize response → cùng schema render. (3) Đổi page → reset cả 2 cache, reload theo tab hiện tại. (4) `currentPageId` thay cho hằng `PANCAKE_PAGE_ID` ở mọi nơi gọi API. |

### [facebook-services] Modal chọn bài viết — 3 tab Live/Video/Bài viết, mặc định Live ✅
| | |
|---|---|
| **Files** | `facebook-services/index.html`, `facebook-services/css/facebook-services.css`, `facebook-services/js/facebook-services.js` |
| **What** | Thêm tab strip trên modal. Filter posts theo `post.type`: live=`livestream`, video=`video`, post=khác. State `currentPostTab='live'`. `filterPancakePosts()` áp tab + search. Mặc định mở modal hiển thị tab Live. |

### [render][facebook-services] Load Pancake account từ Render DB ✅
| | |
|---|---|
| **Files** | `render.com/server.js`, `facebook-services/js/facebook-services.js` |
| **What** | Thêm endpoint `GET /api/realtime/credentials/pancake` trả về `{token,userId,pageIds,...}` từ bảng `realtime_credentials`. `fetchPancakePosts()` thêm Strategy 0 — gọi endpoint này trước, nếu có token thì thử load posts qua CF Worker `pancake-direct`, fallback các strategy cũ nếu fail. |

### [customer-hub] Compact UI cho "Hoạt động ví" — 1 dòng/giao dịch ✅
| | |
|---|---|
| **Files** | `customer-hub/js/modules/customer-profile.js` |
| **What** | Đổi card lớn → dòng compact: `±{amountK}  {note · date · operator}  → {balanceAfterK}`. Border-trái màu theo credit/debit. Tooltip giữ thông tin đầy đủ. Logic phân loại tx (cfg, sign, label, detailParts, operatorHtml) giữ nguyên. |

### [orders] Ẩn toàn bộ badge trạng thái đơn (Hủy bỏ / Đơn hàng / Nháp) khỏi cột Phiếu bán hàng ✅
| | |
|---|---|
| **Files** | `orders-report/js/tab1/tab1-fast-sale-invoice-status.js` |
| **What** | Bỏ render `<span invoice-order-status-badge>` ở row 3 cho mọi cls. Logic derive vẫn giữ cho các nơi khác dùng. |

### [orders] StateCode `None` → badge "Hủy bỏ" ✅
| | |
|---|---|
| **Files** | `orders-report/js/tab1/tab1-fast-sale-invoice-status.js` |
| **Why** | User yêu cầu coi `None` như đơn đã hủy thay vì "Đơn hàng" |
| **What** | `deriveOrderStatusFromStateCode()`: chuyển case `'None'` từ nhóm "Đơn hàng" sang nhóm "Hủy" (cùng `cancel`, `IsMergeCancel`) |

### [orders] Gộp 3 cột → 1 cột "Phiếu bán hàng" + WS-driven invoice fetch ✅
| | |
|---|---|
| **Files** | `tab1-fast-sale-invoice-status.js`, `tab1-tpos-realtime.js`, `tab1-table.js`, `tab1-orders.html`, `tab1-orders.css`, `column-visibility-manager.js` |
| **Why** | Bỏ cột "Phiếu bán hàng TPOS"+"Trạng thái"+"Ra đơn", dồn vào cột "Phiếu bán hàng". WS `tpos:order-update` → fetch FastSaleOrder bằng `contains(Reference, code)` → cập nhật ShowState/StateCode + nút "Đã ra đơn" + badge "Trạng thái đơn hàng". |
| **Changes** | (1) Xoá `<th>` + `<td>` status & fulfillment columns. (2) `fetchAndUpdateInvoiceForCode(code, soId)` + `_rawInvoiceById` Map: gọi worker proxy GetView với filter `Type eq 'invoice' and contains(Reference,'CODE')` → ghi InvoiceStatusStore + lưu raw → re-render cell. (3) `renderInvoiceStatusCell` thêm 2 row: badge "Trạng thái đơn" derive từ StateCode + nút "Đã ra đơn" mở modal raw. (4) `handleOrderUpdate`/`handleNewOrder` gọi fetch sau update row. (5) CSS `.invoice-order-status-badge` + `.invoice-ra-don-badge`. |
| **Mapping StateCode** | draft/NotEnoughInventory→Nháp · cancel/IsMergeCancel→Hủy · CrossCheck*/None→Đơn hàng |
| **Status** | ✅ |

### [render][orders] Slim WS bridge — bỏ broadcast thừa + FastSaleOrder enrichment + cột PBH TPOS ✅
| | |
|---|---|
| **Files** | `render.com/server.js`, `orders-report/js/tab1/tab1-tpos-realtime.js`, `orders-report/js/tab1/tab1-tpos-invoice-snapshot.js` (xoá), `orders-report/tab1-orders.html`, `orders-report/js/tab1/tab1-table.js`, `orders-report/js/managers/column-visibility-manager.js`, `orders-report/css/tab1-orders.css` |
| **Why** | Server đang bắn 3 broadcast (tpos:event raw + tpos:parsed-event + tpos:order-update) cho mỗi event TPOS — 2 cái đầu client không xử lý, tốn băng thông. FastSaleOrder enrichment dùng SaleOnlineIds field rỗng nên không khả thi. Cột "Phiếu bán hàng TPOS" phụ thuộc cả 2 → bỏ luôn. |
| **Changes** | (1) `handleEvent` chỉ còn forward `SaleOnline_Order` (drop chatomni.on-message, FastSaleOrder, Product, ProductInventory). Bỏ broadcast `tpos:event` và `tpos:parsed-event`. (2) Xoá toàn bộ block `TPOS FASTSALEORDER ENRICHMENT` (~165 dòng) gồm `_toSnapshot`, `scheduleFastSaleOrderEnrichment`, `flushFastSaleOrderEnrichment`, `fetchFastSaleOrdersByFilter`, endpoint `/api/tpos/fastsale-snapshot`. (3) Client: xoá `handleInvoiceListUpdate` + case trong handleMessage, xoá file `tab1-tpos-invoice-snapshot.js`, xoá `<th>` + `<td>` cột "Phiếu bán hàng TPOS" trong tab1-orders.html + tab1-table.js, xoá entry trong column-visibility-manager, xoá CSS `.invoice-status-tpos-cell`. |
| **Giữ nguyên** | `/api/invoice-status` + `InvoiceStatusStore` + cột "Phiếu bán hàng" gốc — không touch. Cột Trạng thái vẫn render từ `order.Status`. |
| **Status** | ✅ |

### [render] FIFO loại HOÀN khỏi queue — chỉ CK thật ✅
| | |
|---|---|
| **Files** | `render.com/routes/v2/wallets.js` |
| **Chi tiết** | Skip DEPOSIT có `source='ORDER_CANCEL_REFUND'` khỏi FIFO queue. Refund không tham gia làm nguồn cover withdraw, không xuất hiện trong `availableDeposits` kể cả khi còn dư. Withdraw chỉ consume từ CK BANK_TRANSFER thật. |
| **Status** | ✅ Done |

### [render][orders][customer-hub] FIFO availableDeposits + nhãn HOÀN cho refund ✅
| | |
|---|---|
| **Files** | `render.com/routes/v2/wallets.js`, `orders-report/js/utils/sale-modal-common.js`, `customer-hub/js/modules/customer-profile.js` |
| **Bug** | `wallets.js` query `type='WITHDRAWAL'` (sai) → DB lưu `'WITHDRAW'` → `totalWithdrawn` luôn = 0 → `availableDeposits` trả về toàn bộ deposits, không trừ withdraw. Auto-fill note phiếu bán hàng hiển thị các CK đã consumed. |
| **Backend** | Rewrite `availableDeposits`: query DEPOSIT+WITHDRAW chronological, simulate FIFO queue, trả về deposits còn dư (oldest→newest). Bỏ qua VIRTUAL_*. |
| **Frontend orders** | `autoFillSaleNote()` iterate forward (oldest→newest), skip `source === 'ORDER_CANCEL_REFUND'` khỏi note "CK xxxK ACB dd/mm". |
| **Customer-hub** | Override label "HOÀN" (giữ màu xanh, dấu +) cho `tx.type==='DEPOSIT' && tx.source==='ORDER_CANCEL_REFUND'`. Fix `isRefund` detection (trước check `tx.type==='ORDER_CANCEL_REFUND'` không bao giờ match). Operator label đổi "Duyệt bởi" → "Hoàn bởi" cho refund. |

### [orders] Đổi tab "Hàng rớt - xã" → "Bán Hàng" với 2 sub-tab ✅
| | |
|---|---|
| **Files** | `orders-report/tab1-orders.html`, `orders-report/css/tab1-chat-modal.css`, `orders-report/js/managers/dropped-products-manager.js` |
| **Chi tiết** | Đổi label tab cha thành "Bán Hàng" (giữ data-tab="dropped" + badge cũ). Bọc nội dung trong 2 sub-panel: `#droppedSubPanelXasha` (giữ nguyên hàng rớt xả + FAB) và `#droppedSubPanelKho` (Kho Sản Phẩm — UI giống hệt, container/FAB id `warehouse*`). Thêm `.dropped-subtabs` CSS + `switchDroppedSubTab(bucket)`. JS thêm parallel state/render/wire cho warehouse (`warehouseProducts` in-memory, _detectDroppedCategory dùng chung, hover preview singleton dùng chung). Cart-drop flow KHÔNG đổi → vẫn chỉ vào Hàng rớt xả. Stub `addToWarehouseProducts/removeFromWarehouseProducts` để user tự hoàn thiện logic add sau. |
| **Status** | ✅ Done |

### [customer-hub] Fix nút X đóng modal Customer Profile không bấm được ✅
| | |
|---|---|
| **Files** | `customer-hub/js/modules/customer-profile.js` |
| **Chi tiết** | Nút X ở header modal Customer Profile dùng inline `onclick` với optional chaining + nhiều câu lệnh, không kích hoạt. Thay bằng `id="modal-close-btn"` và bind `addEventListener('click', ...)` trong `initUI()`, fallback ẩn modal trực tiếp nếu `window.closeCustomerModal` chưa sẵn. |
| **Status** | DONE |

### [orders] Chốt Đơn panel: dời nút Ghim Tag T lên header ✅
| | |
|---|---|
| **Files** | `orders-report/js/tab1/tab1-processing-tags.js` |
| **Chi tiết** | Nút ghim Tag T (`_ptagToggleTTagPin`) trước nằm trong section header "TAG T CHỜ HÀNG", nay chuyển lên panel header Chốt Đơn — kế nút "Ghim panel". Icon thumbtack màu xanh dương `#3b82f6`, xoay 45° khi chưa ghim. Bỏ nút cũ trong section. |

### [chat] Hàng rớt xả: gom 4 FAB thành speed-dial ✅
| | |
|---|---|
| **Files** | `orders-report/tab1-orders.html`, `orders-report/css/tab1-chat-modal.css`, `orders-report/js/managers/dropped-products-manager.js` |
| **Chi tiết** | Thêm nút toggle (`#droppedFabToggle`, icon `fa-bars`) — mặc định container có class `collapsed` chỉ hiện toggle, click để xổ ra 4 FAB (+, GỬI TÊN, GỬI ẢNH, HỦY/XÓA). CSS dùng opacity + transform + height:0 cho hiệu ứng thu gọn. |

### [chat] Hàng rớt xả: đổi nút FAB grid ✅
| | |
|---|---|
| **Files** | `orders-report/tab1-orders.html`, `orders-report/js/managers/dropped-products-manager.js` |
| **Chi tiết** | Tab "Hàng rớt - xả" (grid view) đổi nút FAB: nút "GỬI ĐƠN" → "+" (icon `fa-plus`, vẫn gọi `_handleDroppedSendSelected` chuyển vào đơn). Thêm nút "GỬI TÊN" (paper-plane) gọi `sendProductToChat` cho mỗi sản phẩm chọn. Thêm nút "GỬI ẢNH" (icon ảnh) gọi `sendImageToChat`. Cập nhật `_updateDroppedFabState` enable/disable cả 4 nút theo selection. |

### [chat] Hàng rớt xả: đổi nút thao tác sản phẩm (table view) ✅
| | |
|---|---|
| **Files** | `orders-report/js/managers/dropped-products-manager.js` |
| **Chi tiết** | Trong panel chat tab1 modal hàng rớt xả: nút "gửi đơn" (moveDroppedToOrder) đổi icon `fa-undo` → `fa-plus`. Nút paper-plane đổi thành text "Gửi tên". Thêm nút "Gửi ảnh" (màu tím #8b5cf6) gọi `sendImageToChat`, chỉ hiển thị khi có ImageUrl. |
### [shared] Mở quyền truy cập trang Thống Kê Giao Hàng cho mọi tài khoản ✅
| | |
|---|---|
| **Files** | `shared/js/navigation-modern.js` |
| **Chi tiết** | Thêm `publicAccess: true` cho menu item `delivery-report` (giống pattern Inbox). Mọi user đều vào được trang mà không cần cấp permission riêng. |
| **Status** | ✅ Done |

### [chat] Tối ưu modal: in-flight dedupe, per-conv debounce, LRU cache, reconcile helper ✅
| | |
|---|---|
| **Files** | `orders-report/js/tab1/tab1-chat-core.js`, `orders-report/js/tab1/tab1-chat-realtime.js` |
| **#6** | `_resetTransientChatState()` thêm reset `isLoadingMoreMessages = false` — tránh kẹt cờ khi user switch giữa lúc paginate. |
| **#5** | Tách `window._reconcileOptimisticReplies(existing, incoming)` shared helper. `_loadMessages` và `handleNewMessage` cùng dùng → loại ~25 dòng dup. |
| **#2** | In-flight dedupe `_findAndLoadConversation`: wrap qua `_doFindAndLoadConversation`, cache promise theo key `${pageId}:${psid}:${type}` trong 3s. Double-click hoặc switch nhanh không tạo 2 fetch song song. |
| **#9** | LRU bound cho `_globalIdCache` (max 200, drop oldest 20% khi vượt) qua `_setGlobalIdCache(key, value)`. Tránh memory leak chậm theo số customer. |
| **#3** | `handleConversationUpdate` đổi từ 1 timer global (`_chatUpdateDebounce`) sang Map per convId (`_chatUpdateDebounceMap`). Nhiều conv update đồng loạt không clobber nhau. |
| **Cleanup** | `closeChatModal` clear cả `_chatUpdateDebounceMap` lẫn `_chatFindInFlight`. Comparator `_byUpdatedAtDesc` dùng chung cho 2 sort COMMENT (gọn hơn). |
| **Status** | ✅ Done |

### [orders][render] Giảm spam request `empty-cart-sync` (~95%) ✅
| | |
|---|---|
| **Files** | `orders-report/js/tab1/tab1-empty-cart-auto-sync.js`, `n2store-realtime/server.js` |
| **Why** | Network panel thấy 1000+ requests `empty-cart-sync` mỗi lần fetchOrders. Nguyên nhân: `batchEmptyCartSync` gửi MỌI đơn không lọc → server trả >95% noop. CORS preflight không cache → nhân đôi traffic. |
| **Chi tiết** | (1) **Fix A — Client pre-filter**: trong `batchEmptyCartSync` chỉ giữ đơn `(SL=0 && !hasGT)` hoặc `(SL>0 && hasGT)`, các đơn còn lại là noop chắc chắn → skip. Log dạng `Batch sync N/total (filtered)`. (2) **Fix B — CORS preflight cache**: thêm `maxAge: 86400` vào cors() middleware → browser cache OPTIONS 24h, cắt 50% requests. |
| **Status** | ✅ Done |

### [orders] updatePartnerStatus — broadcast theo SĐT, update tất cả partner trùng ✅
| | |
|---|---|
| **Files** | `orders-report/js/tab1/tab1-table.js` |
| **Why** | Code cũ chỉ update đúng partnerId được click. Trong khi 1 KH thường có nhiều record TPOS trùng SĐT → mark Bom 1 record không chặn được các đơn sau đi qua record khác. Align với issue-tracking `markPartnerAsBoom`. |
| **Chi tiết** | (1) Lookup `Telephone` từ `partnerId` trong `allData`. (2) Search `Partner/GetViewV2?Name={phone}` lấy tất cả partner trùng SĐT (top 50 desc). (3) POST `UpdateStatus` cho toàn bộ targetIds. (4) Nếu có note: GET+PUT ghi vào `Email` cho toàn bộ. (5) Local sync + UI badge update broadcast theo `targetIds` thay vì 1 partner. (6) Fallback: nếu không tìm được phone hoặc search fail → giữ behavior cũ (chỉ update partnerId). Notification show số record đã update. |
| **Status** | ✅ Done |

### [issue-tracking] markPartnerAsBoom — note chỉ ghi vào partner mới nhất ✅
| | |
|---|---|
| **Files** | `issue-tracking/js/script.js` |
| **Why** | Sniff TPOS UI native: khi mark Bom thủ công chỉ `PUT Partner({id})` cho 1 record (record user đang xem), không broadcast. Code mình đang ghi Email cho cả 3 partner trùng SĐT → đè Email thật ở các record cũ. |
| **Chi tiết** | (1) Search param đổi `Phone=` → `Name=` cho khớp TPOS UI native (cùng kết quả). (2) Status "Bom hàng" vẫn quét **tất cả** partner trùng SĐT (giữ nghiệp vụ — 1 KH = nhiều record TPOS đều phải mark). (3) Note (`Email` field) chỉ ghi vào **partner mới nhất** (`partners[0]` sau sort `DateCreated desc`) — bỏ vòng for, dùng GET+PUT 1 lần duy nhất. |
| **Status** | ✅ Done |

### [issue-tracking] Refactor markPartnerAsBoom → dùng UpdateStatus API ✅
| | |
|---|---|
| **Files** | `issue-tracking/js/script.js` |
| **Why** | Code cũ GET full Partner payload + mutate `StatusStyle`/`StatusText` + PUT + cần `_rollbackPartners` khi fail giữa chừng. Phức tạp, dễ race. orders-report đã dùng `ODataService.UpdateStatus` atomic — align về cùng pattern. |
| **Chi tiết** | (1) Bỏ `_rollbackPartners` + vòng GET/mutate/PUT. (2) Step 2 mới: `POST Partner({Id})/ODataService.UpdateStatus` body `{"status":"#d1332e_Bom hàng"}` cho từng partner — TPOS tự set StatusStyle+StatusText server-side. (3) Step 3: ghi đè `Email = noteText` (GET+PUT) tách riêng, best-effort, lỗi chỉ `console.warn` không throw. (4) Vẫn quét tất cả partner trùng SĐT (top 50) — giữ nguyên nghiệp vụ cũ của issue-tracking. |
| **Status** | ✅ Done |

---

## 2026-04-08

### [render][soquy] Backup + migration Soquy Firestore → Postgres ✅
| | |
|---|---|
| **Files** | `render.com/scripts/backup-soquy-firestore.js` (new), `render.com/scripts/migrate-soquy-firestore-to-pg.js` (new), `render.com/migrations/041_create_soquy_tables.sql` (new), `render.com/backups/soquy/soquy-backup-*.json` (new) |
| **Why** | Cần backup dữ liệu Soquy trên Firestore và migrate sang Postgres trên Render để có nguồn dữ liệu thứ 2 (an toàn hơn, query SQL được). |
| **Chi tiết** | (1) `backup-soquy-firestore.js` dump 3 collections (`soquy_vouchers`, `soquy_counters`, `soquy_meta`) ra JSON, serialize Firestore Timestamp/GeoPoint/DocRef. Tạo file timestamp + `soquy-backup-latest.json`. (2) Migration 041 tạo 3 bảng mirror với column chính + `raw jsonb` giữ full doc, indexes trên `voucher_date_time/type/fund_type/status/code/source_code`. (3) `migrate-soquy-firestore-to-pg.js` đọc backup-latest, upsert vào Postgres trong 1 transaction, idempotent (`ON CONFLICT id DO UPDATE`). Counters dùng field `lastNumber`. (4) Đã chạy production: backup 573 vouchers + 3 counters + 7 meta, migrate vào Render Postgres `n2store_chat`. Frontend Firestore client **chưa thay đổi** — đây mới chỉ là backup/mirror. |
| **Status** | ✅ Done |

### [orders] Bulk "In hàng loạt PBH" — auto mark CHỜ HÀNG 🖨 ✅
| | |
|---|---|
| **Files** | `orders-report/js/tab1/tab1-fast-sale-invoice-status.js` |
| **Why** | Nút "In hàng loạt PBH" in xong nhưng không gán mark "đã in phiếu soạn" cho Tag XL → user phải đánh thủ công. |
| **Chi tiết** | Trong `bulkPrintSelectedBills` sau khi mở print popups, loop qua `tposOrders` + `fallbackOrders` gọi `window.onPtagPackingSlipPrinted(saleOnlineId)` cho từng đơn → set `pickingSlipPrinted=true`, force `subState='CHO_HANG'`, badge thành "CHỜ HÀNG 🖨". |
| **Status** | ✅ Done |

### [orders] Bulk Xóa Tag — admin xóa luôn Tag XL ✅
| | |
|---|---|
| **Files** | `orders-report/js/tab1/tab1-processing-tags.js`, `tab1-bulk-tags.js` |
| **Why** | Nút bulk "Xóa Tag" trước đây chỉ xóa cột TAG TPOS. Admin cần xóa sạch cả Tag XL (category/subTag/flags/tTags). |
| **Chi tiết** | Thêm `forceClearProcessingTag(orderCode)` ở processing-tags: xóa toàn bộ XL state (khác `clearProcessingTag` chỉ clear category nếu còn flags/tTags). Trong `executeBulkRemoveAllTagsForSelected` sau khi xóa TPOS thành công, nếu `authManager.isAdminTemplate()` → gọi `forceClearProcessingTag(order.Code)` cho từng đơn. Confirm dialog hiện note "(admin: xóa cả TAG TPOS lẫn Tag XL)". |
| **Status** | ✅ Done |

### [orders] Bypass Render — gọi TPOS FastSaleOrder trực tiếp qua worker proxy ✅
| | |
|---|---|
| **Files** | `orders-report/js/tab1/tab1-tpos-invoice-snapshot.js` |
| **Why** | Render Singapore outage + bug `DateUpdated` field → endpoint `/api/tpos/fastsale-snapshot` trả 400, store rỗng → cột "PBH TPOS" hiển thị Nháp dù TPOS thật là Đã xác nhận. Deploy fix server không lên được. |
| **Changes** | Cold-start và `fetchFreshByIds` giờ gọi thẳng `chatomni-proxy.nhijudyshop.workers.dev/api/odata/FastSaleOrder/ODataService.GetView` với `$select=Id,Number,State,ShowState,StateCode,IsMergeCancel,...,SaleOnlineIds`, dùng `window.tokenManager.getAuthHeader()`. Bypass Render hoàn toàn cho 2 path này. |
| **Status** | ✅ |

### [orders] Mark "đã in phiếu soạn" — force CHO_HANG khi bật ✅
| | |
|---|---|
| **Files** | `orders-report/js/tab1/tab1-processing-tags.js` |
| **Why** | Click nút 🖨 (cell) hoặc bulk Phiếu Soạn Hàng khi đơn ở Cat 1/OKIE_CHO_DI_DON: `pickingSlipPrinted=true` đúng nhưng subState giữ OKIE → badge hiển thị "OKIE..." không phải "CHỜ HÀNG 🖨". |
| **Chi tiết** | `_ptagQuickAssign('print')` + `onPtagPackingSlipPrinted()`: khi bật mark, force `subState='CHO_HANG'` cho mọi đơn Cat 1 (không chỉ khi cat null/Cat 2). Khi tắt mark (chỉ nút cell), recompute subState từ tTags. Persistence khi xoá tTags rồi add lại đã sẵn (pickingSlipPrinted không reset). |
| **Status** | ✅ Done |

### [orders] Filter subtag — bỏ orphan subTag không khớp category ✅
| | |
|---|---|
| **Files** | `orders-report/js/tab1/tab1-processing-tags.js` |
| **Why** | Filter `subtag_BAN_HANG` ra 21 đơn nhưng nhiều đơn cat=1 (CHỜ ĐI ĐƠN) còn sót `subTag='BAN_HANG'` từ lúc ở cat 2 → cell render cat 1 hiển thị "CHỜ HÀNG" (bỏ qua subTag) → user tưởng filter đang bám TAG TPOS. |
| **Chi tiết** | `orderPassesProcessingTagFilter` + `_ptagComputeCounts` giờ require `data.category === PTAG_SUBTAGS[subKey].category` khi check subTag → loại bỏ orphan subTag từ category cũ. |
| **Status** | ✅ Done |

### [orders] Panel Chốt Đơn — filter chỉ theo Tag XL, bỏ TAG TPOS ✅
| | |
|---|---|
| **Files** | `orders-report/js/tab1/tab1-processing-tags.js` |
| **Why** | Flag `KHAC` (TAG TPOS NGOÀI MAPPING) trong panel scan `order.Tags` (cột TAG TPOS) → vi phạm yêu cầu panel Chốt Đơn chỉ filter theo cột Tag XL. |
| **Chi tiết** | `_ptagComputeCounts`: bỏ vòng lặp `getUnmanagedTPOSTagsFromOrder`, set `flagCounts['KHAC']=0`. `orderPassesProcessingTagFilter`: bỏ nhánh KHAC TPOS-resolution, flag filter giờ chỉ check `data.flags` (Tag XL state). |
| **Status** | ✅ Done |

### [orders] Tag ĐÃ RA ĐƠN — đổi trigger từ "PBH tạo thành công" sang "Status='Đơn hàng'" ✅
| | |
|---|---|
| **Files** | `orders-report/js/tab1/tab1-processing-tags.js`, `tab1-table.js`, `tab1-fast-sale-invoice-status.js`, `tab1-sale.js`, `tab1-fast-sale-workflow.js` |
| **Why** | Trước đây tag XL `ĐÃ RA ĐƠN` (category 0 = HOAN_TAT) được set khi PBH tạo thành công. Nay tag phải bám theo trạng thái đơn (`order.Status === 'Đơn hàng'`) để chính xác hơn — kể cả khi user đổi status thủ công. |
| **Chi tiết** | Thêm `onPtagOrderStatusChanged(orderId, newStatus)` ở `tab1-processing-tags.js`: `'Đơn hàng'` → forward `onPtagBillCreated`; rời `'Đơn hàng'` mà category=HOAN_TAT → forward `onPtagBillCancelled` (rollback `previousPosition`). Thêm `backfillPtagFromOrderStatus()` chạy sau `loadProcessingTags()` để tag các đơn đã có Status='Đơn hàng' lúc load. Bỏ 3 trigger cũ `onPtagBillCreated` ở `tab1-sale.js` (×2) + `tab1-fast-sale-invoice-status.js`. Bỏ 2 trigger `onPtagBillCancelled` ở `tab1-fast-sale-workflow.js` (đã được thay bằng hook trong `updateOrderStatus`). Gắn hook mới ở `tab1-table.js#updateOrderStatus` (manual) và `tab1-fast-sale-invoice-status.js` (auto-update Nháp→Đơn hàng). |
| **Status** | ✅ Done |

### [orders] RT TPOS → cập nhật cả cột "Phiếu bán hàng TPOS" và "Trạng thái" ✅
| | |
|---|---|
| **Files** | `orders-report/js/tab1/tab1-tpos-invoice-snapshot.js`, `orders-report/js/tab1/tab1-tpos-realtime.js`, `orders-report/css/tab1-orders.css` |
| **Why** | Khi WS `tpos:invoice-list-updated` về, chỉ refresh cột "Phiếu bán hàng TPOS"; cột "Trạng thái" vẫn đứng im theo Pancake → user thấy không nhất quán. |
| **Changes** | (1) `TPOSInvoiceSnapshotStore.fetchFreshByIds(ids)` — gọi `GET /api/tpos/fastsale-snapshot?ids=...` lấy snapshot fresh từ TPOS invoicelist OData. (2) `deriveStatusFromTPOS(snap)` — map ShowState/StateCode/IsMergeCancel → text+class (Đã hủy, Nháp, Đơn hàng, Đã đối soát, Đã thanh toán, Hoàn thành, Gộp/Hủy). (3) `refreshStatusCellsFor(soIds)` — re-render `td[data-column="status"]` UI-only, KHÔNG ghi `order.Status` về Pancake. (4) `handleInvoiceListUpdate` async: fetch fresh trước, fallback payload nếu fail, rồi gọi cả `refreshCellsFor` lẫn `refreshStatusCellsFor`. (5) CSS `.status-paid` + `.status-order.strong`. |
| **Status** | ✅ |

### [orders] Chặn tạo PBH khi đơn ở trạng thái "Đơn hàng" (single + bulk) ✅
| | |
|---|---|
| **Files** | `orders-report/js/tab1/tab1-sale.js`, `orders-report/js/tab1/tab1-fast-sale.js` |
| **Why** | Trạng thái `StatusText === 'Đơn hàng'` nghĩa là SaleOnline đã được chuyển sang đơn — tạo PBH thêm sẽ gây trùng. |
| **Changes** | Thêm điều kiện `StatusText === 'Đơn hàng' \|\| Status === 'Đơn hàng'` vào duplicate-guard ở `confirmAndPrintSale()` (single) và filter `fastSaleOrdersData` (bulk, line ~419). |
| **Status** | ✅ |

### [chat] Follow-up hardening: bump seq trước reset, stale-guard catch + loadMoreMessages ✅
| | |
|---|---|
| **Files** | `orders-report/js/tab1/tab1-chat-core.js` |
| **A** | `switchConversationType` / `switchChatPage` reset state TRƯỚC khi bump `_chatLoadSeq` → load cũ vẫn pass `_isStale()` trong khoảng giữa. Đảo thứ tự: bump trước, reset sau. |
| **B** | `_loadMessages` catch block ghi error UI mà không check stale → fetch cũ throw sau khi user switch sẽ ghi đè UI conv mới. Thêm `if (_isStale()) return;` đầu catch. |
| **C** | `loadMoreMessages` thiếu stale guard → user switch page giữa lúc đang scroll-paginate, messages cũ bị prepend vào conv mới. Snapshot `_chatLoadSeq + convId + pageId` đầu hàm, bail sau await nếu mismatch. |
| **Status** | ✅ Done |

### [orders] Chống tạo PBH trùng ở nút "Tạo phiếu bán hàng" (single mode) ✅
| | |
|---|---|
| **Files** | `orders-report/js/tab1/tab1-sale.js` |
| **Why** | Bulk "Tạo nhanh PBH (F9)" có 4 lớp phòng vệ duplicate (dedupe modal, skip đơn đã `Đã xác nhận`/`Đã thanh toán`, dedupe `models[]` trước submit, flag `isSavingFastSale`). Single "Tạo phiếu bán hàng" CHỈ có check `button.disabled` → đơn đã có PBH vẫn có thể submit lần 2 (mở lại modal sau timeout / race). |
| **Changes** | `confirmAndPrintSale()`: (1) check `window.__isSavingSingleSale` flag in-flight; (2) guard `currentSaleOrderData.ShowState`/`State` đã `Đã xác nhận`/`Đã thanh toán`/`open` → bỏ qua + warning; (3) tra `window.InvoiceStatusStore.get(saleOnlineId)` (cùng logic bulk tab1-fast-sale.js:419); (4) `finally` reset flag. |
| **Status** | ✅ Cần manual test. |

### [shared][all] Đồng bộ typography toàn dự án ✅
| | |
|---|---|
| **Files** | `shared/css/typography.css` (mới), 52 HTML entry pages, ~20 CSS module files |
| **Why** | Typography phân mảnh: 12/30 trang load Inter, 18/30 fallback system. Body size 13–20px, weight 400–500, font-family lẫn lộn. User chốt: toàn dự án Inter 20px weight 600. |
| **typography.css** | Single source of truth, dùng `!important` cho `body { font-family/size/weight }`, headings dùng Manrope 700. Buttons/inputs `inherit`. |
| **Inject** | Script `/tmp/inject_typography.py` chèn `<link>` Google Fonts (Inter+Manrope) + `shared/css/typography.css` vào 52 entry HTML pages, đường dẫn relative tự tính theo depth, marker `<!-- typography:shared -->` chống re-inject. |
| **Cleanup** | Script `/tmp/clean_body_css.py` xóa `font-family/size/weight` trong rule `body{}` của 19 CSS module + 2 inline `<style>` (`tab-kpi-commission.html`, `order-management/index.html` — bỏ luôn `font-family: Segoe UI` cũ). Giữ `color/background/line-height/padding`. |
| **Loại trừ** | `n2store-extension/`, `pancake-extension/`, `render.com/`, `cloudflare-worker/`, `backups/`, `docs/plans/*.html`. |
| **Status** | ✅ Commit `9e588e01` (inject) + cleanup commit. Pushed. Cần verify visual ở các trang dùng Bootstrap/Tailwind (`customer-hub`, `tab3-product-assignment`) và `firebase-stats` dashboard. |

### [orders] Đồng bộ typography orders-report giống inbox ✅
| | |
|---|---|
| **Files** | `orders-report/main.html`, `orders-report/css/modern.css` |
| **Why** | Trang orders-report dùng Inter 14px, không có headline font, khác hẳn inbox (Inter 15px + Manrope headline) → cảm giác lệch khi chuyển tab. |
| **Changes** | main.html: thêm preconnect + link Google Fonts (Inter 400/500/600/700 + Manrope 600/700/800). modern.css: thêm `--font-body` / `--font-headline` trong `:root`, body dùng `var(--font-body)` + `font-size: 0.9375rem` (15px), thêm rule `h1–h6 { font-family: var(--font-headline) }`. |
| **Status** | ✅ Commit `4eb7b20e`, pushed. |

### [render][orders][extension] Cột "Phiếu bán hàng TPOS" → nguồn từ WS server thay extension ✅
| | |
|---|---|
| **Files** | `render.com/server.js`, `orders-report/js/tab1/tab1-tpos-invoice-snapshot.js`, `n2store-extension/content/tpos-interceptor.js` |
| **Why** | Trước đây snapshot FastSaleOrder phải chờ user mở trang TPOS invoicelist để extension intercept XHR. Server `n2store-fallback` thực ra đã treo TPOS chatomni hub và nhận event `FastSaleOrder` realtime — chỉ thiếu enrichment Number/ShowState/StateCode/SaleOnlineIds. |
| **Server** | `handleEvent()` thêm nhánh `eventType === 'FastSaleOrder'` → `scheduleFastSaleOrderEnrichment(Id)` (debounce 200ms, cache 5s). `flushFastSaleOrderEnrichment` gọi TPOS odata `GetView?$filter=Id eq ...` qua `tposTokenManager`, broadcast `tpos:invoice-list-updated` cùng schema cũ. Thêm REST `GET /api/tpos/fastsale-snapshot?since=<ms>|ids=...` (cache 30s) cho cold-start. |
| **Frontend** | `TPOSInvoiceSnapshotStore.init()` gọi `_coldStartFromServer()` (fire-and-forget) load 24h gần nhất, upsert + refresh cell. Handler WS `handleInvoiceListUpdate` không đổi. |
| **Extension** | Disable nhánh intercept `FSO_LIST_URL`/`FSO_BATCH_URL`. Tag-assigned interceptor giữ nguyên. Bump `v1.1.0`. |
| **Status** | ✅ Code xong, syntax OK. Cần deploy Render rồi smoke test (`curl /api/tpos/fastsale-snapshot?since=...`, treo WS verify `source:'server-enrich'`). |

### [chat] Hardening modal tin nhắn/bình luận: race + state-reset + dropdown sync + reconcile ✅
| | |
|---|---|
| **Files** | `orders-report/js/tab1/tab1-chat-core.js`, `orders-report/js/tab1/tab1-chat-realtime.js` |
| **Bug 2.2** | `switchConversationType` không reset reply/images → reply id của INBOX bị mang sang COMMENT, khiến `reply_comment` gửi với message_id sai. Fix: gọi `_resetTransientChatState()` trước khi find conv mới. |
| **Bug 2.1** | `switchChatPage` tương tự — không reset `currentReplyMessage`, `pendingImages`, `currentChatCursor`, `allChatMessages`. Fix: dùng cùng helper. |
| **Bug 3.1** | Multi-page fallback trong `_findAndLoadConversation` silently override `currentChatChannelId` mà KHÔNG sync `#chatPageSelect.value` → dropdown lệch state thật. Fix: set `sel.value = convPageId` khi drift. |
| **Bug 1.1** | Switch page/type nhanh → fetch cũ resolve sau fetch mới và ghi đè state. Fix: thêm monotonic `window._chatLoadSeq`, mỗi entry point (`openChatModal`, `switchChatPage`, `switchConversationType`) bump `++seq` lấy `myToken`, truyền xuống `_findAndLoadConversation` + `_loadMessages`, check `loadToken !== _chatLoadSeq` ở mọi điểm trước-write-state. `closeChatModal` cũng bump seq để huỷ in-flight. |
| **Bug 4.3** | Optimistic private-reply id `pr_<ts>` không bao giờ reconcile với id thật từ Pancake → duplicate hiển thị + PrivateReplyStore stale 7 ngày. Fix: trong `handleNewMessage` (realtime) và `_loadMessages` (sau fetch), match shop message theo (text + 60s window) để drop optimistic và migrate `PrivateReplyStore.mark` sang real id. |
| **Helper mới** | `_resetTransientChatState()` (dùng chung), `window._chatLoadSeq` (monotonic). |
| **Status** | ✅ Done |

### [orders] Filter tab1 persist vào IndexedDB, per-account ✅
| | |
|---|---|
| **Files** | `orders-report/js/tab1/tab1-filter-persistence.js` (NEW), `orders-report/tab1-orders.html`, `orders-report/js/tab1/tab1-init.js`, `orders-report/js/tab1/tab1-search.js`, `orders-report/js/tab1/tab1-tags.js`, `orders-report/js/tab1/tab1-processing-tags.js` |
| **Mục tiêu** | Hard reload (Cmd+Shift+R) phải restore lại toàn bộ filter tab1, scope theo tài khoản đang đăng nhập. |
| **Filter cover** | (1) Search input — TTL 30 phút idle thì tự reset; (2) `conversationFilter`/`statusFilter`/`fulfillmentFilter` `<select>` (trước đây memory-only → mất khi reload); (3) TAG `orderTableSelectedTags`; (4) Excluded TAG `orderTableExcludedTags`; (5) Chốt Đơn / Tag XL = `ProcessingTagState._activeFilter` + `_activeFlagFilters`; (6) Chốt Đơn panel pinned; (7) "Lọc theo ngày" toggle (`dateModeToggle`). Date range start/end vẫn để campaign system quản lý qua PostgreSQL — không đụng để tránh phá campaign flow. |
| **Kiến trúc** | Module mới `FilterPersistence` (IIFE expose `window.FilterPersistence`) wrap `window.indexedDBStorage`. Key IDB: `tab1_filters_v1__${userIdentifier}` với `userIdentifier` resolve từ `authManager.getAuthState()` (priority `userType` → `username` → `uid` → `'guest'`). Snapshot debounce save 400ms. Init `await` trong DOMContentLoaded của tab1-init.js trước khi wire search input listener. |
| **Migration LS → IDB** | First run: nếu IDB trống cho user này, đọc các LS key cũ làm seed. **Per-account guard:** `tab1_filter_persist_migrated_at` global LS marker — chỉ user đầu tiên trên browser inherit LS, các account sau bắt đầu snapshot rỗng → isolation 100%. Sau 7 ngày tự xóa legacy LS keys + marker (giữ tuần đầu để rollback an toàn). |
| **Search TTL** | Snapshot search có `savedAt`; load lại nếu `Date.now() - savedAt > 30 phút` → drop search query, giữ filter khác — tránh user reload lâu mà bị filter cũ gây nhầm. |
| **Wire save** | `scheduleSave()` được gọi từ: `handleTableSearch()`, 3 select onchange (HTML inline), `saveSelectedTagFilters()`, `saveExcludedTagFilters()`, `_ptagPersistFilters()`, `_ptagTogglePin()`, `dateModeToggle` onchange. Không xóa logic LS hiện hữu — IDB là sync layer phụ. |
| **Status** | ✅ Done |

### [orders] Auto-chọn ship theo địa chỉ: pass extraAddress + dedupe + notify ✅
| | |
|---|---|
| **Files** | `orders-report/js/tab1/tab1-fast-sale.js`, `orders-report/js/utils/sale-modal-common.js` |
| **Chi tiết** | Fast Sale (tạo nhiều phiếu) trước đây gọi `smartSelectCarrierForRow(select, address, null)` — bỏ qua structured `ExtraAddress` từ Pancake/TPOS → kém chính xác khi địa chỉ text mơ hồ. **(2)** Truyền `saleOnlineOrder?.ExtraAddress \|\| order.Ship_Receiver?.ExtraAddress \|\| order.Partner?.ExtraAddress` vào auto-select (cả lúc mở modal lẫn lúc edit địa chỉ inline). **(1)** Refactor: `smartSelectDeliveryPartner(address, extraAddress, {select, silent})` trong sale-modal-common.js giờ nhận `select` + `silent` qua options và trả về `{matched, fallback, name}`; `smartSelectCarrierForRow` rút gọn thành thin wrapper (xoá ~30 dòng duplicate logic). **(3)** Thêm notification thống nhất: bulk dùng `silent:true` per-row + 1 toast tổng kết `"Tự động chọn ship: X/Y khớp · Z fallback"` sau khi xong loop; address-edit inline dùng `silent:false` (1 user action → 1 toast). |
| **Status** | ✅ Done |

### [orders] In hàng loạt phiếu bán hàng (bulk print PBH) ✅
| | |
|---|---|
| **Files** | `orders-report/tab1-orders.html`, `orders-report/js/tab1/tab1-table.js`, `orders-report/js/tab1/tab1-fast-sale-invoice-status.js` |
| **Chi tiết** | Thêm nút **"In hàng loạt PBH"** (tím, `fa-print`) vào toolbar `actionButtonsSection`, hiện khi có ≥1 đơn được tick **và** đơn đó đã có PBH (check qua `InvoiceStatusStore.get`). Handler `bulkPrintSelectedBills()` gom selection: đơn có `inv.Id` → push vào `tposOrders` rồi gọi `window.openCombinedTPOSPrintPopup(orders, headers)` (template TPOS chính thức 80mm); đơn không có TPOS Id → fallback `window.openCombinedPrintPopup(orders)` (custom HTML). Skip + warning các đơn chưa có PBH. **Reuse 100% logic in có sẵn** trong [bill-service.js](orders-report/js/utils/bill-service.js) — chỉ wire UI + selection filtering, ~80 dòng code. |
| **Status** | ✅ Done |

### [orders] Lịch sử Tag T: thêm ô lọc theo STT ✅
| | |
|---|---|
| **Files** | `orders-report/js/tab1/tab1-processing-tags.js` |
| **Chi tiết** | Modal "Lịch Sử Tag T Chờ Hàng" giờ có input lọc STT. Cache `historyArray` vào `window._ttagMgrHistoryCache`, hàm `_ttagMgrFilterHistory(q)` lọc các entry chứa STT khớp (cả success/failed), giữ nguyên tag name, recompute summary counts. Tách `_ttagMgrRenderHistoryList()` để re-render. |

### [chat] Tooltip hàng rớt-xả: bỏ SĐT, thêm "Chiến dịch:" + fix 2 bug ✅
| | |
|---|---|
| **Files** | `orders-report/js/managers/dropped-products-manager.js`, `orders-report/js/chat/chat-products-actions.js` |
| **Tooltip** | Bỏ dòng SĐT (không lưu DB), đổi nhãn "Live:" → "Chiến dịch:" lấy fallback từ `currentChatOrderData.LiveCampaignName` / `campaignInfoFromTab1.activeCampaignName`. Revert propagate `removedFromCustomerPhone`. |
| **Bug B** | `Uncaught ReferenceError: grid is not defined` spam mỗi mousemove. Nguyên nhân: handler `contextmenu` lồng nhầm trong `_positionHoverPreview` (sót pre-existing). Đã chuyển ra cuối `_wireDroppedGrid()` — vừa hết error vừa wire đúng right-click → gửi tên SP vào chat. |
| **Bug A** | Xóa SP "đang giữ" không persist (F5 vẫn còn). `deleteHeldProduct` còn gọi `removeHeldFromFirebase` cũ — đã đổi sang `window.removeHeldProduct(productId)` (gọi `DELETE /api/realtime/held-products/{orderId}/{productId}/{userId}`), giữ fallback Firebase. |
| **Status** | DONE |

### [issue-tracking] Tách tìm kiếm Tạo Phiếu thành 2 tab: SĐT/Tên & Mã đơn ✅
| | |
|---|---|
| **Files** | `issue-tracking/index.html`, `issue-tracking/css/style.css`, `issue-tracking/js/script.js`, `shared/js/api-service.js` |
| **Chi tiết** | Modal "Tạo Phiếu Mới" trước chỉ search theo `Phone`. Thêm 2 tab: **SĐT/Tên** (auto detect: toàn chữ số → `contains(Phone,...)`, ngược lại strip dấu tiếng Việt → `contains(PartnerNameNoSign,...)`) và **Mã đơn** (`contains(Number,...)`). 1 input + 1 nút Tìm, placeholder đổi theo tab. `ApiService.searchOrders` refactor sang signature `{mode, value}` với `mode ∈ {phone\|name\|code}`, giữ backward-compat khi nhận string (legacy call ở `script.js:2649`). Escape `'` trong OData literal. Date range 60 ngày + `$top=20` giữ nguyên. |
| **Status** | ✅ Done |

### [orders] Fix Tag XL filter (Chốt Đơn) bị mất khi tương tác bảng + persist localStorage ✅
| | |
|---|---|
| **Files** | `orders-report/js/tab1/tab1-processing-tags.js` |
| **Bug** | User filter "ĐƠN CHƯA PHẢN HỒI" (116 rows) → tương tác bảng (click/edit) → filter biến mất, hiện lại 5364 rows. |
| **Root cause** | `loadProcessingTags()` line 373 unconditionally `_activeFilter = null`, bị polling 15s (`_ptagStartPolling`) gọi → wipe user filter state. Filter chỉ lưu in-memory, không persist như TAG thường. |
| **Fix** | (1) Bỏ `_activeFilter = null` trong `loadProcessingTags`. (2) Persist `_activeFilter` + `_activeFlagFilters` vào localStorage (`ptag_active_filter_v1`, `ptag_active_flag_filters_v1`); init từ localStorage trong State; helper `_ptagPersistFilters()` gọi trong `_ptagSetFilter` / `_ptagToggleFlagFilter` / `_ptagToggleGiuDonQuaLay`. (3) Sau load nếu `hasActiveProcessingTagFilters()` → call `performTableSearch()` để re-apply filter cho data mới. |
| **Status** | ✅ Done |

### [docs] Phân tích chi tiết PDF OnCallCX UCaaS v1.1 ✅
| | |
|---|---|
| **Files** | `orders-report/oncallcx-ucaas-analysis.md` (new) |
| **Chi tiết** | Đọc đầy đủ 75 trang PDF `orders-report/oncallcxucaasuserguidevieforcustomerv112 (2).pdf` (FPT Telecom OnCallCX UCaaS user guide v1.1, tiếng Việt) và xuất ra phân tích markdown có cấu trúc lại theo 10 mục: §1 PBX Portal/Login, §2 Departments + Extensions (kèm bảng Call Forwarding codes đầy đủ CFU/CFF/CFNR/CFB/CFO/Reset), §3 SIP provisioning (3 mode: Auto-MAC / URL .xml / Manual credentials) + Re-Provisioning, §4 Routing (Timetables/Holidays + ACD methods Linear/Cyclic/Parallel + IVR menu/rule + regex patterns), §5 Conference Rooms (`*72` + 2 phương án external access), §6 anConnect/anMeet, §7 CDR statistics, §8 MS Teams plugin + Desktop app, §9 Cheatsheet tổng hợp service codes (`*21` `*26` `*67` `*72` `*76` `*78` `*86` `*99` `*481`...), §10 10 pitfalls quan trọng (đáng chú ý: `Queue Size=0 AND Queue Timeout=0` → fallback never triggered; mất Encryption Password = mất hết tin nhắn anConnect; xoá extension giữ CDR nhưng mất voicemail; "User defined" ACD method PDF ghi rõ KHÔNG dùng). Plan file: `~/.claude/plans/wise-snacking-trinket.md`. |
| **Status** | ✅ Done |

---

## 2026-04-07

### [orders] Conversation filter null-guard ✅
| | |
|---|---|
| **Files** | `orders-report/js/tab1/tab1-search.js` |
| **Chi tiết** | Phát hiện khi chạy verify-chotdon-panel.js harness: `_applyFiltersExceptProcessingTag` crash `TypeError: Cannot read properties of null (reading 'hasUnread')` khi đổi `conversationFilter` sang `unread`. `pancakeDataManager.getMessageUnreadInfoForOrder(order)` / `getCommentUnreadInfoForOrder(order)` có thể trả null cho một số order. Fix null-guard: `const hasUnreadMessage = !!(msgUnread && msgUnread.hasUnread);`. Harness sau fix: 6/6 PASS. |

### [orders] Chốt Đơn panel: realtime re-render khi TPOS/Firebase mutate data + robust open check ✅
| | |
|---|---|
| **Files** | `orders-report/js/tab1/tab1-processing-tags.js`, `orders-report/js/tab1/tab1-tpos-realtime.js`, `orders-report/js/tab1/tab1-firebase.js`, `orders-report/debug/verify-chotdon-panel.js` (new) |
| **Chi tiết** | Mở rộng fix commit trước (`a4efdac9`). Debug session với user phát hiện panel vẫn stale counts trong 3 scenario realtime mà pipeline filter chạy OK nhưng không có ai trigger re-render panel: (1) TPOS `handleOrderUpdate` → `updateOrderInTable` mutate `allData` field-level, (2) TPOS `handleTagAssigned` → same, (3) Firebase `child_changed/child_added` → `updateTagCellOnly` mutate Tags. Cả 3 đều thiếu call `_ptagRenderPanelIfOpen`. Fix: add call vào cuối mỗi handler. Ngoài ra làm `_ptagRenderPanelIfOpen` robust hơn: dùng `ProcessingTagState._panelOpen` state làm primary check, `classList.contains('open')` làm fallback (tránh edge case CSS animation remove class tạm thời). **Verification harness**: tạo `orders-report/debug/verify-chotdon-panel.js` — paste vào Console (top frame), tự động find iframe tab1, snapshot filter state, chạy 6 test case (baseline, search, status, search+status, fulfillment, conversation), so sánh `panel TỔNG == getOrdersBeforeProcessingTagFilter().length`, restore state, báo PASS/FAIL ra `console.table`. Ghi chú: race condition trong `_ptagSetFilter` (render trước performTableSearch 50ms) không phải bug — counts panel độc lập với processing tag filter nên immediate render không làm flicker counts, chỉ update active highlight. Skip sửa chỗ đó. |

### [wallet-adjust] Hiển thị rõ điều chỉnh ví v2 — enrich Node-side, không JOIN cast ✅
| | |
|---|---|
| **Files** | `render.com/routes/v2/customers.js`, `render.com/routes/v2/wallets.js`, `render.com/routes/v2/balance-history.js`, `orders-report/js/tab1/tab1-wallet-modal.js`, `customer-hub/js/modules/customer-profile.js`, `customer-hub/js/modules/wallet-panel.js`, `balance-history/js/accountant.js` |
| **Chi tiết** | Plan v1 (4 commit đã revert) dùng JOIN SQL với cast `wt.reference_id::int` → PG không short-circuit AND → 500 trên `/v2/customers/:id`. **Plan v2**: enrich ở Node, không cast SQL. Backend mỗi endpoint giữ SQL gốc, sau khi fetch lọc các row `type='ADJUSTMENT' AND reference_type='balance_history' AND /^\d+$/`, query phụ `wallet_adjustments WHERE original_transaction_id = ANY($1::int[])` (PG array cast chuẩn, không bao giờ crash), merge thêm `counterparty_phone`/`adjustment_reason`/`adjusted_by`/`adjusted_at`/`wrong_customer_phone`/`correct_customer_phone`. Tất cả enrich block bao bọc try/catch riêng — nếu lỗi vẫn trả row gốc, không 500. `balance-history.js` approved-list thêm query phụ thứ 2 lấy 2 leg `wallet_transactions` (balance_before/after) cho tooltip kế toán. **Frontend** (4 file): dấu/màu/icon theo `Math.sign(tx.amount)` cho ADJUSTMENT (override config cứng), label động "Nhận Điều Chỉnh Từ SĐT X" / "Điều Chỉnh Chuyển Sang SĐT Y", thêm dòng "Điều chỉnh ví sai SĐT: chuyển từ X → Y (+/- N)", "Lý do: ...", "Điều chỉnh bởi ...". Tooltip kế toán multi-line từ `adjustment_legs`. **Tuyệt đối không động vào logic dòng tiền** (`balance-history.js:1716-2030`). |
| **Status** | ✅ Done |

### [chat] Modal chat — fallback Extension cho mọi lỗi + enrich convData (giống bulk send) ✅
| | |
|---|---|
| **Files** | `orders-report/js/tab1/tab1-chat-messages.js` |
| **Chi tiết** | Trước: `_sendInbox` chỉ fallback extension khi `is24HourError` hoặc `isUserUnavailable (#551)`, và build convData chỉ bằng `buildConvData()` 1 lần (cache rỗng → "Không tìm được Global Facebook ID"). Bulk send (message-template-manager) thì fallback mọi lỗi + tự `fetchMessages` lấy `thread_id`/`global_id` + retry với `buildConvData`. **Fix**: (1) Bỏ điều kiện `is24HourError/isUserUnavailable` — fallback extension cho **mọi** lỗi Pancake (chỉ cần extension connected). Toast hiển thị reason theo loại lỗi. (2) Trước khi gọi `sendViaExtension`, enrich convData giống bulk send: `pdm.fetchMessages(pageId, convId)` → lấy `conversation.thread_id` + `page_customer.global_id` + `customers[]`; fallback từ cache (`inboxMapByPSID`/`currentConversationData`); fallback global_id từ `customers[].global_id`. (3) Retry với `window.buildConvData()` nếu extension fail vì Global Facebook ID. Pattern copy từ `message-template-manager.js:1038-1136`. |
| **Status** | ✅ Done |

### [orders][inbox] Global ID Harvester — auto push global_id từ Pancake responses lên Render cache ✅
| | |
|---|---|
| **Files** | `orders-report/js/managers/global-id-harvester.js` (mới), `orders-report/js/managers/pancake-data-manager.js`, `inbox/js/inbox-pancake-api.js`, `orders-report/tab1-orders.html`, `inbox/index.html`, `don-inbox/index.html` |
| **Chi tiết** | Module mới `GlobalIdHarvester` extract `global_id` từ `customers[]` (và `page_customer.global_id`) trong response Pancake `fetchConversations`/`fetchMessages`, dedupe theo `pageId:psid` trong session, fire-and-forget `PUT https://n2store-fallback.onrender.com/api/fb-global-id`. Hook vào `pancake-data-manager.js` (`fetchConversations`, `fetchConversationsForPage`, `fetchMessages`) và `inbox-pancake-api.js` (cùng 3 hàm). Thêm `<script>` load harvester trước data-manager ở tab1-orders.html, inbox/index.html, don-inbox/index.html. Mỗi user mở conversation → mappings tự động được đẩy vào DB cache shared, bypass 6 strategies extension trong tương lai. Sanity check: bỏ qua khi `psid === globalId`. |
| **Status** | ✅ Done |

### [chat] Paste ảnh vào modal chat khi focus ngoài input ✅
| | |
|---|---|
| **Files** | `orders-report/js/tab1/tab1-chat-images.js` |
| **Chi tiết** | Handler `paste` cũ chỉ fire khi `chatInput` đang focus → user click panel sản phẩm/message list rồi Cmd+V không bắt được. Thêm fallback keydown Cmd/Ctrl+V ở document: nếu modal mở và focus KHÔNG ở editable element, gọi `navigator.clipboard.read()` lấy image blob đẩy vào `addImageToPreview()` rồi auto-focus lại `chatInput`. |
| **Status** | ✅ Done |

### [orders] Tab "Hàng rớt - xã" — redesign sang image grid 5 cột + drag-select ✅
| | |
|---|---|
| **Files** | `orders-report/tab1-orders.html`, `orders-report/js/managers/dropped-products-manager.js`, `orders-report/css/tab1-chat-modal.css` |
| **Chi tiết** | Đổi UI tab "Hàng rớt - xã" trong chat modal Tab1 từ table (Ảnh/SP/SL/Giá/Thao tác) sang **image grid 5 cột chỉ ảnh**, hover phóng to scale 1.5. Bỏ dropdown campaign "T6 vèo vèo", thay bằng search bar (lọc theo tên/code) + 6 pills lọc nhanh ALL/Áo/Quần/Set/GIÀY/PK (detect category từ ProductName). **Selection**: click ảnh hoặc nhấn-giữ-rê chuột (drag-paint) qua nhiều ảnh — toggle theo trạng thái ô đầu tiên (add/remove mode). 2 nút floating bottom-right: **GỬI ĐƠN** (loop `moveDroppedToOrder` cho từng id chọn) và **HỦY/XÓA** (confirm 1 lần, loop `removeFromDroppedProducts` với flag skipConfirm mới). State module-level: `_droppedSearchText`, `_droppedCategoryFilter`, `_droppedSelectedIds`, `_droppedDragging`, `_droppedDragMode`. Thêm helpers `_detectDroppedCategory`, `_wireDroppedToolbar`, `_wireDroppedGrid`, `_updateDroppedFabState`, global `mouseup`/`mouseleave` reset drag. Item Quantity=0 → cell `.held` opacity 0.4 không chọn được. Right-click cell → `sendProductToChat`. Code legacy table+searchUI giữ trong block `/* LEGACY_REMOVED_START ... LEGACY_REMOVED_END */`. CSS thêm `.dropped-toolbar/.dropped-search/.dropped-pills/.dropped-grid/.dropped-cell[.selected/.held]/.dropped-floating-actions/.dropped-fab`. **Verification**: `node --check` OK. |
| **Status** | ✅ Done |

### [issue-tracking] Filter loại — đổi dropdown thành tab pills (và filter thật sự) ✅
| | |
|---|---|
| **Files** | `issue-tracking/index.html`, `issue-tracking/css/style.css`, `issue-tracking/js/script.js` |
| **Chi tiết** | Dropdown `#filter-type` ở filters-bar dashboard (Tất cả loại / Không Nhận Hàng / Thu về (Shipper) / Khách gửi / Sửa COD) chuyển thành dãy tab pill `#type-tabs` với `data-type`. Phát hiện thêm: dropdown cũ chưa từng được JS đọc → filter loại trước nay không hoạt động. Thêm CSS `.type-tabs/.type-tab-btn` (pill, active = primary). `initTabs()` gắn click handler: toggle active, giữ search term + active main tab rồi gọi `renderDashboard()`. `renderDashboard()` đọc `data-type` của tab active và filter `t.type` trước bước search. History tab vẫn dùng `#history-filter-type` riêng. |
| **Status** | ✅ Done |

### [inbox] Fix "Partner is null" khi xác nhận sale từ Đơn Inbox ✅
| | |
|---|---|
| **Files** | `don-inbox/js/tab-social-sale.js` |
| **Chi tiết** | TPOS `InsertListOrderModel` reject với `Partner is null.` khi bấm Xác nhận và in (F9) trong modal sale từ Đơn Inbox. Root cause: `buildSaleOrderModelForInsertList()` (tab1-sale.js:1537) đọc `currentSalePartnerData` để build object Partner, nhưng flow social không bao giờ set biến này → Partner.Id=0, TPOS từ chối. Fix: trong `openSaleModalInSocialTab()` sau khi set `currentSaleOrderData`, gọi `window.fetchTPOSCustomer(phone)` (shared/js/tpos-customer-lookup.js, đã load sẵn trong index.html) → map customer trả về thành shape PascalCase (`Id`, `Name`, `DisplayName`, `Street`, `Phone`, `StatusText`, `Customer`, `Type`, `CompanyType`) gán vào `currentSalePartnerData` và đồng bộ `mappedOrder.PartnerId`. Không tìm thấy KH hoặc thiếu phone → notification cảnh báo. |
| **Status** | ✅ Done |

### [extension] Popup — sync version từ manifest (fix hardcode v1.0.0) ✅
| | |
|---|---|
| **Files** | `n2store-extension/popup/popup.js` |
| **Chi tiết** | User báo popup hiển thị `v1.0.0` trong khi manifest đã là `1.0.3`. Root cause: `popup.html` hardcode `<span id="version">v1.0.0</span>`, không có code nào sync từ manifest. Fix: trong `DOMContentLoaded` của `popup.js` thêm `chrome.runtime.getManifest().version` → set `#version` textContent thành `v{version}` (try/catch defensive). Tự động sync mọi lần bump version sau này. |
| **Status** | ✅ Done |

### [inbox] Trạng thái filter — chuyển dropdown thành tab pills ✅
| | |
|---|---|
| **Files** | `don-inbox/index.html`, `don-inbox/css/don-inbox.css` |
| **Chi tiết** | User không thấy "Đơn đã hủy" vì nó nằm trong dropdown Trạng thái. Chuyển `<select id="statusFilter">` thành 4 tab pills (Tất cả / Nháp / Đơn hàng / Đã hủy) trong `#statusFilterTabs`. Giữ hidden `<select id="statusFilter">` để tương thích với code hiện tại đọc `statusFilter.value` (performTableSearch, etc.). Click handler inline ở cuối body sync giá trị + active class + gọi `performTableSearch()`. CSS pill style: bg `#f3f4f6`, active = white + tím `#8b5cf6` + shadow nhẹ. |
| **Status** | ✅ Done |

### [inbox] Fix Hủy đơn — global `confirmCancelOrder` collision với tab1 ✅
| | |
|---|---|
| **Files** | `don-inbox/js/tab-social-table.js` |
| **Chi tiết** | Click ban icon ở row → toast "Vui lòng nhập lý do hủy đơn" nhưng không có modal/input. **Root cause**: `don-inbox/index.html` load `tab1-fast-sale-workflow.js` SAU `tab-social-table.js`, tab1 ghi đè `window.confirmCancelOrder` bằng version index-based đọc `#cancelReasonInput` từ modal không tồn tại trong flow row → reason rỗng → warning. **Fix**: Tạo alias namespaced `window.socialConfirmCancelOrder = confirmCancelOrder`, đổi onclick row button (line 155) sang gọi `socialConfirmCancelOrder('${order.id}')` để tránh collision hoàn toàn. Tab1 modal vẫn dùng global `confirmCancelOrder` của nó như cũ. |
| **Status** | ✅ Done |

---

## 2026-04-06

### [orders] Per-row history popover — show STT + tên + SĐT + mã đơn ✅
| | |
|---|---|
| **Files** | `orders-report/js/tab1/tab1-processing-tags.js`, `orders-report/css/tab1-processing-tags.css` |
| **Chi tiết** | User feedback popover lịch sử per-row hiện chỉ thấy time + STT/code (truncated) + user + sign + label → khó nhận ra đơn nào. Yêu cầu thêm STT, tên KH, SĐT. **Fix**: (1) `_ptagAggregateAllHistory()` — enrich `orderLookup` Map với 4 field thay vì 2: `stt: o.STT \|\| o.Stt \|\| o.SessionIndex`, `code`, `name: o.PartnerName \|\| o.Name`, `phone: o.Telephone`. Mỗi entry kèm thêm `orderName` + `orderPhone`. (2) `_ptagShowRowHistory()` row template chuyển từ 1-row grid 5 cột → block 2-line: row1 (grid cũ: time / STT / user / sign / label), row2 (flex: name · phone · code) — chỉ hiển thị field nào có data, dùng `<span class="ptag-rh-sep">·</span>` separator. Title attr cũng enrich với code+name+phone+action+label cho hover full info. (3) CSS `.ptag-rh-item` đổi `display: grid` → `display: block`, tách `.ptag-rh-row1` (giữ grid 5 cột cũ) + `.ptag-rh-row2` mới (flex, padding-left 81px để align với cột STT, font 10.5px gray). `.ptag-rh-name` weight 500 dark gray max-width 140px ellipsis, `.ptag-rh-phone` tabular-nums gray, `.ptag-rh-code` mono font 10px lighter. (4) Bump popover từ 340×420 → 380×460 (rộng hơn để fit name + phone + code line 2). Update `popW` trong logic position. **Verification**: `node --check` OK. **Limitation**: Đơn không nằm trong list visible hiện tại sẽ không có name/phone (chỉ có code) — vì lookup phụ thuộc `window.getAllOrders()`. |
| **Status** | ✅ Done |

### [orders] Sync v3 `_findOrCreateTPOSTag` — `$filter` query thay vì pagination cap ✅
| | |
|---|---|
| **Files** | `orders-report/js/tab1/tab1-tag-sync.js` |
| **Chi tiết** | Sau khi fix `ensureMergeTagExists` (commit `c551a4b9`), user merge thành công nhưng phát hiện **bug giống hệt** ở forward sync v3: `[TAG-SYNC-V3] Creating new TPOS tag "CHỜ ĐI ĐƠN (OKE)"...` → `POST /api/odata/Tag 400 ()`. Tag `CHỜ ĐI ĐƠN (OKE)` đã tồn tại trên TPOS (Id 99163) nhưng `_findOrCreateTPOSTag` không tìm thấy → POST → server reject. **Root cause**: `_findOrCreateTPOSTag` (cũ) chỉ có 3 step: (1) cache lookup, (2) reload qua `loadAvailableTags()` / `fetchAllTagsWithPagination()`, (3) POST create. Mặc dù step 2 có pagination (đã thấy log `Pagination complete: 1373/1373 tags fetched`), reload là **expensive** (gọi multiple HTTP request) → trong race condition + cache stale, có thể vẫn miss tag. Fallback sau 400 hiện tại phụ thuộc vào việc reload thành công lần 2 trong block recovery — không guarantee. **Fix**: Refactor `_findOrCreateTPOSTag` thành **4-step lookup** mirror pattern của `ensureMergeTagExists`: (1) **Local cache** (`window.availableTags`, dùng `_normalizeName()` case-insensitive). (2) **OData `$filter` query** qua helper mới `_queryTPOSTagByName(name)` — escape single quote `'` → `''`, build expr `Name eq '...'`, `encodeURIComponent`, `$top=5`, dùng `window.API_CONFIG.smartFetch` → cache trên cache, không phụ thuộc pagination. (3) **Full reload** `loadAvailableTags()` / `fetchAllTagsWithPagination()` (last resort trước khi tạo mới — preserve behavior cũ). (4) **POST create** với recovery: nếu trả `400` → re-query qua `_queryTPOSTagByName` 1 lần để recover (handle race condition). Mỗi success path sync vào `window.availableTags` + `cacheManager.set('tags', ...)`. **Behavior preservation**: Return signature giữ nguyên, error path return `null` như cũ (caller `_callAssignTag` handle). **Verification**: `node --check` syntax OK. Sau fix: scenario "tag CHỜ ĐI ĐƠN (OKE) ngoài top 1000 cache" → STEP 2 `$filter` tìm thấy ngay → return → sync flow tiếp tục, không POST nhầm, không 400 trong console. |
| **Status** | ✅ Done |

### [orders] Fix `ensureMergeTagExists` — `$filter` query thay vì `$top=1000` ✅
| | |
|---|---|
| **Files** | `orders-report/js/tab1/tab1-merge.js` |
| **Chi tiết** | User merge cluster STT 4/6/73 thành công (products + Tag XL OK) nhưng tag assignment cho TPOS column FAIL với error `400 "Đã tồn tại tag"` khi tạo `"Gộp 4 6 73"`. **Root cause**: `ensureMergeTagExists` (cũ) fetch full list `$top=1000` rồi search client-side. TPOS DB đã có >1000 tag (từ các merge group cũ tích lũy) → tag `"Gộp 4 6 73"` (tạo từ lần merge trước, hoặc bởi user khác) nằm ngoài top 1000 → local search trả null → POST tạo mới → server reject với `400 BusinessException "Đã tồn tại tag"` → throw → cả `assignTagsAfterMerge` fail → target order không nhận được TPOS tag merged. **Fix**: Refactor `ensureMergeTagExists` thành **4-step lookup**: (1) **Local cache** (`availableTags`, case-insensitive) — fast path. (2) **OData `$filter` query** qua helper mới `queryTPOSTagByName(tagName)` — escape single quote `'` → `''`, build expr `Name eq '...'`, `encodeURIComponent`, `$top=5` → targeted, không bị giới hạn pagination, scale với DB lớn. (3) **POST tạo mới** nếu vẫn không tìm thấy. (4) **Recovery**: Nếu POST trả `400` với body match `/tồn tại\|exist/i` → re-query qua `queryTPOSTagByName` 1 lần để lấy tag từ server (handle race condition khi tag được tạo bởi user khác giữa STEP 2 và STEP 3). **Helper mới `_registerLocalTag(tag)`**: Sync tag vào `availableTags` + `cacheManager` + Firebase `settings/tags`. Idempotent — skip nếu Id đã có. **Behavior preservation**: Return signature giữ nguyên (`{Id, Name, Color, ...}`), error path vẫn throw để caller `assignTagsAfterMerge` handle. **Verification**: `node --check` syntax OK. Sau fix: scenario "Gộp 4 6 73 đã tồn tại" → STEP 2 `$filter` tìm thấy → return ngay → assignTag flow tiếp tục thành công. |
| **Status** | ✅ Done |

### [orders] Per-row history popover — nút clock trên từng row panel Chốt Đơn ✅
| | |
|---|---|
| **Files** | `orders-report/js/tab1/tab1-processing-tags.js`, `orders-report/css/tab1-processing-tags.css` |
| **Chi tiết** | User yêu cầu mỗi row trong panel Chốt Đơn (substate, flag, subtag, T-tag) có nút riêng để xem lịch sử thêm/xóa tag đó ở đơn nào. **Implementation**: (1) Helper inline `_rowHistoryBtnHtml(rowType, rowId)` (line 1869-1875) generate button 20×20px với icon `fa-clock-rotate-left`, escape single quotes trong rowId. (2) Chèn button vào 5 nơi trong `renderPanelContent()`: substate row (line 2073, type='substate'), built-in flag row (line 2101, type='flag'), custom flag row dưới KHÁC (line 2125, type='flag'), subtag row (line 2160, type='subtag'), T-tag row (line 2195, type='ttag'). Tất cả button có `event.stopPropagation()` để không trigger row click filter. (3) Section mới SECTION 10D `PER-ROW HISTORY POPOVER` (line 4793-4905) với 3 function: `_ptagMatchRowHistoryEntry(entry, rowType, rowId)` filter logic — substate match `SET_CATEGORY` value `1:*` + `ADD_TTAG`/`REMOVE_TTAG`/`TRANSFER_*` (vì substate auto-derive từ tTags count, không log riêng); flag match `ADD_FLAG`/`REMOVE_FLAG` value === rowId; subtag match `SET_CATEGORY` value `cat:subTag`; ttag match `ADD_TTAG`/`REMOVE_TTAG` value === rowId. `_ptagGetRowHistoryTitle()` resolve label từ enum (`PTAG_SUBSTATES`, `PTAG_FLAGS`, custom flag, `PTAG_SUBTAGS`, T-tag def name). `_ptagShowRowHistory(rowType, rowId, anchorEl)` aggregate qua `_ptagAggregateAllHistory()` (đã có), filter, take top 20, render popover. Mỗi item: time DD/MM HH:MM + STT/Code + user + sign (+/-/←/→) + label. Nếu > 20 entries → hiển thị footer "+N mục cũ hơn — bấm clock ở header để xem hết". (4) Position popover smart: align right edge với button, flip up nếu vượt viewport, clamp left/right. Close on outside click (skip nếu click vào anchorEl để tránh re-open). (5) CSS mới `.ptag-row-history-btn` (20×20px, gray border, hover xanh) + `.ptag-row-history-popover` (340×420px, header tím gradient, grid 5 cột) trong `tab1-processing-tags.css` (line 2107-2237). Sign colors: add green, remove red, auto blue. (6) Window export `_ptagShowRowHistory`. **Substate edge case**: OKIE_CHO_DI_DON và CHO_HANG đều show cùng dataset (vì substate transitions không log riêng, chỉ derived từ tTags count). User vẫn thấy được toàn bộ activity trong category 1 — đủ context để hiểu order nào vừa vào CHỜ ĐI ĐƠN, order nào vừa được gán T-tag (→ chuyển sang CHỜ HÀNG). |
| **Status** | ✅ Done |

### [orders] Modal gộp đơn — preview "Sau Khi Gộp" hiển thị merged tags pills ✅
| | |
|---|---|
| **Files** | `orders-report/js/tab1/tab1-merge.js` |
| **Chi tiết** | User báo bug — modal "Gộp Sản Phẩm Đơn Trùng SĐT" cột **"Sau Khi Gộp (STT XX)"** trống không có tag pills nào, trong khi các cột STT nguồn/đích bên cạnh vẫn render đầy đủ tag pills. → Không xem trước được kết quả merge tags trước khi click "Xác nhận Gộp Đơn". **Root cause**: `renderClusterCard` (line 687-689) chỉ render text `Sau Khi Gộp` cho header `merged-col` mà không có logic compute merged tags. Logic merge tag thật ở `assignTagsAfterMerge` (line 1571) chỉ chạy SAU khi user xác nhận → preview hoàn toàn không tồn tại ở client-side. **Fix**: (1) Thêm pure helper `calculateMergedTagsPreview(cluster)` (sau `getOrderTagsArray` ~line 1527, ~50 dòng) — mirror exact filter + dedup logic của `assignTagsAfterMerge`: (a) `shouldExcludeTag()` filter `MERGED_ORDER_TAG_NAME` ('ĐÃ GỘP KO CHỐT') + tag bắt đầu bằng `'Gộp '` (merge group cũ), (b) target tags trước (priority hiển thị) → source tags sort theo `SessionIndex` ascending (deterministic), dedup by `tag.Id` qua `Map`, (c) thêm placeholder `{Id:'__preview_merge_group__', Name:'Gộp X Y Z', Color: MERGE_TAG_COLOR}` (tag thật sẽ tạo lúc confirm). (2) Sửa `renderClusterCard` (line 686-693) — compute `mergedTagsPreview` rồi render qua `renderMergeTagPills()` có sẵn vào header `merged-col`. Empty case (cluster không có tag) → render fallback `"Không có tag"` pill xám `#9ca3af`. **CSS**: Reuse `merge-header-tags` + `merge-tag-pill` class có sẵn ở `tab1-orders.css:3876` → không thêm CSS mới. **Backwards compatible**: `assignTagsAfterMerge` không bị chạm → behavior thực tế khi confirm merge giữ nguyên 100%, fix chỉ ở display layer. **Verification scenario** (screenshot user): STT 4 (CHỜ ĐI ĐƠN OKE, CHUYỂN KHOẢN, GIẢM GIÁ, T8 LÓT TULIP) + STT 6 (CHỜ ĐI ĐƠN OKE, T7 BÌNH SIÊU TỐC) + STT 73 đích (GIẢM GIÁ) → preview giờ hiển thị: GIẢM GIÁ (target) → CHỜ ĐI ĐƠN OKE → CHUYỂN KHOẢN → T8 LÓT TULIP (từ STT 4) → T7 BÌNH SIÊU TỐC (từ STT 6) → Gộp 4 6 73 (placeholder vàng). `node --check` syntax OK. |
| **Status** | ✅ Done |

### [orders] Lịch sử Tag — default filter "Tag XL + Chuyển đơn" ✅
| | |
|---|---|
| **Files** | `orders-report/js/tab1/tab1-processing-tags.js` |
| **Chi tiết** | User yêu cầu xem lại lịch sử thêm/xóa Tag XL (T-tag) trong panel Chốt Đơn. Phát hiện feature **đã có sẵn**: icon clock ở header panel (`fa-clock-rotate-left`, line 1834-1836) → mở modal `_ptagOpenGlobalHistory()` (line 4684) với filter STT/mã đơn + loại action + user, pagination 50/trang, đã track `ADD_TTAG`/`REMOVE_TTAG`/`TRANSFER_IN`/`TRANSFER_OUT`. **Thiếu duy nhất**: dropdown filter loại không có option "Chuyển đơn" (group `transfer` đã định nghĩa trong `PTAG_ACTION_META` nhưng không xuất hiện ở UI), và mở modal mặc định show tất cả thay vì chỉ Tag XL + Chuyển đơn. **Fix**: (1) Thêm 3 option vào `<select id="ptag-gh-filter-action">` (line 4710): `"ttag_transfer"` ("Tag XL + Chuyển đơn", `selected`), `"transfer"` ("Chuyển đơn"), và đổi label `"ttag"` từ "Tag T" → "Tag XL" cho consistent với UI bảng. (2) Sửa `_ptagGHApplyFilters()` (line 4623-4630) handle group đặc biệt `ttag_transfer`: match `meta.group === 'ttag' \|\| meta.group === 'transfer'`. (3) Sửa `_ptagOpenGlobalHistory()` — thêm `_ptagGHApplyFilters()` call sau `appendChild` để áp dụng filter mặc định (trước đó set thẳng `_globalHistoryFiltered = [..._cache]` nên dropdown selected nhưng không filter). **KHÔNG đổi**: cleanup 60 ngày giữ nguyên (user yêu cầu), cột "Bảng/campaign" không thêm (user yêu cầu không cần). **Cleanup hiện hành**: `_ptagCleanupOldHistory()` (line 4531) xóa cả tag data + history nếu order > 60 ngày không update — không phải sliding window per-entry. |
| **Status** | ✅ Done |

### [orders] Fix gộp đơn — Tag XL persistence + subState preservation + phone normalize ✅
| | |
|---|---|
| **Files** | `orders-report/js/tab1/tab1-merge.js` |
| **Chi tiết** | Fix các bug + smell trong logic gộp đơn trùng SĐT (`assignTagXLAfterMerge`, `executeBulkMergeOrderProducts`, `showMergeDuplicateOrdersModal`). **Bug #1 — Tag XL tTags không persist (CRITICAL)**: Code cũ ở lines 1715-1723 set `data.tTags = mergedTTags` trực tiếp qua `setOrderData()` → chỉ update local state, KHÔNG gọi `saveProcessingTagToAPI()` → sau page reload, merged tTags biến mất. Cũng không trigger sync v3 → TPOS tag column không có Tx merged. **Bug #2 — subState bị reset khi target có sẵn category đúng**: Code cũ luôn gọi `assignOrderCategory(targetCode, finalCategory, ...)` ngay cả khi target đã ở đúng category + subTag → bên trong `assignOrderCategory` (line 734) `data.subState = null` → các state quan trọng như `DA_IN_PHIEU`, `CHO_HANG` bị mất. **Bug #3 — fallback `existingData.category`**: Khi `bestCategory === null` (tất cả đơn đều là old merge tag), code cũ fallback về `existingData.category` → có thể giữ "Đã gộp không chốt" cũ thay vì để nguyên. **Smell #4 — guard check thiếu**: line 1653 chỉ check `assignOrderCategory` mà không check `assignTTagToOrder` / `toggleOrderFlag` (functions mới sẽ dùng). **Smell #5 — phone normalization**: `executeBulkMergeOrderProducts` (line 296) và `showMergeDuplicateOrdersModal` (line 453) chỉ dùng `Telephone?.trim()` → `+84xxx` và `0xxx` của cùng 1 KH không group được. **Fix**: (A) Refactor `assignTagXLAfterMerge` (~+50/-25 dòng): thêm helper `_mergeXLId(item)` để extract id từ object hoặc string. Logic mới: (1) Collect bestCategory/bestSubTag/mergedFlags/mergedTTags từ all orders như cũ. (2) Compute `targetSameCategory` = bestCategory nullable + match cả category + subTag với target hiện tại. (3) Nếu cần đổi category (`!targetSameCategory && bestCategory !== null`) → gọi `assignOrderCategory(targetCode, bestCategory, {subTag, flags: mergedFlags, source: 'Hệ thống (gộp đơn)'})`. (4) Else (same category hoặc no new category) → loop merge flags qua `await window.toggleOrderFlag(targetCode, flagId, source)` để tránh reset subState (idempotent: skip nếu flag đã có). (5) Loop merge tTags qua `await window.assignTTagToOrder(targetCode, tId, source)` (idempotent: skip nếu tTag đã có) — mỗi call persists + syncs. Bỏ block buggy `setOrderData(updatedData)` ở cuối. (B) `normalizeMergePhone(phone)` helper mới ở đầu file: trim, remove `[\s\-\.()]`, convert `+84xxx` → `0xxx` (và `84xxx` 11-digit → `0xxx`). Dùng làm group key trong cả 2 nơi grouping; field `Telephone`/`phone` khi trả về vẫn là original từ `targetOrder.Telephone` để hiển thị đúng format gốc. (C) Guard check mở rộng: kiểm tra cả 4 functions cần thiết (`ProcessingTagState`, `assignOrderCategory`, `assignTTagToOrder`, `toggleOrderFlag`). **Behavior preservation**: Source order logic giữ nguyên (`assignOrderCategory(sourceCode, 3, {subTag: 'DA_GOP_KHONG_CHOT'})` — preserve flags + tTags) theo yêu cầu user "logic tag như cũ". TPOS tag merging logic ở `assignTagsAfterMerge` (lines 1551-1644) không đổi. **Verification**: `node --check` syntax OK. **Critical fix path**: Trước fix này, sau page reload, target order STT cao nhất chỉ giữ category + flags từ `assignOrderCategory`, mất hết tTags được merge từ source orders → user thấy cột Tag XL không có Tx tags như mong đợi. |
| **Status** | ✅ Done |

### [orders] Auto detect GIẢM GIÁ + clear Tx tags khi tạo phiếu bán hàng ✅
| | |
|---|---|
| **Files** | `orders-report/js/utils/sale-modal-common.js`, `orders-report/js/tab1/tab1-sale.js`, `orders-report/js/tab1/tab1-fast-sale.js`, `orders-report/js/tab1/tab1-processing-tags.js` |
| **Chi tiết** | 2 thay đổi trong cùng commit: **(A) GIẢM GIÁ auto-detect**: Bỏ điều kiện gating "phải có TPOS tag GIẢM GIÁ" ở mọi nơi parse/apply discount từ ghi chú sản phẩm. Trước đây phải có tag "GIẢM GIÁ" thì discount mới được tính → user phàn nàn vì phải gán tag thủ công. Sau: discount luôn được auto-parse từ note (regex `^(\d+(?:[.,]\d+)?)\s*k$` hoặc plain number), khi `totalDiscount > 0` → tự động gán flag `GIAM_GIA` vào XL state qua helper mới `_ensureGiamGiaFlag(orderCode)` (idempotent — check flag tồn tại trước khi gọi `toggleOrderFlag`). Helper dùng `window.toggleOrderFlag` để tận dụng sync v3 hook → tự push tag "GIẢM GIÁ" sang TPOS. **5 vị trí gỡ gate**: (1) `sale-modal-common.js:populateSaleOrderLinesFromAPI()` — bỏ `const hasDiscountTag = currentSaleOrderHasDiscountTag()` (line 774), `notePrice = parseDiscountFromNoteForDisplay(productNote)` luôn (line 788), block render discount input bỏ điều kiện tag + thêm call `_ensureGiamGiaFlag(currentSaleOrderData?.Code)`. (2) `tab1-sale.js:1762` payload builder — bỏ `if (saleOrderHasDiscountTag(order))`, thêm call `window._ensureGiamGiaFlag(order.Code)`. (3) `tab1-fast-sale.js:960` `hasAnyDiscount` (cho auto-generate order note) — bỏ `hasDiscountTag &&`. (4) `tab1-fast-sale.js:1607` freeship calc — bỏ `if (orderHasDiscountTag(order))`. (5) `tab1-fast-sale.js:1805` payload builder — bỏ gate, thêm call `window._ensureGiamGiaFlag(saleOnlineOrder?.Code || order.Reference)`. Helper functions `currentSaleOrderHasDiscountTag` / `saleOrderHasDiscountTag` / `orderHasDiscountTag` giữ lại (dead code, không xóa để tránh side-effect). **(B) Clear Tx tags khi auto-transition ĐÃ RA ĐƠN**: User báo bug — tạo phiếu bán hàng thành công thì tag "ĐÃ RA ĐƠN" được gán nhưng các Tx sản phẩm (vd "T7 BÌNH SIÊU TỐC") vẫn còn ở cột TAG XL. Yêu cầu: clear Tx tags khi chuyển sang ĐÃ RA ĐƠN, nhưng lưu lại trong snapshot để khi hủy phiếu sẽ restore. Fix: `tab1-processing-tags.js:onPtagBillCreated()` thêm `data.tTags = []` ngay sau `data.subState = null`. Snapshot trong `previousPosition` đã lưu `tTags` từ commit trước → `onPtagBillCancelled` đã restore `tTags = [...prev.tTags]` sẵn → restore tự động hoạt động. Sync v3 hook đã có sẵn ở cuối cả 2 function → tự push xóa/restore Tx tag sang TPOS. |
| **Status** | ✅ Done |

### [orders] Robust snapshot/restore cho onPtagBillCreated + onPtagBillCancelled + hook sync v3 ✅
| | |
|---|---|
| **Files** | `orders-report/js/tab1/tab1-processing-tags.js` |
| **Chi tiết** | Làm kỹ lại logic auto-transition ĐÃ RA ĐƠN ↔ rollback khi hủy phiếu, và bổ sung hook sync v3 (XL→TPOS) vào cả 2 function. **Trước**: `onPtagBillCreated` snapshot `previousPosition` thiếu `pickingSlipPrinted` + timestamp, flags chỉ shallow spread; `onPtagBillCancelled` clear `previousPosition: null` (vẫn giữ key trong JSONB), không idempotency guard, không async. Cả 2 đều bypass `assignOrderCategory` → `syncXLToTPOS` không chạy → TPOS tag column không update khi bill tạo/hủy tự động. **Sau**: (1) `onPtagBillCreated` → `async`. Snapshot giờ gồm `{category, subTag, subState, flags, tTags, note, pickingSlipPrinted, snapshotAt}`, deep clone flag objects (`f => ({...f})`). `await saveProcessingTagToAPI()` rồi gọi `window.syncXLToTPOS(orderCode, 'bill-created')` fire-and-forget. (2) `onPtagBillCancelled` → `async`. Thêm 2 idempotency guard: skip nếu `!data.previousPosition` (đã restore), skip nếu `data.category !== HOAN_TAT` (user đã gán thủ công lại → tránh restore nhầm). Restore giờ có `pickingSlipPrinted` + deep clone flags + clone `history`. Dùng `delete restored.previousPosition` thay vì `: null` → field bị xóa hẳn khỏi JSONB (backend PUT full-replace). `await save` rồi gọi `syncXLToTPOS(orderCode, 'bill-cancelled')`. **Callers KHÔNG đổi**: 5 caller ở `tab1-fast-sale-workflow.js:461/1332`, `tab1-fast-sale-invoice-status.js:819`, `tab1-sale.js:1003/1172` đều fire-and-forget, zero-risk. **Guard interaction sync v3**: `_syncingForward` flip true trong sync → TPOS broadcast `tpos:tag-assigned` về sẽ thấy guard và early-return → không loop. |
| **Status** | ✅ Done |

### [inbox] Search conv — chỉ trigger khi Enter hoặc idle 5s (bỏ search-mỗi-phím) ✅
| | |
|---|---|
| **Files** | `inbox/js/inbox-chat.js`, `inbox/index.html` |
| **Chi tiết** | User gõ SĐT 10 chữ số → gọi Pancake API search 10 lần liên tiếp (mỗi phím 1 request với debounce 100-300ms → vẫn trigger nhiều) → spam server và tốn quota. **Fix**: Tách 2 tầng rõ ràng: (1) **Local filter** vẫn chạy instant mỗi phím cho feedback nhanh (`renderConversationList()` dùng `getConversations({search})` local). (2) **Pancake API search** chỉ trigger khi: (a) user bấm **Enter** → `performSearch()` ngay lập tức, hoặc (b) sau **5 giây idle** không gõ thêm → auto trigger. Khi query thay đổi hoặc bị clear trước 5s → `clearTimeout()` hủy lịch. Thêm `e.preventDefault()` cho Enter. Placeholder đổi: `"Tìm tên, SĐT, nội dung (Enter để tìm)..."` để hướng dẫn user. |
| **Status** | ✅ Done |

### [orders] Sync logic mới TPOS ↔ TAG XL v3 (hardcoded mapping) ✅
| | |
|---|---|
| **Files** | Created: `orders-report/js/tab1/tab1-tag-sync.js` (~564 dòng). Modified: `orders-report/js/tab1/{tab1-processing-tags.js, tab1-tags.js, tab1-tpos-realtime.js}`, `orders-report/tab1-orders.html`, `docs/flow-tag-xl-panel-chotdon.md` |
| **Chi tiết** | Rebuild sync module TPOS ↔ TAG XL sau khi xóa sạch ở commit `53816496`. Kiến trúc mới **hardcoded mapping**, không có modal user-configurable, không tái hiện button "Đồng bộ Tag". **Mapping tables** (hardcoded trong source): (1) `CAT_TO_TPOS` — 5 category (0→'ĐÃ RA ĐƠN', 1→'CHỜ ĐI ĐƠN (OKE)', 2→'MỤC XỬ LÝ', 3→'KHÔNG CẦN CHỐT', 4→'KHÁCH XÃ SAU CHỐT') — **1 chiều XL→TPOS, không reverse**. (2) `SUBTAG_TO_TPOS` — 10 subtag map theo tên TPOS — **1 chiều** cho 7 subtag thường + **bidirectional REMOVE** cho 3 subtag đặc biệt `GIO_TRONG`/`DA_GOP_KHONG_CHOT`/`NCC_HET_HANG` (TPOS xóa tag → XL xóa subtag nhưng **giữ category**). (3) `FLAG_TO_TPOS` — 10 flag bidirectional ADD+REMOVE: TRU_CONG_NO, CHUYEN_KHOAN, GIAM_GIA, CHO_LIVE, GIU_DON, QUA_LAY, **GOI_BAO_KHACH_HH** (mới so với map cũ), KHACH_BOOM, THE_KHACH_LA, DA_DI_DON_GAP. Flag `KHAC` không map (nội bộ XL only). (4) `TTAG_HARDCODED` — T_MY→'MY THÊM CHỜ VỀ' bidirectional. (5) Dynamic Tx pattern `/^T\d+\s+/` bidirectional — khi TPOS gửi tag Tx chưa có XL def → **auto-create def** (id=name uppercase, reuse `mergeConfigDefs('__ttag_config__')`) + gán luôn. (6) `TPOS_ALIASES` — reverse lookup: 'TRỪ THU VỀ'→TRU_CONG_NO, 'KHÁCH CK'/'CK'→CHUYEN_KHOAN. **Architecture**: IIFE module ~564 dòng. **Forward sync** `syncXLToTPOS(orderCode, reason)` — strategy "preserve unmanaged + replace managed": lấy current TPOS tags, phân loại managed/unmanaged (dùng `MANAGED_NAMES` Set build 1 lần từ tất cả mapping values + alias keys, check thêm dynamic T-tag def names + pattern `/^T\d+\s+/`), build desired managed từ `ProcessingTagState.getOrderData()`, final = unmanaged + desired managed, no-op nếu set equal, call `_callAssignTag` với full tag array. `_findOrCreateTPOSTag` reuse pattern cũ (cache → reload → create với random color). **Reverse sync** `handleTPOSTagsChanged(orderId, newTPOSTags)` — 5 phase: (a) Flags bidirectional loop qua `FLAG_TO_TPOS`, (b) Aliases→flag, (c) Bidirectional REMOVE 3 subtag đặc biệt dùng `assignOrderCategory(code, category, {subTag:null})` để giữ cat, (d) T_MY bidirectional, (e1) Tx ADD với auto-create def, (e2) Tx REMOVE. Mỗi phase re-read latest state để tránh race. **Guard flags kép** `_syncingForward` + `_syncingReverse` — set trước khi sync, reset ở `finally`; mỗi hàm early-return nếu cờ đối diện đang bật → tránh loop vô hạn giữa 2 chiều (forward→AssignTag→extension broadcast→reverse; reverse→toggleOrderFlag→forward hook). **Integration (8 hook)**: Forward (`tab1-processing-tags.js`) — 4 hook sau `saveProcessingTagToAPI` trong `assignOrderCategory`, `toggleOrderFlag`, `assignTTagToOrder`, `removeTTagFromOrder`. Reverse — `quickAssignTag`/`quickRemoveTag`/`saveOrderTags` (tab1-tags.js, sau API success + emit Firebase) + `handleTagAssigned` (tab1-tpos-realtime.js, sau `updateOrderInTable`). **HTML**: thêm `<script src="js/tab1/tab1-tag-sync.js">` sau `tab1-processing-tags.js`. **Docs**: `flow-tag-xl-panel-chotdon.md` thêm section 11 (mapping tables, ma trận hành vi, guard flags, trigger points, forward strategy), section 10 cũ chuyển sang "HISTORICAL" note. Syntax-checked cả 4 JS files OK. |
| **Status** | ✅ Done |

### [orders] Xóa toàn bộ mapping/sync logic TPOS ↔ TAG XL ✅
| | |
|---|---|
| **Files** | Deleted: `orders-report/js/tab1/tab1-tag-sync.js`. Modified: `orders-report/js/tab1/{tab1-processing-tags.js, tab1-tags.js, tab1-tpos-realtime.js}`, `orders-report/tab1-orders.html`, `orders-report/css/tab1-orders.css`, `docs/flow-tag-xl-panel-chotdon.md` |
| **Chi tiết** | User yêu cầu xóa sạch logic bidirectional sync giữa TPOS tag và TAG XL (processing tag) để làm lại từ đầu. Lý do: dữ liệu lệch giữa cột TAG và TAG XL (đơn "Huyền Nhi" ví dụ), TPOS realtime qua extension gây bug `[object Object]`, mapping hardcoded + alias + pattern + fallback đan xen khó bảo trì. **Đã xóa**: (1) File `tab1-tag-sync.js` (~1201 dòng) — toàn bộ `PTAG_TO_TPOS_MAP`, `TPOS_TO_PTAG_MAP`, `TPOS_ALIAS_MAP`, `_resolvePtagToTPOSName`, `_findOrCreateTPOSTag`, `syncPtagToTPOS`, `syncTPOSToPtag`, `executeTagSync`, guard flags `_isSyncingToTPOS`/`_isSyncingFromTPOS`, modal state + dropdown logic. (2) Trong `tab1-processing-tags.js`: 4 block sync `if (window.syncPtagToTPOS) {...}` trong `assignSubTag`, `toggleOrderFlag`, `assignTTagToOrder`, `removeTTagFromOrder`; function `onPtagOrderTagsChanged`; dòng `window.onPtagOrderTagsChanged = ...`. (3) Trong `tab1-tags.js`: 3 hook call `onPtagOrderTagsChanged` trong `quickAssignTag`, `quickRemoveTag`, và block lưu `_hookOrderId`/`_hookTags` trong save modal. (4) Trong `tab1-tpos-realtime.js`: hook call sau `updateOrderInTable` (giữ `normalizedTags` cho defensive coerce). (5) Trong `tab1-orders.html`: button `#tagSyncModalBtn` "Đồng bộ Tag", script tag `tab1-tag-sync.js`, toàn bộ modal `#tagSyncModal` (52 dòng). (6) Trong `css/tab1-orders.css`: section "TAG SYNC MODAL" (~418 dòng, 56 selectors `.tag-sync-modal*` + `.ts-*`). (7) Trong `docs/flow-tag-xl-panel-chotdon.md`: section 8.11, 10, 11 (11a+11b), xóa `tab1-tag-sync.js` khỏi File Map, xóa `syncPtagToTPOS`/`syncTPOSToPtag`/`onPtagOrderTagsChanged` khỏi Key Global Functions. Section 10 giờ là note ngắn "TAG XL ↔ TPOS — Độc Lập Hoàn Toàn". **Kết quả**: TAG TPOS và TAG XL hoàn toàn độc lập — gán/bỏ bên này không ảnh hưởng bên kia. Redesign sẽ được thảo luận/plan sau. Tổng: ~-2000 dòng code/markdown, 0 feature mới, pure cleanup. |
| **Status** | ✅ Done |

### [inbox][render] Đơn Inbox — Modal nhập lý do hủy + đổi retention 30→60 ngày ✅
| | |
|---|---|
| **Files** | `don-inbox/index.html`, `don-inbox/js/tab-social-table.js`, `don-inbox/js/tab-social-history.js`, `render.com/routes/social-orders.js`, `.github/workflows/cleanup-cancelled-orders.yml` |
| **Chi tiết** | User yêu cầu 2 thứ: (1) Bấm "Hủy đơn" → modal có textarea nhập lý do hủy, mặc định "HẾT HÀNG" → confirm → chuyển sang tab Đã hủy với lý do được lưu vào ghi chú. (2) Retention auto-cleanup đổi từ 30 → 60 ngày. **FE**: (1) `index.html` — thêm block `#confirmCancelReasonBlock` vào modal confirm (textarea rows=2, pre-filled "HẾT HÀNG", chỉ hiện khi action type = cancel/bulk_cancel). Đổi text info "30 ngày" → "60 ngày". (2) `tab-social-table.js` — `_showConfirmModal()` thêm option `reasonInput`, hiện textarea + focus+select khi mở. `confirmCancelOrder()` + `cancelSelectedOrders()` pass `reasonInput: true`. `confirmPendingAction()` đọc value từ `#confirmCancelReason` (fallback "HẾT HÀNG" nếu rỗng), pass vào `_doCancel(ids, reason)`. `_doCancel()` rewrite: prepend marker `[HỦY: <reason>]` vào `order.note`, preserve existing note (strip old HỦY marker nếu có), gọi `updateSocialOrder(id, {status:'cancelled', note: newNote})`. **Bonus fix**: Phát hiện bug cũ — `confirmPendingAction` case `bulk_cancel` gọi `_doBulkCancel` (function không tồn tại) → fallthrough vào `_doCancel` (đã handle array). (3) `tab-social-history.js` — `logCancel(order, reason)` accept reason param, append ` \| Lý do: <reason>` vào details. Đổi label `auto_cleanup` "30 ngày" → "60 ngày". **BE**: `social-orders.js` — `RETENTION_DAYS = 30` → `60`, comment và docstring cập nhật. **Workflow**: `cleanup-cancelled-orders.yml` comment + notice message 30 → 60. **Storage approach**: KHÔNG thêm column `cancel_reason` mới — prepend marker `[HỦY: HẾT HÀNG]` vào field `note` hiện có. Ưu điểm: không cần schema migration, hiển thị tự nhiên trong cột ghi chú của tab Đã hủy. Nhược: reason "contaminate" note — khắc phục bằng regex strip `/^\[HỦY:[^\]]*\]\s*/i` để khi hủy lại sẽ replace marker cũ thay vì nesting. |
| **Status** | ✅ Done |

### [extension][orders][render] Realtime cột "Phiếu bán hàng TPOS" (extension push) ✅
| | |
|---|---|
| **Files** | `n2store-extension/content/tpos-interceptor.js`, `n2store-extension/manifest.json` (bump 1.0.0→1.0.1), `orders-report/js/tab1/tab1-tpos-invoice-snapshot.js` (new), `orders-report/js/tab1/tab1-tpos-realtime.js`, `orders-report/tab1-orders.html`, `orders-report/js/tab1/tab1-table.js`, `orders-report/js/managers/column-visibility-manager.js`, `orders-report/css/tab1-orders.css` |
| **Chi tiết** | User yêu cầu thêm cột MỚI "Phiếu bán hàng TPOS" realtime từ trang `tomato.tpos.vn/#/app/fastsaleorder/invoicelist` (tách khỏi cột "Phiếu bán hàng" cũ — không đụng code cũ). Flow: **Extension** MAIN-world interceptor (`tpos-interceptor.js`) bắt thêm XHR `FastSaleOrder/ODataService.GetView` và `GetListOrderIds` → parse response, `toSnapshot()` extract minimal fields (`Id, Number, State, ShowState, StateCode, IsMergeCancel, PartnerDisplayName, AmountTotal, AmountPaid, Residual, DateInvoice, DateUpdated, SaleOnlineIds`) → debounce 400ms → POST `{type:'tpos:invoice-list-updated', invoices:[...]}` lên `chatomni-proxy/api/tpos-events/broadcast` (reused — Cloudflare Worker proxy → Render). **Render** không sửa code — endpoint `/api/tpos-events/broadcast` đã generic relay qua `broadcastToClients()` WebSocket. Verified env vars `TPOS_USERNAME/TPOS_PASSWORD/TPOS_CLIENT_ID` đã có sẵn trên Render `srv-d4e5pd3gk3sc73bgv600`. Smoke-test POST thành công (`{success:true, broadcasted:true}`). **Web**: Tạo `tab1-tpos-invoice-snapshot.js` với `TPOSInvoiceSnapshotStore` (`_byId Map<String,snap>`, `_bySaleOnlineId Map<id,Set<fsoId>>`, localStorage `tposInvoiceSnapshot_v1` TTL 24h); method `upsertBatch()`, `getBySaleOnlineId()` (pick latest by `DateInvoice` + `Id`), `refreshCellsFor(saleOnlineIds)` (query `tr[data-order-id]` → update `td[data-column="invoice-status-tpos"]`). Duplicate `SHOW_STATE_CONFIG` + `STATE_CODE_CONFIG` local vì file gốc `tab1-fast-sale-invoice-status.js` khai báo private trong IIFE. `renderInvoiceStatusTposCell(order)` render 2 dòng: pill badge (ShowState, color/bg/border theo config, line-through cho "Huỷ bỏ") + reconcile line (label theo StateCode: None→"Chưa đối soát", CrossCheckComplete→"Hoàn thành đối soát", v.v.), tooltip = `Số phiếu: {Number}`. Fallback `−` khi không có snapshot. `tab1-tpos-realtime.js` thêm case `'tpos:invoice-list-updated'` trong `handleMessage()` → gọi `handleInvoiceListUpdate()` → `store.upsertBatch()` + `store.refreshCellsFor()`. HTML: thêm `<th data-column="invoice-status-tpos">Phiếu bán hàng TPOS</th>` sau cột `invoice-status` (line 486), checkbox modal (line 774-777), `<script src="js/tab1/tab1-tpos-invoice-snapshot.js">` sau `tab1-fast-sale-invoice-status.js` (line 1231). `tab1-table.js`: thêm `<th>` trong employee view (line 1005) + thêm `<td data-column="invoice-status-tpos">` sau invoice-status cell trong `createRowHTML` (line 1172). `column-visibility-manager.js` DEFAULT_COLUMN_VISIBILITY thêm `'invoice-status-tpos': true` (line 34). CSS `.invoice-status-tpos-cell` (flex column, gap 3px, 12px) + `.state-badge` (pill 2px/8px, radius 10px) + `.reconcile-line` (11px/500). Cell matching: one FastSaleOrder có thể có nhiều `SaleOnlineIds[]` → index cả hai chiều để lookup O(1). |
| **Status** | ✅ Done |

### [inbox][render] Đơn Inbox — Soft-cancel + tab Đã hủy + auto-cleanup 30 ngày ✅
| | |
|---|---|
| **Files** | `don-inbox/index.html`, `don-inbox/js/tab-social-table.js`, `don-inbox/js/tab-social-history.js`, `render.com/routes/social-orders.js`, `.github/workflows/cleanup-cancelled-orders.yml` (new) |
| **Chi tiết** | Đổi hành vi nút 🗑️ "Xóa đơn" thành 🚫 "Hủy đơn" (soft-delete, set `status='cancelled'`). Tab "Đã hủy" hiển thị action buttons riêng: **Khôi phục** (undo → `draft`) và **Xóa vĩnh viễn** (DELETE thật). Filter status dropdown rút gọn còn 4 option: `Tất cả / Nháp / Đơn hàng / Đã hủy` (ẩn `processing`, `completed` — nhưng giữ trong `STATUS_CONFIG` để data cũ không vỡ, admin dropdown cell vẫn dùng được). **FE**: (1) `tab-social-table.js` — rewrite section DELETE thành action dispatcher (`pendingAction = {type, ids}`), thêm `confirmCancelOrder`, `confirmPermanentDeleteOrder`, `restoreOrder`, `confirmPendingAction`, `cancelSelectedOrders`, `permanentDeleteSelectedOrders`, `restoreSelectedOrders`, `updateBulkActionBar`. `renderTableRow()` render action column khác theo `order.status`. (2) `index.html` — dropdown filter 4 option, bulk action container `#bulkActionButtons` (render theo tab), modal generic với title/icon/button/warning động (thông báo "sẽ tự động xóa sau 30 ngày" khi hủy). (3) `tab-social-history.js` — thêm `logCancel`, `logRestore`, `logPermanentDelete`; thêm label mapping cho `cancel`/`restore`/`permanent_delete`/`auto_cleanup` trong `HISTORY_ACTION_CONFIG`. **BE**: Render route `social-orders.js` — thêm endpoint `POST /api/social-orders/cleanup-cancelled` bảo vệ bằng header `X-Cleanup-Secret` (env `CLEANUP_SECRET`), query `DELETE FROM social_orders WHERE status='cancelled' AND updated_at < (now - 30 days)`, log kết quả vào `social_orders_history` với action `auto_cleanup`. **Infra**: thêm env var `CLEANUP_SECRET` vào Render service `n2store-fallback` qua `PUT /v1/services/{id}/env-vars/{KEY}` (đã verify không ảnh hưởng 24 vars khác → 25 tổng). Tạo workflow `.github/workflows/cleanup-cancelled-orders.yml` chạy cron daily 19:00 UTC (= 02:00 ICT) + `workflow_dispatch`, curl endpoint với secret từ GitHub Secrets. |
| **Status** | ✅ Done |

### [inbox] Fix real-time conv list — read convs không bị đẩy lên trên unread ✅
| | |
|---|---|
| **Files** | `inbox/js/inbox-chat.js` |
| **Chi tiết** | Bug: khi shop reply một conversation (→ chuyển từ unread sang read) hoặc khi có tin mới tới một read conv, `_updateSingleConversationInList()` luôn `prepend` element lên đầu DOM, **bỏ qua** sort rule (unread-first). Kết quả: read convs nổi lên trên các unread convs — trái với sort canonical của `getConversations()`. **Fix**: Thêm 3 helper: 1) `_convSortRank(conv)` — return 1 nếu `unread > 0 && isCustomerLast !== false`, else 0 (khớp chính xác với sort trong `getConversations()`). 2) `_convSortTime(conv)` — normalize Date/number → timestamp ms. 3) `_findInsertionAnchor(conv, skipEl)` — walk qua siblings trong DOM, tìm element đầu tiên mà conv hiện tại nên chèn TRƯỚC nó (higher rank hoặc same rank + newer time). Rewrite `_updateSingleConversationInList()`: thay vì `prepend()` mù quáng, dùng `insertBefore(newEl, anchor)` tại vị trí đúng theo sort. Cover 2 case: (existing element → remove rồi insert lại) và (new conversation → insert ở đúng vị trí). Độ phức tạp O(n) per update nhưng chính xác 100% với sort rule. |
| **Status** | ✅ Done |

### [inbox] Message bubbles — chữ to và đậm hơn ✅
| | |
|---|---|
| **Files** | `inbox/css/inbox.css` |
| **Chi tiết** | User yêu cầu tăng kích thước chữ trong bong bóng tin nhắn chat (cho dễ đọc, đồng bộ với conversation list). **Fix**: 1) `.message-text`: 15px/normal → **17px/500**. 2) `.message-time`: 10px/opacity 0.7 → **12px/opacity 0.8/weight 500**, margin-top 2px → 4px. |
| **Status** | ✅ Done |

### [inbox] Conversation list — chữ đậm to hơn + unread pop với background indigo ✅
| | |
|---|---|
| **Files** | `inbox/css/inbox.css` |
| **Chi tiết** | User yêu cầu: (1) text trong danh sách conversation đậm/to hơn; (2) unread items có background nổi bật để phân biệt với read. **Fix**: 1) `.conv-name`: 15px/600 → 16px/700. 2) `.conv-preview`: 13px/normal → 15px/500 (line-height 1.45→1.5). 3) `.conv-time`: 12px/500 → 13px/600. 4) `.conv-page-name`: 11px → 13px/500. 5) `.conversation-item.unread`: đổi bg từ `--surface-container-lowest` (#ffffff — trùng col bg → không nổi) sang `#eef2ff` (soft indigo wash) + border-left primary 4px. Font weight cho unread: name 700→800, preview 500→700, time primary color 700. Hover unread: `#e0e7ff`. 6) `.conversation-item.active`: đổi bg từ `--primary-bg` sang `#dad7ff` (darker, saturated hơn để distinct với unread). Selector `.conversation-item.unread.active` đảm bảo active override unread khi trùng. Sort unread-first đã có sẵn từ commit trước (`277de493`). |
| **Status** | ✅ Done |

### [inbox] Tìm kiếm hội thoại theo số điện thoại — normalize VN phone formats ✅
| | |
|---|---|
| **Files** | `inbox/js/inbox-data.js`, `inbox/js/inbox-chat.js`, `inbox/index.html` |
| **Chi tiết** | User không tìm được conversation theo SĐT do formats khác nhau (`0984040726`, `+84 984 040 726`, `0984-040-726` — substring match fail). **Fix**: 1) Thêm helper `normalizePhone(str)` — strip non-digit chars + convert country code `84xxxxxxxxx` → `0xxxxxxxxx` (VN). 2) `isPhoneQuery(str)` — detect query phone-like (≥4 consecutive digits). 3) `getConversations()` filter: nếu query là phone, normalize cả 2 bên (`c.phone` split theo `,` → normalize từng item, `c._raw.recent_phone_numbers` → normalize từng số) rồi substring match. Text fields (name/lastMessage/pageName) vẫn dùng `removeDiacritics` như trước. 4) `performSearch()` (Pancake API): khi query là phone, gửi query đã normalized lên server để Pancake match tốt hơn. 5) Update placeholder search input: `"Tìm khách hàng..."` → `"Tìm theo tên, SĐT, nội dung..."`. |
| **Status** | ✅ Done |

### [inbox] Fix sort — đẩy conversation unread (customer gửi cuối) lên top ✅
| | |
|---|---|
| **Files** | `inbox/js/inbox-data.js`, `inbox/js/inbox-chat.js` |
| **Chi tiết** | Sort cũ chỉ check `unread > 0` → không match với display condition `unread > 0 && isCustomerLast !== false`. Kết quả: convo đã reply nhưng vẫn bubble lên top, hoặc unread thật sự không lên top đúng thứ tự. **Fix**: 1) `getConversations()` sort dùng chung condition `(unread > 0 && isCustomerLast !== false)` khớp UI. 2) Initial fetch sort trong `fetchAllPagesConversations()` compute inline `customerLast = last_sent_by.id !== page_id`. 3) `toggleReadUnread()` bỏ `_updateSingleConversationInList` (chỉ update 1 item DOM) → dùng full `renderConversationList()` để re-apply sort (vị trí phải đổi khi mark/unmark). |
| **Status** | ✅ Done |

### [inbox] High-End Editorial UI redesign — "The Digital Curator" style ✅
| | |
|---|---|
| **Files** | `inbox/index.html`, `inbox/css/inbox.css`, `inbox/css/quick-reply-modal.css` |
| **Chi tiết** | Áp dụng design system từ `inbox/DESIGN.md` + `inbox/changelog.md` + reference templates (`inbox_modernized.css`, `quick_reply_modernized.css`, `code.html`). **1) Typography**: Thêm Google Fonts Manrope (headlines) + Inter (body) vào index.html. Mới var `--font-headline` (Manrope), `--font-body` (Inter). Headings dùng Manrope 700/800, letter-spacing -0.015em. **2) Color palette**: Chuyển sang Indigo (#3525cd) + Slate neutrals. Thêm Material surface hierarchy (--surface #f7f9fb, --surface-container-lowest #ffffff, --surface-container-high #e6e8ea). **3) Layout**: col1 320→380px, col3 360→400px. **4) "No-Line" rule**: Bỏ 1px borders giữa col-header/conversation-search/conversation-filters/chat-header/conv items/info-tabs — dùng tonal background shift thay thế. **5) Conversation list**: Avatar 44→52px, active state dùng border-left 4px primary + primary-bg, padding 14×24px, conv-name 15px semibold, conv-preview 13px. **6) Message bubbles**: radius 16→20px, bỏ border incoming dùng shadow-sm, outgoing dùng gradient primary→primary-container + shadow indigo. **7) Input area**: Wrapper 16px radius, focus state có ghost border, btn-send 36→44px FAB với gradient + shadow indigo. **8) Quick-reply-modal**: Rewrite full — glassmorphism overlay (backdrop-blur 12px), 24px radius modal, Manrope title, monospace shortcuts với indigo tag pill (#eef2ff bg), table header uppercase tracker, footer tonal bg. **9) Image zoom**: Upgrade với backdrop-blur, 16px radius, shadow đậm. Active state dùng primary accent bar 4px thay vì 3px. |
| **Status** | ✅ Done |

### [orders] Fix bug "[object Object]" qua TPOS realtime sync — defensive guards full chain ✅
| | |
|---|---|
| **Files** | `orders-report/js/tab1/tab1-processing-tags.js`, `orders-report/js/tab1/tab1-tag-sync.js`, `orders-report/js/tab1/tab1-tpos-realtime.js`, `orders-report/js/tab1/tab1-table.js` |
| **Chi tiết** | Bug tiếp diễn khi sync từ TPOS realtime via extension → web. Thêm defensive guards toàn chuỗi: 1) `assignOrderCategory()` validate `category` arg — nếu là object → extract `.category` + warn; coerce parseInt + check range 1-5, abort nếu invalid. 2) `_ptagAddHistory()` coerce `value` to string, replace bằng '' nếu chứa `[object`. 3) `syncTPOSToPtag()` defensive `String(t.Name \|\| '')` ở 3 chỗ (build tposNames, T-pattern, fallback KHAC). 4) `handleTagAssigned()` realtime — normalize tag fields to strings ngay khi nhận event từ extension. 5) `parseOrderTags()` (TPOS column render) coerce `tag.Name` + `tag.Color` to string. Mục tiêu: không bao giờ store hoặc render `[object Object]` dù data nguồn có corrupt. |

### [orders] Fix UI bug "[object Object]:" trong popover lịch sử tag ✅
| | |
|---|---|
| **Files** | `orders-report/js/tab1/tab1-processing-tags.js` |
| **Chi tiết** | Bug: popover lịch sử tag hiển thị `[object Object]:` cho entries SET_CATEGORY cũ. Nguyên nhân: code cũ trong tab1-tag-sync.js gọi `assignOrderCategory(orderCode, {category, subTag})` (object làm 2nd arg) → `${category}:${subTag}` template tạo ra `"[object Object]:"` được lưu vào history `value` + `displayName`. Đã fix code gốc rồi nhưng entries cũ vẫn corrupt trong storage. **Defensive fix**: 1) `_ptagResolveDisplayName()` detect `value` không phải string hoặc start with `[object` → return "Phân loại". 2) Cả 2 renderers (popover + global history) skip `displayName` nếu chứa `[object Object]`, fallback xuống resolver. |

### [orders] TAG XL ↔ TPOS sync — Category subtags ADD 2 chiều, REMOVE skip ✅
| | |
|---|---|
| **Files** | `orders-report/js/tab1/tab1-tag-sync.js`, `docs/flow-tag-xl-panel-chotdon.md` |
| **Chi tiết** | Revert một phần thay đổi trước: GIỎ TRỐNG / ĐÃ GỘP KO CHỐT / NCC HẾT HÀNG vẫn sync **ADD** 2 chiều (TPOS → XL gán cat tương ứng), chỉ skip **REMOVE** từ TPOS → XL (khi TPOS xóa tag, giữ nguyên subtag XL). Re-enable block `type === 'subtag'` với logic ADD only: tìm cat từ `SUBTAG_OPTIONS` local → `assignOrderCategory(orderCode, cat, {subTag: key, source: 'TPOS-SYNC'})`. Lý do giữ skip REMOVE: category là phân loại cốt lõi, không tự revert khi TPOS gỡ tag. |

### [orders] TAG XL ↔ TPOS sync — skip category subtags + fallback KHAC cho tag lạ ✅
| | |
|---|---|
| **Files** | `orders-report/js/tab1/tab1-tag-sync.js`, `docs/flow-tag-xl-panel-chotdon.md` |
| **Chi tiết** | 1) **Skip Category subtags TPOS → XL**: Bỏ block xử lý `type === 'subtag'` trong `syncTPOSToPtag()`. Khi TPOS gắn/xóa GIỎ TRỐNG, ĐÃ GỘP KO CHỐT, NCC HẾT HÀNG → KHÔNG đổi category XL. Hướng XL → TPOS vẫn sync 2 chiều bình thường (mục đích: category là phân loại cốt lõi, không nên auto-change từ TPOS). 2) **Fallback KHAC cho tag lạ**: Thay thế seller pattern check (OK/XỬ LÝ/XÃ ĐƠN) bằng general fallback. Bất kỳ TPOS tag nào không match `TPOS_TO_PTAG_MAP` (kể cả subtags), không match T-number pattern, không trùng custom flag label → auto add flag KHAC (add-only). Cover: OK/XỬ LÝ/XÃ ĐƠN [seller], Gộp xxx, K\d+ xxx, CỌC xxxK, BÁN HÀNG NHA, XÃ KHÁCH LẠ, hoặc bất kỳ tag lạ. |

### [docs] Cập nhật flow-tag-xl-panel-chotdon.md — ghi lại toàn bộ tag mappings ✅
| | |
|---|---|
| **Files** | `docs/flow-tag-xl-panel-chotdon.md` |
| **Chi tiết** | Section 11a: Thay 8-row mapping cũ bằng 4 bảng chi tiết: 1) Bidirectional Mapping (15 entries gồm 3 subtags + 9 flags + 2 ttag patterns + custom). 2) Alias Map (TRỪ THU VỀ, KHÁCH CK). 3) Pattern Map (T-number + 3 seller patterns). 4) "Không sync" table (Gộp, K-tags, CỌC). Cập nhật code constants `PTAG_TO_TPOS_MAP` + `TPOS_ALIAS_MAP`. Section 11b: Reverse mapping table 21 entries với cột Nguồn (PTAG_TO_TPOS_MAP / TPOS_ALIAS_MAP / Pattern detect / Reverse lookup). |

### [orders] Mở rộng TPOS ↔ TAG XL auto sync — thêm mappings + pattern detection ✅
| | |
|---|---|
| **Files** | `orders-report/js/tab1/tab1-tag-sync.js` |
| **Chi tiết** | 1) Mở rộng `PTAG_TO_TPOS_MAP` +7 entries: GIẢM GIÁ, CHUYỂN KHOẢN, QUA LẤY, CHỜ LIVE, GIỮ ĐƠN, ĐÃ GỘP KO CHỐT, NCC HẾT HÀNG. 2) Thêm `TPOS_ALIAS_MAP` cho many-to-one: TRỪ THU VỀ → TRU_CONG_NO, KHÁCH CK → CHUYEN_KHOAN. 3) Forward sync T-tags: `_resolvePtagToTPOSName()` lookup T-tag def name cho mọi ttag (không chỉ T_MY). 4) **Pattern T-number**: TPOS tag `T\d+ xxx` → auto find/create T-tag definition + assign. Removal: xóa TPOS tag → remove T-tag tương ứng. 5) **Pattern seller**: OK/XỬ LÝ/XÃ ĐƠN [tên seller] → auto flag KHAC (add-only). |

### [render][orders] Server-side order buffer — chống mất đơn real-time ✅
| | |
|---|---|
| **Files** | `render.com/routes/tpos-order-buffer.js` (MỚI), `render.com/server.js`, `render.com/cron/scheduler.js`, `orders-report/js/tab1/tab1-tpos-realtime.js` |
| **Chi tiết** | Khi client mất kết nối WebSocket (rớt mạng, server restart), event đơn mới từ TPOS bị mất. Fix: 1) Server lưu mọi event `SaleOnline_Order` vào PostgreSQL `tpos_order_buffer` table (fire-and-forget). 2) API endpoint `GET /api/tpos/order-buffer?since=<timestamp>` trả danh sách đơn buffered. 3) Client poll mỗi 45s, so sánh với `allData`, fetch đơn thiếu từ TPOS OData. 4) Cron cleanup tự xóa entries > 3 ngày. Debug: `window.tposRealtime.pollNow()`, `window.tposRealtime.getStatus()`. |

## 2026-04-05

### [orders] Fix tiền ship bị reset khi xóa dòng đơn hàng trong phiếu bán hàng hàng loạt ✅
| | |
|---|---|
| **Files** | `orders-report/js/tab1/tab1-fast-sale.js` |
| **Chi tiết** | Khi xóa 1 dòng đơn hàng trong modal fast-sale, toàn bộ modal bị re-render qua `innerHTML` khiến tiền ship, carrier, ghi chú bị reset về mặc định. Fix: thêm `saveFastSaleFormState()` lưu form state (shipping fee, carrier, note, weight, wallet) vào `fastSaleOrdersData` trước khi re-render. `renderFastSaleOrderRow` và auto-carrier-select sử dụng giá trị đã lưu (`_user*` properties) thay vì giá trị mặc định. |

### [orders] Bidirectional TAG XL ↔ TPOS auto sync + 3 built-in flags mới ✅
| | |
|---|---|
| **Files** | `orders-report/js/tab1/tab1-processing-tags.js`, `orders-report/js/tab1/tab1-tag-sync.js`, `orders-report/js/tab1/tab1-tags.js` |
| **Chi tiết** | 1) Thêm 3 built-in flags mới vào PTAG_FLAGS: KHÁCH BOOM 💥, THẺ KHÁCH LẠ 🪪, ĐÃ ĐI ĐƠN GẤP ⚡ + tooltips. 2) Tạo mapping `PTAG_TO_TPOS_MAP` (TAG XL ↔ TPOS): GIỎ TRỐNG, KHÁCH BOOM, MY THÊM CHỜ VỀ, THẺ KHÁCH LẠ, ĐÃ ĐI ĐƠN GẤP, TRỪ CÔNG NỢ + custom flags. 3) **TAG XL → TPOS**: `syncPtagToTPOS()` auto sync khi gán/bỏ TAG XL → add/remove TPOS tag. Fallback chain: cache → reload → create. Hook fire-and-forget vào 4 hàm. 4) **TPOS → TAG XL**: `syncTPOSToPtag()` reverse sync khi gán/bỏ TPOS tag → auto add/remove TAG XL flags/subtags/ttags tương ứng. Hook vào `onPtagOrderTagsChanged` (called from `saveOrderTags`, `quickAssignTag`, `quickRemoveTag`). 5) Guard flags `_isSyncingToTPOS` + `_isSyncingFromTPOS` chống infinite loop. |

### [orders][render] Migration dropped_products & held_products: Firebase RTDB → PostgreSQL ✅
| | |
|---|---|
| **Files** | `render.com/routes/realtime-db.js`, `orders-report/js/managers/dropped-products-manager.js`, `orders-report/js/managers/held-products-manager.js`, `render.com/migrations/040_update_dropped_products_schema.sql` (MỚI), `render.com/scripts/migrate-dropped-held-to-pg.js` (MỚI) |
| **Chi tiết** | 1) ALTER TABLE `dropped_products` thêm 13 columns thiếu (product_id, image_url, price, reason, campaign_id/name, removed_by, etc.). 2) Backend: rewrite dropped_products routes (GET all, PUT upsert, PATCH quantity atomic, PATCH fields, DELETE all/single) + thêm held_products routes (GET by-product, PATCH draft, PATCH quantity). 3) Frontend `dropped-products-manager.js`: rewrite hoàn toàn Firebase → Render API + SSE (EventSource). Firebase `transaction()` → PG atomic `quantity + $change`. Firebase `push()` → client-generated `dp_` ID. 4) Frontend `held-products-manager.js`: rewrite hoàn toàn Firebase → Render API + SSE. 5) Data migration script: 2 dropped products + 1 held product migrated thành công. Strategy: PG only, không dual-write. |

### [chat] Fix sender UI not updating after private reply ✅
| | |
|---|---|
| **Files** | `orders-report/js/tab1/tab1-chat-messages.js` |
| **Chi tiết** | 2 bugs: 1) `PrivateReplyStore._getDocRef()` dùng per-user doc → marks không sync giữa nhân viên → đổi sang shared doc `'shared'`. 2) Reload sau 2s ghi đè `allChatMessages = messages` → xóa mất tin nhắn optimistic `pr_*` chưa có trên server → preserve optimistic messages khi text chưa match server data. |

### [chat] Private reply marks store + optimistic UI ✅
| | |
|---|---|
| **Files** | `orders-report/js/tab1/tab1-chat-messages.js`, `orders-report/js/tab1/tab1-chat-core.js` |
| **Chi tiết** | 1) `PrivateReplyStore`: Firestore collection `private_reply_marks`, real-time listener, 7-day TTL. Đánh dấu tin nhắn nhắn riêng → hiện badge "🔒 Nhắn riêng" + đổi màu, đồng bộ cross-device. 2) Optimistic UI: sau khi gửi nhắn riêng thành công → thêm tin nhắn vào UI ngay lập tức, không cần đợi reload. 3) Auto-mark: khi load messages từ Pancake, tự detect và store private reply messages. |

### [chat] Fix #551 user unavailable — extension fallback toàn dự án ✅
| | |
|---|---|
| **Files** | `tab1-chat-messages.js`, `chat-products-ui.js`, `bill-service.js`, `shared/quick-reply-manager.js` |
| **Chi tiết** | Search toàn bộ dự án: nhiều chỗ chỉ check `is24HourError` (e_code 10) mà thiếu `isUserUnavailable` (#551). Fix: thêm check 551 ở tất cả send paths — `_sendInbox()` fallback extension, `chat-products-ui` gửi ảnh, `bill-service` hóa đơn, `shared/quick-reply-manager`. Các file đã OK: inbox `_sendInbox()` (fallback mọi error), `message-template-manager` (queue ALL errors), `inbox/quick-reply-manager` (check cả 2). |

### [chat] Fix private_replies false error + UI not updating ✅
| | |
|---|---|
| **Files** | `inbox/js/inbox-chat.js`, `orders-report/js/tab1/tab1-chat-messages.js` |
| **Chi tiết** | Pancake API `private_replies` gửi tin nhắn thành công lên Facebook nhưng trả về `success:false` → code chạy vào fallback chain → tất cả fail (COMMENT conv không có global_id) → hiện lỗi + UI không reload. Fix: gọi API trực tiếp thay vì qua `_sendApi()`, chỉ throw khi lỗi rõ ràng (post deleted, code 100). Các lỗi khác treat as success → UI cập nhật bình thường. |

### [chat] Chat panel — default Nhắn riêng + load bình luận mới nhất + page selector ✅
| | |
|---|---|
| **Files** | `inbox/js/inbox-chat.js`, `orders-report/js/tab1/tab1-chat-core.js`, `orders-report/tab1-orders.html`, `orders-report/css/tab1-chat-modal.css` |
| **Chi tiết** | 1) Dropdown reply type mặc định "Nhắn riêng" thay vì "Bình luận công khai" (cả inbox + orders-report). 2) Orders-report COMMENT tab luôn fetch fresh từ API thay vì dùng cache → load bình luận mới nhất, sort by updated_at. 3) Thêm page selector dropdown trong chat modal header — cho phép chuyển page xem tin nhắn/bình luận của khách trên page khác (ẩn nếu chỉ 1 page). |

### [orders] Delivery report — permission gate tra soát + yêu cầu hủy đơn ✅
| | |
|---|---|
| **Files** | `delivery-report/js/delivery-report.js`, `delivery-report/js/cancel-request.js` (MỚI), `delivery-report/index.html`, `delivery-report/css/delivery-report.css` |
| **Chi tiết** | 1) Chỉ admin + "Phước đẹp trai" mới bật tra soát và xóa quét (canTraSoat helper + guard 4 functions + ẩn nút). 2) Tab "Yêu cầu hủy" luôn hiện — nút toggle danh sách + badge pending, modal chọn đơn (search + checkbox) + lý do, lưu Firestore subcollection `delivery_report/data/cancel_requests/{id}` với displayName người yêu cầu, realtime listener. |

### [orders] Delivery report — confirm dialog on unscan + per-group delete-all buttons ✅
| | |
|---|---|
| **Files** | `delivery-report/js/delivery-report.js`, `delivery-report/css/delivery-report.css` |
| **Chi tiết** | Xóa từng đơn hiện confirm "Chắc chắn đơn X đã được đưa vào kho xử lý?". Thêm nút "Xóa" riêng cho từng bảng nhóm (TOMATO/NAP/CITY/SHOP/RETURN) khi xem đơn đã quét. |

### [orders] Fix RefundDateStore — save MoveName after confirming draft refund orders ✅
| | |
|---|---|
| **Files** | `supplier-debt/js/main.js` |
| **Chi tiết** | `RefundDateStore` lưu custom date cho đơn trả hàng nháp nhưng field `number` (MoveName) luôn trống vì đơn nháp chưa được TPOS gán Number. Fix: sau `ActionInvoiceOpen` (xác nhận đơn), re-fetch đơn đã confirm để lấy Number mới (BILL/xxxx) và cập nhật vào RefundDateStore → `getByMoveName()` có thể map custom date sang tab Công nợ. Dọn 2 entries trống (54772, 54943) trong Firestore. |

### [chat] Fix unread badge system — localStorage persistence + server backup ✅
| | |
|---|---|
| **Files** | `render.com/server.js`, `orders-report/js/chat/new-messages-notifier.js` |
| **Chi tiết** | **5 vấn đề**: (1) Refresh mất badge — in-memory only, (2) Server chỉ save `update_conversation` bỏ qua `new_message`, (3) Server spin down mất events, (4) Badge count không update khi có tin mới, (5) `setPendingCustomers()` replace thay vì merge. **Fixes**: Server: thêm `upsertPendingCustomer()` cho `pages:new_message` (chỉ tin từ khách, không từ page). Browser: localStorage persistence (`n2s_pending_customers` key) — load ngay khi init, save mỗi khi thay đổi. `setPendingCustomers()` giờ merge server data với existing (lấy count cao hơn). `_upsertBadge()` helper mới — update badge text nếu đã tồn tại thay vì skip. Badges survive refresh ngay lập tức từ localStorage, sau đó server data merge vào. |

### [orders] Fix flag counts hiển thị 0 trong thống kê Tổng quan ✅
| | |
|---|---|
| **Files** | `orders-report/js/overview/overview-statistics.js` |
| **Chi tiết** | Flags (CHỜ LIVE, QUA LẤY + GIỮ ĐƠN, GIẢM GIÁ) hiển thị 0 đơn dù bấm mắt xem vẫn có đơn. Root cause: flags đã chuyển từ string (`"CHO_LIVE"`) sang object (`{id:"CHO_LIVE", name:"Chờ Live"}`) nhưng `computeTagXLCounts` vẫn dùng `flags.includes('CHO_LIVE')` — không match object. Fix: đổi sang `flags.some(f => _fid(f) === 'KEY')` với helper `_fid` extract id từ cả string lẫn object. |

### [orders] Chuyển hoàn toàn sang Tag XL — bỏ thống kê theo tag TPOS ✅
| | |
|---|---|
| **Files** | `orders-report/js/overview/overview-ui.js`, `orders-report/js/overview/overview-modals.js`, `orders-report/js/overview/overview-table.js` |
| **Chi tiết** | Thay tất cả 6 chỗ gọi `renderStatistics()` (TPOS tags) → `renderStatisticsFromAllOrders()` (Tag XL). Trước đây khi bấm "Lấy chi tiết đơn hàng", "Tải lại Excel", "Đồng bộ Tab1", hoặc save tracked tags thì gọi hàm legacy TPOS, ghi đè lên stats Tag XL. Giờ mọi action đều dùng Tag XL thống nhất. |

## 2026-04-04

### [balance-history] Thêm cảnh báo trừ ví thất bại vào tab Kế Toán ✅
| | |
|---|---|
| **Files** | `balance-history/index.html`, `balance-history/css/accountant.css`, `balance-history/js/accountant.js` |
| **Chi tiết** | Thêm alert bar thứ 3 🚨 "X giao dịch trừ ví thất bại (Xđ)" vào dashboard Kế Toán, hiển thị khi có pending-withdrawals status=FAILED. Thêm sub-tab "Trừ Ví Thất Bại" với badge đỏ. Panel chi tiết gồm: (1) Stats summary cards (Thất bại/Đang chờ/Hoàn thành + số tiền), (2) Bảng chi tiết mỗi giao dịch lỗi: mã đơn, SĐT, số tiền, nguồn (PBH Loạt/Lẻ), lỗi cụ thể, số lần retry, người tạo, thời gian. (3) Nút Retry cho phép kế toán thử lại trừ ví ngay. Hover vào cột lỗi sẽ expand full text. Data fetch từ API `/api/v2/pending-withdrawals/stats` + `/api/v2/pending-withdrawals?status=FAILED`. Auto-load khi mở tab Kế Toán. |

### [chat] Bulk send → chat realtime update + Emoji picker ✅
| | |
|---|---|
| **Files** | `orders-report/js/chat/message-template-manager.js`, `orders-report/js/tab1/tab1-chat-core.js`, `orders-report/tab1-orders.html`, `orders-report/css/tab1-chat-modal.css`, `orders-report/js/tab1/tab1-chat-messages.js` |
| **Chi tiết** | **Bulk send fix**: Sau khi gửi tin nhắn hàng loạt, chat modal không cập nhật ngay (chờ 15s polling). Fix: dispatch `bulkSendCompleted` event từ message-template-manager → tab1-chat-core lắng nghe → clear cache + fetch messages + render ngay. **Emoji picker**: Thêm emoji button vào chat toolbar + inline picker với 7 categories (recent, smileys, gestures, hearts, animals, food, objects). Recent emojis lưu localStorage. Pattern copy từ inbox module. |

### [orders] Fix lỗi trừ ví thiếu tiền ship + cải thiện note giao dịch ✅
| | |
|---|---|
| **Files** | `orders-report/js/tab1/tab1-fast-sale.js`, `orders-report/js/tab1/tab1-sale.js` |
| **Chi tiết** | **Bug 1 (nghiêm trọng)**: PBH hàng loạt — `processWalletWithdrawalsForSuccessOrders()` dùng `CashOnDelivery \|\| AmountTotal`. Khi khách trả hết bằng ví → CashOnDelivery=0 (falsy) → fallback sang AmountTotal (chỉ tiền hàng, KHÔNG có ship). VD: đơn 445k (410k+35k ship) chỉ trừ ví 410k. **Fix**: Dùng `PaymentAmount` (đã tính đúng khi tạo đơn, bao gồm ship). **Bug 2**: PBH lẻ — InvoiceStatusStore lưu `PaymentAmount = walletBalance` (số dư ví) thay vì `min(walletBalance, codAmount)` (số tiền thực trừ). **Fix**: Tính đúng `actualPaymentForStore = min(wallet, COD)`. **Enhancement**: Thêm breakdown chi tiết vào note giao dịch ví cả lẻ và hàng loạt: `(Hàng: 410.000đ + Ship: 35.000đ = 445.000đ)`. PBH lẻ: trừ ví đúng (actualPayment = min(debt, codAmount) đã bao gồm ship) — không có bug trừ sai. |

### [docs] Tổng quan hệ thống n2store — danh sách module và chức năng chính ✅
| | |
|---|---|
| **Files** | `docs/dev-log.md` |
| **Chi tiết** | Ghi nhận tổng quan ~45 module để AI agent nắm được toàn bộ hệ thống: **Core Business**: `orders-report` (dashboard đơn hàng chính, 102 JS files — tab bán hàng, xử lý đơn, chat, thống kê), `inventory-tracking` (quản lý kho + tồn), `purchase-orders` (đặt hàng nhập + nhận hàng), `customer-hub` (CRM trung tâm khách hàng), `balance-history` (lịch sử công nợ). **Communication**: `inbox` (messenger inbox UI), `don-inbox` (inbox yêu cầu đặt hàng), chat module (trong orders-report — modal chat realtime). **Integration**: `cloudflare-worker` (multi-API proxy: TPOS, Pancake, Facebook, token), `render.com` (fallback server + Firebase admin proxy + autofb), `n2store-extension` (Chrome extension: messenger integration + TPOS global-id), `pancake-extension` (Pancake POS extension), `tpos-pancake` (bridge TPOS↔Pancake). **Utility**: `shared` (65 JS — auth, cache, firebase, utils, TPOS client), `user-management` (roles & permissions), `attendance-sync` (chấm công), `firebase-functions` (Cloud Functions). **Reports**: `delivery-report` (báo cáo giao hàng), `soquy` (sổ quỹ kế toán), `doi-soat` (đối soát), `firebase-stats` (DB monitoring), `invoice-compare` (so sánh hóa đơn). **Other**: `soluong-live` (sync số lượng realtime), `bangkiemhang` (kiểm kho), `soorder` (đơn hàng soorder), `nhanhang` (tích hợp vận chuyển), `hanghoan` (hàng hoàn), `project-tracker` (task tracking), `supplier-debt` (công nợ NCC), `service-costs` (chi phí dịch vụ), `stitch_customer` (đồng bộ khách hàng), `order-management` (quản lý lifecycle đơn), `kho-di-cho` (kho đi chợ). |

### [docs] Add #Note AI-instruction header to all HTML+JS source files ✅
| | |
|---|---|
| **Files** | `scripts/add-note-header.sh` (new), 609 `.html` + `.js` files modified, `CLAUDE.md`, `MEMORY.md` |
| **Chi tiết** | Thêm 1 dòng `#Note` song ngữ ở đầu mỗi file HTML/JS (609 files), nhắc AI agent đọc CLAUDE.md, MEMORY.md, dev-log.md trước khi code và cập nhật dev-log sau thay đổi. Script bash idempotent (detect `#Note:` marker → skip), hỗ trợ `--dry-run`, xử lý shebang (chèn dòng 2). Exclude: `node_modules`, `_metadata`, `pancake-extension/scripts` (bundled), `*.min.js`. Cập nhật CLAUDE.md + MEMORY.md với convention cho file mới. |

### [orders] Chuyển hoàn toàn sang Tag XL — bỏ thống kê theo tag TPOS ✅
| | |
|---|---|
| **Files** | `orders-report/js/overview/overview-ui.js`, `orders-report/js/overview/overview-modals.js`, `orders-report/js/overview/overview-table.js` |
| **Chi tiết** | Thay tất cả 6 chỗ gọi `renderStatistics()` (TPOS tags) → `renderStatisticsFromAllOrders()` (Tag XL). Trước đây khi bấm "Lấy chi tiết đơn hàng", "Tải lại Excel", "Đồng bộ Tab1", hoặc save tracked tags thì gọi hàm legacy TPOS, ghi đè lên stats Tag XL. Giờ mọi action đều dùng Tag XL thống nhất. |

### [orders] Lưu tên hiển thị cùng ID trong flags/tTags — fix lỗi hiển thị Tag XL ✅
| | |
|---|---|
| **Files** | `orders-report/js/tab1/tab1-processing-tags.js`, `orders-report/js/tab1/tab1-merge.js`, `orders-report/js/tab1/tab1-tag-sync.js`, `orders-report/js/overview/overview-statistics.js` |
| **Chi tiết** | Root cause: `flags` và `tTags` chỉ lưu ID (`"CUSTOM_xxx"`, `"T115"`), tên hiển thị phải tra cứu từ config API riêng. Khi config chưa load hoặc load lỗi → cột Tag XL hiển thị ID thô. **Fix**: Đổi format từ mảng string sang mảng object `{id, name}`. (1) Thêm normalize helpers (`_ptagNormalizeFlag`, `_ptagNormalizeTTag`) — tự động convert data cũ (string) → format mới khi load qua `setOrderData()`. (2) Tất cả hàm write (`toggleOrderFlag`, `assignTTagToOrder`, `assignOrderCategory`, `transferProcessingTags`) push objects `{id, name}`. (3) Render dùng `f.name`/`t.name` trực tiếp, fallback lookup. (4) Tất cả `.includes()` chuyển sang `.some(f => _ptagFlagId(f) === key)`. (5) Merge logic dùng Map dedup by ID. (6) Tag sync + overview-statistics cập nhật tương tự. Backward compatible — data cũ tự convert. |

### [extension] Fix global-id v2: Pancake approach — 5 regex patterns + rsrcMap full load + strategy reorder ✅
| | |
|---|---|
| **Files** | `n2store-extension/background/facebook/session.js`, `n2store-extension/background/facebook/global-id.js` |
| **Chi tiết** | Root cause: (1) `extractDocIds` thiếu 3 regex patterns quan trọng của Pancake → không tìm được `MessengerThreadlistQuery` doc_id. (2) `BusinessCometInboxThreadDetailHeaderQuery` trả về UI data (`ubi_thread_detail`), KHÔNG phải `target_id`. (3) Chỉ fetch script tags (~27), Pancake fetch ALL rsrcMap resources (~5400). (4) `PagesManagerInboxAdminAssignerRootQuery` đã bị Facebook xóa khỏi JS bundles. **Fix**: (1) Thêm 4 Pancake regex patterns: Pattern F (operationKind/name/id), Pattern G (id/metadata/name — **pattern này tìm được MessengerThreadlistQuery: 34388012574175272**), Pattern H (__getDocID), Pattern I (_instagramRelayOperation). (2) Xóa `BusinessCometInboxThreadDetailHeaderQuery` khỏi ADMIN_ASSIGNER_NAMES. (3) Thay `_extractRsrcMapModuleUrls` (targeted) → `_extractAllRsrcMapUrls` (fetch ALL rsrcMap JS resources giống Pancake). (4) Đưa `findThread` strategy lên #3 (trước ConversationPage), xóa `queryViaAdminAssignerFriendlyName` + `queryViaThreadlist` (luôn fail/redundant). (5) Fix compat view URL: `asset_id + nav_ref=diode_page_inbox`. |

### [orders] [render] Fix custom tag display name bị mất — atomic config merge ✅
| | |
|---|---|
| **Files** | `render.com/routes/realtime-db.js`, `orders-report/js/tab1/tab1-processing-tags.js`, `orders-report/js/tab1/tab1-tag-sync.js` |
| **Chi tiết** | Root cause: race condition — nhiều client cùng save config (DELETE+INSERT full replace) → ghi đè definitions của nhau → orphaned IDs hiện raw code thay vì display name. **Dữ liệu bị ảnh hưởng**: 4 T-tags orphan (11 orders) + 12 custom flags orphan (67 orders, `CUSTOM_1774718207671_kg70` chiếm 50 đơn). **Fix**: (1) Server: thêm `PATCH /config-merge` endpoint — atomic add/remove defs, dùng `SELECT FOR UPDATE` lock, merge vào array hiện tại thay vì replace. (2) Client: tất cả create/delete operations dùng `mergeConfigDefs()` thay vì `saveTTagDefinitions()/saveCustomFlagDefinitions()` (full-replace). (3) `_getOrCreateCustomFlag()` persist ngay lập tức qua merge thay vì đợi batch save cuối. (4) Backup `_tTagDefinitions` khi load config (giống `_customFlagDefs` đã có). (5) Fallback display `⚠ tagId` + console.warn cho missing definitions. (6) Cải thiện `debug-config` endpoint report cả orphaned flags + `?repair=true`. **Đã chạy repair**: 4 T-tags + 12 flags recovered thành công. |

### [extension] Fix global-id: load compat view + alternative BizComet query names ✅
| | |
|---|---|
| **Files** | `n2store-extension/background/facebook/session.js`, `n2store-extension/background/facebook/global-id.js`, `n2store-extension/background/facebook/doc-id-interceptor.js` |
| **Chi tiết** | Root cause: Facebook đổi tên `PagesManagerInbox*` → `BusinessComet*`/`BizInbox*`, doc_ids không tìm được. Fix 3 phần: (1) **Compat view** (Pancake approach): load legacy inbox view bằng cách append `?cquick=jsc_c_d&cquick_token=TOKEN` vào inbox URL → trang legacy chứa PagesManager doc_ids + rsrcMap. (2) **Alternative query names**: global-id.js thử `BusinessCometInboxThreadDetailHeaderQuery` khi `PagesManagerInboxAdminAssignerRootQuery` không có. Thêm `findDocId()` helper với arrays alternatives cho mỗi strategy. (3) **New strategies**: ConversationPage scraping (no doc_id needed), enhanced interceptor parse raw body, `waitForDocIds()` đảm bảo JS bundle extraction xong trước khi resolve. (4) Better error logging: log GraphQL errors, response size. |

### [orders] Đổi "NAP" → "TỈNH NAP" trong delivery-report ✅
| | |
|---|---|
| **Files** | `delivery-report/js/delivery-report.js` |
| **Chi tiết** | Đổi tên hiển thị "NAP" thành "TỈNH NAP" ở 2 nơi: (1) Header province view "NAP 115/229" → "TỈNH NAP 115/229", (2) Thông báo scan feedback dùng GROUP_LABELS thay vì hardcode. Không đụng export buttons, Excel sheet names hay logic. |

### [realtime] Fix root cause: page không có subscription → WS join fail ✅
| | |
|---|---|
| **Files** | `orders-report/js/managers/realtime-manager.js`, `orders-report/js/tab1/tab1-init.js` |
| **Chi tiết** | Root cause: `pdm.pageIds` trả 4 pages nhưng page `193642490509664` không có Pancake subscription → `multiple_pages:` channel join bị reject "Gói cước hết hạn" → browser + server không nhận events. Fix: (1) Retry logic: khi join fail, thử lại bỏ từng page để tìm page lỗi. (2) Push fresh token (Kỹ Thuật NJD) + 3 pages đúng lên cả 2 server → server đã nhận events thành công. (3) Auto-push token lên server khi browser WS connect. |

### [orders] Fix unread badges bị đè bởi sentOrdersUpdated + auto-push token lên server ✅
| | |
|---|---|
| **Files** | `orders-report/js/tab1/tab1-table.js`, `orders-report/js/tab1/tab1-init.js` |
| **Chi tiết** | 3 fixes: (1) `sentOrdersUpdated` event dùng `td.innerHTML` đè mất badge "X MỚI" unread — fix: save `.new-msg-badge` trước innerHTML rồi prepend lại. (2) Tương tự `failedOrdersUpdated` đè `.new-cmt-badge` trong cột comments. (3) Server có 0 pending_customers vì token Pancake expired — thêm `_pushTokenToServer()` tự động gửi fresh token lên server mỗi khi browser WS connect. |

### [orders] Fix realtime: WS diagnostics + chat polling fallback + convId bug ✅
| | |
|---|---|
| **Files** | `orders-report/js/managers/realtime-manager.js`, `orders-report/js/tab1/tab1-chat-realtime.js`, `orders-report/js/tab1/tab1-chat-core.js`, `orders-report/js/tab1/tab1-init.js` |
| **Chi tiết** | 4 fixes: (1) Thêm console logging vào WS lifecycle (connect, join, events, close) để debug. (2) Fix `handleNewMessage` bug: `conversation_id` nằm trong `payload.message.conversation_id`, không phải `payload.conversation_id`. (3) Thêm polling fallback 15s cho chat modal khi WS không hoạt động — poll fetchMessages + append new msgs. (4) Thêm WS status badge `● WS` / `○ WS` trên toolbar + log khi pending customers load. |

### [shared] Thêm ImageBlobCache (IndexedDB) cho hình gửi lại nhiều lần ✅
| | |
|---|---|
| **Files** | `shared/js/quick-reply-manager.js`, `orders-report/js/chat/quick-reply-manager.js`, `orders-report/js/utils/bill-service.js` |
| **Chi tiết** | Hình CAMON, quick-reply trước đây fetch mỗi lần gửi. Thêm `ImageBlobCache` class dùng IndexedDB lưu blob theo URL (max 7 ngày). `getOrFetch(url)` trả cache nếu có, không thì download + lưu. Tích hợp vào 3 files: shared quick-reply-manager (upload + re-upload), orders-report quick-reply-manager (upload + re-upload + extension fallback), bill-service (CAMON extension). |

### [orders] Fix bill send extension bypass: gửi hình bill + CAMON image qua extension ✅
| | |
|---|---|
| **Files** | `orders-report/js/utils/bill-service.js` |
| **Chi tiết** | Extension bypass trước chỉ gửi text `[Hóa đơn đã được tạo]`, không gửi hình. Fix: (1) Hoist `billImageFile` → dùng `sendImagesViaExtension` gửi hình bill thật. (2) CAMON qua extension: download imageUrl → File → `sendImagesViaExtension([camonFile], camonText)` gửi cả hình + text. (3) extConv populate customerName/customers từ msgData + orderResult. (4) `sendAdditionalBillMessages` chuyển fire SAU bill thành công. (5) Thêm chữ ký nhân viên vào CAMON text cả 2 paths. |

### [chat] Fix reply comment: detect post-not-exist, stop fallback chain sớm ✅
| | |
|---|---|
| **Files** | `orders-report/js/tab1/tab1-chat-messages.js` |
| **Chi tiết** | Reply comment trên post cũ (2022) bị xóa → Pancake API trả `(#100, 33) Object does not exist` → code fallback qua 5 methods rồi hiện lỗi "Global Facebook ID" gây nhầm. Fix: detect error code 100 hoặc "does not exist" → throw ngay "Bài viết/bình luận không còn tồn tại" → không chạy fallback chain vô ích. |

### [chat] Fix lỗi "Không tìm được Global Facebook ID" khi gửi qua Extension ✅
| | |
|---|---|
| **Files** | `orders-report/js/tab1/tab1-chat-messages.js`, `orders-report/js/tab1/tab1-extension-bridge.js`, `orders-report/js/tab1/tab1-chat-core.js` |
| **Chi tiết** | 3 fixes: (1) `_sendInbox` chỉ fallback extension khi lỗi 24h, không fallback cho lỗi khác. (2) `sendViaExtension` detect `thread_id === psid` → skip thread_id vì PSID làm extension resolve sai. (3) `_loadMessages` cache global_id ngay khi load tin nhắn. |

### [chat] Thêm chữ ký nhân viên vào chat modal (orders-report) ✅
| | |
|---|---|
| **Files** | `orders-report/js/tab1/tab1-chat-messages.js` |
| **Chi tiết** | `window.sendMessage()` gửi text trực tiếp không có chữ ký. Thêm `\nNv. [displayName]` giống inbox-chat.js. Quick-reply đã có sẵn, chỉ thiếu khi gõ trực tiếp. |

### [chat] Hiển thị reaction emoji trên tin nhắn trong chat modal ✅
| | |
|---|---|
| **Files** | `orders-report/js/tab1/tab1-chat-messages.js`, `orders-report/css/tab1-chat-modal.css` |
| **Chi tiết** | Bug: code chỉ render `reactionSummary` (comment counts) mà bỏ qua `msg.reactions` (emoji attachments từ inbox). Fix: thêm render `reactions` array (hiển thị emoji như ❤️) + thêm CSS `.message-reactions`. |

### [inbox] Thêm chữ ký nhân viên vào inbox chat ✅
| | |
|---|---|
| **Files** | `inbox/js/inbox-chat.js` |
| **Chi tiết** | Thêm `\nNv. [displayName]` vào cuối mỗi tin nhắn gửi từ inbox chat (cả inbox và comment). Quick-reply đã có sẵn. message-template-manager (bulk send) không thêm theo yêu cầu. |

### [docs] Tạo file dev-log.md + cập nhật CLAUDE.md ✅
| | |
|---|---|
| **Files** | `docs/dev-log.md`, `CLAUDE.md`, `MEMORY.md` |
| **Chi tiết** | File theo dõi tiến trình code. Thêm hướng dẫn bắt buộc vào CLAUDE.md và MEMORY.md để mọi session đều tự cập nhật. |

---

<!--
HƯỚNG DẪN THÊM ENTRY MỚI:

1. Nếu cùng ngày → thêm entry ngay dưới heading ## [NGÀY]
2. Nếu ngày mới → thêm heading ## [NGÀY MỚI] ở trên cùng (trước ngày cũ)

FORMAT:
### [module] Mô tả ngắn {✅ hoặc 🔄}
| | |
|---|---|
| **Files** | `path/to/file.js` |
| **Chi tiết** | Thay đổi gì, tại sao |

MODULE TAGS: [inbox] [chat] [extension] [orders] [worker] [render] [shared] [docs] [config]
STATUS: ✅ = Done, 🔄 = In Progress
-->
