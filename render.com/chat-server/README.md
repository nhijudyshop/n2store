# N2Store Internal Chat Server

Hệ thống chat nội bộ cho N2Store, sử dụng Firebase Firestore và WebSocket.

## 🎯 Tính năng

- ✅ Chat 1-1 và Group chat
- ✅ Gửi text, hình ảnh, file
- ✅ Typing indicator (realtime)
- ✅ Read receipts (đã đọc/chưa đọc)
- ✅ Online/Offline status
- ✅ Lịch sử tin nhắn
- ✅ Upload file/image
- ✅ Realtime WebSocket communication

## 📁 Cấu trúc

```
chat-server/
├── firebase-service.js      # Firebase Admin SDK operations
├── auth-middleware.js        # Authentication middleware
├── websocket-handler.js      # WebSocket handler for realtime
└── README.md                 # This file

routes/
└── chat.js                   # REST API endpoints

js/
└── chat-client.js            # Frontend chat client
```

## 🔧 Setup

### 1. Cài đặt dependencies

```bash
cd render.com
npm install
```

### 2. Cấu hình Firebase

1. Truy cập [Firebase Console](https://console.firebase.google.com/project/n2shop-69e37/settings/serviceaccounts/adminsdk)
2. Click "Generate New Private Key"
3. Download file JSON
4. Copy thông tin vào `.env`:

```env
FIREBASE_PROJECT_ID=n2shop-69e37
FIREBASE_CLIENT_EMAIL=firebase-adminsdk-xxxxx@n2shop-69e37.iam.gserviceaccount.com
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\nYOUR_KEY_HERE\n-----END PRIVATE KEY-----\n"
```

### 3. Deploy Firestore Security Rules

Vào Firebase Console > Firestore Database > Rules:

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // LOCKED MODE - Chỉ server (Admin SDK) có thể access
    match /{document=**} {
      allow read, write: if false;
    }
  }
}
```

### 4. Enable Firebase Storage

1. Firebase Console > Storage
2. Click "Get Started"
3. Chọn production mode
4. Chọn location: `asia-southeast1` (Singapore)

### 5. Deploy lên Render.com

1. Push code lên GitHub
2. Render.com sẽ auto-deploy
3. Thêm Environment Variables trên Render Dashboard:
   - `FIREBASE_PROJECT_ID`
   - `FIREBASE_CLIENT_EMAIL`
   - `FIREBASE_PRIVATE_KEY`

## 📡 API Endpoints

### User Endpoints

- `POST /api/chat/sync-user` - Sync user vào Firestore
- `GET /api/chat/users` - Lấy danh sách users

### Chat Endpoints

- `POST /api/chat/create` - Tạo chat mới
- `GET /api/chat/conversations` - Lấy danh sách conversations
- `GET /api/chat/:chatId` - Lấy thông tin chat

### Message Endpoints

- `GET /api/chat/:chatId/messages` - Lấy tin nhắn
- `POST /api/chat/:chatId/send` - Gửi tin nhắn
- `POST /api/chat/:chatId/mark-read` - Đánh dấu đã đọc

### Upload Endpoint

- `POST /api/chat/upload` - Upload file/image

## 🔌 WebSocket Events

### Client → Server

- `auth` - Authenticate connection
- `typing` - Send typing indicator
- `stop_typing` - Stop typing indicator
- `ping` - Keep-alive ping

### Server → Client

- `connected` - Connection established
- `authenticated` - Authentication successful
- `new_message` - New message received
- `user_typing` - User is typing
- `user_stopped_typing` - User stopped typing
- `user_status` - User online/offline status
- `pong` - Keep-alive response

## 💻 Frontend Usage

### Initialize

```javascript
// Auto-initialized khi load page
// Hoặc manually:
await chatClient.init();
```

### Get users

```javascript
const users = await chatClient.getUsers({ online: true });
```

### Create chat

```javascript
const { chatId } = await chatClient.createChat([userId1, userId2]);
```

### Send message

```javascript
await chatClient.sendMessage(chatId, 'Hello!');
```

### Upload file

```javascript
const file = document.getElementById('fileInput').files[0];
const result = await chatClient.uploadFile(chatId, file);
await chatClient.sendFile(chatId, result.fileUrl, result.fileName);
```

### Listen to new messages

```javascript
chatClient.onNewMessage = (chatId, message) => {
  console.log('New message:', message);
  displayMessage(chatId, message);
};
```

### Send typing indicator

```javascript
// Start typing
chatClient.sendTyping(chatId);

// Stop typing (auto after 3s)
chatClient.stopTyping(chatId);
```

## 🗄️ Firestore Schema

### Collections

- `chat_users` - User profiles
- `chats` - Chat conversations
- `messages/{chatId}/msgs` - Messages
- `typing/{chatId}` - Typing indicators

## 🔒 Security

- ✅ Firestore locked mode (server-only access)
- ✅ Auth middleware verify authManager data
- ✅ Session timeout checks
- ✅ Participant verification
- ✅ File size limits (10MB)

## 📊 Monitoring

```javascript
// Get chat stats
const stats = await fetch('/api/chat/stats', {
  headers: { 'X-Auth-Data': JSON.stringify(authManager.getUserInfo()) }
});
```

## 🐛 Troubleshooting

### WebSocket không kết nối

- Check server URL trong `chat-client.js`
- Check Render.com logs
- Check browser console

### Lỗi Firebase credentials

- Kiểm tra .env file
- Kiểm tra format của PRIVATE_KEY (phải có `\n`)
- Kiểm tra Environment Variables trên Render

### Lỗi authentication

- User phải login lại để generate userId
- Check authManager có userId không: `authManager.getUserId()`

## 📝 Notes

- Lịch sử 30 ngày: Cần setup Cloud Function để auto-delete
- Cost: FREE với 20 users (trong Firebase free tier)
- Server cũ vẫn hoạt động bình thường (không bị ảnh hưởng)
