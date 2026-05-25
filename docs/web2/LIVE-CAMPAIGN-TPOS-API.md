# Live Campaign — TPOS API Reference (2-way Sync)

> **Web 2.0 module — đồng bộ 2 chiều với TPOS.** Trang `web2/live-campaign/` gọi
> trực tiếp các endpoint TPOS qua Cloudflare Worker proxy (`/api/odata/*` →
> `https://tomato.tpos.vn/odata/*`). Không có lưu local — mọi mutation đi thẳng
> TPOS, list cũng load realtime từ TPOS.

Mục tiêu: clone 100% UI + chức năng trang
`https://tomato.tpos.vn/#/app/saleOnline/liveCampaign/list`.

---

## 1. Entity schema — `SaleOnline_LiveCampaign`

Capture từ live record (id `7de71c5b-b847-953f-5ba9-3a215f8d0122`, "HOUSE 22/05/2026"):

```json
{
    "Id": "7de71c5b-b847-953f-5ba9-3a215f8d0122",
    "Name": "HOUSE 22/05/2026",
    "NameNoSign": "HOUSE 22/05/2026",
    "Facebook_UserId": "117267091364524",
    "Facebook_UserName": "Nhi Judy House",
    "Facebook_UserAvatar": "",
    "Facebook_LiveId": "117267091364524_1003485565460369",
    "Note": null,
    "IsActive": true,
    "DateCreated": "2026-05-22T08:50:08.163+07:00",
    "LastUpdated": null,
    "ResumeTime": null,
    "StartDate": null,
    "EndDate": null,
    "ConfirmedOrder_TemplateId": null,
    "Preliminary_TemplateId": null,
    "SendOrderConfirmedOrderTemplateId": null,
    "SendOrderPreliminaryTemplateId": null,
    "Config": "Draft", // raw enum: Draft | …
    "ShowConfig": "Nháp", // Vietnamese label of Config
    "MinAmountDeposit": 0,
    "MaxAmountDepositRequired": 0,
    "EnableQuantityHandling": null,
    "IsAssignToUserNotAllowed": null,
    "SumQtyInCart": 0, // counters (read-only)
    "SumQtyWaitCheckOut": 168.0,
    "SumQtyCheckOut": 0,
    "SumCancelCheckout": 0,
    "SumOrderWaitCheckOut": 86,
    "SumOrderCheckOut": 0,
    "SumOrderCancelCheckOut": 0,
    "IsShift": null,
    "IsEnableAuto": null,
    "IsApplyQuantityLiveCampaign": null,
    "ChatomniObject": null
}
```

Field semantics (best guess from UI / existing N2Store code):

| Field                 | UI label                  | Notes                                               |
| --------------------- | ------------------------- | --------------------------------------------------- |
| `Id`                  | —                         | UUID, không sửa được                                |
| `Name` (required)     | Tên                       | Unique — TPOS trả 400 nếu trùng                     |
| `Facebook_UserName`   | Facebook                  | Tên page Facebook (vd "Nhi Judy House")             |
| `Facebook_UserId`     | —                         | Page ID (numeric)                                   |
| `Facebook_LiveId`     | Live                      | Định dạng `{pageId}_{liveVideoId}`                  |
| `Note`                | Ghi chú                   | Free text                                           |
| `IsActive`            | Hoạt động                 | Toggle bật/tắt (default `true`)                     |
| `DateCreated`         | Ngày tạo                  | ISO 8601 + TZ                                       |
| `Config`/`ShowConfig` | (status badge)            | "Draft" → "Nháp" — TPOS chưa expose enum khác       |
| `Sum*` fields         | (counters)                | TPOS tự tính từ orders, read-only                   |
| `Details`             | Sản phẩm trong chiến dịch | Array `SaleOnline_LiveCampaign_Detail` (skip ở MVP) |

---

## 2. Endpoints (verified 2026-05-25)

Base: `https://chatomni-proxy.nhijudyshop.workers.dev/api/odata` → forwarded to
`https://tomato.tpos.vn/odata`. Mọi request cần header `Authorization: Bearer
<JWT>` (lấy qua `window.tokenManager`).

### 2.1 List

```
GET /api/odata/SaleOnline_LiveCampaign
    ?$top=20
    &$skip=0
    &$orderby=DateCreated desc
    &$count=true
    &$filter=<expr>
```

Filter examples:

- Active only: `IsActive eq true`
- Search by name: `contains(Name,'STORE')`
- Date range: `DateCreated ge 2026-05-01T00:00:00%2B07:00 and DateCreated le 2026-05-25T23:59:59%2B07:00`

Response:

```json
{
  "@odata.context": "...",
  "@odata.count": 46,
  "value": [ {...record}, ... ]
}
```

> TPOS web app dùng URL ngắn gọn `/odata/SaleOnline_LiveCampaign?$top=20&$orderby=DateCreated+desc&$count=true`
> (POST không cần). Cũng có endpoint legacy `/odata/SaleOnline_LiveCampaign/ODataService.GetAvailables` trả
> subset (subset 12 trường, không filter được). Trang dùng endpoint base để có full schema + filter.

### 2.2 Get one

```
GET /api/odata/SaleOnline_LiveCampaign({Id})
```

### 2.3 Create

```
POST /api/odata/SaleOnline_LiveCampaign
Content-Type: application/json;odata.metadata=minimal

{
  "Name": "TEST-WEB2-...",
  "Note": "Optional",
  "IsActive": true,
  "Details": []
}
```

Response: 200 OK với full record (kèm `Id`).

Lỗi 400 `BusinessException` "Tên chiến dịch đã tồn tại" nếu name trùng.

### 2.4 Update

```
PUT /api/odata/SaleOnline_LiveCampaign({Id})
Content-Type: application/json;odata.metadata=minimal

{ <full record body, không có @odata.* keys> }
```

Response: 204 No Content.

> **QUAN TRỌNG**: TPOS yêu cầu **full body** (tất cả các field trừ `@odata.context`).
> PATCH (partial update) trả 500 `DbUpdateException`. Cách dùng đúng: GET record →
> mutate fields → PUT lại.

### 2.5 Delete

```
DELETE /api/odata/SaleOnline_LiveCampaign({Id})
```

Response: 204 No Content. Sau khi delete, GET trả 400 `DataNotFound`.

### 2.6 Excel export — orders per campaign

```
POST /api/SaleOnline_Order/ExportFile?campaignId={Id}&sort=date
Content-Type: application/json

{ "data": "{}" }
```

Response: nếu chiến dịch có order → 200 binary Excel (`application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`).
Nếu chưa có order → 500 HTML error page.

> `data` là JSON string của filter rỗng `{}` (mặc định export hết). Có thể truyền filter
> trong tương lai nếu cần slice.

### 2.7 Suggest users (cho field "Nhân viên chốt đơn")

```
GET /api/odata/ApplicationUser?$orderby=Name+asc&$filter=Active+eq+true&$format=json&$count=true
```

Trả danh sách user `[{Id, Name, Email, ...}]`. MVP có thể skip.

---

## 3. UI columns (TPOS-clone)

Header bảng (verified qua DOM):

| #   | Cột       | Field               | Render                                             |
| --- | --------- | ------------------- | -------------------------------------------------- |
| 1   | Tên       | `Name`              | text, link tới detail                              |
| 2   | Facebook  | `Facebook_UserName` | avatar + tên page                                  |
| 3   | Live      | `Facebook_LiveId`   | text, monospace                                    |
| 4   | Ghi chú   | `Note`              | text, truncate                                     |
| 5   | Excel     | (action)            | nút "Tải về" → POST `/SaleOnline_Order/ExportFile` |
| 6   | Hoạt động | `IsActive`          | toggle switch                                      |
| 7   | Ngày tạo  | `DateCreated`       | format `DD/MM/YYYY HH:mm`                          |
| 8   | Thao tác  | —                   | dropdown: Sửa, Xóa                                 |

Top bar:

- Breadcrumb: `App / Sale Online / Chiến dịch Live / Tất cả`
- Buttons: `+ Thêm`, `Lọc` (mở filter panel), `Apply`, `Close`
- Filter panel: search by name, status (Tất cả / Đang hoạt động / Ngưng), date range, page filter

Pagination: `$top=20` mặc định, hiển thị total từ `@odata.count`.

---

## 4. Form "Thêm chiến dịch" (verified)

Route TPOS: `#/app/saleOnline/liveCampaign/create` (separate page).
Trong Web 2.0 → render modal dialog cho gọn.

Fields:

- **Tên** (`vm.model.Name`) — text, required
- **Nhân viên chốt đơn** (`vm.model.AssignedUsers`) — multi-select user list (MVP skip)
- **Ghi chú** (`vm.model.Note`) — textarea

Actions: **Lưu** (POST), **Trở lại** (cancel).

Buttons "Lưu" → POST tới `/odata/SaleOnline_LiveCampaign`.

---

## 5. Safety / nondestructive policy

- Trang Web 2.0 KHÔNG được xóa hoặc đổi tên campaigns đã tồn tại trừ khi user click rõ ràng.
- Toggle `IsActive` cho phép — không destructive (chỉ ẩn khỏi list `Active=true`).
- Delete campaign chỉ kích hoạt nếu user double-confirm.
- Test campaign convention: prefix `TEST-` (matches CLAUDE.md test data rule). Cleanup script:
    ```bash
    curl -X DELETE "https://chatomni-proxy.nhijudyshop.workers.dev/api/odata/SaleOnline_LiveCampaign({Id})" \
         -H "Authorization: Bearer $TOKEN"
    ```

---

## 6. References

- Existing TPOS livecampaign callers: `orders-report/js/overview/overview-fetch.js`,
  `orders-report/docs/CAMPAIGN_FETCH_LOGIC.md`.
- TPOS proxy chain: `cloudflare-worker/modules/config/routes.js`
  (line 333: `if (pathname.startsWith('/api/')) return 'TPOS_GENERIC'`).
- Token: `shared/js/token-manager.js` (loaded as `window.tokenManager`,
  `authenticatedFetch(url, opts)` auto-injects Bearer).
- Verified live 2026-05-25 với token user `nvkt` (Company 1).
