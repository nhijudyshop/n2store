# Multi-Account Parallel Sending System

## Tổng quan

Hệ thống gửi tin nhắn Facebook sử dụng **tất cả Pancake accounts** để gửi song song, giúp tăng tốc độ gửi tin nhắn đáng kể mà không bị rate limit.

## Kiến trúc

```
┌─────────────────────────────────────────────────────────────┐
│                    Message Template Modal                     │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐  │
│  │ X accounts  │  │  1s delay   │  │ Pancake API (only)  │  │
│  │  (readonly) │  │             │  │ T-Page disabled     │  │
│  └─────────────┘  └─────────────┘  └─────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│              Round-Robin Order Distribution                   │
│                                                               │
│   Orders: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12...]        │
│                              │                                │
│              ┌───────────────┼───────────────┐               │
│              ▼               ▼               ▼               │
│         Account A       Account B       Account C            │
│         [1,4,7,10]      [2,5,8,11]      [3,6,9,12]          │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│              Parallel Execution (Workers)                     │
│                                                               │
│   Worker A ──▶ [1] ─delay─ [4] ─delay─ [7] ─delay─ [10]     │
│   Worker B ──▶ [2] ─delay─ [5] ─delay─ [8] ─delay─ [11]     │
│   Worker C ──▶ [3] ─delay─ [6] ─delay─ [9] ─delay─ [12]     │
│                                                               │
│   ↑ Tất cả workers chạy SONG SONG                            │
└─────────────────────────────────────────────────────────────┘
```

## Files liên quan

| File | Mô tả |
|------|-------|
| `js/managers/pancake-token-manager.js` | Quản lý accounts, lưu localStorage |
| `js/chat/message-template-manager.js` | Logic gửi tin nhắn multi-account |

## Cách hoạt động chi tiết

### 1. Lấy danh sách accounts hợp lệ

```javascript
// pancake-token-manager.js
getValidAccountsForSending() {
    const validAccounts = [];
    const now = Math.floor(Date.now() / 1000);

    for (const [accountId, account] of Object.entries(this.accounts)) {
        // Check if not expired (with 1 hour buffer)
        if (account.exp && (now < account.exp - 3600)) {
            validAccounts.push({
                accountId,
                name: account.name,
                uid: account.uid,
                token: account.token,
                exp: account.exp
            });
        }
    }
    return validAccounts;
}
```

### 2. Phân phối đơn hàng (Round-Robin)

```javascript
// message-template-manager.js
const accountQueues = validAccounts.map(() => []);

// Round-robin distribution
this.selectedOrders.forEach((order, index) => {
    const accountIndex = index % validAccounts.length;
    accountQueues[accountIndex].push(order);
});
```

**Ví dụ phân phối:**

| Order Index | `index % 3` | Assigned Account |
|-------------|-------------|------------------|
| 0 | 0 | Account A |
| 1 | 1 | Account B |
| 2 | 2 | Account C |
| 3 | 0 | Account A |
| 4 | 1 | Account B |
| 5 | 2 | Account C |
| ... | ... | ... |

### 3. Tạo Worker cho mỗi account

```javascript
const createWorker = (account, queue) => {
    const context = {
        token: account.token,
        displayName,
        templateContent,
        sendMode
    };

    return async () => {
        for (const order of queue) {
            // Delay before processing
            if (delay > 0) {
                await new Promise(r => setTimeout(r, delay));
            }

            await this._processSingleOrder(order, context);
        }
    };
};
```

### 4. Chạy tất cả workers song song

```javascript
const workers = validAccounts.map((account, i) =>
    createWorker(account, accountQueues[i])()
);

await Promise.all(workers);
```

## Ví dụ thực tế

### Case: 8 Accounts, 1000 Đơn, Delay 1s

#### Phân phối

```
1000 đơn ÷ 8 accounts = 125 đơn/account
```

| Account | Đơn được gán | Số lượng |
|---------|--------------|----------|
| Account 1 | 1, 9, 17, 25, ... 993 | 125 đơn |
| Account 2 | 2, 10, 18, 26, ... 994 | 125 đơn |
| Account 3 | 3, 11, 19, 27, ... 995 | 125 đơn |
| Account 4 | 4, 12, 20, 28, ... 996 | 125 đơn |
| Account 5 | 5, 13, 21, 29, ... 997 | 125 đơn |
| Account 6 | 6, 14, 22, 30, ... 998 | 125 đơn |
| Account 7 | 7, 15, 23, 31, ... 999 | 125 đơn |
| Account 8 | 8, 16, 24, 32, ... 1000 | 125 đơn |

#### Timeline

```
Thời gian (giây)
0s      1s      2s      3s      ...     124s    125s
│       │       │       │               │       │
▼       ▼       ▼       ▼               ▼       ▼

Acc 1:  [Đơn 1] [Đơn 9] [Đơn 17] ...   [Đơn 993] ✅
Acc 2:  [Đơn 2] [Đơn 10][Đơn 18] ...   [Đơn 994] ✅
Acc 3:  [Đơn 3] [Đơn 11][Đơn 19] ...   [Đơn 995] ✅
Acc 4:  [Đơn 4] [Đơn 12][Đơn 20] ...   [Đơn 996] ✅
Acc 5:  [Đơn 5] [Đơn 13][Đơn 21] ...   [Đơn 997] ✅
Acc 6:  [Đơn 6] [Đơn 14][Đơn 22] ...   [Đơn 998] ✅
Acc 7:  [Đơn 7] [Đơn 15][Đơn 23] ...   [Đơn 999] ✅
Acc 8:  [Đơn 8] [Đơn 16][Đơn 24] ...   [Đơn 1000]✅

        ↑       ↑       ↑               ↑
      8 đơn   8 đơn   8 đơn           8 đơn
      /giây   /giây   /giây           /giây
```

#### So sánh hiệu suất

| Phương thức | Công thức | Thời gian |
|-------------|-----------|-----------|
| 1 Account | 1000 × 1s | **16 phút 40 giây** |
| 8 Accounts | 125 × 1s | **2 phút 5 giây** |

**Nhanh hơn ~8 lần!**

## Đảm bảo không trùng lặp

### Tại sao không có đơn nào bị gửi trùng?

1. **Mỗi đơn chỉ nằm trong 1 queue duy nhất**
   ```
   Order 1 → accountQueues[0] → CHỈ Account A xử lý
   Order 2 → accountQueues[1] → CHỈ Account B xử lý
   Order 3 → accountQueues[2] → CHỈ Account C xử lý
   ```

2. **Queue là mảng riêng biệt, không chia sẻ**
   ```javascript
   const accountQueues = validAccounts.map(() => []); // Mỗi account 1 mảng riêng
   ```

3. **Không có cơ chế "lấy từ queue chung"**
   - Khác với worker pool pattern (nhiều worker lấy từ 1 queue)
   - Ở đây: mỗi worker có queue riêng, xử lý tuần tự

### Minh họa

```
KHÔNG TRÙNG:

Account A queue: [1, 4, 7, 10]  ←── Account A CHỈ xử lý những đơn này
Account B queue: [2, 5, 8, 11]  ←── Account B CHỈ xử lý những đơn này
Account C queue: [3, 6, 9, 12]  ←── Account C CHỈ xử lý những đơn này

Không có đơn nào xuất hiện trong 2 queue!
```

## Công thức tính thời gian

```
Thời gian ≈ (Số đơn ÷ Số accounts) × Delay

Ví dụ:
- 1000 đơn, 8 accounts, 1s delay
- Thời gian = (1000 ÷ 8) × 1s = 125s ≈ 2 phút
```

## Throughput

```
Throughput = Số accounts ÷ Delay

Ví dụ:
- 8 accounts, 1s delay
- Throughput = 8 đơn/giây
```

## UI Changes

### Trước (cũ)

```
[1] người  ←── Có thể chỉnh số thread (1-5)
API: ● T-Page  ○ Pancake
```

### Sau (mới)

```
[8] accounts  ←── Readonly, hiển thị số accounts hợp lệ
API: ○ T-Page (disabled)  ● Pancake (default)
```

## Storage

### Accounts được lưu ở đâu?

| Storage | Key | Mục đích |
|---------|-----|----------|
| Firestore | `pancake_tokens/accounts` | Cloud sync, source of truth |
| localStorage | `pancake_all_accounts` | Fast access, offline |
| Memory | `this.accounts` | Runtime cache |

### Flow load accounts

```
1. App khởi động
2. Load từ Firestore
3. Save vào localStorage (backup)
4. Khi gửi tin → getValidAccountsForSending() từ memory
```

## Error Handling

Mỗi worker xử lý lỗi độc lập:

```javascript
try {
    await this._processSingleOrder(order, context);
    this.sendingState.success++;
} catch (err) {
    this.sendingState.error++;
    this.sendingState.errors.push({
        order: order.code,
        error: err.message,
        account: account.name  // Biết account nào gặp lỗi
    });
}
```

Lỗi của 1 account không ảnh hưởng các account khác.

## Tóm tắt

| Feature | Mô tả |
|---------|-------|
| **Phân phối** | Round-robin, chia đều đơn cho các accounts |
| **Song song** | Tất cả accounts chạy cùng lúc |
| **Delay** | Mỗi account có delay riêng giữa các đơn |
| **Trùng lặp** | 0% - Mỗi đơn chỉ 1 account xử lý |
| **Tốc độ** | Nhanh hơn N lần (N = số accounts) |
| **Error isolation** | Lỗi 1 account không ảnh hưởng accounts khác |
