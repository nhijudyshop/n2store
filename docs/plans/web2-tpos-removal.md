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

## PHASE C — Build thay thế Pancake (LỚN, scope riêng, defer)

Chỉ làm khi quyết tâm cắt TPOS triệt để. Các khoảng trống:

- **C1. SSE realtime live comments** thay TPOS `/facebook/comments/stream` — build Pancake/FB Graph webhook hoặc polling + SSE hub Web 2.0.
- **C2. livevideo thumbnail** — nguồn thay (FB Graph picture đã 400; cần giải pháp khác).
- **C3. FB Page list + live videos** discovery qua Pancake (thay `GetAllFacebook` + `facebook-graph/livevideo`).
- **C4. Thống nhất campaign id** toàn Web 2.0 (đồng bộ tpos-pancake + live-campaign).
- **C5. Quyết định 2-way customer write** sang TPOS (business: TPOS có còn là kho KH chính không?).

**Effort:** lớn (nhiều phiên). **Rủi ro:** cao (chạm chat/realtime/livestream live).

---

## Khuyến nghị thứ tự

1. **Phase A** ngay (safe, dọn rác + customer-read warehouse).
2. **Phase B** sau khi chốt B3 (campaign-id strategy).
3. **Phase C** chỉ khi user xác nhận đầu tư build Pancake replacement (lớn).

## Dẫn chứng research

- tpos-pancake: `js/tpos/tpos-api.js`, `tpos-init.js`, `tpos-realtime.js:59`, `tpos-partner-fallback.js`, `tpos-kho-enricher.js`, `tpos-native-orders-api.js:5-8`, `tpos-livestream-snap.js:77-81`; `web2/shared/web2-chat-client.js:373-468`; `index.old.html` vs `index.html`.
- live-campaign: `js/live-campaign-api.js:14,77-228`, `js/live-campaign-app.js:84,334-464`; route `/api/native-orders/load` (web2Db).
