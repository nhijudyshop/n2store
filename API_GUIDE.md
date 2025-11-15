# ChatOmni API Guide

Hướng dẫn sử dụng API để lấy tin nhắn, kiểm tra tin nhắn mới từ TPOS ChatOmni.

## 1. Lấy danh sách Conversations

### Endpoint
```
POST /api-ms/chatomni/v1/conversations/search
```

### Headers
```json
{
  "Content-Type": "application/json",
  "Authorization": "Bearer YOUR_ACCESS_TOKEN",
  "accept": "application/json"
}
```

### Request Body
```json
{
  "Keyword": null,
  "Limit": 50,
  "Sort": null,
  "Before": null,
  "After": null,
  "Channels": [
    {
      "Id": "270136663390370",
      "Type": 4
    }
  ],
  "Type": "message",
  "HasPhone": null,
  "HasAddress": null,
  "HasOrder": null,
  "IsUnread": null,
  "IsUnreplied": null,
  "TagIds": [],
  "UserIds": [],
  "Start": null,
  "End": null,
  "FromNewToOld": null
}
```

### Response Structure
```json
{
  "Data": [
    {
      "Id": "conversation_id",
      "Name": "Tên khách hàng",
      "Phone": "0123456789",
      "Channel": {
        "Id": "270136663390370",
        "Type": 4
      },
      "User": {
        "Id": "facebook_psid_here"  // ← Facebook PSID
      },
      "LastActivities": {
        "HasUnread": true,           // ← Có tin nhắn mới
        "UnreadCount": 5,             // ← Số lượng tin nhắn chưa đọc
        "Message": {
          "Message": "Nội dung tin nhắn cuối"
        },
        "ActivitedTime": "2025-11-15T10:30:00Z"
      }
    }
  ]
}
```

## 2. Lấy Messages của User cụ thể

### Endpoint
```
GET /api-ms/chatomni/v1/messages?type={type}&channelId={channelId}&userId={userId}
```

### Parameters
- **`type`**: Loại platform (4 = Facebook Messenger)
- **`channelId`**: ID của kênh (Facebook Page ID)
- **`userId`**: Facebook PSID của khách hàng

### Headers
```json
{
  "Authorization": "Bearer YOUR_ACCESS_TOKEN",
  "accept": "application/json"
}
```

### Ví dụ Request
```
GET /api-ms/chatomni/v1/messages?type=4&channelId=270136663390370&userId=7234567890123456
```

### Response Structure
```json
{
  "Data": [
    {
      "Id": "message_id",
      "Message": "Nội dung tin nhắn",
      "IsOwner": false,              // false = khách gửi, true = shop gửi
      "CreatedTime": "2025-11-15T10:30:00Z",
      "Attachments": [
        {
          "Type": "image",
          "Payload": {
            "Url": "https://..."
          }
        }
      ]
    }
  ]
}
```

### Lưu ý
- API **KHÔNG có tham số `limit`** → Backend sẽ trả về số lượng messages mặc định (thường 50-200 messages gần nhất)
- Để lấy thêm messages cũ hơn, cần dùng **pagination** với tham số `before` hoặc `after`
- Messages được sắp xếp từ **cũ đến mới**

## 3. Kiểm tra Tin nhắn mới

### Cách 1: Từ Conversation List

Mỗi conversation có 2 trường quan trọng:

```javascript
conversation.LastActivities.HasUnread     // Boolean: có tin nhắn chưa đọc
conversation.LastActivities.UnreadCount   // Number: số lượng tin nhắn chưa đọc
```

### Ví dụ Code
```javascript
// Kiểm tra tin nhắn mới
conversations.forEach(conv => {
  if (conv.LastActivities.HasUnread) {
    console.log(`${conv.Name} có ${conv.LastActivities.UnreadCount} tin nhắn mới`);
  }
});

// Lọc chỉ conversations có tin nhắn mới
const unreadConversations = conversations.filter(
  conv => conv.LastActivities.HasUnread
);
```

### Cách 2: Filter khi Search

Thêm tham số `IsUnread` vào request body:

```json
{
  "Keyword": null,
  "Limit": 50,
  "IsUnread": true,  // ← Chỉ lấy conversations có tin nhắn chưa đọc
  "Channels": [...]
}
```

## 4. Đánh dấu Đã đọc

### Endpoint
```
POST /api-ms/chatomni/v1/conversations/{type}/{channelId}/{userId}/seen?isSeen=true&type=message
```

### Parameters
- **`type`** (trong URL): Loại platform (4 = Facebook)
- **`channelId`**: ID của kênh
- **`userId`**: Facebook PSID của khách hàng
- **`isSeen`** (query param): true = đánh dấu đã đọc

### Headers
```json
{
  "Authorization": "Bearer YOUR_ACCESS_TOKEN",
  "accept": "application/json"
}
```

### Ví dụ Request
```
POST /api-ms/chatomni/v1/conversations/4/270136663390370/7234567890123456/seen?isSeen=true&type=message
```

### Code Example
```javascript
async function markAsSeen(channelId, userId) {
  await fetch(
    `/api/api-ms/chatomni/v1/conversations/4/${channelId}/${userId}/seen?isSeen=true&type=message`,
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'accept': 'application/json'
      }
    }
  );
}
```

## 5. Workflow thực tế

### Bước 1: Lấy danh sách conversations
```javascript
const response = await fetch('/api/api-ms/chatomni/v1/conversations/search', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`
  },
  body: JSON.stringify({
    Limit: 50,
    Channels: [{ Id: "270136663390370", Type: 4 }]
  })
});
const { Data: conversations } = await response.json();
```

### Bước 2: Tìm conversation theo Facebook PSID
```javascript
const userPSID = "7234567890123456";
const conversation = conversations.find(
  conv => conv.User.Id === userPSID
);

if (!conversation) {
  console.log("Không tìm thấy conversation với PSID này");
}
```

### Bước 3: Kiểm tra tin nhắn mới
```javascript
if (conversation.LastActivities.HasUnread) {
  console.log(`Có ${conversation.LastActivities.UnreadCount} tin nhắn mới`);
  console.log(`Tin nhắn cuối: ${conversation.LastActivities.Message.Message}`);
}
```

### Bước 4: Lấy messages
```javascript
const messagesResponse = await fetch(
  `/api/api-ms/chatomni/v1/messages?type=4&channelId=${conversation.Channel.Id}&userId=${conversation.User.Id}`,
  {
    headers: {
      'Authorization': `Bearer ${token}`
    }
  }
);
const { Data: messages } = await messagesResponse.json();
```

### Bước 5: Đánh dấu đã đọc (nếu có tin nhắn mới)
```javascript
if (conversation.LastActivities.HasUnread) {
  await markAsSeen(conversation.Channel.Id, conversation.User.Id);
}
```

## 6. Tìm kiếm chính xác theo Facebook PSID

### Option 1: Filter trong code (sau khi fetch)
```javascript
const conversations = await fetchConversations();
const userConversation = conversations.find(
  conv => conv.User.Id === "7234567890123456"
);
```

### Option 2: Search với UserIds parameter
```javascript
const response = await fetch('/api/api-ms/chatomni/v1/conversations/search', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`
  },
  body: JSON.stringify({
    Limit: 1,
    UserIds: ["7234567890123456"],  // ← Tìm theo PSID
    Channels: [{ Id: "270136663390370", Type: 4 }]
  })
});
```

## 7. Lấy Avatar từ Facebook PSID

Facebook cung cấp API public để lấy avatar từ PSID:

```javascript
function getFacebookAvatar(psid) {
  return `https://platform-lookaside.fbsbx.com/platform/profilepic/?psid=${psid}&height=200&width=200`;
}

// Sử dụng
const avatarUrl = getFacebookAvatar("7234567890123456");
```

## 8. Platform Types

| Type | Platform |
|------|----------|
| 4    | Facebook Messenger |
| ?    | Zalo OA |
| ?    | Instagram |

## 9. Lưu ý quan trọng

1. **Authentication**: Tất cả API đều cần Bearer token trong header
2. **PSID**: `User.Id` chính là Facebook PSID - dùng để identify chính xác người dùng
3. **Channel**: Mỗi Facebook Page có 1 Channel ID riêng
4. **Messages Limit**: Backend có limit mặc định, không lấy toàn bộ lịch sử
5. **Auto Mark Seen**: Nên tự động đánh dấu đã đọc khi user xem conversation
6. **Polling**: Không có WebSocket → Cần polling (refresh 10s) để kiểm tra tin nhắn mới

## 10. Error Handling

```javascript
try {
  const response = await fetch('/api/...');

  if (!response.ok) {
    if (response.status === 401) {
      console.error('Token hết hạn hoặc không hợp lệ');
    } else if (response.status === 404) {
      console.error('Không tìm thấy conversation');
    } else {
      console.error('Lỗi API:', response.status);
    }
    return;
  }

  const data = await response.json();
  // Process data...
} catch (error) {
  console.error('Network error:', error);
}
```

## 11. Best Practices

1. **Cache conversations**: Lưu cache để giảm số lần gọi API
2. **Debounce search**: Delay khi user gõ search để tránh spam API
3. **Lazy load messages**: Chỉ load messages khi user click vào conversation
4. **Mark seen sau khi view**: Đánh dấu đã đọc ngay khi user mở conversation
5. **Handle token expiry**: Refresh token hoặc yêu cầu đăng nhập lại khi 401

---

**Tham khảo code thực tế**: Xem file `src/app.jsx` trong project này để biết implementation chi tiết.
