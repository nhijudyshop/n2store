# 🚀 Hướng dẫn Deploy Phone Extraction Feature

## 📋 Tổng quan

Feature này tự động:

1. Extract số điện thoại từ nội dung chuyển khoản (>4 chữ số, lấy số cuối cùng)
2. Lưu trực tiếp vào `balance_customer_info` để tracking
3. Mark transaction là `debt_added = TRUE`

**Lưu ý:**

- ❌ Không search trong `customers` table
- ❌ Không cập nhật debt
- ❌ Không tạo pending matches
- ✅ Chỉ tracking phone numbers trong `balance_customer_info`

---

## ✅ Bước 1: Chạy SQL Setup

### Option A: Chạy file SQL tổng hợp (khuyến nghị)

```bash
psql $DATABASE_URL -f balance-history/SETUP_ALL.sql
```

### Option B: Chạy từng migration riêng lẻ

```bash
# 1. Tạo balance_history table
psql $DATABASE_URL -f render.com/migrations/create_balance_history.sql

# 2. Tạo balance_customer_info table
psql $DATABASE_URL -f render.com/migrations/create_customer_info.sql

# 3. Tạo pending_customer_matches table
psql $DATABASE_URL -f render.com/migrations/create_pending_customer_matches.sql
```

### Verify tables được tạo thành công:

```sql
-- Kiểm tra tables
SELECT tablename FROM pg_tables
WHERE schemaname = 'public'
AND tablename IN ('balance_history', 'balance_customer_info', 'pending_customer_matches');

-- Expected output:
--        tablename
-- --------------------------
--  balance_history
--  balance_customer_info
--  pending_customer_matches
```

---

## ✅ Bước 2: Deploy Code

### 2.1. Đẩy code lên production

```bash
# Push branch lên remote
git push origin claude/review-balance-history-yRCqn

# Merge vào main (hoặc tạo PR)
git checkout main
git merge claude/review-balance-history-yRCqn
git push origin main
```

### 2.2. Restart server (Render.com)

- Vào dashboard Render.com
- Click "Manual Deploy" > "Deploy latest commit"
- Hoặc server sẽ auto-deploy nếu đã config auto-deploy

---

## ✅ Bước 3: Test Feature

### 3.1. Test webhook nhận transaction

```bash
# Test với curl (thay YOUR_GATEWAY bằng gateway thực tế)
curl -X POST https://your-domain.com/api/sepay/webhook \
  -H "Content-Type: application/json" \
  -d '{
    "id": 999999,
    "gateway": "YOUR_GATEWAY",
    "transactionDate": "2025-12-29 10:30:00",
    "accountNumber": "0123456789",
    "content": "CT DEN:0123456789 ND:0901234567 thanh toan",
    "transferType": "in",
    "transferAmount": 500000,
    "accumulated": 10000000,
    "subAccount": "",
    "referenceCode": "REF123",
    "description": "Thanh toan don hang"
  }'
```

### 3.2. Kiểm tra logs

```bash
# Grep logs để xem phone extraction
grep "EXTRACT-PHONE\|DEBT-UPDATE" logs.txt

# Expected output:
# [EXTRACT-PHONE] Found GD, parsing before GD: 456788 tam
# [EXTRACT-PHONE] Found phone (last occurrence): 456788
# [DEBT-UPDATE] Phone extracted: 456788
# [DEBT-UPDATE] Saved to balance_customer_info: PHONE456788 456788
# [DEBT-UPDATE] ✅ Success (phone extraction - auto save)
```

### 3.3. Kiểm tra balance_customer_info

```sql
-- Xem records đã được tạo
SELECT unique_code, customer_phone, customer_name, created_at
FROM balance_customer_info
WHERE unique_code LIKE 'PHONE%'
ORDER BY created_at DESC
LIMIT 10;

-- Expected output:
-- unique_code    | customer_phone | customer_name | created_at
-- -------------------------------------------------------------
-- PHONE456788    | 456788         | NULL          | 2025-12-29 10:30:00
```

---

## 📊 Logic Mới (Đơn giản)

### Flow:

```
1. Extract phone từ content (lấy số cuối cùng >4 chữ số)
   ↓
2. Generate unique_code = PHONE{phone}
   ↓
3. UPSERT vào balance_customer_info
   ↓
4. Mark transaction debt_added = TRUE
   ↓
5. Done ✅
```

### Ví dụ:

| Content                 | Extracted    | Unique Code       | Customer Phone |
| ----------------------- | ------------ | ----------------- | -------------- |
| `456788 tam GD 5363...` | `456788`     | `PHONE456788`     | `456788`       |
| `CT:0123 ND:0901234567` | `0901234567` | `PHONE0901234567` | `0901234567`   |
| `ABC 12345 XYZ 98765`   | `98765`      | `PHONE98765`      | `98765`        |

---

## 🔍 API Endpoints

### 1. Lấy pending matches

```bash
GET /api/sepay/pending-matches?status=pending&limit=50
```

**Response:**

```json
{
    "success": true,
    "data": [
        {
            "id": 1,
            "transaction_id": 123,
            "extracted_phone": "0901234567",
            "matched_customers": [
                { "id": 1, "phone": "0901234567", "name": "Nguyen Van A" },
                { "id": 2, "phone": "0901234567xxx", "name": "Nguyen Van B" }
            ],
            "transaction_content": "...",
            "transfer_amount": 500000,
            "status": "pending"
        }
    ],
    "count": 1
}
```

### 2. Resolve pending match

```bash
POST /api/sepay/pending-matches/:id/resolve
Content-Type: application/json

{
  "customer_id": 1,
  "resolved_by": "admin_username"
}
```

### 3. Skip pending match

```bash
POST /api/sepay/pending-matches/:id/skip
Content-Type: application/json

{
  "reason": "Wrong transaction",
  "resolved_by": "admin_username"
}
```

---

## 🛠️ Troubleshooting

### Issue: Tables chưa được tạo

```sql
-- Kiểm tra xem table có tồn tại không
SELECT EXISTS (
    SELECT FROM information_schema.tables
    WHERE table_schema = 'public'
    AND table_name = 'pending_customer_matches'
);
```

Nếu `false`, chạy lại SQL setup ở Bước 1.

### Issue: Phone không được extract

**Kiểm tra:**

1. Content có >= 5 chữ số liền kề không?
2. Có "GD" trong content không? Nếu có, check phần trước "GD"

**Test locally:**

```javascript
const content = 'CT DEN:0123456789 ND:0901234567 thanh toan';
const gdMatch = content.match(/^(.*?)(?:\s*-?\s*GD)/i);
const textToParse = gdMatch ? gdMatch[1].trim() : content;
const allMatches = textToParse.match(/\d{5,}/g);
const phone = allMatches ? allMatches[allMatches.length - 1] : null;
console.log('Extracted phone:', phone); // Should be: 0901234567
```

### Issue: Không tìm thấy customer

**Possible causes:**

1. Database không có customer với SĐT matching
2. SĐT trong database format khác (có dấu cách, dấu gạch ngang, etc.)

**Solution:**

```sql
-- Kiểm tra customers có SĐT chứa "56789"
SELECT id, phone, name
FROM customers
WHERE phone LIKE '%56789%';
```

### Issue: Luôn tạo pending matches (nhiều kết quả)

**Possible causes:**

1. Database có duplicate phone numbers
2. Phone matching quá rộng

**Solution:**

```sql
-- Tìm duplicate phones
SELECT phone, COUNT(*)
FROM customers
GROUP BY phone
HAVING COUNT(*) > 1;

-- Merge duplicates hoặc deactivate old ones
UPDATE customers SET active = false WHERE id = ...;
```

---

## 📈 Monitoring

### Metrics cần theo dõi:

1. **Auto match rate**: % transactions được auto-save (1 match)

    ```sql
    SELECT
        COUNT(*) FILTER (WHERE debt_added = TRUE) * 100.0 / COUNT(*) as auto_match_rate
    FROM balance_history
    WHERE transfer_type = 'in' AND created_at > NOW() - INTERVAL '7 days';
    ```

2. **Pending rate**: % transactions cần admin review (multiple matches)

    ```sql
    SELECT COUNT(*) as pending_count
    FROM pending_customer_matches
    WHERE status = 'pending';
    ```

3. **Resolution time**: Thời gian từ pending → resolved
    ```sql
    SELECT
        AVG(EXTRACT(EPOCH FROM (resolved_at - created_at))/3600) as avg_hours
    FROM pending_customer_matches
    WHERE status = 'resolved';
    ```

---

## ✅ Checklist Deploy

- [ ] Đã chạy SQL setup (SETUP_ALL.sql hoặc từng migration)
- [ ] Đã verify tables được tạo thành công (`balance_history`, `balance_customer_info`)
- [ ] Đã push code lên production branch
- [ ] Đã restart server
- [ ] Đã test webhook với transaction mẫu
- [ ] Đã check logs có EXTRACT-PHONE và DEBT-UPDATE
- [ ] Đã verify records được tạo trong `balance_customer_info`

---

## 🎯 Expected Flow (Simplified)

```
1. Webhook nhận transaction → Parse content
                                    ↓
2. Extract số cuối (>4 chữ số) → "456788"
                                    ↓
3. Generate unique_code → "PHONE456788"
                                    ↓
4. UPSERT vào balance_customer_info
   (unique_code, customer_phone, customer_name)
                                    ↓
5. Mark transaction debt_added = TRUE
                                    ↓
                                  Done ✅
```

**Không có customer search, không có pending matches, không có debt updates.**

---

**Xong! Feature đã sẵn sàng sử dụng. Nếu có vấn đề, check logs hoặc ping dev team.**
