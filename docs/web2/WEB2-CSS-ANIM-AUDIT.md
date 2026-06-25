<!-- #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | WEB2.0 — audit CSS animation/interaction + skeleton loading. -->

# Web 2.0 — Audit CSS Animation / Tương tác + Skeleton Loading

> Audit toàn bộ CSS Web 2.0 (46 trang) → áp dụng animation tăng tương tác người dùng + skeleton loading kiểu GitHub. Ngày: **2026-06-25**.

## 1. Tóm tắt

- **Phạm vi**: 45 file CSS (~31.9k dòng) + loading-state JS của 46 trang.
- **File CSS global thật sự** = [`web2/shared/web2-theme.css`](../../web2/shared/web2-theme.css) (49/52 trang link, scope `body.web2-theme` / `:has(.web2-shell)`). `web2-effects.css` (utility `w2fx-*`) chỉ 3 trang link → underused.
- **Phát hiện chính** (audit 11 nhóm song song):
    - Loading state: **18 trang "Đang tải…" text · 7 blank · 5 spinner · 7 đã-skeleton · 6 mixed · 3 none**. → đa số trang KHÔNG có skeleton.
    - **~40/46 trang KHÔNG có `prefers-reduced-motion`** trong CSS riêng.
    - Pattern lỗi lặp lại khắp nơi: nút/tab/chip/row đổi nền-viền khi `:hover` **NHƯNG quên `transition`** (giật) + **thiếu `:active` press**.
    - `.btn` global có hover-lift + press NHƯNG base transition thiếu `transform`/`box-shadow` → lift/press **snap** (không mượt).

## 2. Đã làm

### 2.1. Global interaction polish — `web2-theme.css` (1 chỗ, phủ MỌI trang)

Vá theo **ELEMENT + role** (KHÔNG `[class*=]` để né khớp nhầm vd `.data-table`). Compositor-friendly (color/bg/border/shadow + transform). Page tự override khi cần.

| Sửa                                                                                             | Tác dụng                                                                             |
| ----------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| `.btn` base transition + `box-shadow` + `transform`                                             | hover-lift / press của mọi nút **ease mượt** thay vì snap                            |
| Baseline transition cho `button:not(.btn)`, `a`, `summary`, `[role=tab/button/option/menuitem]` | hover đổi nền/viền của nút/tab/chip custom **mượt** (vá ~40 trang quên `transition`) |
| `:active { transform: scale(.97) }` cho button/role tương tác                                   | **press feedback** toàn cục (gap #1 trong audit)                                     |
| `:focus-visible` ring cho element tương tác custom + `[tabindex]`                               | a11y keyboard nav rõ ràng                                                            |
| `input/select/textarea` transition                                                              | focus ring (đã có ở L824) **ease** thay vì snap                                      |
| **GLOBAL `@media (prefers-reduced-motion: reduce)`** clamp mọi animation/transition             | 1 block phủ ~40 trang chưa tự khai báo                                               |

### 2.2. `Web2Skeleton` — module shared mới (skeleton kiểu GitHub)

[`web2/shared/web2-skeleton.js`](../../web2/shared/web2-skeleton.js) — **self-contained** (tự inject CSS 1 lần `id=web2-skeleton-css`) → chạy mọi trang bất kể link CSS nào. Compositor-only shimmer + honor reduced-motion.

```js
Web2Skeleton.rows('#xxxTbody', { rows: 8, cols: 6 }); // <tr><td> nhét vào <tbody> (giữ cột)
Web2Skeleton.list('#convList', { count: 6, avatar: true });
Web2Skeleton.cards('#grid', { count: 8 });
Web2Skeleton.grid('#productGrid', { count: 12 }); // thumb vuông + tên + giá
Web2Skeleton.stats('#kpiRow', { count: 4 });
Web2Skeleton.detail('#modalBody');
Web2Skeleton.html(opts); // string để ghép inline
Web2Skeleton.clear(target);
```

**Pattern drop-in** (defensive, chỉ lần tải đầu — container rỗng):

```js
if (window.Web2Skeleton && !tbody.querySelector('tr[data-...]')) {
    window.Web2Skeleton.rows(tbody, { rows: 8, cols: N });
} else {
    /* giữ markup "Đang tải…" cũ làm fallback */
}
// render path post-fetch dùng innerHTML= → tự ghi đè skeleton.
```

### 2.3. Đã wire skeleton vào 30 trang (✅)

**Đợt 1 (20 trang)**: `products`, `variants`, `customers`, `customer-wallet`, `fastsaleorder-invoice`, `fastsaleorder-delivery`, `fastsaleorder-refund`, `balance-history`, `chi-tieu`, `users`, `returns`, `live-tv`, `live-control`, `fb-posts`, `zalo`, `jt-tracking`, `multi-tool`, `order-tags`, `ai-hub`, `video-maker`.

**Đợt 2 (10 trang)**: `purchase-refund` (#prSourceList, #prList), `cham-cong` (3 tab), `fb-ads-stats`, `fb-insights`, `system` (#sdDbGrid/#sdServiceGrid/#sdProcGrid/#ssTopicsList), `ck-dashboard` (4 cột), `pancake-settings` (pages+accounts), `ai-assistant` (test-out + provider-status), `report-delivery` (KPI+2 bảng), `users-permissions` (#permBody).

> `reconcile` **đã có** `.w2-skel` inline sẵn (skip).

Mỗi trang: thêm `<script src="../shared/web2-skeleton.js?v=…">` + đổi loading-placeholder sang `Web2Skeleton.X()` defensive, **guard first-load** (chỉ khi container rỗng) + **clear ở nhánh lỗi/early-return**. Verify: `node --check` pass toàn bộ + 2 vòng adversarial review (workflow) bắt + fix flash/stuck bug + browser-test (~8 trang) data render OK, skeleton KHÔNG kẹt, 0 console error.

### 2.4. Trang CỐ TÌNH skip (render đồng bộ → skeleton vô nghĩa / flash)

Audit đợt 2 phát hiện 6 trang KHÔNG nên wire (render đồng bộ từ state in-memory, không có khoảng fetch → skeleton sẽ flash 0ms hoặc đè data, là anti-pattern):

| Trang                              | Lý do skip                                                                  |
| ---------------------------------- | --------------------------------------------------------------------------- |
| `payment-confirm`                  | RETIRED 2026-06-06 — redirect stub sang ck-dashboard, không load app-script |
| `ai-photo` `#apResultWrap`         | inject ảnh đồng bộ; tool modal tự có progress riêng                         |
| `photo-studio` `.ps-batch-thumb`   | đã có spinner per-thumb + counter — wire generic là regression              |
| `product-card` `#pcardDrop`        | search in-memory (`Web2ProductsCache.findByName`) đồng bộ, không fetch      |
| `supplier-debt` `.sd-detail-panel` | expand row render đồng bộ từ state, không fetch                             |
| `supplier-wallet` drawer table     | render drawer đồng bộ từ state đã load                                      |

## 3. Backlog — trang chưa wire (đã có skeleton sẵn / để dành)

> Đã có skeleton sẵn (không đụng): `supplier-wallet` + `supplier-debt` (bảng chính), `kpi`, `dashboard`, `notifications`, `report-revenue`, `delivery-zone`, `audit-log`.

- ✅ `video-beauty` — wire skeleton-frame 16:9 vào `#vbEmpty` trong lúc decode video (`loadFile()` await metadata+seek). KHÔNG đụng `#vbStage` (chứa `<canvas>` sống); restore prompt gốc khi lỗi/xong.
- ⏭️ `purchase-refund` `#prDetail` — **render ĐỒNG BỘ** (`STATE.items.find()` → `innerHTML` ngay, KHÔNG fetch) → skeleton sẽ flash 0ms → **cố tình KHÔNG wire** (wire = regression).

## 4. Cache-bust

`web2-theme.css?v=` bump → **`20260625anim`** trên toàn bộ trang link nó (53 file: web2 + so-order + live-chat). `web2-skeleton.js?v=20260625a`.

## 5. Verify reduced-motion

Global `@media (prefers-reduced-motion: reduce)` trong web2-theme.css (đã confirm load trong browser) + block riêng trong web2-skeleton.js → bật "Giảm chuyển động" ở OS thì tắt shimmer/lift/press, giữ UI tĩnh.
