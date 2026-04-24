# Rebuild Guide — trang `tpos-pancake`

Mục tiêu: đọc guide này là **dựng lại 100%** trang [tpos-pancake/index.html](../../../tpos-pancake/index.html) từ đầu, không cần đoán.

Trang này là một dashboard 2 cột:
- **Cột trái — TPOS**: đọc comment live Facebook qua proxy TPOS, tạo đơn web-native vào Postgres (`native_orders`), quản lý khách (SĐT/địa chỉ/nợ), trả lời/ẩn comment.
- **Cột phải — Pancake**: inbox Pancake (tin nhắn + comment), chọn page, gửi tin, đánh dấu đã đọc, menu ngữ cảnh.
- **Lớp shared**: layout 2-cột resize được, event bus, debt manager, cache, token manager (TPOS + Pancake độc lập).
- **Backend**: Cloudflare Worker proxy (`chatomni-proxy.nhijudyshop.workers.dev`) + Render server (`n2store-fallback`) + PostgreSQL.

## Cách đọc guide này

Làm tuần tự từ Phase 0 → Phase 18. Mỗi phase có: **mục tiêu → files → code → verify**. Nếu verify không pass, quay lại sửa trước khi đi tiếp.

## Mục lục

| # | File | Nội dung |
|---|---|---|
| 0 | [README.md](README.md) (file này) | Overview, roadmap, tree |
| 1 | [01-html-css-shell.md](01-html-css-shell.md) | Phase 0-2: Skeleton, CSS design tokens, layout.css, HTML |
| 2 | [02-shared-and-layout.md](02-shared-and-layout.md) | Phase 3-4: shared services (event-bus, utils, cache, debt) + layout managers |
| 3 | [03-tpos-column.md](03-tpos-column.md) | Phase 5-10: TPOS token, state, API, native-orders, comment list, SSE realtime, customer panel, init |
| 4 | [04-pancake-column.md](04-pancake-column.md) | Phase 11-16: Pancake token, state, API, page selector, conversation list, chat window, WS realtime, context menu, init |
| 5 | [05-wiring-and-verify.md](05-wiring-and-verify.md) | Phase 17-18: app-init, cross-column events, smoke test checklist |
| 6 | [06-css-item-styles.md](06-css-item-styles.md) | CSS đầy đủ cho conversation cards (TPOS + Pancake) |
| 7 | [07-tpos-action-handlers.md](07-tpos-action-handlers.md) | Bổ sung: các action handler còn thiếu của TposCommentList (renderComments, status dropdown, save phone/address, reply, v.v.) |
| 8 | [99-appendix.md](99-appendix.md) | Full reference: state shape, API tables, event bus, localStorage keys, Firestore schema, backend endpoints |

## Cây thư mục cuối cùng

```
tpos-pancake/
├── index.html
├── css/
│   ├── variables.css         # design tokens (colors, shadows, spacing)
│   ├── layout.css            # topbar + dual-column + resize handle
│   ├── components.css        # buttons, badges, modals, spinners
│   ├── pancake-chat.css      # Pancake pk-* base styles
│   ├── tpos-chat.css         # TPOS legacy header styles
│   ├── tpos/
│   │   └── tpos-comments.css
│   └── pancake/
│       └── pancake-chat-window.css
└── js/
    ├── api-config.js                 # WORKER_URL + URL builders
    ├── config.js                     # APP_CONFIG + Firebase init
    ├── shared/
    │   ├── event-bus.js              # window.eventBus
    │   ├── utils.js                  # window.SharedUtils
    │   ├── cache-manager.js          # window.SharedCache (class)
    │   └── debt-manager.js           # window.sharedDebtManager
    ├── layout/
    │   ├── column-manager.js         # window.ColumnManager
    │   ├── settings-manager.js       # window.SettingsManager
    │   └── app-init.js               # bootstraps everything on DOMContentLoaded
    ├── tpos/
    │   ├── tpos-token-manager.js     # OAuth token + auto-refresh
    │   ├── tpos-state.js             # window.TposState (plain object)
    │   ├── tpos-api.js               # window.TposApi (CRM teams, live campaigns, comments, session index)
    │   ├── tpos-native-orders-api.js # window.NativeOrdersApi (our own PG orders)
    │   ├── tpos-comment-list.js      # window.TposCommentList (renders conversation cards)
    │   ├── tpos-customer-panel.js    # window.TposCustomerPanel (customer info modal)
    │   ├── tpos-realtime.js          # window.TposRealtime (SSE per campaign)
    │   └── tpos-init.js              # window.TposColumnManager.initialize()
    └── pancake/
        ├── pancake-token-manager.js  # JWT multi-account (Firestore-backed)
        ├── pancake-state.js          # window.PancakeState
        ├── pancake-api.js            # window.PancakeAPI
        ├── pancake-page-selector.js  # window.PancakePageSelector
        ├── pancake-conversation-list.js  # window.PancakeConversationList
        ├── pancake-chat-window.js    # window.PancakeChatWindow
        ├── pancake-context-menu.js   # window.PancakeContextMenu
        ├── pancake-realtime.js       # window.PancakeRealtime (Phoenix WS)
        └── pancake-init.js           # window.PancakeColumnManager.initialize()
```

## Các thành phần bên ngoài đã có sẵn (KHÔNG phải dựng lại)

- **Cloudflare Worker**: `https://chatomni-proxy.nhijudyshop.workers.dev` — proxy về TPOS (`tomato.tpos.vn`), Pancake, Facebook Graph, và Render server. Routing trong `cloudflare-worker/modules/config/routes.js`.
- **Render server**: `https://n2store-fallback.onrender.com` — Node/Express, DATABASE_URL Postgres. Routes dùng ở trang này:
  - `POST /api/native-orders/from-comment` → tạo đơn web-native
  - `GET /api/native-orders/by-user/:id` / `/load` / `PATCH :code` / `DELETE :code`
  - `GET /api/tpos-saved/ids` → Pancake "Đã lưu TPOS" filter
  - `POST /api/v2/wallets/batch-summary` → debt cho nhiều SĐT
- **Firebase project** `n2store`: Firestore (tokens, pancake_accounts, pancake_page_tokens), Realtime DB (không dùng), Storage.
- **Shared library** `/shared/js/*`: auth-manager, firebase-config, notification-system, navigation-modern, common-utils (được load từ `../shared/js/`).

## Tech stack tối thiểu

- Vanilla JS (ES2020, không bundler, không framework, không TypeScript)
- Firebase 10.14.1 compat SDK (`app-compat`, `firestore-compat`, `database-compat`, `storage-compat`)
- Lucide 0.294.0 icons (UMD bundle qua unpkg)
- Google Fonts: Inter + Manrope
- CSS: custom variables, flex/grid, no preprocessor

## Checklist cuối cùng (ở Phase 18 sẽ verify)

Sau khi build xong, mở trang → phải thấy:
- [ ] Topbar có logo TPOS (shopping-cart icon) + page selector + campaign multi-select + status dot + nút refresh (trái), Pancake logo + page selector + settings/columns/refresh (phải).
- [ ] Hai cột song song, giữa có resize handle 8px kéo được.
- [ ] Chọn page TPOS → dropdown campaign hiện hôm nay → chọn campaign → comment load (có SSE status dot đỏ nháy).
- [ ] Hover comment → hiện 4 nút hành động: shopping-cart (tím) / user / reply / eye-off.
- [ ] Click nút giỏ hàng tím → tạo đơn web → icon đổi `package-open` + badge tím `NW-YYYYMMDD-NNNN`.
- [ ] Cột Pancake: chọn page → danh sách hội thoại → click → chat window load message → gõ + gửi OK.
- [ ] Right-click hội thoại Pancake → context menu hiện.
- [ ] Refresh F5 → mọi lựa chọn (page, campaign, column order) restore.

---

> **Ghi chú cho người đọc**: guide này được viết để tự-chứa. Mọi code block đều copy-paste được. Số dòng file (`< 800`) là giới hạn của repo — nếu viết lại mà vượt, split module nhỏ hơn. KHÔNG sửa `shared/`, `cloudflare-worker/`, `render.com/` — guide chỉ tập trung vào frontend trang `tpos-pancake/`.
