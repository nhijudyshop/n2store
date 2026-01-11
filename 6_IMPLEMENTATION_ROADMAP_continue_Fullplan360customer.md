# IMPLEMENTATION ROADMAP: Customer 360 Complete System - Continued

> **Cập nhật:** 2026-01-10
> **Mục tiêu:** Hoàn thiện toàn bộ hệ thống Customer 360 với đầy đủ tính năng
> **Ưu tiên:** Quality - Code maintainable lâu dài

---

# IMPLEMENTATION TASKS (Theo thứ tự ưu tiên)

## 🔥 PHASE 1: CRITICAL FIXES (1-2 ngày)

### Task 1.1: Fix POST /api/ticket - Auto-create Customer
**File:** `render.com/routes/customer-360.js:957-1003`

**Hiện trạng:**
```javascript
// Line 971-973 - KHÔNG TẠO CUSTOMER MỚI
const customerResult = await db.query('SELECT id FROM customers WHERE phone = $1', [phone]);
const customerId = customerResult.rows[0]?.id;  // ❌ Có thể null
```

**Cần làm:**
1. Tạo helper function `getOrCreateCustomer(db, phone, name)`
2. Update POST /api/ticket để dùng helper này
3. Đảm bảo mọi ticket có `customer_id` hợp lệ

**Code mẫu:**
```javascript
// render.com/utils/customer-helpers.js
async function getOrCreateCustomer(db, phone, name) {
    const normalized = normalizePhone(phone);

    let result = await db.query('SELECT id FROM customers WHERE phone = $1', [normalized]);

    if (result.rows.length > 0) {
        return result.rows[0].id;
    }

    // Auto-create customer
    result = await db.query(`
        INSERT INTO customers (phone, name, status, tier, created_at)
        VALUES ($1, $2, 'Bình thường', 'new', CURRENT_TIMESTAMP)
        ON CONFLICT (phone) DO UPDATE SET updated_at = CURRENT_TIMESTAMP
        RETURNING id
    `, [normalized, name || 'Khách hàng mới']);

    console.log(`[AUTO-CREATE] Created customer: ${name} (${normalized})`);
    return result.rows[0].id;
}
```

**Test:**
- Tạo ticket với SĐT mới → Check customers table có record mới
- Tạo ticket với SĐT đã có → Check không tạo duplicate

---

### Task 1.2: Create POST /api/balance-history/link-customer
**File:** `render.com/routes/customer-360.js` (thêm route mới)

**Mục đích:** Cho phép link giao dịch balance_history với customer + tự động tạo customer mới + auto deposit wallet

**API Spec:**
```
POST /api/balance-history/link-customer
Body: {
  transaction_id: number,
  phone: string,
  auto_deposit: boolean (default: false)
}
```

**Flow:**
1. Get balance_history transaction by ID
2. getOrCreateCustomer(phone, tx.customer_name)
3. UPDATE balance_history SET linked_customer_phone, customer_id
4. If auto_deposit: Deposit to wallet + log transaction
5. Mark wallet_processed = true

**Test:**
- Link giao dịch với SĐT mới → Check customer created + linked
- Link với auto_deposit=true → Check wallet balance increased
- Link giao dịch đã link → Return error

---

### Task 1.3: Create Cron Jobs Scheduler
**File:** `render.com/cron/scheduler.js` (MỚI)

**Mục đích:** Chạy PostgreSQL function `expire_virtual_credits()` mỗi giờ

**Code:**
```javascript
const cron = require('node-cron');
const db = require('../db/pool');

// Chạy mỗi giờ
cron.schedule('0 * * * *', async () => {
    console.log('[CRON] Running expire_virtual_credits...');
    try {
        const result = await db.query('SELECT * FROM expire_virtual_credits()');
        const { expired_count, total_expired_amount } = result.rows[0];
        console.log(`[CRON] ✅ Expired ${expired_count} credits, total: ${total_expired_amount} VND`);
    } catch (error) {
        console.error('[CRON] ❌ Error:', error);
    }
});

console.log('[CRON] Scheduler started');
```

**File:** `render.com/server.js` (update)
```javascript
// Thêm vào cuối file
require('./cron/scheduler');
```

**Test:**
- Insert virtual_credit với expires_at = yesterday
- Chạy server → Đợi 1 giờ hoặc trigger manual
- Check virtual_credits status = 'EXPIRED'
- Check wallet.virtual_balance đã giảm

---

## ⭐ PHASE 2: FRONTEND CUSTOMER HUB (3-5 ngày)

### Task 2.1: Create customer-hub/ Structure
**Thư mục:** `customer-hub/`

**Cấu trúc:**
```
customer-hub/
├── index.html
├── styles/
│   ├── main.css
│   └── components.css
├── js/
│   ├── main.js
│   ├── api-service.js       # Copy từ issue-tracking (đã có)
│   ├── modules/
│   │   ├── customer-search.js
│   │   ├── customer-profile.js
│   │   ├── wallet-panel.js
│   │   ├── transaction-history.js
│   │   ├── ticket-list.js
│   │   └── link-bank-transaction.js  # MỚI
│   └── utils/
│       └── permissions.js    # Import PermissionHelper
└── config.js
```

---

### Task 2.2: Customer Search Module
**File:** `customer-hub/js/modules/customer-search.js`

**Features:**
- Search by phone/name
- Display results in table
- Click → navigate to customer detail

---

### Task 2.3: Customer Profile 360° View
**File:** `customer-hub/js/modules/customer-profile.js`

**API:** `GET /api/customer/:phone` (đã có)

**Sections:**
1. Customer Info Card (name, phone, tier, status, tags)
2. Wallet Balance (real + virtual)
3. RFM Scores (visual chart)
4. Recent Tickets (last 10)
5. Activity Timeline (last 20)

---

### Task 2.4: Link Bank Transaction Module
**File:** `customer-hub/js/modules/link-bank-transaction.js`

**Features:**
- List unlinked balance_history transactions
- Search/filter by date, amount, description
- Button "Liên kết khách hàng"
  → Modal: Nhập SĐT + checkbox "Auto deposit"
  → Call `POST /api/balance-history/link-customer`
- Show success message + update customer wallet in real-time

---

## 🎯 PHASE 3: ADVANCED FEATURES (Tuần 2-3)

### Task 3.1: Carrier Deadline Checker Cron
**File:** `render.com/cron/scheduler.js` (update)

**Cần thêm field:** `carrier_deadline TIMESTAMP` vào `customer_tickets`

**Flow:**
```javascript
cron.schedule('0 */6 * * *', async () => { // Mỗi 6 giờ
    // Tìm tickets có carrier_deadline < now + 24h
    // Update priority = 'high'
    // Gửi notification
});
```

---

### Task 3.2: Fraud Detection Job
**File:** `render.com/cron/fraud-detection.js` (MỚI)

**Rules:**
- return_rate > 50% trong 7 ngày → tier = 'blacklist'
- Nhiều giao dịch wallet > 5M trong 1 giờ → flag suspicious
- Tự deposit rồi withdraw liên tục → flag self-dealing

---

## 📋 FILES QUAN TRỌNG

### Cần sửa:
1. `render.com/routes/customer-360.js:957-1003` (POST /api/ticket)
2. `render.com/server.js` (import cron scheduler)

### Cần tạo mới:
1. `render.com/utils/customer-helpers.js` (getOrCreateCustomer)
2. `render.com/routes/customer-360.js` (thêm POST /api/balance-history/link-customer)
3. `render.com/cron/scheduler.js` (cron jobs)
4. `customer-hub/` (toàn bộ frontend mới)

### Cần cập nhật permissions:
1. `user-management/permissions-registry.js`:
```javascript
"customer-hub": {
    id: "customer-hub",
    icon: "users",
    name: "CUSTOMER 360",
    subPermissions: {
        view: { name: "Xem thông tin", icon: "eye" },
        edit_profile: { name: "Sửa hồ sơ", icon: "edit" },
        manage_wallet: { name: "Quản lý ví", icon: "wallet" },
        view_transactions: { name: "Xem giao dịch", icon: "list" },
        link_transactions: { name: "Liên kết giao dịch", icon: "link" },
        export_data: { name: "Xuất dữ liệu", icon: "download" },
    },
}
```

---

## ✅ VERIFICATION CHECKLIST

### Backend:
- [ ] Tạo ticket với SĐT mới → Customer auto-created
- [ ] Tạo ticket với SĐT cũ → Customer không duplicate
- [ ] Link balance_history → Customer created + linked
- [ ] Link với auto_deposit=true → Wallet balance tăng
- [ ] Cron job chạy → Virtual credits expired
- [ ] SSE events hoạt động real-time

### Frontend:
- [ ] Customer search hoạt động
- [ ] Customer 360 view hiển thị đầy đủ
- [ ] Wallet panel cập nhật real-time
- [ ] Link transaction UI hoạt động
- [ ] Permissions được enforce đúng

### End-to-End:
- [ ] Flow: Bank transfer → Auto match QR → Deposit wallet → Real-time update
- [ ] Flow: Create ticket BOOM → Issue virtual credit → Use in order → Expire after 15 days
- [ ] Flow: Search customer → View 360 → Link new bank transaction → Deposit

---

## 🚀 RECOMMENDED IMPLEMENTATION ORDER

**Tuần 1:**
1. Task 1.1: Fix POST /api/ticket (2 giờ)
2. Task 1.2: Create link-customer API (3 giờ)
3. Task 1.3: Cron scheduler (1 giờ)
4. Test backend thoroughly (2 giờ)

**Tuần 2:**
5. Task 2.1-2.2: Customer hub structure + search (1 ngày)
6. Task 2.3: Customer profile 360 (2 ngày)
7. Task 2.4: Link transaction module (1 ngày)

**Tuần 3:**
8. Task 3.1-3.2: Advanced cron jobs (2 ngày)
9. End-to-end testing + bug fixes (3 ngày)

---

## 📞 DEPENDENCIES & ASSUMPTIONS

### Dependencies:
- PostgreSQL migrations đã chạy xong
- Firebase authentication đang hoạt động
- Cloudflare Worker proxy hoạt động
- SePay webhook đang nhận được transactions

### Assumptions:
- User sẽ tự động tạo customer khi tạo ticket (Option A - im lặng)
- Balance history link sẽ có manual step (không auto-link 100%)
- Cron jobs chạy trên Render.com (không cần separate service)

---

## 🎓 TECHNICAL NOTES

### Phone Normalization:
- Luôn dùng function `normalizePhone()` từ `002_create_customer_360_triggers.sql`
- Format chuẩn: `0XXXXXXXXX` (10-11 số)

### Atomic Transactions:
- Mọi wallet operations dùng `BEGIN...COMMIT`
- Dùng `FOR UPDATE` khi lock wallet

### Real-time Updates:
- SSE endpoint: `/api/events`
- Channels: `wallets`, `tickets`, `customers`

### Error Handling:
- Dùng Error Matrix từ `issue-tracking/MASTER_DOCUMENTATION.md`
- Log mọi errors vào `audit_logs` table
