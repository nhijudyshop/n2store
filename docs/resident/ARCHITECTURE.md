# Resident.vn — Phân tích kiến trúc & API

> File này tổng hợp toàn bộ hiểu biết từ phiên crawl ngày **2026-04-25** của
> [https://app.resident.vn](https://app.resident.vn). Mọi route, endpoint, và schema
> dưới đây đều **bắt nguồn từ data đã capture thực tế**, không phải đoán.

---

## 1. Tổng quan

| Thành phần | Giá trị |
|---|---|
| Tên | Resident — Quản lý BĐS & Cư dân số |
| Owner (footer) | ODOOR.,JSC |
| Domain frontend | `https://app.resident.vn` |
| Domain backend  | `https://api.resident.vn` |
| Doc public | `https://docs.resident.vn` |
| Marketing | `https://resident.vn` |
| Auth | **Token trong localStorage**, KHÔNG dùng cookie HttpOnly |
| i18n | `vi`, `en` (load từ `/i18n/messages/*.json`) |
| Stack frontend | SPA — page shell server-render, data load qua XHR |
| Pricing page | `https://resident.vn/bang-gia/` |
| Liên hệ | Zalo `4210535441806653975` |

### Lưu ý auth

Frontend lưu token ở localStorage trên origin `https://app.resident.vn` (3 keys
khi đăng nhập xong). Mọi request tới `api.resident.vn/v1/*` đều mang token này
trong header (Authorization Bearer hoặc tương tự). Cookie list trống.

➡ Khi clone hoặc tích hợp: phải capture localStorage chứ không phải document.cookie.

---

## 2. Sơ đồ host

```
┌───────────────────────────────────────────────────────┐
│  Browser (SPA)                                        │
│  ┌───────────────────────────┐                        │
│  │  app.resident.vn          │  HTML shell + JS bundle│
│  │  /auth/signin             │                        │
│  │  /apartments  /rooms ...  │                        │
│  └───────────┬───────────────┘                        │
│              │ XHR + Bearer token                     │
│              ▼                                        │
│  ┌───────────────────────────┐                        │
│  │  api.resident.vn          │  REST JSON             │
│  │  /v1/*  /v2/*             │  envelope wrap         │
│  └───────────┬───────────────┘                        │
│              │ link asset                             │
│              ▼                                        │
│  ┌───────────────────────────┐                        │
│  │  s3.resident.vn           │  uploads, avatar...    │
│  └───────────────────────────┘                        │
└───────────────────────────────────────────────────────┘
```

---

## 3. Routes (frontend)

Tất cả là route SPA dạng path-based (Vue Router hoặc tương tự — không phải hash):

| Route | Module | Ghi chú |
|---|---|---|
| `/` | Dashboard | Tổng quan KPI + biểu đồ doanh thu/chi |
| `/auth/signin?next=/...` | Login | Redirect sau login về `next` |
| `/notifications` | Thông báo | List + page=1 perPage=10 |
| `/tasks` | Việc của tôi | KPI nhanh |
| `/tasks/all` | Tất cả công việc | Bảng đầy đủ |
| `/general-setting` | Cài đặt chung | User profile + permission |
| `/apartments`, `/apartments?location=:id`, `/apartments?show_create=true` | Toà nhà | Filter theo khu vực, modal create |
| `/rooms`, `/rooms?apartment=:id` | Phòng | Filter theo toà |
| `/beds` | Giường | Mặc định ko có giường (BĐS không phải dạng dorm) |
| `/apartment-layout` | Sơ đồ toà | Hiển thị grid theo tầng |
| `/locations` | Khu vực | Quản lý khu vực |
| `/leads`, `/leads?leadStatus=new\|success` | Lead | Tab theo status |
| `/reservations`, `/reservations?reservationStatus=2`, `/reservations?reservationStatuses=1` | Đặt cọc | Theo status |
| `/contracts` | Hợp đồng | Có analytics + list |
| `/tenants/active` | Cư dân đang ở | Khác `/tenants` (đã rời đi) |
| `/vehicles` | Phương tiện | Sort `id desc` mặc định |
| `/invoices`, `/invoices?month=MM-YYYY` | Hoá đơn | Filter theo tháng |
| `/income-expenses` | Thu chi tổng hợp | List có cashbook ref |
| `/finance/cash-flow` | Dòng tiền | List sổ quỹ |
| `/fees` | Khoản thu | perPage=200 (cố định) |
| `/meter-logs`, `/meter-logs?month=MM-YYYY` | Chỉ số đồng hồ | Điện/nước |
| `/inventory/assets` | Tài sản | Quản lý đồ trong phòng |
| `/changelog` | Changelog | Static page |

---

## 4. API endpoints (backend)

Tất cả response đều có **envelope wrapper**:

```json
{
  "statusCode": 200,
  "status": 1,
  "data": <payload>,
  "message": null,
  "errors": null
}
```

`data` ở list endpoint thường là `{ "items": [...], "total": <n> }`.

### 4.1 Auth & user

| Method | Path | Response shape (data) |
|---|---|---|
| GET | `/v1/user/me` | `{ id, name, email, phone, avatar, gender:{name,id}, lastLogin, ... }` |
| GET | `/v1/user-configuration` | Cấu hình UI cá nhân |
| GET | `/v1/permission` | Object map quyền — vài chục keys |

### 4.2 Dashboard (KPI)

| Method | Path | Trả về |
|---|---|---|
| GET | `/v1/dashboard/real-estate-report` | `{totalActiveApartments, totalActiveRooms, totalActiveBeds, occupancyRate}` |
| GET | `/v1/dashboard/real-estate-room-report` | `{totalActive/Renting/Empty/Deposit/InActiveRooms, *Percentage}` |
| GET | `/v1/dashboard/real-estate-bed-report` | Tương tự cho giường |
| GET | `/v1/dashboard/contract-overview` | `{newContractThisMonth, liquidThisMonth, activeContracts, progress, leavingContracts, expireSoonContracts}` |
| GET | `/v1/dashboard/invoice-overview` | `{totalThisMonth, paidThisMonth, totalPreviousMonth, totalLease, totalElectricity, totalWater, totalOtherFee, compare*}` |
| GET | `/v1/dashboard/lead-overview` | `{newLeadThisMonth, leadPreviousMonth, successLeadThisMonth, changePercentage, occupancyRate, topLeadSource}` |
| GET | `/v1/dashboard/reservation-overview` | Tương tự lead |
| GET | `/v1/dashboard/task-overview` | `{newTasksThisMonth, completedTaskThisMonth, doingTasks*, notStarted*, inReview*}` |
| GET | `/v1/dashboard/task-top-values` | `{topApartmentName, topRoomName, topTaskTypeName, topPerformerName, ... taskCount}` |
| GET | `/v1/dashboard/customer-rating` | `{ratingOneStar..FiveStar, ratingOneStarPercentage..FiveStarPercentage, totalRating}` |
| GET | `/v1/dashboard/income-expense-line-chart` | `{incomeSeries:[12], expenseSeries:[12], labels:["MM/YY"]}` |

### 4.3 BĐS (Real estate)

| Method | Path | Query mặc định |
|---|---|---|
| GET | `/v1/apartment` | `sort={"field":"name","type":"asc"}, filter={}, perPage=1000` (full list) |
| GET | `/v2/apartment` | `page=1, perPage=10, searchTerm=, filter={}` (paginated) |
| GET | `/v1/apartment/analytics` | `{totalActive, totalActiveRooms, totalEmptyRooms, totalRentingRooms,...}` |
| GET | `/v1/apartment/layout` | `?apartmentId=:id` — return `{apartment, floors:[{rooms:[...]}]}` |
| GET | `/v2/room` | `page=1, perPage=10, searchTerm=, filter={}` |
| GET | `/v1/room/analytics` | Tổng hợp phòng |
| GET | `/v2/bed` | Tương tự room |
| GET | `/v1/bed/analytics` | Tổng hợp giường |
| GET | `/v1/location/select` | List rút gọn (cho dropdown) |
| GET | `/v1/location` | List đầy đủ |

**Item shape — `/v2/apartment`:**
```json
{ "code":"CH006205", "id":6205, "name":"102/30 Lê Văn Thọ",
  "fullAddress":"...", "paymentDay":0, "numberRooms":40,
  "active":true, "ownerId":7012 }
```

**Item shape — `/v2/room`:**
```json
{ "code":"P063117", "id":63117, "name":"MB02",
  "status": {"id":"3","title":"Đang thuê","class":"text-primary","variant":"primary","color":"#248F55"},
  "price":6200000, "deposit":10000000, "size":50,
  "numberActiveBeds":0, "apartmentId":6205, "active":true,
  "maxTenants":5, "apartment":{"id":6205,"name":"...","active":true},
  "beds":[], "floor":{"id":77230,"name":"Tầng 1"}, "type":null }
```

### 4.4 Khách hàng (Lead → Reservation → Contract → Tenant)

| Method | Path | Query |
|---|---|---|
| GET | `/v1/lead` | `filter={"status":0}` cho tab "Mới" |
| GET | `/v1/lead/analytics` | Cùng filter |
| GET | `/v1/reservation` | `filter={}` |
| GET | `/v1/reservation/analytics` | |
| GET | `/v1/contract` | `filter={"contractStatus":0}` |
| GET | `/v1/contract/analytics` | Có `totalActive, totalExpireSoon, totalLiquid, totalLeaving, ...` |
| GET | `/v2/tenant/living` | Cư dân đang ở |
| GET | `/v2/tenant/living-analytics` | |
| GET | `/v1/vehicle` | `sort={"field":"id","type":"desc"}, filter={}` |

### 4.5 Tài chính

| Method | Path | Query |
|---|---|---|
| GET | `/v1/invoice` | `filter={}` |
| GET | `/v1/invoice/analytics` | `totalAmount, totalPaid, totalUnpaid, ...` |
| GET | `/v1/income-expense` | List giao dịch |
| GET | `/v1/income-expense/analytics` | `totalIncome, totalExpense, ...` |
| GET | `/v1/cashbook/select` | Sổ quỹ (số dư + loại) |
| GET | `/v1/fee` | `page=1, perPage=200` (full khoản thu) |
| GET | `/v1/meter-log` | `filter={}` |
| GET | `/v1/meter-log/analytics` | `totalElectricity, totalWater, ...` |

### 4.6 Việc & Thông báo

| Method | Path | Query |
|---|---|---|
| GET | `/v2/task` | `filter={}` |
| GET | `/v1/task/analytics-all` | |
| GET | `/v1/task/total-my-tasks` | `{total, dueToday, overdue, ...}` |
| GET | `/v1/task/total-tasks-by-group` | Phân theo trạng thái |
| GET | `/v1/notification` | `page=1, perPage=10, filter={}` |
| GET | `/v1/system-notification/count-unread` | `{total/count}` |

### 4.7 Khác

| Method | Path | Note |
|---|---|---|
| GET | `/v1/asset` | Tài sản |
| GET | `/v1/asset/analytics` | |

---

## 5. Patterns chung

### 5.1 Pagination URL encoding

Filter object được serialize JSON rồi URL-encoded:

```
/v2/room?page=1&perPage=10&searchTerm=&filter={"status":1}
       → /v2/room?page=1&perPage=10&searchTerm=&filter=%7B%22status%22%3A1%7D
```

### 5.2 Status object

Mọi entity có status đều mang shape:
```json
{ "id":"3", "title":"Đang thuê", "class":"text-primary", "variant":"primary", "color":"#248F55" }
```
→ Frontend chỉ cần đọc `title` cho text, `color`/`variant` cho UI. Map `variant`:
- `primary` (xanh) — đang hoạt động / thành công
- `warn` (vàng) — đang chờ / sắp hết hạn
- `info` (xanh dương) — thông tin
- `muted` — ngừng

### 5.3 Money

Tất cả money là **VND, integer**, không có thập phân. Format VN: `1.234.567đ`.

### 5.4 i18n

`/i18n/messages/vi/resident.json` và `/i18n/messages/en.json` được fetch ở mỗi
trang (cache-bust bằng `?t=<ts>`). Có `vi/resident.json` (tách namespace) và
`en.json` (gộp).

---

## 6. Theo dõi — file local

| Path | Nội dung |
|---|---|
| `downloads/resident-crawl/<ts>-v3/manifest.json` | Index toàn bộ request |
| `downloads/resident-crawl/<ts>-v3/api/*.json` | Body từng API call |
| `downloads/resident-crawl/<ts>-v3/pages/*.html` | HTML snapshot |
| `downloads/resident-crawl/<ts>-v3/screenshots/*.png` | Ảnh full-page |
| `downloads/resident-crawl/auth-state.json` | localStorage + cookies (storageState) |
| `resident/data/*.json` | 49 file mock dùng cho clone |
| `resident/data/_catalog.json` | Catalog mapping endpoint → file |

## 7. Re-run flow

```bash
# 1. Login lại nếu state hết hạn
node scripts/resident-save-auth.js

# 2. Crawl các route đã định nghĩa
node scripts/resident-crawl-v3.js

# 3. Cập nhật mock data cho clone
node scripts/resident-build-data.js

# 4. Mở 2-tab browser (clone + live) để compare
node scripts/resident-side-by-side.js
```

## 8. Module-by-module mapping (clone vs live)

| Live route | Clone view fn | Mock files |
|---|---|---|
| `/` | `viewDashboard` | 10 dashboard endpoints |
| `/apartments` | `viewApartments` | apartment + analytics |
| `/rooms` | `viewRooms` | v2-room + analytics |
| `/beds` | `viewBeds` | v2-bed + analytics |
| `/leads` | `viewLeads` | lead + analytics |
| `/reservations` | `viewReservations` | reservation + analytics |
| `/contracts` | `viewContracts` | contract + analytics |
| `/tenants/active` | `viewTenants` | v2-tenant-living + analytics |
| `/vehicles` | `viewVehicles` | vehicle |
| `/invoices` | `viewInvoices` | invoice + analytics |
| `/income-expenses` | `viewIncomeExpense` | income-expense + analytics |
| `/finance/cash-flow` | `viewCashflow` | cashbook-select |
| `/fees` | `viewFees` | fee |
| `/meter-logs` | `viewMeterLogs` | meter-log + analytics |
| `/tasks/all` | `viewTasks` | v2-task + analytics + groups |
| `/tasks` | `viewMyTasks` | task-total-my-tasks + groups |
| `/notifications` | `viewNotifications` | notification + count-unread |
| `/inventory/assets` | `viewAssets` | asset + analytics |
| `/locations` | `viewLocations` | location-select |
| `/general-setting` | `viewSettings` | user-me + permission + user-configuration |
| `/apartment-layout` | `viewLayout` | apartment-layout |
| `/changelog` | `viewChangelog` | _catalog.json |
