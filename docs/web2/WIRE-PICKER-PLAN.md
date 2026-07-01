<!-- #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. | WEB2.0 plan doc — wire Web2CampaignPicker vào các trang PBH. -->

# Kế hoạch: Wire Web2CampaignPicker vào Bán hàng HĐ / Đối soát / Phiếu giao

> Mục cuối của overhaul chiến dịch (4/5 mục đã xong: #2, H4/MP1/CAMP-1, #1+Web2CampaignManager, KPI-2PAGE-1). Tách ra plan để phiên mới làm 1 lượt sạch (context phiên trước đã sâu). **2026-07-01.**

## Nuance QUAN TRỌNG (đã điều tra — đừng rediscover)

- Picker `onChange(sel)` trả `{ campaignId, campaign, postIds }`.
    - `campaignId` = **PARENT campaign id** (`web2_campaigns.id`, INTEGER).
    - `postIds` = mảng `fb_post_id` (Facebook_LiveId) của các bài gán vào chiến dịch cha.
- **native-orders** lọc `fb_post_id = ANY(postIds)` (đã wire — mẫu ở `native-orders-filters-campaigns.js`).
- **fast_sale_orders KHÔNG có `fb_post_id`** — chỉ có `source_code` (→ `native_orders.code`) + `live_campaign_id` (= `camp.Id` per-post Pancake, **KHÁC** `fb_post_id` = `Facebook_LiveId`). ⇒ KHÔNG lọc PBH bằng postIds/live_campaign_id trực tiếp.
- **CÁCH ĐÚNG cho trang PBH** (fast_sale_orders): lọc qua PARENT campaign id + subquery source_code:
    ```sql
    source_code IN (SELECT code FROM native_orders WHERE parent_campaign_id = $N)
    ```
    1 param (INTEGER), cross-page ĐÚNG (span 2 page qua parent). ⚠ Merged PBH `source_code='A+B'` sẽ miss — chấp nhận (giống KPI scope subquery, `fast-sale-orders.js:1294`).

## Recipe chung (mỗi trang)

**Frontend:**

1. `index.html`: thêm `<div id="<x>CampaignPicker"></div>` vào toolbar + load 2 script TRƯỚC app:
    ```html
    <script src="../shared/web2-campaign.js?v=20260701"></script>
    <script src="../shared/web2-campaign-picker.js?v=20260701"></script>
    ```
2. App JS `init()`:
    ```js
    window.Web2CampaignPicker.mount(document.getElementById('<x>CampaignPicker'), {
        storageKey: '<page-name>',
        onChange(sel) {
            STATE.campaignId = (sel && sel.campaignId) || null;
            reload();
        },
    });
    ```
3. API layer: thêm `campaignId` vào query khi `STATE.campaignId` set.

**Backend** (list handler): nếu `req.query.campaignId` → `params.push(Number(campaignId)); conds.push('source_code IN (SELECT code FROM native_orders WHERE parent_campaign_id = $'+params.length+')')`.

## 3 trang cụ thể

### 1. Đối soát — `web2/reconcile/` ✅ ĐÃ XONG (2026-07-01, mẫu cho 2 trang còn lại)

- Backend: `reconcile.js` `GET /list` — thêm `campaignId` filter `source_code IN (SELECT code FROM native_orders WHERE parent_campaign_id = $N)`.
- Frontend: `index.html` `<div id="rcCampaignPicker">` sau `.rc-search-input` + load `web2-campaign.js`+`web2-campaign-picker.js`; `reconcile-app.js` `mountCampaignPicker()` (onChange → STATE.campaignId → loadList); `reconcile-api.js` `q.set('campaignId', STATE.campaignId)`; `reconcile-state.js` `campaignId:null`.
- Verify ✅: picker mount, 0 console error, `/api/reconcile/list?state=pending&campaignId=6`.

### 2. Bán hàng HĐ (PBH) — ⚠ TÌM FRONTEND TRƯỚC

- `web2/fast-sale-orders/` **KHÔNG tồn tại**. Tìm trang liệt kê PBH thật (grep `fast-sale-orders/list` hoặc `/api/fast-sale-orders` trong `web2/**/*.js`, hoặc trong `native-orders` tab). Có thể PBH list nằm trong 1 tab của trang khác.
- Backend: `render.com/routes/fast-sale-orders.js` `GET /` list handler (line ~727, `const { state, search, customerId } = req.query`) — thêm campaignId filter vào `conds`.

### 3. Phiếu giao — `delivery-report/` (Web 1.0-style path, không phải web2/)

- Backend: `render.com/routes/delivery-invoices.js` — list join `fast_sale_orders`. Lọc qua `fso.source_code IN (SELECT code FROM native_orders WHERE parent_campaign_id = $)` (alias theo query).
- Frontend: `delivery-report/index.html` header + `delivery-report/js/`. Load picker script (path `../web2/shared/...` vì ở root level).

## Verify (mỗi trang)

- Browser-test (localhost admin, `--start web2/overview`): mount picker → chọn chiến dịch → list lọc đúng (chỉ đơn thuộc parent), 0 console error.
- Postgres: `source_code IN (SELECT code FROM native_orders WHERE parent_campaign_id = $)` trả đúng PBH cross-page.

## Sau khi xong

- Cập nhật `docs/web2/WEB2-PAGES-ANALYSIS.md` (nếu có mục liên quan) + `docs/dev-log.md`.
- Xóa file plan này (đã hoàn tất).
