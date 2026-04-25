<!-- #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | Read these files before coding, update dev-log after changes. -->

# 99 — Appendix

## URLs

| Service | URL |
|---------|-----|
| Frontend GitHub Pages | https://nhijudyshop.github.io/ |
| Cloudflare Worker | https://chatomni-proxy.nhijudyshop.workers.dev |
| Render API | https://n2store-fallback.onrender.com |
| Render service ID | `srv-d4e5pd3gk3sc73bgv600` |

## Path map

```
n2store/
├── web2-shared/                    # Framework client
│   ├── web2-api.js                 # Web2Api.forEntity(slug)
│   ├── page-builder.js             # Web2Page.mount(rootSel, config)
│   ├── tpos-sidebar.js             # Web2Sidebar.mount(rootSel, opts)
│   ├── tpos-sidebar.css            # Sidebar styling
│   └── tpos-menu.json              # 87 link source of truth
├── web2/                           # Trang generic (1 folder / page)
│   ├── product-category/
│   │   └── index.html
│   ├── product-uom/
│   │   └── index.html
│   └── ...
├── native-orders/                  # Page riêng (logic phức tạp)
│   ├── index.html
│   ├── css/native-orders.css
│   ├── css/tpos-theme.css          # ← shared theme cho mọi web2
│   └── js/native-orders-app.js
├── web2-products/                  # Kho sản phẩm
│   └── ...
├── tpos-pancake/                   # Live tool (đã có sẵn từ trước)
│   └── ...
├── render.com/
│   ├── server.js                   # Mount /api/web2 → web2-generic.js
│   ├── routes/
│   │   ├── web2-generic.js         # ← REST generic
│   │   ├── native-orders.js
│   │   └── web2-products.js
│   └── migrations/
│       ├── 065_native_orders_schema.sql
│       ├── 066_web2_products_schema.sql
│       ├── 067_native_orders_extend.sql
│       └── 068_web2_generic_entities.sql
├── cloudflare-worker/
│   ├── worker.js                   # Dispatch case 'WEB2_GENERIC'
│   └── modules/config/routes.js    # Pattern '/api/web2/*'
└── docs/
    ├── dev-log.md                  # Lịch sử commit
    └── guides/web2-builder/        # ← Tài liệu này
```

## Slug list (87 trang, lấy từ TPOS sidebar)

Xem `web2-shared/tpos-menu.json` để có danh sách đầy đủ + group.

Tóm tắt:
- **Sản phẩm**: productcategory, productuom, productuomcateg, productattribute, productattributevalue, product
- **Đối tác**: partner-customer, partner-supplier, partnercategory, partner-customer-dsd
- **Bán hàng**: fastsaleorder-invoice, fastsaleorder-refund, fastsaleorder-delivery, salequotation, saleorder
- **Mua hàng**: fastpurchaseorder-invoice, fastpurchaseorder-refund
- **Kho**: stockpicking, stockmove, stockinventory, stocklocation
- **POS**: posconfig, possession, posorder
- **Live**: liveCampaign
- **Tài chính**: accountjournal, accountaccount, accountaccount-thu, accountaccount-chi, accountpayment-thu, accountpayment-chi, accountdeposit, accountinventory
- **Khuyến mãi**: promotionprogram, couponprogram, loyaltyprogram, offerprogram
- **Báo cáo**: report/* (18 báo cáo)
- **Cấu hình**: configs/*, applicationuser, company, rescurrency, irmailserver, mailtemplate, ... (12 cấu hình)
- **Khác**: tag, salechannel, deliverycarrier, revenuebegan, revenuebegan-supplier, wiinvoice

## Troubleshooting

### "Invalid API route" (404 từ CF Worker)
- Chưa deploy worker. Chạy `cd cloudflare-worker && wrangler deploy`.
- Hoặc routes.js chưa add pattern `WEB2_GENERIC`.

### "DB unavailable" (500 từ Render)
- Render chưa deploy code mới. Check https://dashboard.render.com.
- `chatDb` pool null — env var `CHAT_DB_URL` chưa set hoặc DB down.

### "invalid entity slug" (400)
- Slug có ký tự không khớp `/^[a-z0-9][a-z0-9-]{1,58}[a-z0-9]$/`.
- Tránh: dấu `_`, dấu `.`, viết HOA, dấu `/`.

### Page load nhưng table trống mãi
- DevTools → Network → check call `/api/web2/.../list` status code.
- Nếu 200 nhưng `records: []` → entity chưa có data, bấm "Thêm mới".
- Nếu CORS error → Worker chưa wrap `addCorsHeaders`. Hiếm gặp.

### Sidebar không render
- Check `lucide` đã load chưa (icon không hiện).
- Check path `web2-shared/tpos-sidebar.js` đúng tương đối.

### Modal đóng khi click ngoài
- User feedback: KHÔNG đóng khi click overlay. Modal chỉ đóng qua nút X / Hủy / ESC.
- Đã fix trong page-builder.js.

## Render API key (cho deploy / env vars)

Xem `serect_dont_push.txt` (gitignored) ở project root. Hoặc memory file `reference_secrets_file.md`.

Add env var qua API:
```bash
# Đúng
PUT /services/{id}/env-vars/{KEY}   body: {"value":"..."}

# Sai (replaces ALL!)
PUT /services/{id}/env-vars         body: [{...}]
```

## Khi nào tạo bảng riêng thay vì dùng generic

| Tiêu chí | Dùng generic | Tạo bảng riêng |
|---------|-------------|----------------|
| Chỉ list + CRUD | ✓ | |
| Có 1 cột số quan trọng (vd. tồn kho) | ✓ (data.stock) | |
| Có aggregate/sum (báo cáo) | | ✓ |
| Có quan hệ N–N (đơn ↔ dòng đơn) | | ✓ |
| Có workflow (duyệt, hủy) | | ✓ |
| Cần PostgreSQL trigger / function | | ✓ |
| Cần index vào field cụ thể | | ✓ |

## Liên hệ context khác

- Chat về native-orders: đọc `docs/guides/tpos-pancake/08-create-order-data-flow.md`
- Schema sync Firebase ↔ Postgres: đọc `docs/architecture/DATA-SYNCHRONIZATION.md`
- TPOS API/controllers: đọc `docs/tpos/TposWebsite.md`
