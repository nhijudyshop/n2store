# Web 2.0 — Sơ đồ tương tác giữa các trang + Data flow

> Bản đồ trực quan các trang Web 2.0 tương tác với nhau, dữ liệu gì được truyền, qua channel nào (REST API / SSE / Firestore).
>
> Đọc kèm: [IMPROVEMENT-PLAN.md](IMPROVEMENT-PLAN.md), [SSE-REALTIME.md](SSE-REALTIME.md), [WEB2-INDEX.md](WEB2-INDEX.md).

---

## 1. Tổng quan topology

```
┌──────────────────────────────────────────────────────────────────────────────┐
│                            BROWSER (Web 2.0 pages)                            │
│                                                                                │
│  ┌──────────┐  ┌──────────┐  ┌──────────────┐  ┌──────────┐  ┌─────────────┐│
│  │ so-order │  │ products │  │ native-orders│  │   PBH    │  │ customer-   ││
│  │          │  │          │  │              │  │          │  │ wallet      ││
│  └────┬─────┘  └─────┬────┘  └──────┬───────┘  └────┬─────┘  └──────┬──────┘│
│       │              │              │                │                │       │
│  ┌────┴─────┐  ┌─────┴────┐  ┌──────┴──┐  ┌─────────┴───┐  ┌────────┴────┐│
│  │supplier- │  │ variants │  │  PBH    │  │  balance-   │  │ supplier-   ││
│  │ wallet   │  │          │  │  reports│  │  history    │  │ debt        ││
│  └────┬─────┘  └─────┬────┘  └─────────┘  └──────┬──────┘  └──────┬──────┘│
│       │              │                            │                 │       │
└───────┼──────────────┼────────────────────────────┼─────────────────┼──────┘
        │              │                            │                 │
        │   ┌──────────┴────────────────────────────┴─────────────────┴───┐
        │   │   Web2SSE bridge — singleton EventSource multiplex topics    │
        │   └──────────────────────────────┬───────────────────────────────┘
        │                                  │ SSE stream
        │                                  ▼
        │   ┌────────────────────────────────────────────────────────┐
        │   │  Cloudflare Worker — proxy /api/realtime/* + REST CORS  │
        │   └──────────────────────────┬─────────────────────────────┘
        │                              │
        │   ┌──────────────────────────┴────────────────────────────────────┐
        │   │  Render — Express server (n2store-fallback.onrender.com)       │
        │   │                                                                 │
        │   │  ┌──────────────────────┐  ┌────────────────────────────────┐│
        │   │  │ routes/*.js          │  │ realtime-sse.js                ││
        │   │  │ - web2-products      │  │ Map<topic, Set<Response>>     ││
        │   │  │ - web2-variants      │──┤ notifyClients(topic, data,    ││
        │   │  │ - native-orders      │  │   eventType)                   ││
        │   │  │ - fast-sale-orders   │  │ → broadcast cho subscribers   ││
        │   │  │ - web2-generic       │  └────────────────────────────────┘│
        │   │  │ - web2-users         │            ▲                        │
        │   │  │ - balance-history    │            │ walletEvents.emit      │
        │   │  └──────┬───────────────┘            │                        │
        │   │         │ pool.query              ┌──┴─────────────────────┐ │
        │   │         ▼                          │ services/              │ │
        │   │  ┌──────────────────┐              │ wallet-event-processor │ │
        │   │  │ Postgres         │◄─────────────┤ - processIncoming      │ │
        │   │  │ - web2_products  │              │ - emit wallet:update   │ │
        │   │  │ - web2_variants  │              └────────────────────────┘ │
        │   │  │ - web2_records   │                          ▲              │
        │   │  │ - native_orders  │                          │              │
        │   │  │ - fast_sale_orders│                         │              │
        │   │  │ - web2_users     │            ┌─────────────┴────────────┐ │
        │   │  │ - balance_history│            │ sepay-webhook-core.js     │ │
        │   │  │ - customer_wallets│           │ POST /api/sepay/webhook   │ │
        │   │  │ - customer_wallet_│◄──────────┤                           │ │
        │   │  │   transactions   │            └───────────┬──────────────┘ │
        │   │  └──────────────────┘                        │                │
        │   └────────────────────────────────────────────────┼─────────────┘
        │                                                    │
        │   ┌────────────────────────────────────────────────┴───────┐
        │   │       SePay webhook (bank transfer notifications)        │
        │   └─────────────────────────────────────────────────────────┘
        │
        └────► Firestore (legacy — being deprecated):
               - so_order_v2/main           (so-order data, supplier-wallet read)
               - supplier_wallet_v1/main    (supplier-wallet ledger)
               - customer_wallet_v1/main    (customer-wallet manual notes)
               - suppliers_v1/main           (supplier-debt aggregation)
```

---

## 2. Page interaction matrix (Reads → Writes)

```
                          READS FROM                          │   WRITES TO
─────────────────────────────────────────────────────────────┼──────────────────────────
                  Postgres    Firestore   API endpoints      │  Postgres    SSE Events
─────────────────────────────────────────────────────────────┼──────────────────────────
so-order/         (none)      so_order_v2 web2-products/list │  Firestore   (none direct)
                              web2_variants                  │  upsert-pending
─────────────────────────────────────────────────────────────┼──────────────────────────
native-orders/    native_     (none)     /api/native-orders/ │  native_      web2:native-
                  orders                  /load              │  orders       orders
                  customers              /api/web2-products/ │
                                          list (cache)        │
─────────────────────────────────────────────────────────────┼──────────────────────────
web2/products/    web2_       web2_      /api/web2-products/ │  web2_        web2:products
                  products    products_   list                 │  products    +cross-broadcast
                              sync                            │              web2:supplier-
                                                             │               wallet (B1)
─────────────────────────────────────────────────────────────┼──────────────────────────
web2/variants/    web2_       web2_      /api/web2-variants/ │  web2_        web2:variants
                  variants    variants_   list                 │  variants
                              sync                            │
─────────────────────────────────────────────────────────────┼──────────────────────────
PBH               fast_sale_  (none)     /api/fast-sale-     │  fast_sale_   web2:fast-
                  orders                  orders/load        │  orders       sale-orders
                                                             │               +cross-broadcast
                                                             │               web2:customer-
                                                             │               wallet (B2)
─────────────────────────────────────────────────────────────┼──────────────────────────
customer-wallet/  fast_sale_  customer_  /api/fast-sale-     │  customer_    (none direct)
                  orders      wallet_v1   orders/load         │  wallet_v1   subscribes
                  customer_               /api/wallet-        │  Firestore   wallet:*
                  wallets                 deposits/load       │              web2:fast-
                                                             │              sale-orders
                                                             │              web2:customer-
                                                             │              wallet
─────────────────────────────────────────────────────────────┼──────────────────────────
supplier-wallet/  (none)      so_order_v2 /api/wallet-        │  Firestore   subscribes
                              supplier_   deposits/load       │              wallet:all
                              wallet_v1                       │              web2:products
                                                             │              web2:supplier-
                                                             │              wallet
─────────────────────────────────────────────────────────────┼──────────────────────────
supplier-debt/    (none)      so_order_v2 /api/odata/Report/  │  (read-only)  subscribes
                              supplier_   PartnerDebt         │              wallet:all
                              wallet_v1                       │              web2:products
                                                             │              web2:fast-sale-
                                                             │              orders
─────────────────────────────────────────────────────────────┼──────────────────────────
balance-history/  balance_    (none)     /api/v2/balance-     │  balance_    web2:balance-
                  history                history/*            │  history     history
                                         /api/sepay/*         │              subscribes
                                                             │              wallet:all
─────────────────────────────────────────────────────────────┼──────────────────────────
partner-customer/ web2_       (none)     /api/web2/partner-   │  web2_       web2:partner-
partner-supplier/ records                customer/list        │  records     customer
delivery-carrier/                                            │              (via generic)
product-category/                                            │
live-campaign/                                               │
─────────────────────────────────────────────────────────────┼──────────────────────────
web2/users/       web2_users  (none)     /api/web2-users/list │  web2_users   web2:users
                                                             │              + permission
                                                             │              live reload
─────────────────────────────────────────────────────────────┼──────────────────────────
```

---

## 3. Cross-page flows — detailed diagrams

### 🛒 Flow 1: Sổ Order → Web2 Products (nhập hàng nháp)

User mở Sổ Order, thêm dòng SP mới → tự động tạo SP với status CHỜ MUA bên Kho SP.

```
┌──────────────┐                                          ┌──────────────┐
│  USER A      │  1. Thêm dòng SP: name='AO M', qty=5,    │   Browser    │
│  (so-order/) ├─────►supplier='NCC-X', costPrice=100000  │              │
└──────────────┘  2. Lưu nháp                              └──────┬───────┘
                                                                   │
                            ┌──────────────────────────────────────┘
                            │ POST /api/web2-products/upsert-pending
                            │ Body: { items: [{name,variant,qty,costPrice,supplier,...}] }
                            ▼
                  ┌─────────────────────────────────────┐
                  │  Render — routes/web2-products.js   │
                  │  upsert-pending handler             │
                  │  ┌─────────────────────────────┐   │
                  │  │ INSERT/UPDATE web2_products  │   │
                  │  │ status='CHO_MUA'             │   │
                  │  │ pending_qty += qty           │   │
                  │  │ supplier=<supplier>          │   │
                  │  └─────────────────────────────┘   │
                  │            │                        │
                  │            ▼                        │
                  │  _notify('upsert-pending', null)   │
                  │  → broadcast 2 SSE topics:          │
                  │    - web2:products                  │
                  │    - web2:supplier-wallet (B1)      │
                  └────────────────┬────────────────────┘
                                   │ SSE stream
                                   ▼
        ┌──────────────────┬───────┴───────┬──────────────────┐
        ▼                  ▼               ▼                  ▼
┌──────────────┐  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐
│ USER A (so-  │  │ USER B       │  │ USER C       │  │ supplier-    │
│ order tab    │  │ (web2/       │  │ (supplier-   │  │ debt page    │
│ vẫn ở đó)    │  │ products/)   │  │ wallet/)     │  │              │
│              │  │              │  │              │  │              │
│ Cache local  │  │ Subscribe    │  │ Subscribe    │  │ Subscribe    │
│ updated      │  │ web2:products│  │ web2:supplier│  │ web2:products│
│              │  │ → reload list│  │ -wallet      │  │ + web2:fast- │
│              │  │              │  │ → recalc     │  │ sale-orders  │
│              │  │ SP mới hiện  │  │ aggregate    │  │ → recalc     │
│              │  │ status=CHỜ   │  │ NCC tổng     │  │ public nợ    │
│              │  │ MUA (×5)     │  │ mua          │  │              │
└──────────────┘  └──────────────┘  └──────────────┘  └──────────────┘
```

**Data payload SSE event**:

```json
{
  "key": "web2:products",
  "data": { "action": "upsert-pending", "code": null, "ts": 1779171920891 },
  "timestamp": 1779171920891,
  "event": "update"
}
// + parallel event:
{
  "key": "web2:supplier-wallet",
  "data": { "action": "upsert-pending", "code": null, "ts": 1779171920891, "from": "web2:products" }
}
```

---

### 🛍️ Flow 2: Sổ Order "Mua hàng" → Web2 Products (confirm purchase)

User click "Mua hàng" trong Sổ Order → SP từ `CHO_MUA` → `DANG_BAN`, `stock += pending_qty`, `pending_qty = 0`.

```
┌──────────────┐
│  USER        │  1. Click "Mua hàng cho NCC X"
│  (so-order/) ├─────────────────────────────────►
└──────────────┘                                    │
                                                    │ POST /api/web2-products/confirm-purchase
                                                    │ Body: { supplier:'NCC-X', codes:[...] }
                                                    ▼
                                       ┌──────────────────────────────────┐
                                       │  Render — confirm-purchase       │
                                       │  ┌──────────────────────────┐   │
                                       │  │ UPDATE web2_products      │   │
                                       │  │ SET status='DANG_BAN',    │   │
                                       │  │     stock = stock +       │   │
                                       │  │            pending_qty,   │   │
                                       │  │     pending_qty = 0       │   │
                                       │  │ WHERE code IN (...)       │   │
                                       │  └──────────────────────────┘   │
                                       │  _notify('confirm-purchase')     │
                                       │  → web2:products                  │
                                       │  → web2:supplier-wallet (B1)      │
                                       └────────────┬─────────────────────┘
                                                    │ SSE
                                                    ▼
                          ┌─────────────────────────┴──────────────────┐
                          ▼                                              ▼
                  ┌──────────────┐                                ┌──────────────┐
                  │ web2/products│                                │ supplier-    │
                  │ Kho SP refresh│                               │ wallet       │
                  │ status: ĐANG  │                                │ Recalc NCC X │
                  │ BÁN, stock=5 │                                │ - tổng mua  │
                  └──────────────┘                                │ + 5 × 100k  │
                                                                  └──────────────┘
```

---

### 📦 Flow 3: Native Orders → PBH (convert) → Customer Wallet

User tạo Đơn Web (native-orders) cho KH → click "Tạo PBH" → fast_sale_orders insert → SSE chain.

```
┌──────────────┐
│  USER        │ 1. Tạo đơn web cho KH=0123456788
│ (native-     ├──► POST /api/native-orders { customerName, phone, products[] }
│  orders/)    │
└──────────────┘
                │
                ▼ INSERT native_orders
                │ _notify('create') → SSE web2:native-orders
                │
┌──────────────┐
│  USER        │ 2. Click "Tạo PBH" trên row
│ (native-     ├──► POST /api/fast-sale-orders/from-native-order
│  orders/)    │      Body: { nativeOrderCode: 'NW-...' }
└──────────────┘
                ▼
       ┌────────────────────────────────────────────┐
       │ Render — fast-sale-orders.js                │
       │ from-native-order handler:                 │
       │   - Fetch source native_order              │
       │   - INSERT fast_sale_orders                │
       │     (source_type='native_order',           │
       │      source_code=nativeOrderCode)          │
       │   - WS broadcast pbh:created               │
       │   - _notify('from-native-order', number)   │
       │     → web2:fast-sale-orders                │
       │     → web2:customer-wallet (B2 cross-bc)   │
       └──────────────────┬─────────────────────────┘
                          │ SSE
        ┌─────────────────┼─────────────────────────┐
        ▼                 ▼                          ▼
┌──────────────┐  ┌──────────────┐         ┌──────────────────┐
│ PBH page     │  │ customer-    │         │ supplier-debt    │
│ (Phiếu Bán   │  │ wallet/      │         │ (báo cáo)        │
│ Hàng)        │  │              │         │                  │
│              │  │ Subscribe    │         │ Subscribe        │
│ Auto-refresh │  │ web2:        │         │ web2:fast-sale- │
│ list → PBH   │  │ customer-    │         │ orders → recalc │
│ mới hiện     │  │ wallet       │         │ ending balance  │
│              │  │ → reload PBH │         │                  │
│ Click eye    │  │ list +       │         │                  │
│ icon → modal │  │ recalc công  │         │                  │
│              │  │ nợ KH        │         │                  │
│ external-    │  │              │         │                  │
│ link → back  │  │ Toast: "PBH  │         │                  │
│ to native    │  │ mới HD-X →   │         │                  │
│ -orders      │  │ KH Y"        │         │                  │
└──────────────┘  └──────────────┘         └──────────────────┘
```

**Data payload PBH event**:

```json
{
  "key": "web2:fast-sale-orders",
  "data": { "action": "from-native-order", "number": "HD-20260519-0001", "ts": ... }
}
// + cross-broadcast (B2):
{
  "key": "web2:customer-wallet",
  "data": { "action": "from-native-order", "number": "HD-20260519-0001", "from": "web2:fast-sale-orders" }
}
```

---

### 💰 Flow 4: SePay webhook → Customer Wallet + Balance History

Khách CK tiền vào tk shop → SePay webhook → wallet update + tất cả pages liên quan refresh.

```
┌──────────────────┐
│  Bank/SePay app  │ 1. KH chuyển khoản 100k đến shop
└────────┬─────────┘
         │ POST /api/sepay/webhook
         │ { id, amount, content, referenceCode, ... }
         ▼
┌──────────────────────────────────────────────────┐
│ Render — sepay-webhook-core.js                   │
│  - Save transaction → balance_history             │
│  - Extract phone from content (regex)             │
│  - Call wallet-event-processor.processIncoming() │
└──────────────────┬───────────────────────────────┘
                   ▼
┌──────────────────────────────────────────────────┐
│ services/wallet-event-processor.js               │
│  - Postgres TX:                                  │
│    UPDATE customer_wallets SET balance += amount │
│    INSERT customer_wallet_transactions           │
│  - walletEvents.emit('wallet:update',             │
│      { phone, wallet, transaction })             │
└──────────────────┬───────────────────────────────┘
                   ▼
┌──────────────────────────────────────────────────┐
│ realtime-sse.js listener (line 369)              │
│  - notifyClients('wallet:<phone>', data)         │
│  - notifyClientsWildcard('wallet', data)         │
└──────────────────┬───────────────────────────────┘
                   │ SSE broadcast
        ┌──────────┼──────────┬──────────────┐
        ▼          ▼          ▼              ▼
┌──────────────┐ ┌────────┐ ┌──────────────┐ ┌──────────────┐
│ customer-    │ │supplier│ │ balance-     │ │ supplier-    │
│ wallet/      │ │-wallet │ │ history/     │ │ debt/        │
│              │ │        │ │              │ │              │
│ Subscribe    │ │ Subscr.│ │ Subscribe    │ │ Subscribe    │
│ 'wallet:all' │ │'wallet:│ │ 'wallet:all' │ │ 'wallet:all' │
│ (wildcard)   │ │all'    │ │              │ │              │
│              │ │        │ │ Live Mode    │ │ Recalc       │
│ → pollDeposits│ │→ poll │ │ kanban card  │ │ ending bal   │
│ → match phone│ │Deposits│ │ "TỰ ĐỘNG    │ │              │
│ → +payment   │ │ (refund│ │ GÁN" hoặc   │ │              │
│ → render +   │ │ NCC)   │ │ "NHẬP TAY"  │ │              │
│ toast 💰     │ │        │ │              │ │              │
└──────────────┘ └────────┘ └──────────────┘ └──────────────┘
```

**Data payload wallet event**:

```json
{
  "key": "wallet:0123456788",
  "data": {
    "phone": "0123456788",
    "wallet": { "balance": 235000, ... },
    "transaction": { "amount": 100000, "ts": ..., "sepayId": "..." }
  },
  "event": "wallet_update"
}
// + wildcard fan-out to anyone subscribing 'wallet:*'
```

---

### 👤 Flow 5: Users page permission change → Live session invalidation

Admin sửa role/permission của user X → user X (đang online ở tab khác) tự nhận warning + reload.

```
┌──────────────┐
│  ADMIN       │ 1. Sửa user 'staff1' → role='viewer'
│  (web2/users/├──► PATCH /api/web2-users/{id}
│  tab admin)  │      Body: { role: 'viewer' }
└──────────────┘
                ▼
       ┌─────────────────────────────────────┐
       │ Render — web2-users.js              │
       │  - UPDATE web2_users SET role=...   │
       │  - _notify('update', user.id)       │
       │  → SSE web2:users                   │
       └────────────────┬────────────────────┘
                        │ SSE
        ┌───────────────┼─────────────────────────┐
        ▼               ▼                          ▼
┌──────────────┐  ┌──────────────────────┐  ┌──────────────────┐
│ ADMIN tab    │  │ USER 'staff1' tab    │  │ Other user tabs   │
│ (open users  │  │ (open any web2 page) │  │ (irrelevant ID)   │
│ list)        │  │                      │  │                  │
│              │  │ Subscribe web2:users │  │ Subscribe        │
│ Subscribe    │  │                      │  │ web2:users       │
│ web2:users   │  │ Check msg.data.id    │  │                  │
│              │  │ == currentSessionId? │  │ Just refresh    │
│ Reload list  │  │ YES → toast warning  │  │ user list       │
│ — see staff1 │  │ "Quyền vừa thay đổi" │  │ (no force       │
│ now viewer   │  │ → setTimeout 3s →    │  │ reload)          │
│              │  │   window.location.   │  │                  │
│              │  │   reload()           │  │                  │
└──────────────┘  └──────────────────────┘  └──────────────────┘
```

---

### 📊 Flow 6: Supplier-wallet aggregation (read-only derive)

Supplier-wallet KHÔNG có DB riêng — aggregate từ so_order_v2 (Firestore) + supplier_wallet_v1 (Firestore).

```
┌──────────────────┐
│ USER open        │
│ supplier-wallet/ │
└────────┬─────────┘
         │ init()
         ▼
┌──────────────────────────────────────────┐
│ SupplierWalletStorage.loadSoOrderData()  │
│  - Firestore.doc('so_order_v2/main')     │
│  - aggregateSuppliers(soOrderData)       │
│    → group by supplier name              │
│    → tổng mua = Σ(qty × costPrice ×      │
│                    currencyRate→VND)     │
└────────┬─────────────────────────────────┘
         │ Plus:
         │ ┌────────────────────────────────────┐
         │ │ Sync.init() → Firestore subscribe  │
         │ │ supplier_wallet_v1/main             │
         │ │ → ledger (payment + return tx)     │
         │ │ → applyAggregation(state, walletData)│
         │ └────────────────────────────────────┘
         ▼
┌──────────────────────────────────────────┐
│ Plus auto-refresh khi:                    │
│  - SSE web2:products mutation             │
│    (B1 cross-broadcast)                   │
│    → pollDeposits + reload aggregation    │
│  - SSE wallet:all (SePay refund NCC)      │
│  - SSE web2:supplier-wallet (alias topic) │
└──────────────────────────────────────────┘
```

---

## 4. Realtime topology — topic + subscribers

```
                           SSE TOPICS broadcast hub
                           (realtime-sse.js trên Render)
                                       │
        ┌──────────┬──────────┬────────┼────────┬──────────┬──────────┐
        │          │          │        │        │          │          │
        ▼          ▼          ▼        ▼        ▼          ▼          ▼
   web2:        web2:      web2:    web2:    web2:      web2:    wallet:*
   products    variants    native-  fast-    customer-  supplier-(wildcard
                           orders   sale-    wallet     wallet   wallet)
                                    orders   (B2 alias) (B1 alias)
        │          │          │        │        │          │          │
        │          │          │        │        │          │          │
  ┌─────┴──┐  ┌────┴────┐ ┌──┴───┐ ┌──┴───┐ ┌──┴────────┐ ┌─┴───────┐ ┌─┴──────────┐
  │subscribers:│subscribers:│subscr│subscr│subscribers: │ subscribers: │subscribers:│
  │  - web2/   │  - web2/  │ - nat│ - PBH│ - customer- │ - supplier- │ - customer- │
  │    products│    variants│ ive- │       │   wallet    │   wallet    │   wallet    │
  │  - so-order│  - so-order│ orders│       │ - supplier- │ - supplier- │ - supplier- │
  │    (cache) │    (cache) │       │       │   debt      │   debt      │   wallet    │
  │  - supplier│            │       │       │             │             │ - supplier- │
  │   -wallet  │            │       │       │             │             │   debt      │
  │   (B1)     │            │       │       │             │             │ - balance-  │
  │  - supplier│            │       │       │             │             │   history   │
  │   -debt    │            │       │       │             │             │ - per-phone │
  │            │            │       │       │             │             │   detail    │
  │ Trigger:   │ Trigger:  │Trigger│Trigger│ Trigger:    │ Trigger:    │ Trigger:    │
  │ POST/PATCH │ POST/PATCH│POST/  │POST/  │ ↑ via       │ ↑ via       │ SePay       │
  │ /api/web2- │ /api/web2-│PATCH/ │PATCH/ │ web2:fast-  │ web2:       │ webhook     │
  │ products/* │ variants/*│DELETE │DELETE │ sale-orders │ products    │ →           │
  │            │            │       │       │ cross-bc    │ cross-bc    │ wallet-     │
  │            │            │       │       │             │             │ event-      │
  │            │            │       │       │             │             │ processor   │
  └────────────┴────────────┴───────┴───────┴─────────────┴─────────────┴────────────┘
```

---

## 5. Data ownership map

```
ENTITY                    │ DB SOURCE              │ OWNER PAGE         │ SUBSCRIBERS
──────────────────────────┼────────────────────────┼────────────────────┼─────────────────────
Product (kho SP)          │ Postgres web2_products │ web2/products      │ so-order, native-
                          │                        │                    │ orders, supplier-
                          │                        │                    │ wallet, supplier-
                          │                        │                    │ debt
──────────────────────────┼────────────────────────┼────────────────────┼─────────────────────
Variant (biến thể)        │ Postgres web2_variants │ web2/variants      │ so-order (picker)
──────────────────────────┼────────────────────────┼────────────────────┼─────────────────────
Shipment (đợt mua NCC)    │ Firestore so_order_v2  │ so-order           │ supplier-wallet,
                          │                        │                    │ supplier-debt
──────────────────────────┼────────────────────────┼────────────────────┼─────────────────────
Đơn Web                   │ Postgres native_orders │ native-orders      │ tpos-pancake (chat),
                          │                        │                    │ PBH (convert source)
──────────────────────────┼────────────────────────┼────────────────────┼─────────────────────
PBH (Phiếu Bán Hàng)      │ Postgres fast_sale_   │ PBH/               │ customer-wallet,
                          │ orders                 │                    │ supplier-debt
──────────────────────────┼────────────────────────┼────────────────────┼─────────────────────
Customer wallet           │ Postgres customer_     │ customer-wallet    │ balance-history
  + transactions          │ wallets +              │                    │ (cross-listen)
                          │ customer_wallet_       │                    │
                          │ transactions           │                    │
──────────────────────────┼────────────────────────┼────────────────────┼─────────────────────
Supplier wallet (NCC)     │ Firestore supplier_   │ supplier-wallet    │ supplier-debt
                          │ wallet_v1              │                    │
──────────────────────────┼────────────────────────┼────────────────────┼─────────────────────
SePay deposits            │ Postgres balance_     │ balance-history    │ customer-wallet,
                          │ history                │                    │ supplier-wallet
──────────────────────────┼────────────────────────┼────────────────────┼─────────────────────
Partner customer/supplier │ Postgres web2_records │ partner-customer,  │ (none direct —
delivery-carrier, etc.    │ (entity_slug)         │ partner-supplier,  │ usually FK ref)
                          │                        │ etc.               │
──────────────────────────┼────────────────────────┼────────────────────┼─────────────────────
Users + permissions       │ Postgres web2_users   │ web2/users         │ Tất cả page check
                          │                        │                    │ permission live
──────────────────────────┴────────────────────────┴────────────────────┴─────────────────────
```

---

## 6. SSE Event payload reference

### Standard envelope

```json
{
  "key": "<topic-name>",
  "data": {
    "action": "<action-string>",
    "code": "<entity-code>" | null,
    "number": "<entity-number>" | null,
    "id": "<entity-id>" | null,
    "ts": <unix-ms-timestamp>,
    "from": "<source-topic>" | absent
  },
  "timestamp": <unix-ms>,
  "event": "update" | "created" | "deleted" | "wallet_update" | "test"
}
```

### Action vocabulary per topic

| Topic                             | Actions emit                                                                                                                         |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| `web2:products`                   | `create`, `update`, `delete`, `adjust-stock`, `adjust-pending`, `upsert-pending`, `confirm-purchase`                                 |
| `web2:variants`                   | `create`, `update`, `delete`                                                                                                         |
| `web2:native-orders`              | `create`, `update`, `delete`, `comment-merged`, `backfill-customer-links`, `reset-stt-renumber`                                      |
| `web2:fast-sale-orders`           | `create`, `from-native-order`, `update`, `cancel`, `confirm`, `print`, `delete`, `bulk-confirm`, `bulk-cancel`, `reset-stt-renumber` |
| `web2:users`                      | `create`, `update`, `update-permissions`, `change-password`, `deactivate`                                                            |
| `web2:<entity>` (generic)         | `create`, `update`, `delete`, `delete-all`, `bulk-create`                                                                            |
| `wallet:<phone>` / `wallet:*`     | `wallet_update` (always with `{phone, wallet, transaction}`)                                                                         |
| `web2:supplier-wallet` (cross-bc) | inherit from `web2:products` action + `from: 'web2:products'`                                                                        |
| `web2:customer-wallet` (cross-bc) | inherit from `web2:fast-sale-orders` action + `from: 'web2:fast-sale-orders'`                                                        |

---

## 7. Tóm tắt 1 dòng

> **Mọi mutation Web 2.0 đi qua Render REST API → fire SSE event → 1+ pages subscribe topic tự refresh. Cross-broadcast pattern broadcast 1 mutation đến 2+ topics song song (vd `adjust-stock` → cả `web2:products` + `web2:supplier-wallet`) — đảm bảo các trang downstream luôn đồng bộ realtime mà không cần polling.**
