# Hệ thống Chat Nội Bộ - N2Store

## Tổng quan

Hệ thống chat nội bộ được tích hợp vào N2Store, cho phép nhân viên và quản lý giao tiếp nhanh chóng với nhau. Chat có thể được mở ở bất kỳ trang nào dưới dạng bong bóng chat nổi.

## Tính năng

✅ **Bong bóng chat nổi**: Mở chat ở bất kỳ trang nào
✅ **Tin nhắn văn bản**: Gửi và nhận tin nhắn văn bản
✅ **Hình ảnh**: Gửi và xem hình ảnh
✅ **File đính kèm**: Gửi và nhận file
✅ **Số điện thoại**: Chia sẻ số điện thoại
✅ **Trạng thái online/offline**: Xem ai đang online
✅ **Typing indicator**: Thấy khi người khác đang nhập
✅ **Unread count**: Đếm tin nhắn chưa đọc
✅ **Real-time sync**: Đồng bộ tức thì qua Firebase

## Cấu trúc File

```
/js/
  ├── chat-manager.js       # Quản lý logic chat (Firebase, messages, etc.)
  └── chat-bubble.js        # Giao diện người dùng

/css/
  └── chat-modern.css       # Styling cho chat system

/database.rules.json        # Firebase security rules
```

## Firebase Database Schema

### 1. chatConversations

Lưu thông tin về các cuộc trò chuyện.

```json
{
  "chatConversations": {
    "conversationId": {
      "id": "conversationId",
      "type": "direct",  // hoặc "group"
      "members": {
        "userId1": true,
        "userId2": true
      },
      "createdAt": 1699999999999,
      "createdBy": "userId1",
      "lastMessage": "Nội dung tin nhắn cuối",
      "lastMessageTimestamp": 1699999999999,
      "lastMessageSenderId": "userId1"
    }
  }
}
```

### 2. chatMessages

Lưu tất cả tin nhắn của mỗi conversation.

```json
{
  "chatMessages": {
    "conversationId": {
      "messageId": {
        "id": "messageId",
        "senderId": "userId",
        "senderName": "Tên người gửi",
        "timestamp": 1699999999999,
        "type": "text",  // text, image, file, phone
        "content": "Nội dung tin nhắn",
        "status": "sent"  // sent, delivered, read
      }
    }
  }
}
```

### 3. chatMembers

Lưu thông tin thành viên của mỗi conversation.

```json
{
  "chatMembers": {
    "conversationId": {
      "userId": {
        "userId": "userId",
        "joinedAt": 1699999999999,
        "lastReadTimestamp": 1699999999999
      }
    }
  }
}
```

### 4. userStatus

Lưu trạng thái online/offline của user.

```json
{
  "userStatus": {
    "userId": {
      "status": "online",  // online, offline
      "lastActive": 1699999999999,
      "displayName": "Tên hiển thị"
    }
  }
}
```

### 5. chatTyping

Lưu trạng thái đang nhập của user (tự động xóa sau 3 giây).

```json
{
  "chatTyping": {
    "conversationId": {
      "userId": {
        "displayName": "Tên hiển thị",
        "timestamp": 1699999999999
      }
    }
  }
}
```

## API Documentation

### ChatManager Class

#### Khởi tạo

```javascript
await window.ChatManager.initialize();
```

#### Tạo hoặc lấy conversation

```javascript
const conversationId = await window.ChatManager.createOrGetConversation(
  ['userId1', 'userId2'],  // Danh sách user IDs
  'direct'                 // 'direct' hoặc 'group'
);
```

#### Gửi tin nhắn văn bản

```javascript
await window.ChatManager.sendTextMessage(conversationId, 'Xin chào!');
```

#### Gửi hình ảnh

```javascript
await window.ChatManager.sendImageMessage(
  conversationId,
  imageBase64,    // Base64 hoặc URL
  'Caption text'  // Optional
);
```

#### Gửi file

```javascript
await window.ChatManager.sendFileMessage(
  conversationId,
  fileBase64,     // Base64 hoặc URL
  'document.pdf', // File name
  1024000        // File size in bytes
);
```

#### Gửi số điện thoại

```javascript
await window.ChatManager.sendPhoneMessage(
  conversationId,
  '0123456789',
  'Tên liên hệ'  // Optional
);
```

#### Đánh dấu đã đọc

```javascript
await window.ChatManager.markAsRead(conversationId, lastMessageTimestamp);
```

#### Lấy số tin nhắn chưa đọc

```javascript
const unreadCount = await window.ChatManager.getUnreadCount(conversationId);
```

#### Lấy danh sách conversations

```javascript
const conversations = await window.ChatManager.getConversationsWithUnreadCount();
```

#### Upload file

```javascript
const fileData = await window.ChatManager.uploadFile(fileObject);
// Returns: { data, name, size, type }
```

#### Lắng nghe events

```javascript
// Lắng nghe cập nhật conversations
window.ChatManager.on('conversationsUpdated', (conversations) => {
  console.log('Conversations updated:', conversations);
});

// Lắng nghe cập nhật messages
window.ChatManager.on('messagesUpdated', ({ conversationId, messages }) => {
  console.log('Messages updated:', conversationId, messages);
});
```

### ChatBubbleUI Class

ChatBubbleUI tự động khởi tạo khi trang load. Không cần gọi thủ công.

#### Mở chat window

```javascript
window.ChatBubbleUI.toggleChat();
```

#### Mở conversation cụ thể

```javascript
await window.ChatBubbleUI.openConversation(conversationId);
```

#### Tạo conversation mới

```javascript
await window.ChatBubbleUI.createNewConversation(userId);
```

## Cách sử dụng

### 1. Tự động tích hợp

Hệ thống chat tự động load trên tất cả các trang có `core-loader.js`:

```html
<script src="/js/core-loader.js"></script>
```

### 2. Manual integration (nếu cần)

Nếu một trang không sử dụng `core-loader.js`, bạn có thể tích hợp thủ công:

```html
<!-- CSS -->
<link rel="stylesheet" href="/css/chat-modern.css">

<!-- JavaScript (theo thứ tự) -->
<script src="/js/firebase-config.js"></script>
<script src="/js/shared-auth-manager.js"></script>
<script src="/js/chat-manager.js"></script>
<script src="/js/chat-bubble.js"></script>
```

### 3. Sử dụng trong code

```javascript
// Đợi core utilities load xong
document.addEventListener('coreUtilitiesLoaded', async () => {
  // ChatManager và ChatBubbleUI đã sẵn sàng
  console.log('Chat system ready!');

  // Tạo conversation mới (nếu cần)
  const convId = await window.ChatManager.createOrGetConversation(['user123']);

  // Gửi tin nhắn
  await window.ChatManager.sendTextMessage(convId, 'Hello!');
});
```

## Giao diện người dùng

### Bong bóng chat

- **Vị trí**: Góc dưới bên phải màn hình
- **Icon**: Biểu tượng tin nhắn
- **Badge**: Hiển thị số tin nhắn chưa đọc (nếu có)
- **Click**: Mở/đóng cửa sổ chat

### Cửa sổ chat

#### View 1: Danh sách conversations

- **Search bar**: Tìm kiếm conversations
- **Conversation list**: Danh sách cuộc trò chuyện
  - Avatar tròn với chữ cái đầu
  - Tên người dùng
  - Tin nhắn cuối cùng
  - Thời gian
  - Badge tin nhắn chưa đọc
- **New message button**: Tạo cuộc trò chuyện mới

#### View 2: Chat view

- **Header**:
  - Back button: Quay lại danh sách
  - User info: Tên và trạng thái (online/offline)
  - Info button: Xem thông tin chi tiết
- **Messages area**: Hiển thị tin nhắn
  - Tin nhắn của bạn: Bên phải, màu xanh
  - Tin nhắn của người khác: Bên trái, màu trắng
  - Hỗ trợ: text, image, file, phone
  - Hiển thị thời gian
- **Typing indicator**: "đang nhập..." khi người khác nhập
- **Input area**:
  - Attach button: Đính kèm file
  - Image button: Gửi hình ảnh
  - Text input: Nhập tin nhắn
  - Send button: Gửi tin nhắn

## Responsive Design

- **Desktop**: 380x600px window
- **Mobile**: Full screen (trừ margins)
- **Breakpoint**: 480px

## Performance

### Optimizations

1. **Message limit**: Chỉ load 100 tin nhắn gần nhất
2. **Base64 encoding**: File và hình ảnh được encode trực tiếp
3. **Real-time sync**: Firebase Realtime Database
4. **Auto cleanup**: Typing indicators tự xóa sau 3 giây
5. **Lazy loading**: Messages chỉ load khi mở conversation

### Best Practices

- Hạn chế file size < 2MB
- Sử dụng hình ảnh đã compress
- Không gửi quá nhiều file lớn cùng lúc

## Troubleshooting

### Chat không hiển thị

1. Kiểm tra console log có lỗi không
2. Đảm bảo Firebase đã được cấu hình đúng
3. Kiểm tra user đã đăng nhập chưa
4. Kiểm tra `core-loader.js` đã được include

### Tin nhắn không gửi được

1. Kiểm tra kết nối internet
2. Kiểm tra Firebase security rules
3. Kiểm tra user có quyền write không
4. Xem console log để debug

### Tin nhắn không cập nhật real-time

1. Kiểm tra Firebase connection
2. Refresh trang và thử lại
3. Kiểm tra listeners có được setup đúng không

### File upload thất bại

1. Kiểm tra file size (khuyến nghị < 2MB)
2. Kiểm tra format file có được hỗ trợ không
3. Kiểm tra browser có hỗ trợ FileReader API không

## Security

### Firebase Security Rules

```json
{
  "rules": {
    "chatConversations": {
      ".read": true,
      ".write": true
    },
    "chatMessages": {
      ".read": true,
      ".write": true
    },
    "chatMembers": {
      ".read": true,
      ".write": true
    },
    "userStatus": {
      ".read": true,
      ".write": true
    }
  }
}
```

⚠️ **Lưu ý**: Hiện tại rules cho phép read/write tự do. Trong production, nên thêm authentication và authorization checks.

### Recommended Production Rules

```json
{
  "rules": {
    "chatConversations": {
      "$conversationId": {
        ".read": "auth != null && data.child('members').child(auth.uid).exists()",
        ".write": "auth != null"
      }
    },
    "chatMessages": {
      "$conversationId": {
        ".read": "auth != null && root.child('chatConversations').child($conversationId).child('members').child(auth.uid).exists()",
        ".write": "auth != null && root.child('chatConversations').child($conversationId).child('members').child(auth.uid).exists()"
      }
    }
  }
}
```

## Future Enhancements

### Phase 2

- [ ] Group chat với nhiều người
- [ ] Video/voice call
- [ ] Message reactions (like, love, etc.)
- [ ] Message forwarding
- [ ] Delete messages
- [ ] Edit messages
- [ ] Search messages trong conversation
- [ ] Pin messages
- [ ] Notifications API (browser notifications)

### Phase 3

- [ ] File preview
- [ ] Image gallery view
- [ ] Message threading
- [ ] Polls/Surveys
- [ ] Location sharing
- [ ] Voice messages
- [ ] Read receipts (seen by multiple users)
- [ ] Message encryption

## Support

Nếu gặp vấn đề, vui lòng:
1. Kiểm tra console log
2. Xem phần Troubleshooting
3. Liên hệ team phát triển

## License

Internal use only - N2Store
