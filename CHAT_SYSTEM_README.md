# Hệ thống Chat Nội Bộ - N2Store

## Tổng quan

Hệ thống chat nội bộ được tích hợp vào N2Store, cho phép nhân viên và quản lý giao tiếp nhanh chóng với nhau.

**Có 2 cách sử dụng:**
1. **Trang chat chuyên dụng** (`/chat/`) - Giao diện chat toàn màn hình
2. **Bong bóng chat nổi** - Hiển thị ở các trang khác khi có tin nhắn chưa đọc

## Tính năng

### Trang Chat Chuyên Dụng
✅ **Giao diện toàn màn hình**: Sidebar conversations + main chat area
✅ **Danh sách cuộc trò chuyện**: Hiển thị tất cả conversations với preview
✅ **Tìm kiếm conversations**: Search bar để tìm nhanh
✅ **Avatar và trạng thái**: Hiển thị avatar và online/offline status

### Bong Bóng Chat
✅ **Hiển thị thông minh**: Chỉ xuất hiện khi có tin nhắn chưa đọc
✅ **Badge thông báo**: Hiển thị số tin nhắn chưa đọc
✅ **Compact UI**: Giao diện nhỏ gọn không che khuất nội dung chính
✅ **Tự động ẩn**: Ẩn khi đã đọc hết tin nhắn

### Tính Năng Chat
✅ **Tin nhắn văn bản**: Gửi và nhận tin nhắn văn bản
✅ **Hình ảnh**: Gửi và xem hình ảnh với caption
✅ **File đính kèm**: Gửi và nhận file với hiển thị tên + kích thước
✅ **Số điện thoại**: Chia sẻ số điện thoại với tên liên hệ
✅ **Trạng thái online/offline**: Xem ai đang online
✅ **Typing indicator**: Thấy khi người khác đang nhập
✅ **Unread count**: Đếm tin nhắn chưa đọc
✅ **Real-time sync**: Đồng bộ tức thì qua Firebase

## Cấu trúc File

```
/chat/
  ├── index.html            # Trang chat chuyên dụng
  ├── chat-page.css         # Styles cho trang chat
  └── chat-page.js          # Logic cho trang chat

/js/
  ├── chat-manager.js       # Quản lý logic chat (Firebase, messages, etc.)
  └── chat-bubble.js        # Giao diện bong bóng chat

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

## Truy cập và Quyền

### Navigation Menu

Trang chat đã được thêm vào navigation sidebar với:
- **Icon**: message-square (💬)
- **Tên**: Chat Nội Bộ
- **Vị trí**: Giữa "Check Inbox Khách" và "Thông Tin Chuyển Khoản"

### Quyền truy cập (Permissions)

Để truy cập trang chat, user cần có permission **"chat"**.

**Cấp quyền cho users:**
1. Vào trang **Quản Lý Tài Khoản** (`/user-management/`)
2. Chỉnh sửa user cần cấp quyền
3. Thêm permission **"chat"** vào danh sách permissions của user
4. Lưu thay đổi

**Lưu ý:**
- Admin tự động có tất cả permissions (bao gồm chat)
- User thường cần được cấp quyền "chat" để thấy menu item
- Bong bóng chat vẫn hoạt động ngay cả khi user chưa có quyền truy cập trang chat chuyên dụng

## Cách sử dụng

### 1. Sử dụng trang chat chuyên dụng (Khuyến nghị)

Truy cập: **`/chat/`** hoặc **`/chat/index.html`**

Trang này có:
- Giao diện toàn màn hình với sidebar và main chat area
- Danh sách tất cả conversations
- Tìm kiếm nhanh
- Trải nghiệm tối ưu cho chat

**Không có bong bóng chat trên trang này** - trang chat là nơi chuyên dụng để trò chuyện.

### 2. Bong bóng chat trên các trang khác

Bong bóng chat **tự động xuất hiện** khi:
- Có tin nhắn chưa đọc từ người khác
- Số lượng tin nhắn chưa đọc > 0

Bong bóng chat **tự động ẩn** khi:
- Không có tin nhắn chưa đọc
- Đã đọc hết tất cả tin nhắn

**Lợi ích:**
- Không làm phiền người dùng khi không có tin nhắn
- Tự động thông báo khi có tin nhắn mới
- Có thể truy cập nhanh từ bất kỳ trang nào

### 3. Tự động tích hợp

Hệ thống chat tự động load trên tất cả các trang có `core-loader.js`:

```html
<script src="/js/core-loader.js"></script>
```

### 4. Manual integration (nếu cần)

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

### 5. Sử dụng trong code (API)

```javascript
// Đợi core utilities load xong
document.addEventListener('coreUtilitiesLoaded', async () => {
  // ChatManager đã sẵn sàng
  console.log('Chat system ready!');

  // Tạo conversation mới
  const convId = await window.ChatManager.createOrGetConversation(['user123']);

  // Gửi tin nhắn
  await window.ChatManager.sendTextMessage(convId, 'Hello!');

  // Gửi hình ảnh
  await window.ChatManager.sendImageMessage(convId, imageBase64, 'Caption');
});
```

## Giao diện người dùng

### Trang Chat Chuyên Dụng (`/chat/`)

#### Sidebar (Trái)
- **Header**:
  - Tiêu đề "Tin nhắn"
  - Nút "+" tạo cuộc trò chuyện mới
- **Search bar**: Tìm kiếm conversations
- **Conversation list**: Danh sách cuộc trò chuyện
  - Avatar tròn với chữ cái đầu
  - Tên người dùng
  - Tin nhắn cuối cùng
  - Thời gian
  - Badge tin nhắn chưa đọc
  - Highlight conversation đang active

#### Main Area (Phải)
- **Empty state** (khi chưa chọn conversation):
  - Icon chat
  - "Chọn một cuộc trò chuyện"
  - Hướng dẫn sử dụng

- **Chat view** (khi đã chọn conversation):
  - **Header**:
    - Avatar và tên người dùng
    - Trạng thái online/offline
    - Nút gọi điện và thông tin
  - **Messages area**: Hiển thị tin nhắn
    - Tin nhắn của bạn: Bên phải, màu xanh gradient
    - Tin nhắn của người khác: Bên trái, màu trắng
    - Hỗ trợ: text, image, file, phone
    - Hiển thị thời gian
  - **Typing indicator**: "đang nhập..." khi người khác nhập
  - **Input area**:
    - Attach button: Đính kèm file
    - Image button: Gửi hình ảnh
    - Text input: Nhập tin nhắn (Enter để gửi)
    - Send button: Gửi tin nhắn

### Bong bóng chat (Các trang khác)

- **Vị trí**: Góc dưới bên phải màn hình
- **Hiển thị**: Chỉ khi có tin nhắn chưa đọc
- **Icon**: Biểu tượng tin nhắn
- **Badge**: Hiển thị số tin nhắn chưa đọc
- **Click**: Mở/đóng cửa sổ chat popup (380x600px)
- **Animation**: Smooth fade in/out

#### Popup Chat Window

Giống như trang chat chuyên dụng nhưng compact hơn:

- **View 1**: Danh sách conversations
  - Search bar
  - Conversation list với unread badges
  - New message button

- **View 2**: Chat view
  - Back button để quay lại danh sách
  - User info và status
  - Messages area (cuộn được)
  - Typing indicator
  - Input area với attach/image/send buttons

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
