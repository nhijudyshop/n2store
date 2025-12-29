# 🚀 Hướng dẫn Deploy Phone Extraction Feature

## 📋 Tổng quan

Feature này tự động:
1. Extract số điện thoại từ nội dung chuyển khoản (>4 chữ số)
2. Search customer trong database (match bao quát: số chỉ cần **có chứa trong** SĐT đầy đủ)
3. Tự động cập nhật công nợ nếu tìm được 1 customer duy nhất
4. Lưu vào pending matches nếu tìm được nhiều customers

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
grep "EXTRACT-PHONE\|SEARCH-CUSTOMER\|DEBT-UPDATE" logs.txt

# Expected output:
# [EXTRACT-PHONE] Found GD, parsing before GD: CT DEN:0123456789 ND:0901234567 thanh toan
# [EXTRACT-PHONE] Found phone (last occurrence): 0901234567
# [SEARCH-CUSTOMER] Searching for phone: 0901234567
# [SEARCH-CUSTOMER] Found 1 customers for phone pattern: 0901234567
# [DEBT-UPDATE] ✅ Success (phone extraction - single match)
```

### 3.3. Kiểm tra pending matches

```bash
# Lấy danh sách pending matches
curl https://your-domain.com/api/sepay/pending-matches?status=pending
```

---

## 📊 Logic Matching (Bao quát)

### Query search customer:

```sql
SELECT id, phone, name, email, status, debt
FROM customers
WHERE phone LIKE '%0901234567%'  -- Số extracted chỉ cần CÓ CHỨA trong SĐT
ORDER BY
    CASE
        WHEN phone = '0901234567' THEN 100      -- Exact match (priority cao nhất)
        WHEN phone LIKE '0901234567%' THEN 95   -- Starts with
        WHEN phone LIKE '%0901234567' THEN 90   -- Ends with
        ELSE 85                                  -- Contains anywhere
    END DESC
LIMIT 10
```

### Ví dụ matching:

| Extracted | Customer Phone | Match? | Priority |
|-----------|----------------|--------|----------|
| `56789`   | `0901256789`   | ✅ Yes | 85 (contains) |
| `56789`   | `0956789012`   | ✅ Yes | 95 (starts with) |
| `56789`   | `0912356789`   | ✅ Yes | 90 (ends with) |
| `56789`   | `56789`        | ✅ Yes | 100 (exact) |
| `56789`   | `0912345678`   | ❌ No  | - |

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
        {"id": 1, "phone": "0901234567", "name": "Nguyen Van A"},
        {"id": 2, "phone": "0901234567xxx", "name": "Nguyen Van B"}
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
const content = "CT DEN:0123456789 ND:0901234567 thanh toan";
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
- [ ] Đã verify tables được tạo thành công
- [ ] Đã push code lên production branch
- [ ] Đã restart server
- [ ] Đã test webhook với transaction mẫu
- [ ] Đã check logs có EXTRACT-PHONE và SEARCH-CUSTOMER
- [ ] Đã test API endpoints (pending-matches, resolve, skip)

---

## 🎯 Expected Flow

```
1. Webhook nhận transaction → Parse content
                                    ↓
2. Extract số cuối (>4 chữ số) → "0901234567"
                                    ↓
3. Search customers → WHERE phone LIKE '%0901234567%'
                                    ↓
         ┌──────────────────────────┼──────────────────────────┐
         ↓                          ↓                          ↓
    0 results               1 result (auto)            Multiple results
    Skip                    ✅ Save + Update debt      ⚠️  Pending review
                            Mark debt_added=TRUE        Save to pending_matches
```

---

**Xong! Feature đã sẵn sàng sử dụng. Nếu có vấn đề, check logs hoặc ping dev team.**
