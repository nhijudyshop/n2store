# TPOS Socket.IO Real-time Events Analysis

> Captured: 2026-04-05, 14:32-14:40 (ICT), ~8.5 phut
> Total events: 310 | Unique conversations: 37 | Orders: 17

---

## 1. Tong quan Events nhan duoc

| Broadcast Type | Count | Mo ta |
|---|---|---|
| `raw-ws` | 159 | Raw Socket.IO messages (bao gom handshake) |
| `tpos:event` | 115 | Parsed on-events (main events) |
| `tpos:parsed-event` | 19 | Events co structured data (Order, Product) |
| `tpos:new-order` | 17 | Don hang moi/cap nhat |

| EventName | Count | Mo ta |
|---|---|---|
| `chatomni.on-message` | 96 | Tin nhan chat (Messenger + Comment) |
| `SaleOnline_Order` created | 11 | Don hang MOI duoc tao |
| `SaleOnline_Order` updated | 6 | Don hang duoc CAP NHAT |
| `product.image-updated` | 1 | Hinh anh san pham thay doi |
| `ProductTemplate` created | 1 | San pham moi duoc tao/cap nhat |

---

## 2. Chi tiet tung loai Event

### 2.1 `chatomni.on-message` — Tin nhan Chat (96 events)

Day la event chinh, chiem 83% tong so events.

**Cau truc:**
```json
{
  "Conversation": {
    "Id": "69d202d930d61faef94df3b1",
    "ChannelType": 4,
    "ChannelId": "270136663390370",      // Facebook Page ID
    "UserId": "26321856524090269",        // Facebook User ID
    "Name": "Ca Nhu",                     // Ten khach hang
    "HasPhone": true,                     // Da co SĐT
    "HasAddress": false,                  // Chua co dia chi
    "UpdatedTime": "2026-04-05T07:32:00.269Z"
  },
  "Message": {
    "Id": "69d20fefb01011ec1622ae7b",
    "ChannelType": 4,
    "ChannelId": "270136663390370",
    "UserId": "26321856524090269",
    "Message": "DẠ ĐÃ NHẬN 100K ACB 04/05",    // Noi dung tin nhan
    "MessageType": 11,                            // 11=Messenger, 12=Comment
    "IsOwner": true,                               // true=Shop gui, false=KH gui
    "Data": {
      "id": "m_xxx",                              // Facebook message ID
      "message": "DẠ ĐÃ NHẬN 100K ACB 04/05",
      "app_id": "1733556690196497",               // Chi co voi Messenger
      "created_time": "2026-04-05T14:31:59.814+07:00",
      "from": { "id": "270136663390370" },
      "attachments": null,                         // hoac { data: [...] }
      "webhook_attachments": []                    // hoac [{type:"image", payload:{url:...}}]
    }
  },
  "EventName": "chatomni.on-message"
}
```

**MessageType:**
| Type | Count | Mo ta |
|---|---|---|
| 11 | 62 | Facebook Messenger (inbox) |
| 12 | 34 | Facebook Comment (tren post live) |

**IsOwner:**
| Value | Count | Mo ta |
|---|---|---|
| false | 69 | Khach hang gui (72%) |
| true | 27 | Shop gui/tra loi (28%) |

**Attachment types:**
| Type | Count |
|---|---|
| text_only | 84 |
| image | 13 |
| template | 1 |
| empty_message | 1 |

**Facebook Pages (ChannelIds):**
| ChannelId | Count | Ghi chu |
|---|---|---|
| 270136663390370 | 55 | Page chinh (STORE) |
| 1479019015501919 | 28 | Page 2 |
| 117267091364524 | 13 | Page 3 (HOUSE) |

---

### 2.2 `SaleOnline_Order` — Don hang (17 events)

**Created (11 events) — Don moi:**
```json
{
  "Type": "SaleOnline_Order",
  "Message": "Duyên: label.create_order_with_code 260401050.",
  "Data": {
    "Facebook_PostId": "270136663390370_1325483922726440",
    "Facebook_UserName": "Hong Phuong Duong",
    "Facebook_ASUserId": "6534172086646407",
    "Facebook_PageId": null,
    "Facebook_CommentId": "1325483922726440_2055808845331824",
    "Id": "b41e0000-5d7d-0015-bfd0-08de92e597a9",     // TPOS Order UUID
    "Code": "260401050",                                 // Ma don hang
    "Session": 1175,                                     // Live session ID
    "SessionIndex": 268                                  // So thu tu trong session
  },
  "EventName": "created"
}
```

**Updated (6 events) — Cap nhat don:**
```json
{
  "Type": "SaleOnline_Order",
  "Message": "Hạnh: label.update_order_with_code 260401047.",
  "Data": {
    "Facebook_PostId": "270136663390370_1325483922726440",
    "Facebook_UserName": "Ngọc Mai",
    "Facebook_ASUserId": "6712551762122145",
    "Id": "b41e0000-5d7d-0015-60c8-08de92e518cc",
    "Code": "260401047",
    "Session": 1175,
    "SessionIndex": 265
  },
  "EventName": "updated"
}
```

**Thong tin co the extract:**
- `Code`: Ma don hang → link den order list
- `Session` + `SessionIndex`: Vi tri trong buoi live
- `Facebook_UserName`: Ten KH dat hang
- `Facebook_PostId`: Post live nao
- `Facebook_CommentId`: Comment nao tao don
- `Message`: "[NV]: [action] [code]" → ten nhan vien xu ly

---

### 2.3 `Product` — San pham (1 event)

```json
{
  "Type": "Product",
  "Message": "",
  "Data": {
    "ProductId": 153261,
    "ImageUrl": "https://img1.tpos.vn/xxx/product_0_xxx.jpg"
  },
  "EventName": "product.image-updated"
}
```

### 2.4 `ProductTemplate` — Template san pham (1 event)

```json
{
  "type": "ProductTemplate",
  "action": "created",
  "message": "nv07: Cập nhật sản phẩm: 0504 B21 ĐẦM DÀI CỔ REN NƠ ĐEN.",
  "data": { "Id": 116696 },
  "companyId": 0,
  "userId": "812948a8-cd98-40a1-95d3-44e1216270fa"
}
```

---

## 3. Nhung phan UI co the cap nhat real-time

### 3.1 BADGE DON HANG MOI (Priority: CAO)

**Event:** `SaleOnline_Order` (EventName: `created`)
**UI:** Badge so tren tab "Don hang" hoac notification popup
**Data co san:** Code, Facebook_UserName, Session, NV xu ly
**Tan suat:** ~11 don/8 phut = ~80 don/gio (trong buoi live)

```
Cach lam:
- Listen window 'tposNewOrder' event
- Filter EventName === 'created'
- Hien badge count tren tab header
- Optional: toast notification "Don moi #260401050 - Hong Phuong Duong"
```

### 3.2 CAP NHAT TRANG THAI DON HANG (Priority: CAO)

**Event:** `SaleOnline_Order` (EventName: `updated`)
**UI:** Refresh row trong bang don hang khi don bi sua
**Data co san:** Code (ma don), Message (NV nao sua)
**Tan suat:** ~6 lan/8 phut

```
Cach lam:
- Listen window 'tposOrderUpdate' event
- Tim don trong danh sach hien tai theo Code
- Highlight row + cap nhat data (fetch lai tu API)
- Optional: mini notification "Hạnh cập nhật đơn 260401047"
```

### 3.3 CHAT LIVE FEED (Priority: TRUNG BINH)

**Event:** `chatomni.on-message` (MessageType: 12 = Comment)
**UI:** Feed comment live real-time (giong TPOS SaleOnline page)
**Data co san:** Name, Message, IsOwner, attachments, PostId
**Tan suat:** ~34 comments/8 phut = ~250 comments/gio

```
Cach lam:
- Listen window 'tposConversationUpdate' event
- Filter MessageType === 12 (chi comment, khong inbox)
- Hien thi trong live feed panel
- Co the filter theo Facebook_PostId (post live cu the)
```

### 3.4 THONG BAO INBOX MOI (Priority: TRUNG BINH)

**Event:** `chatomni.on-message` (MessageType: 11 = Messenger)
**UI:** Badge "tin nhan moi" + preview
**Data co san:** Name, Message, HasPhone, HasAddress
**Tan suat:** ~62 inbox/8 phut = ~465 inbox/gio

```
Cach lam:
- Listen window 'tposConversationUpdate' event
- Filter MessageType === 11 && IsOwner === false (chi tin KH gui)
- Hien badge count
- Preview: "Ca Nhu: DẠ ĐÃ NHẬN 100K ACB 04/05"
```

### 3.5 TRANG THAI KHACH HANG (Priority: THAP)

**Event:** `chatomni.on-message` → `Conversation.HasPhone` / `HasAddress`
**UI:** Icon trang thai ben canh ten KH trong danh sach
**Data co san:** HasPhone, HasAddress

```
Cach lam:
- Khi nhan message cua 1 KH, check HasPhone/HasAddress
- Cap nhat icon (📱 co SDT, 📍 co dia chi)
- Giup NV biet KH nao can lay them thong tin
```

### 3.6 CAP NHAT HINH SAN PHAM (Priority: THAP)

**Event:** `product.image-updated`
**UI:** Refresh hinh san pham trong catalog/don hang
**Data co san:** ProductId, ImageUrl
**Tan suat:** Rat thap (~1/8 phut)

```
Cach lam:
- Listen tposParsedEvent, filter eventType === 'Product'
- Tim product trong cache/UI theo ProductId
- Cap nhat ImageUrl moi
```

---

## 4. Bang tom tat

| # | Feature | Event | Priority | Do kho | Tan suat |
|---|---------|-------|----------|--------|----------|
| 1 | Badge don moi | SaleOnline_Order.created | CAO | De | ~80/h |
| 2 | Cap nhat trang thai don | SaleOnline_Order.updated | CAO | Trung binh | ~45/h |
| 3 | Live comment feed | chatomni.on-message (type 12) | TRUNG BINH | Trung binh | ~250/h |
| 4 | Badge inbox moi | chatomni.on-message (type 11) | TRUNG BINH | De | ~465/h |
| 5 | Trang thai KH (phone/address) | chatomni.on-message | THAP | De | Tu dong |
| 6 | Refresh hinh san pham | product.image-updated | THAP | De | Rat thap |

---

## 5. Architecture hien tai

```
TPOS rt-2.tpos.app (Socket.IO)
    |
    | WebSocket (namespace: /chatomni)
    | Events: on-events
    |
Render Server (TposRealtimeClient)
    |
    | WebSocket broadcast
    | Types: tpos:event, tpos:parsed-event,
    |        tpos:new-order, tpos:order-update
    |
Browser (TposRealtimeManager)
    |
    | window.dispatchEvent(CustomEvent)
    |
    |-- 'tposNewOrder'           → #1 Badge don moi
    |-- 'tposOrderUpdate'        → #2 Cap nhat trang thai
    |-- 'tposConversationUpdate' → #3 Live feed, #4 Badge inbox
    |-- 'tposParsedEvent'        → #5 Trang thai KH, #6 Hinh SP
```

**Frontend listener code:**
```javascript
// #1 Badge don moi
window.addEventListener('tposNewOrder', (e) => {
    const { id, customerName, content } = e.detail;
    showOrderBadge(+1);
    showToast(`Don moi: ${content}`);
});

// #2 Cap nhat trang thai don
window.addEventListener('tposOrderUpdate', (e) => {
    const orderCode = e.detail.Data?.Code;
    refreshOrderRow(orderCode);
});

// #3 + #4 Chat events
window.addEventListener('tposConversationUpdate', (e) => {
    const { conversation, eventType, rawData } = e.detail;
    const msg = rawData?.Message;

    if (msg?.MessageType === 12) {
        // Comment tren post live
        addToLiveFeed(conversation, msg);
    } else if (msg?.MessageType === 11 && !msg?.IsOwner) {
        // Inbox tu khach hang
        showInboxBadge(+1);
    }
});
```

---

## 6. Luu y ky thuat

1. **Namespace auth**: TPOS yeu cau token + room trong `40/chatomni,{token, room}` (khong chi trong join message)
2. **Heartbeat**: Server ping 25s, timeout 60s — can gui pong ngay khi nhan ping
3. **Event format**: `on-events` payload la JSON string can parse 2 lan (JSON trong JSON)
4. **MessageType 11 vs 12**: 11 = Messenger inbox, 12 = Comment tren post — dung de filter UI tuong ung
5. **IsOwner**: true = shop/NV gui, false = khach hang gui — filter de chi hien thong bao KH gui
6. **3 Facebook Pages**: Events den tu nhieu page — can filter theo ChannelId neu chi muon hien 1 page
