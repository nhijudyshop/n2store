<!-- #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | WEB2.0 plan — gỡ TPOS khỏi tpos-pancake + live-campaign. -->

# PLAN — Gỡ phụ thuộc TPOS khỏi tpos-pancake + live-campaign

> Ngày: 2026-06-07. Tiền đề: kho KH warehouse `web2_customers` đã xong (Phase 1/3), độc lập TPOS.
> Trạng thái: **RESEARCH XONG (2 agent map coupling). Chờ user duyệt scope thực thi.**

---

## 0. Sự thật phải nắm (kết quả research 2026-06-07)

**"469 call sites TPOS" bị thổi phồng bởi CODE CHẾT.**

- `tpos-pancake/index.old.html` + 9 file monolith cũ (`tpos-chat.js`, `pancake-chat.js`, `pancake-data-manager.js`, `script.js`, `realtime-manager.js`, `tpos-realtime-manager.js`, top-level `tpos-token-manager.js`/`pancake-token-manager.js`, `debug-realtime.js`) = **~236 ref TPOS chết** (chỉ `index.old.html` load, không phải trang thật).
- Code ACTIVE (`index.html` modular `js/tpos/*` + `js/pancake/*`): chỉ **~21 lệnh gọi `TposApi.*` thật** vs **44 Pancake**.
- **Chat/tin nhắn ĐÃ 100% Pancake** (`web2/shared/web2-chat-client.js` không gọi TPOS dòng nào). Tạo đơn đã off-TPOS (vào PostgreSQL `native_orders`).

**TPOS còn lại trong tpos-pancake (active) = 1 cột "xem comment livestream":**

| Nhóm                                                   | Lệnh         | Gỡ được?                                                                                             |
| ------------------------------------------------------ | ------------ | ---------------------------------------------------------------------------------------------------- |
| Customer lookup read (`chatomni/info`)                 | 4            | ✅ DỄ — warehouse đã có fallback chạy song song (`tpos-partner-fallback.js`, `tpos-kho-enricher.js`) |
| Live ingestion (CRM teams→campaigns→comments→SSE)      | ~17 (55%)    | ❌ KHÓ — SSE realtime comment chưa có thay thế Pancake                                               |
| Partner write 2-way (UpdateStatus/CreateUpdatePartner) | 4            | ⚠ Business call — TPOS là kho KH chính của shop                                                      |
| livevideo thumbnail                                    | (trong snap) | ❌ FB Graph picture đã 400 → buộc dùng TPOS `video.thumbnail.url`                                    |

**live-campaign:**

- ~80% = CRUD `SaleOnline_LiveCampaign` → ✅ thay được bằng bảng web2 riêng.
- Excel đã off-TPOS (build client-side từ `native_orders`).
- ❌ 2 dropdown trong modal: FB Page list (`GetAllFacebook`) + live videos (`facebook-graph/livevideo`) — chưa có nguồn Pancake thay.
- ⚠ `campaign id` hiện do TPOS sinh, dùng chung bởi `tpos-pancake` khi ghi `native_orders.live_campaign_id` → đổi nguồn sinh id phải đồng bộ cả 2 nơi.

→ **Gỡ TPOS HOÀN TOÀN: KHÔNG khả thi ngay.** Vướng 3 thứ chưa có thay thế: (1) SSE realtime live comments, (2) livevideo thumbnail, (3) FB page/live discovery. Đây là build infra lớn (Pancake webhook/polling), scope riêng.

---

## PHASE A — Safe wins (làm ngay, KHÔNG rủi ro chat/PBH live)

**A1. Dọn code chết tpos-pancake** (giảm ~236 ref TPOS giả, hết confuse audit sau):

- Xác minh `index.old.html` thật sự không được link/dùng (grep references + so với `index.html`).
- Xóa `index.old.html` + 9 file monolith chết nếu confirmed orphan.
- Rủi ro: thấp (chỉ xóa file không load). Verify: smoke `index.html` sau xóa.

**A2. tpos-pancake: customer-read → warehouse PRIMARY**:

- Hiện `chatomni/info` (TPOS) là primary, warehouse là fallback. Đảo lại: warehouse `web2_customers` primary, TPOS chỉ fallback (hoặc bỏ hẳn nếu warehouse đủ).
- File: `tpos-customer-panel.js`, `tpos-comment-list.js` (showPancakeCustomerInfo `:1480-1519`), `tpos-partner-fallback.js`.
- Rủi ro: thấp (fallback đã chạy song song, chỉ đổi thứ tự ưu tiên).

**Effort:** nhỏ. **Giá trị:** dọn rác + KH đọc từ warehouse (đúng hướng độc lập TPOS).

---

## PHASE B — live-campaign CRUD → Web 2.0 (self-contained, medium)

**B1. Backend**: bảng `web2_live_campaigns` (web2Db) + route `/api/web2-live-campaigns` (CRUD + setActive) + SSE `web2:live-campaigns`. Schema phẳng: id, name, note, is_active, config JSONB, fb_page_id, fb_live_id, date_created, history, created_at, updated_at.

**B2. Frontend**: `live-campaign-api.js` 6 method (list/getOne/create/update/delete/setActive) → trỏ route mới. Excel giữ nguyên (đã off-TPOS).

**B3. Quyết định campaign-id** (⚠ cần chốt trước khi làm):

- Option 1: live-campaign sinh id riêng Web 2.0 → PHẢI đổi `tpos-pancake` (snap/comment-list) sinh+gắn id Web 2.0 vào `native_orders.live_campaign_id` (nếu không Excel-theo-chiến-dịch lệch id).
- Option 2: giữ id TPOS làm khóa (import campaign từ TPOS 1 lần) → ít phá vỡ nhưng vẫn dính TPOS id.

**B4. 2 dropdown modal (Page + Live video)**: tạm GIỮ TPOS hoặc làm optional cho tới khi có nguồn Pancake (Phase C).

**Effort:** trung bình. **Rủi ro:** trung bình (campaign-id desync — cần chốt B3).

---

## PHASE C — Build thay thế Pancake/FB Graph (RESEARCH 2026-06-07: ĐỀU KHẢ THI ✅)

> **Mấu chốt:** `page.settings.page_access_token` lấy từ Pancake `/v1/pages` (đã có `PancakeAPI.fetchPages()`) **CHÍNH LÀ FB page access token thật** → gọi thẳng FB Graph cho live_videos/thumbnails/comments, KHÔNG cần TPOS làm trung gian token. TPOS bên trong cũng chỉ poll FB Graph rồi proxy ra → ta tái tạo 1-1.

- **C3. FB Page list** ✅ ĐÃ XONG sẵn: `PancakeAPI.fetchPages()` → `pages.fm/api/public_api/v1/pages` trả `categorized.activated[]` + `settings.page_access_token`. Chỉ cần adapter thay `CRMTeam/GetAllFacebook`.
- **C2. Livestream discovery + thumbnail** ✅ FB Graph thuần:
    - `GET /v21.0/{pageId}/live_videos?fields=id,status,title,permalink_url,creation_time,broadcast_start_time,video{id}&limit=20`
    - Thumbnail ĐÚNG (thay `/picture` 400): `GET /v21.0/{videoId}/thumbnails?fields=uri,is_preferred,width` → lấy `is_preferred`. Dùng Graph **batch** tránh N+1. Cache URI (signed CDN, expire).
- **C1. Realtime live comments** ✅ FB Graph polling (= cách TPOS làm bên trong):
    - `GET /v21.0/{liveVideoId}/comments?order=reverse_chronological&live_filter=no_filter&fields=id,from{id,name},message,created_time,parent{id}&since=<ts>`
    - Server poll 2-3s/live (1 poller/page, KHÔNG per-client), dedupe theo `id` → đẩy qua **SSE hub Web 2.0 sẵn có** (topic `web2:livestream:<id>`). Live xong (VOD) → poll `/{postId}/comments`.
    - Nâng cao (sau): FB Webhook `feed` (push thật, cần App review).
- **C4. Thống nhất campaign id** — đồng bộ tpos-pancake + live-campaign khi sinh `native_orders.live_campaign_id`.
- **C5. 2-way customer write** sang TPOS — business decision (TPOS còn là kho KH chính?).

**Recipe build (backend Render, additive — KHÔNG phá path TPOS cũ):** route mới `routes/web2-fb-live.js`:

- `GET /api/web2-fb-live/pages` (proxy Pancake fetchPages → flat list)
- `GET /api/web2-fb-live/videos?pageId=` (FB Graph live_videos + thumbnails batch)
- `GET /api/web2-fb-live/comments/stream?pageId=&liveVideoId=` (SSE, poll FB Graph)
  Token: lấy `page_access_token` từ Pancake token manager server-side.

**Nguồn:** FB Graph [Page Live Videos](https://developers.facebook.com/docs/graph-api/reference/page/live_videos/), [Live Video Comments](https://developers.facebook.com/docs/graph-api/reference/live-video/comments/), [Video Thumbnail](https://developers.facebook.com/docs/graph-api/reference/video-thumbnail/), [Page Webhooks](https://developers.facebook.com/docs/graph-api/webhooks/reference/page/). Pancake `pages.fm/api/public_api/v1`.

**Effort:** lớn (nhiều phiên — backend routes + rewire frontend tpos-pancake live column + live-campaign). **Rủi ro:** trung bình (backend additive an toàn; rewire frontend live chạm UI live).

---

## ⚠ Ràng buộc thứ tự PHÁT HIỆN khi đọc code (2026-06-07)

- **A2 (customer-read → warehouse primary) PHỤ THUỘC warehouse đã có data.** Hiện `web2_customers` RỖNG (beta vừa deploy) → nếu đặt warehouse primary ngay sẽ KHÔNG có info KH cho tới khi **Phase 4 (Pancake ingest)** đổ data vào. ⇒ **Phase 4 phải trước A2.**
- Hiện trong tpos-pancake comment list, "customer read" có 3 tầng: (1) `chatomni/info` TPOS (primary), (2) `TposPartnerFallback`→`PartnerCustomerApi.listByPhones` = **TPOS OData** (không phải warehouse!), (3) `TposKhoEnricher`→`/api/v2/customers/batch` = **Web 1.0 `customers`** (không phải `web2_customers`). ⇒ A2 thực chất = thêm tầng warehouse-by-fbid (cần endpoint batch-by-fbid trên `/api/web2/customers`) + bỏ dần 2 tầng TPOS.

## Khuyến nghị thứ tự (CẬP NHẬT)

1. ✅ **Phase A1** (dọn code chết) — XONG 2026-06-07.
2. **Phase C-backend** (additive, an toàn): build `web2-fb-live.js` (FB Graph live_videos/thumbnails/comments qua page_access_token Pancake) + CF worker FB-Graph proxy trực tiếp. KHÔNG phá path TPOS cũ.
3. **Phase 4 ingest** (Pancake/FB → `web2_customers` upsert) — đổ data vào warehouse.
4. **A2** customer-read warehouse primary (sau khi #3 có data).
5. **Phase B** live-campaign CRUD → web2 (chốt campaign-id B3).
6. **Frontend rewire** tpos-pancake live column TPOS→FB Graph (rủi ro cao nhất, cuối cùng).

## Dẫn chứng research

- tpos-pancake: `js/tpos/tpos-api.js`, `tpos-init.js`, `tpos-realtime.js:59`, `tpos-partner-fallback.js`, `tpos-kho-enricher.js`, `tpos-native-orders-api.js:5-8`, `tpos-livestream-snap.js:77-81`; `web2/shared/web2-chat-client.js:373-468`; `index.old.html` vs `index.html`.
- live-campaign: `js/live-campaign-api.js:14,77-228`, `js/live-campaign-app.js:84,334-464`; route `/api/native-orders/load` (web2Db).
