<!-- #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | WEB2.0 design note. -->

# Thiết kế #2 — Gộp giỏ CROSS-PAGE trong 1 chiến dịch (2026-07-01)

> Yêu cầu user: 2 page (NhiJudy Store + House) gán chung 1 chiến dịch → khách M comment ở CẢ 2 page → tạo đơn / kéo SP vào giỏ M ở page nào cũng vào **1 giỏ** nếu cùng chiến dịch. **Hướng chốt: HYBRID (global-id primary + SĐT/customer_id fallback).**

## Hiện trạng (điều tra 2026-07-01)

| Nơi                                                       | Key định danh hiện tại            | Scope            | Vấn đề                                   |
| --------------------------------------------------------- | --------------------------------- | ---------------- | ---------------------------------------- |
| `cart.js` `_findDraft` (v2/cart.js:242)                   | `fb_user_id` (PSID)               | page-scoped      | ⚠ 2 page = 2 giỏ                         |
| from-comment merge (native-orders.js:884-892)             | `fb_user_id` + `live_campaign_id` | page-scoped      | ⚠ 2 page = 2 đơn                         |
| late-merge trong transaction (native-orders.js:1049-1055) | `fb_user_id` + `live_campaign_id` | page-scoped      | ⚠                                        |
| `native_orders.customer_id`                               | web2 customer (theo SĐT)          | **cross-page ✓** | có nhưng bị bỏ qua; NULL khi chưa có SĐT |
| `fb_global_id_cache` (page_id, psid)→global_user_id       | global FB id                      | **cross-page ✓** | hạ tầng có, orders CHƯA dùng             |

- **PSID là page-scoped** (FB) → "M ở Store" ≠ "M ở House" theo `fb_user_id`.
- `fb_global_id_cache` populate bởi: **extension** (`POST /api/fb-global-id-cache`, khi đã nhắn tin) + `v2/customers.js:560`. **KHÔNG populate cho người comment live thuần** (chưa nhắn tin) → global_user_id chỉ có cho KH đã từng được nhắn.
- ⚠ **NGUY HIỂM**: key ẩu theo `customer_id` khi NULL → gộp NHẦM mọi khách ẩn danh. Phải guard non-null.

## Thiết kế HYBRID (3 tầng)

### Schema

- Migration idempotent: `ALTER TABLE native_orders ADD COLUMN IF NOT EXISTS global_user_id VARCHAR(50);` + index `(global_user_id, live_campaign_id)`.

### Resolve lúc TẠO đơn (from-comment + cart /add)

- Đọc `fb_global_id_cache` theo `(page_id, psid)` → nếu có `global_user_id` → lưu lên `native_orders.global_user_id`. Chỉ 1 DB read (không gọi FB API). Best-effort: không có → để NULL.

### draft-find / merge — key 3 tầng (ưu tiên trên xuống)

1. **global_user_id** (nếu resolved): `WHERE global_user_id = $g AND live_campaign_id <gate>` → cross-page NGAY cả khi chưa SĐT (nếu KH đã trong cache).
2. **customer_id** (nếu non-null): `WHERE customer_id = $c AND ...` → cross-page theo SĐT.
3. **fallback page-scoped**: `WHERE fb_user_id = $psid AND fb_page_id = $page AND ...` → khi cả 2 trên NULL (khách ẩn danh mới).

⚠ Mỗi tầng CHỈ áp khi key non-null. KHÔNG bao giờ `WHERE customer_id = NULL`/`global_user_id = NULL`.

### Điểm sửa

1. `render.com/routes/native-orders.js`: migration cột; from-comment INSERT set global_user_id (resolve); 2 merge WHERE (884-892, 1049-1055) → dùng key 3 tầng; campaign gate giữ nguyên (đã dùng name-group cho campaign_stt — 2 page STORE/HOUSE gộp đúng nếu H4 name-group xong).
2. `render.com/routes/v2/cart.js`: `_findDraft` nhận thêm globalUserId + pageId; `/add` resolve global_user_id (cần page_id + psid từ body). Caller (live-chat inventory-panel-actions.js / live-comment-list-orders.js) phải gửi page_id.
3. Helper chung: `resolveGlobalUserId(pool, pageId, psid)` đọc fb_global_id_cache.

### Coverage / giới hạn (nói rõ với user)

- KH đã từng nhắn tin (có trong cache) hoặc đã có SĐT → **gộp cross-page ngay**.
- KH comment mới tinh, chưa nhắn, chưa SĐT, ở 2 page → **chưa gộp được** đến khi nhắn/nhập SĐT (không có tín hiệu cross-page nào khác). Đây là giới hạn bản chất, không phải bug.
- Nâng coverage sau: resolve global_user_id on-demand cho comment author (cần Pancake/FB API qua conversation) — để sau, không thuộc phạm vi này.

### Test

- Beta + data-safe: seed 2 native_orders cùng global_user_id khác page → verify merge 1 giỏ; seed 2 khác global khác SĐT → verify TÁCH; seed khách NULL cả 2 → verify page-scoped (không gộp nhầm).

## Trạng thái

- Thiết kế + feasibility ✓ (2026-07-01). Chưa implement (đụng luồng tạo đơn live — làm cẩn thận với context tươi). Fix F1 (cart draft campaign-scope) đã ship là bước đệm đúng hướng.
