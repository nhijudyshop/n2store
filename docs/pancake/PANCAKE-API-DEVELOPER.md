# Pancake API & Webhooks - Developer Documentation

> Tài liệu chi tiết dành cho developer tích hợp với Pancake API.
> Nguồn: `12_FOR DEVELOPER.docx`, `pancakeAPI_1.txt`, `pancakeAPI_2.txt` (OpenAPI 3.0 spec)
> OpenAPI spec đầy đủ: [pancakeAPI_2.txt](./pancakeAPI_2.txt)
> Official docs: https://developer.pancake.biz

---

## 1. Tổng quan

Pancake cung cấp:
- **REST API** để quản lý pages, conversations, messages, customers, statistics...
- **Webhooks** để nhận thông báo HTTP realtime khi có thay đổi
- **WebSocket** (Phoenix Protocol) để nhận events realtime (xem [REALTIME-SERVER.md](./REALTIME-SERVER.md))

---

## 2. Authentication

### 2.1 User Access Token (`access_token`)

Token đại diện cho **một user** trên Pancake. Dùng để gọi User API.

- **Lấy từ:** Pancake → Account → Personal Settings
- **Hết hạn:** Sau 90 ngày hoặc khi user logout
- **Truyền qua:** Query param `?access_token={token}`

### 2.2 Page Access Token (`page_access_token`)

Token đại diện cho **một page**. Dùng để gọi Public API.

- **Lấy từ:** Pancake → Page Settings → Tools, hoặc gọi API `generate_page_access_token`
- **Hết hạn:** Không hết hạn (trừ khi bị xóa/tạo lại thủ công)
- **Truyền qua:** Query param `?page_access_token={token}`

### 2.3 Base URLs

| Server | URL | Mô tả |
|--------|-----|--------|
| User API | `https://pages.fm/api/v1` | API cần `access_token` (user-level) |
| Public API v1 | `https://pages.fm/api/public_api/v1` | API cần `page_access_token` |
| Public API v2 | `https://pages.fm/api/public_api/v2` | API v2 (conversations) |

> **Lưu ý:** `pages.fm` = `pancake.vn` (cùng hệ thống)

---

## 3. REST API Endpoints

### 3.1 Pages

#### GET /pages
**Server:** User API | **Auth:** `access_token`

Lấy danh sách pages của user.

```
GET https://pages.fm/api/v1/pages?access_token={token}
```

**Response:**
```json
{
  "pages": [
    { "id": "page_id", "platform": "facebook", "name": "Page Name", "avatar_url": "..." }
  ]
}
```

---

#### POST /pages/{page_id}/generate_page_access_token
**Server:** User API | **Auth:** `access_token` (admin quyền)

Tạo hoặc refresh `page_access_token` cho page. Token này không hết hạn trừ khi xóa/tạo lại.

```
POST https://pages.fm/api/v1/pages/{page_id}/generate_page_access_token?access_token={token}
```

---

### 3.2 Conversations

#### GET /pages/{page_id}/conversations
**Server:** Public API v2 | **Auth:** `page_access_token`

Lấy 60 conversations mới nhất. Dùng `last_conversation_id` để pagination.

```
GET https://pages.fm/api/public_api/v2/pages/{page_id}/conversations?page_access_token={token}
```

| Param | Required | Mô tả |
|-------|----------|--------|
| `last_conversation_id` | No | ID conversation cuối của lần gọi trước (để lấy tiếp 60 cũ hơn) |
| `tags` | No | Filter theo tag IDs (comma-separated) |
| `type` | No | Filter theo loại: `INBOX`, `COMMENT` |
| `post_ids` | No | Filter theo post IDs |
| `since` | No | Filter từ timestamp (Unix seconds) |
| `until` | No | Filter đến timestamp (Unix seconds) |
| `unread_first` | No | Ưu tiên conversations chưa đọc |
| `order_by` | No | `inserted_at` hoặc `updated_at` |

**Response:**
```json
{
  "conversations": [
    {
      "id": "conv_id",
      "type": "INBOX",
      "tags": [1, 3],
      "updated_at": "2026-03-17T10:00:00",
      "inserted_at": "2026-03-15T08:00:00",
      "participants": [{ "name": "Khách", "phone": "0901234567" }],
      "last_message": { "text": "Nội dung...", "sender": "customer" }
    }
  ]
}
```

---

#### GET /pages/{page_id}/customers/{customer_fb_id}/conversations
**Server:** Private API v1 | **Auth:** `access_token` (JWT)

Tìm tất cả conversations (INBOX + COMMENT) của 1 khách hàng trên 1 page cụ thể.

```
GET https://pancake.vn/api/v1/pages/{page_id}/customers/{customer_fb_id}/conversations?access_token={jwt}
```

**Response:**
```json
{
  "conversations": [
    {
      "id": "112678138086607_26140045085657251",
      "type": "INBOX",
      "from": { "id": "26140045085657251", "name": "Khách hàng" },
      "from_id": "26140045085657251",
      "from_psid": "26140045085657251",
      "customers": [{ "fb_id": "26140045085657251", "id": "uuid", "name": "Khách hàng" }],
      "page_id": "112678138086607",
      "snippet": "Tin nhắn cuối...",
      "thread_id": "34116166741365151",
      "seen": true,
      "unread_count": 0,
      "updated_at": "2026-03-20T22:20:14.000000"
    }
  ],
  "pages_with_current_count": { "112678138086607": 10 },
  "success": true
}
```

---

#### GET /conversations/customer/{customer_fb_id} (Multi-page)
**Server:** Private API v1 | **Auth:** `access_token` (JWT)

Tìm conversations của khách hàng trên NHIỀU pages cùng lúc.

```
GET https://pancake.vn/api/v1/conversations/customer/{customer_fb_id}?pages[{pageId1}]=0&pages[{pageId2}]=0&access_token={jwt}
```

| Param | Required | Mô tả |
|-------|----------|--------|
| `pages[{pageId}]` | Yes | Mỗi page cần query, value = 0 (initial) hoặc current_count (pagination) |

**Response:** Giống endpoint single-page, nhưng `pages_with_current_count` chứa count cho mỗi page.

---

#### POST /pages/{page_id}/conversations/{conversation_id}/tags
**Server:** Public API v1 | **Auth:** `page_access_token`

Thêm/xóa tag cho conversation.

```json
// Request body
{ "action": "add", "tag_id": "5" }    // hoặc "remove"
```

**Response:** `{ "success": true, "data": [1, 3, 5], "timestamp": 1710680000 }`

---

#### POST /pages/{page_id}/conversations/{conversation_id}/assign
**Server:** Public API v1 | **Auth:** `page_access_token`

Phân công nhân viên xử lý conversation.

```json
// Request body
{ "assignee_ids": ["user_uuid_1", "user_uuid_2"] }
```

---

#### POST /pages/{page_id}/conversations/{conversation_id}/read
**Server:** Public API v1 | **Auth:** `page_access_token`

Đánh dấu conversation đã đọc.

---

#### POST /pages/{page_id}/conversations/{conversation_id}/unread
**Server:** Public API v1 | **Auth:** `page_access_token`

Đánh dấu conversation chưa đọc.

---

### 3.3 Messages

#### GET /pages/{page_id}/conversations/{conversation_id}/messages
**Server:** Public API v1 | **Auth:** `page_access_token`

Lấy lịch sử tin nhắn (30 tin nhắn mỗi lần).

| Param | Required | Mô tả |
|-------|----------|--------|
| `current_count` | No | Index position, trả về 30 tin nhắn trước vị trí này |

**Response:**
```json
{
  "messages": [
    {
      "conversation_id": "conv_id",
      "from": { "id": "sender_id", "name": "Tên", "email": null },
      "message": "Nội dung tin nhắn",
      "inserted_at": "2026-03-17T10:30:00",
      "has_phone": false,
      "is_hidden": false,
      "is_removed": false,
      "type": "INBOX",
      "page_id": "page_id"
    }
  ]
}
```

---

#### POST /pages/{page_id}/conversations/{conversation_id}/messages
**Server:** Public API v1 | **Auth:** `page_access_token`

Gửi tin nhắn. Hỗ trợ 4 loại:

**a) Inbox Message** (`action: "reply_inbox"`):
```json
{
  "action": "reply_inbox",
  "message": "Xin chào!",
  "sender_id": "user_uuid"        // optional
}
```
> **QUAN TRỌNG:** `message` và `content_ids` là **MUTUALLY EXCLUSIVE**. Gửi cả hai sẽ bị lỗi 500!

**b) Reply Comment** (`action: "reply_comment"`):
```json
{
  "action": "reply_comment",
  "message_id": "comment_id_to_reply",
  "message": "Nội dung trả lời",
  "mentions": [{ "psid": "customer_psid", "name": "Tên", "offset": 0, "length": 3 }]
}
```

**c) Private Reply** (`action: "private_replies"`):
```json
{
  "action": "private_replies",
  "post_id": "post_id",
  "message_id": "comment_id",
  "from_id": "sender_from_id",
  "message": "Tin nhắn riêng từ comment"
}
```

**d) WhatsApp Template Message**:
```json
{
  "action": "reply_inbox",
  "template_id": "approved_template_id",
  "template_params": {
    "HEADER_PARAMS": { "IMAGE": { "url": "https://example.com/image.jpg" } },
    "BODY_PARAMS": { "customer_name": "Nguyễn Văn A", "order_id": "DH001" },
    "BUTTONS_0_PARAMS": { "{{order_id}}": "DH001" }
  }
}
```
> **Tip:** Gửi tới số mới chưa có conversation: tạo `conversation_id` theo format `{pageID}_{phoneNumber}`, ví dụ: `waba_1234567890_821234567890`

**Response:** `{ "success": true, "id": "message_id", "message": "Nội dung" }`

---

### 3.4 Upload Media

#### POST /pages/{page_id}/upload_contents
**Server:** Public API v1 | **Auth:** `page_access_token`

Upload file (ảnh, video) để dùng trong tin nhắn.

```
POST https://pages.fm/api/public_api/v1/pages/{page_id}/upload_contents?page_access_token={token}
Content-Type: multipart/form-data
Body: file={binary}
```

**Giới hạn video:**
- Shopee: max 30MB
- WhatsApp Official: max 16MB
- Lazada: max 100MB
- Khác: max 25MB

**Response:**
```json
{
  "success": true,
  "id": "content_id_dùng_trong_content_ids",
  "attachment_type": "PHOTO"    // PHOTO, VIDEO, DOCUMENT, AUDIO_ATTACHMENT_ID
}
```

---

### 3.5 Customers

#### GET /pages/{page_id}/page_customers
**Server:** Public API v1 | **Auth:** `page_access_token`

Lấy danh sách khách hàng. Hỗ trợ pagination.

| Param | Required | Mô tả |
|-------|----------|--------|
| `since` | Yes | Unix timestamp bắt đầu |
| `until` | Yes | Unix timestamp kết thúc |
| `page_number` | Yes | Trang hiện tại (min: 1) |
| `page_size` | No | Số record/trang (max: 100) |
| `order_by` | No | `inserted_at` hoặc `updated_at` |

**Response:**
```json
{
  "success": true,
  "total": 500,
  "customers": [
    {
      "name": "Nguyễn Văn A",
      "psid": "page_scoped_id",
      "phone_numbers": ["0901234567"],
      "gender": "male",
      "birthday": "1990-05-15",
      "lives_in": "HCM",
      "inserted_at": "2026-01-15T08:00:00",
      "notes": [
        {
          "id": "note_id",
          "message": "Khách VIP",
          "created_at": 1710000000000,
          "created_by": { "uid": "user_id", "fb_name": "Admin" }
        }
      ]
    }
  ]
}
```

---

#### PUT /pages/{page_id}/page_customers/{page_customer_id}
**Server:** Public API v1 | **Auth:** `page_access_token`

Cập nhật thông tin khách hàng.

```json
{
  "changes": {
    "name": "Tên mới",
    "gender": "female",       // male, female, unknown
    "birthday": "1990-05-15",
    "phone_numbers": ["0901234567", "0912345678"]
  }
}
```

---

#### POST/PUT/DELETE /pages/{page_id}/page_customers/{page_customer_id}/notes
**Server:** Public API v1 | **Auth:** `page_access_token`

Quản lý ghi chú khách hàng:
- **POST:** `{ "message": "Nội dung ghi chú" }`
- **PUT:** `{ "note_id": "id", "message": "Nội dung cập nhật" }`
- **DELETE:** `{ "note_id": "id" }`

---

### 3.6 Tags

#### GET /pages/{page_id}/tags
**Server:** Public API v1 | **Auth:** `page_access_token`

Lấy danh sách tags của page.

**Response:**
```json
{
  "tags": [
    { "id": 0, "text": "Kiểm hàng", "color": "#4b5577", "lighten_color": "#c9ccd6" },
    { "id": 1, "text": "VIP", "color": "#e74c3c", "lighten_color": "#f1c1bd" }
  ]
}
```

---

### 3.7 Posts

#### GET /pages/{page_id}/posts
**Server:** Public API v1 | **Auth:** `page_access_token`

Lấy danh sách bài viết.

| Param | Required | Mô tả |
|-------|----------|--------|
| `since` | Yes | Unix timestamp bắt đầu |
| `until` | Yes | Unix timestamp kết thúc |
| `page_number` | Yes | Trang hiện tại (min: 1) |
| `page_size` | Yes | Số record/trang (max: 30) |
| `type` | No | Filter: `video`, `photo`, `text`, `livestream` |

**Response:**
```json
{
  "success": true,
  "total": 200,
  "posts": [
    {
      "id": "pageId_postId",
      "page_id": "page_id",
      "from": { "id": "creator_id", "name": "Creator Name" },
      "message": "Nội dung bài viết",
      "type": "photo",
      "inserted_at": "2026-03-17T10:00:00",
      "comment_count": 15,
      "phone_number_count": 3,
      "reactions": {
        "like_count": 111, "love_count": 14, "haha_count": 1,
        "wow_count": 17, "sad_count": 12, "angry_count": 1, "care_count": 2
      }
    }
  ]
}
```

---

### 3.8 Users (Staff)

#### GET /pages/{page_id}/users
**Server:** Public API v1 | **Auth:** `page_access_token`

Lấy danh sách nhân viên (active + disabled + round robin).

**Response:**
```json
{
  "success": true,
  "users": [
    {
      "id": "user_uuid",
      "name": "Anh Ngoc Nguyen",
      "fb_id": "fb_id",
      "status": "available",
      "status_in_page": "active",
      "is_online": true,
      "page_permissions": { "permissions": [100, 71, 81] }
    }
  ],
  "disabled_users": [...],
  "round_robin_users": {
    "inbox": ["user_uuid_1"],
    "comment": ["user_uuid_2"]
  }
}
```

---

#### POST /pages/{page_id}/round_robin_users
**Server:** Public API v1 | **Auth:** `page_access_token`

Cập nhật danh sách phân công xoay vòng.

```json
{
  "inbox": ["user_uuid_1", "user_uuid_2"],
  "comment": ["user_uuid_3"]
}
```

---

### 3.9 Statistics

| Endpoint | Mô tả | Params chính |
|----------|--------|-------------|
| `GET /pages/{page_id}/statistics/pages_campaigns` | Thống kê campaign quảng cáo | `since`, `until` (Unix timestamp) |
| `GET /pages/{page_id}/statistics/ads` | Thống kê ads chi tiết | `since`, `until`, `type` (`by_id`/`by_time`) |
| `GET /pages/{page_id}/statistics/customer_engagements` | Thống kê tương tác | `date_range`, `by_hour`, `user_ids` |
| `GET /pages/{page_id}/statistics/pages` | Thống kê tổng quan page | `since`, `until` |
| `GET /pages/{page_id}/statistics/tags` | Thống kê tag usage | `since`, `until` |
| `GET /pages/{page_id}/statistics/users` | Thống kê nhân viên | `date_range` |

Tất cả đều dùng **Public API v1** + `page_access_token`.

---

### 3.10 Export Data

#### GET /pages/{page_id}/export_data
**Server:** Public API v1 | **Auth:** `page_access_token`

Export conversations từ ads. Mỗi request trả về tối đa 60 records.

| Param | Required | Mô tả |
|-------|----------|--------|
| `action` | Yes | Phải là `conversations_from_ads` |
| `since` | Yes | Unix timestamp bắt đầu |
| `until` | Yes | Unix timestamp kết thúc |
| `offset` | No | Pagination offset (default: 0) |

---

### 3.11 Call Logs

#### GET /pages/{page_id}/sip_call_logs
**Server:** Public API v1 | **Auth:** `page_access_token`

Lấy lịch sử cuộc gọi.

| Param | Required | Mô tả |
|-------|----------|--------|
| `id` | Yes | ID gói SIP |
| `page_number` | Yes | Trang (min: 1) |
| `page_size` | Yes | Records/trang (max: 30) |
| `since` | No | Unix timestamp bắt đầu |
| `until` | No | Unix timestamp kết thúc |

---

### 3.12 Chat Plugin

#### POST /pke_chat_plugin/messages
**Server:** User API (`pages.fm/api/v1`) | **Auth:** Không cần token

Gửi tin nhắn hoặc tạo conversation mới qua Chat Plugin.

```json
{
  "from_id": "web_xxxxxxxxx",
  "conversation_id": "web_pageId_web_xxxxxxxxx",   // null = tạo mới
  "message": "Xin chào!",
  "name": "Web_1619912441",
  "dummy_id": 1765875902892,
  "inserted_at": 1765875902892,
  "attachments": [
    {
      "id": "attach_id", "name": "anh.png",
      "url": "https://cdn.example.com/image.png",
      "type": "photo", "mime_type": "image/png",
      "width": 512, "height": 512, "size": 33254
    }
  ]
}
```

#### GET /pke_chat_plugin/messages
**Server:** User API | Lấy lịch sử tin nhắn của Chat Plugin conversation.

| Param | Required | Mô tả |
|-------|----------|--------|
| `conversation_id` | Yes | ID conversation |
| `page_id` | Yes | ID page chat plugin |
| `offset` | No | Pagination offset |

---

## 4. Webhooks

---

## 4.1 Thiết lập Webhooks

### Bước 1: Tạo endpoint nhận webhook

Tạo một HTTP endpoint trên server của bạn để nhận và xử lý webhook notifications (JSON payload gửi qua HTTP POST).

### Bước 2: Đăng ký page với Pancake Support

Cung cấp thông tin page (`page_id` hoặc Pancake URL) cho đội hỗ trợ Pancake để đăng ký sử dụng tính năng Webhook.

### Bước 3: Tạo Pancake Subscription (2 slots)

Kích hoạt Webhook cho một page sẽ **tiêu tốn 2 slots** từ subscription của bạn.

### Bước 4: Cấu hình Webhook trong Page Settings

- Cần quyền **admin** trên page và quyền quản lý subscription.
- Vào **Settings → Tools → Webhook** để cấu hình.
- Xác minh endpoint URL (verify).

---

## 4.2 Webhook Events

### 4.2.1 Messages Event

Triggered khi có **tin nhắn mới** hoặc **tin nhắn được cập nhật** trong inbox hoặc comment. Đảm bảo hệ thống nhận thông báo realtime về mọi thay đổi trong hội thoại.

**Payload mẫu:**

```json
{
  "data": {
    "conversation": {
      "id": "tt_0:1:6570511458700967938:6711731671916708866",
      "assignee_ids": [
        "62fdbc48-2ad5-4711-9a74-943ca3638386"
      ],
      "from": {
        "id": "tt_6570511458700967938",
        "name": "Jineo"
      },
      "is_combined": false,
      "is_removed": false,
      "is_replied": false,
      "read_watermarks": null,
      "seen": false,
      "snippet": "alo abc",
      "tags": [],
      "type": "INBOX"
    },
    "message": {
      "attachments": [],
      "can_comment": false,
      "can_hide": false,
      "can_like": false,
      "can_remove": false,
      "can_reply_privately": false,
      "conversation_id": "tt_0:1:6570511458700967938:6711731671916708866",
      "edit_history": null,
      "from": {
        "id": "tt_6570511458700967938",
        "page_customer_id": "ddc7b38d-e23a-4bf6-8151-5bfc46105839",
        "name": "Jineo"
      },
      "has_phone": false,
      "id": "tt_7452304119832249857",
      "inserted_at": "2024-12-25T11:06:07.000000",
      "is_hidden": false,
      "is_parent": false,
      "is_parent_hidden": false,
      "is_removed": false,
      "like_count": null,
      "message": "alo abc",
      "original_message": "alo abc",
      "page_id": "tt_6711731671916708866",
      "parent_id": null,
      "phone_info": [],
      "private_reply_conversation": null,
      "removed_by": null,
      "rich_message": null,
      "show_info": true,
      "type": "INBOX",
      "user_likes": false
    },
    "post": {
      "admin_creator": null,
      "attachments": {
        "data": [
          {
            "description": "trung thu đầu tiên của bé Cơ Cơ",
            "media": {
              "image": {
                "height": 1024,
                "width": 576
              }
            },
            "target": {
              "id": "7284278413119032578",
              "thumbnail": "https://content.pancake.vn/2-23/2023/9/29/.jpg",
              "url": "https://v16-webapp-prime.tiktok.com/video/tos"
            },
            "title": null,
            "type": "video"
          }
        ],
        "ids": [
          "7284278413119032578"
        ]
      },
      "from": {
        "id": "tt_6711731671916708866",
        "name": "nF store VN"
      },
      "id": "tt_6711731671916708866_7119032578",
      "inserted_at": "2023-09-29T16:00:37",
      "message": "trung thu đầu tiên của bé Cơ Cơ. dân chơi 4 đèn 🤣",
      "story": null,
      "type": "COMMENT"
    }
  },
  "event_type": "messaging",
  "page_id": "tt_6711731671916708866"
}
```

**Các trường quan trọng:**

| Trường | Mô tả |
|--------|--------|
| `event_type` | Luôn là `"messaging"` |
| `page_id` | ID của page nhận tin nhắn |
| `data.conversation` | Thông tin hội thoại (id, assignee, tags, type...) |
| `data.conversation.type` | `"INBOX"` (tin nhắn) hoặc `"COMMENT"` (bình luận) |
| `data.conversation.snippet` | Nội dung tin nhắn gần nhất |
| `data.message` | Chi tiết tin nhắn (nội dung, người gửi, thời gian...) |
| `data.message.from.page_customer_id` | ID khách hàng trong hệ thống Pancake |
| `data.message.has_phone` | Tin nhắn có chứa số điện thoại không |
| `data.message.phone_info` | Thông tin số điện thoại (nếu có) |
| `data.post` | Thông tin bài viết liên quan (nếu là comment) |

---

### 4.2.2 Subscription Event

Triggered khi có **cập nhật hoặc thay đổi subscription** (kích hoạt, gia hạn, thay đổi cấu hình...).

**Payload mẫu:**

```json
{
  "data": {
    "subscription": {
      "accumulated_amount": 20253900000,
      "activated_at": "2024-11-26T03:08:51",
      "auto_config": false,
      "currency": "VND",
      "duration": 6,
      "expired_at": "2025-05-25T03:08:48",
      "id": "FPTTEL",
      "inserted_at": "2024-11-26T03:08:51",
      "is_activated": true,
      "is_paid": true,
      "owner_id": "6a00ea1f-af2c-4e3e-8f96-46ed462e2243",
      "page_count": 120,
      "page_ids": [
        "ln_1660919956",
        "tl_6791248854"
      ],
      "payment_amount": 20253900000,
      "shared_accounts": [
        "696cd302-206f-4788-adc3-16f29ddcb646"
      ],
      "type": "pancake",
      "upgrade_from": null,
      "user_count": 400,
      "user_ids": [
        "27f0fa6f-4ae4-4d87-b2a4-4f3ff997af6f",
        "6a00ea1f-af2c-4e3e-8f96-46ed462e2243"
      ]
    }
  },
  "event_type": "subscription"
}
```

**Các trường quan trọng:**

| Trường | Mô tả |
|--------|--------|
| `event_type` | Luôn là `"subscription"` |
| `data.subscription.id` | ID của subscription |
| `data.subscription.is_activated` | Subscription đang hoạt động? |
| `data.subscription.is_paid` | Đã thanh toán? |
| `data.subscription.expired_at` | Thời điểm hết hạn |
| `data.subscription.page_count` | Số page tối đa |
| `data.subscription.page_ids` | Danh sách page IDs |
| `data.subscription.user_count` | Số user tối đa |
| `data.subscription.user_ids` | Danh sách user IDs |
| `data.subscription.duration` | Thời hạn (tháng) |
| `data.subscription.currency` | Đơn vị tiền tệ |

---

### 4.2.3 Post Event

Triggered khi **bài viết được tạo mới** hoặc **bất kỳ trường nào được cập nhật**. Trả về toàn bộ thông tin post bao gồm metadata, attachments, author.

**Payload mẫu:**

```json
{
  "data": {
    "post": {
      "admin_creator": null,
      "attachments": {
        "data": [
          {
            "description": null,
            "media": {
              "image": {
                "height": 720,
                "width": 720
              }
            },
            "target": {
              "id": "128718770046800",
              "url": "https://www.facebook.com/1028167.103448482573829/128718770046800/?type=3"
            },
            "title": null,
            "type": "photo"
          }
        ],
        "ids": [
          "128718770046800"
        ],
        "target": {
          "id": "128718770046800",
          "url": "https://www.facebook.com/10281.103448482573829/128718770046800/?type=3"
        },
        "title": null,
        "type": "photo"
      },
      "from": {
        "id": "102816772637000",
        "name": "Nước gạo rang TH true RICE"
      },
      "id": "102816772637000_128718810046796",
      "inserted_at": "2022-12-15T04:02:01",
      "message": "GẠO LỨT ĐỎ CHO CƠ THỂ KHỎE MẠNH \n\nĐược làm từ nguồn nguyên liệu cao cấp",
      "story": null,
      "type": "livestream"
    }
  },
  "event_type": "post",
  "page_id": "102816772637000"
}
```

**Các trường quan trọng:**

| Trường | Mô tả |
|--------|--------|
| `event_type` | Luôn là `"post"` |
| `page_id` | ID page sở hữu bài viết |
| `data.post.id` | ID bài viết (format: `{page_id}_{post_id}`) |
| `data.post.from` | Thông tin trang đăng bài |
| `data.post.message` | Nội dung bài viết |
| `data.post.inserted_at` | Thời gian tạo bài |
| `data.post.type` | Loại: `"livestream"`, `"photo"`, `"video"`... |
| `data.post.attachments` | Media đính kèm (ảnh, video...) |
| `data.post.story` | Story content (nếu có) |

---

## 4.3 Webhook Suspension (Tạm ngưng Webhook)

Để đảm bảo ổn định hệ thống, Pancake sẽ **tự động tạm ngưng webhook** khi phát hiện tỷ lệ lỗi cao.

### Điều kiện bị suspend

Webhook sẽ bị tạm ngưng nếu **trong khoảng 30 phút**:
- **Tỷ lệ lỗi vượt quá 80%**
- **Tổng số request thất bại >= 300**

### Một request được coi là thất bại khi:

- Endpoint trả về HTTP status code **ngoài dải 2xx**
- Endpoint **timeout** hoặc không phản hồi
- Xảy ra **lỗi kết nối mạng** khi gửi webhook request

### Khi bị suspend

Pancake sẽ **ngừng gửi mọi webhook event** tới endpoint đã cấu hình cho đến khi webhook được bật lại thủ công.

### Cách bật lại webhook

1. Đảm bảo endpoint đã hoạt động bình thường và trả về response hợp lệ
2. Đăng nhập vào Pancake
3. Vào **Webhook Settings**
4. **Enable** webhook lại

Sau khi bật lại, Pancake sẽ tiếp tục gửi các webhook event mới tới endpoint.

---

## 4.4 Best Practices cho Webhook Endpoints

Để tránh bị suspend và đảm bảo nhận event ổn định:

| Practice | Mô tả |
|----------|--------|
| **Return HTTP 200 nhanh** | Trả về 200 ngay sau khi nhận webhook request, không xử lý nặng trong handler |
| **Xử lý bất đồng bộ** | Dùng queue hoặc background job để xử lý webhook data (không block response) |
| **Response time ngắn** | Đảm bảo thời gian phản hồi **dưới 5 giây** |
| **Idempotent processing** | Xử lý retry-safe — cùng event gửi 2 lần không gây side effect |
| **Monitoring** | Giám sát endpoint liên tục về availability và error rate |

---

## 5. Tham khảo nhanh

### So sánh Webhook vs WebSocket

| | Pancake Webhook (Official) | Pancake WebSocket (Unofficial) |
|---|---|---|
| **Tài liệu** | File này | [REALTIME-SERVER.md](./REALTIME-SERVER.md) |
| **Cách hoạt động** | Pancake POST tới endpoint của bạn | Kết nối tới `wss://pancake.vn/socket/websocket` |
| **Chi phí** | 2 slots/page từ subscription | Miễn phí (dùng JWT token user) |
| **Yêu cầu** | Endpoint public, admin page | JWT token Pancake |
| **Độ tin cậy** | Chính thức, có suspension protection | Không chính thức, có thể bị block |
| **Events** | 3 loại: messaging, subscription, post | Nhiều loại: update_conversation, new_message, tags_updated... |
| **Use case** | Production integration | Realtime monitoring, internal tools |

### Tổng hợp tất cả API Endpoints

| # | Method | Endpoint | Mô tả | Auth |
|---|--------|----------|--------|------|
| 1 | GET | `/pages` | Danh sách pages | `access_token` |
| 2 | POST | `/pages/{id}/generate_page_access_token` | Tạo page token | `access_token` |
| 3 | GET | `/pages/{id}/conversations` | Danh sách conversations | `page_access_token` |
| 3b | GET | `/pages/{id}/customers/{fbId}/conversations` | Conversations theo customer (1 page) | `access_token` |
| 3c | GET | `/conversations/customer/{fbId}` | Conversations theo customer (multi-page) | `access_token` |
| 4 | POST | `/pages/{id}/conversations/{cid}/tags` | Thêm/xóa tag | `page_access_token` |
| 5 | POST | `/pages/{id}/conversations/{cid}/assign` | Phân công nhân viên | `page_access_token` |
| 6 | POST | `/pages/{id}/conversations/{cid}/read` | Đánh dấu đã đọc | `page_access_token` |
| 7 | POST | `/pages/{id}/conversations/{cid}/unread` | Đánh dấu chưa đọc | `page_access_token` |
| 8 | GET | `/pages/{id}/conversations/{cid}/messages` | Lấy tin nhắn | `page_access_token` |
| 9 | POST | `/pages/{id}/conversations/{cid}/messages` | Gửi tin nhắn | `page_access_token` |
| 10 | POST | `/pages/{id}/upload_contents` | Upload media | `page_access_token` |
| 11 | GET | `/pages/{id}/page_customers` | Danh sách khách hàng | `page_access_token` |
| 12 | PUT | `/pages/{id}/page_customers/{cid}` | Cập nhật khách hàng | `page_access_token` |
| 13 | POST | `/pages/{id}/page_customers/{cid}/notes` | Thêm ghi chú | `page_access_token` |
| 14 | PUT | `/pages/{id}/page_customers/{cid}/notes` | Sửa ghi chú | `page_access_token` |
| 15 | DELETE | `/pages/{id}/page_customers/{cid}/notes` | Xóa ghi chú | `page_access_token` |
| 16 | GET | `/pages/{id}/tags` | Danh sách tags | `page_access_token` |
| 17 | GET | `/pages/{id}/posts` | Danh sách bài viết | `page_access_token` |
| 18 | GET | `/pages/{id}/users` | Danh sách nhân viên | `page_access_token` |
| 19 | POST | `/pages/{id}/round_robin_users` | Cập nhật round robin | `page_access_token` |
| 20 | GET | `/pages/{id}/statistics/pages_campaigns` | Thống kê campaigns | `page_access_token` |
| 21 | GET | `/pages/{id}/statistics/ads` | Thống kê ads | `page_access_token` |
| 22 | GET | `/pages/{id}/statistics/customer_engagements` | Thống kê tương tác | `page_access_token` |
| 23 | GET | `/pages/{id}/statistics/pages` | Thống kê tổng quan | `page_access_token` |
| 24 | GET | `/pages/{id}/statistics/tags` | Thống kê tags | `page_access_token` |
| 25 | GET | `/pages/{id}/statistics/users` | Thống kê nhân viên | `page_access_token` |
| 26 | GET | `/pages/{id}/export_data` | Export data từ ads | `page_access_token` |
| 27 | GET | `/pages/{id}/sip_call_logs` | Lịch sử cuộc gọi | `page_access_token` |
| 28 | POST | `/pke_chat_plugin/messages` | Gửi tin Chat Plugin | Không cần |
| 29 | GET | `/pke_chat_plugin/messages` | Lấy tin Chat Plugin | Không cần |

### Webhook Event Types

| Event Type | Trigger |
|------------|---------|
| `messaging` | Tin nhắn mới hoặc cập nhật (inbox/comment) |
| `subscription` | Thay đổi subscription (kích hoạt, gia hạn, cấu hình) |
| `post` | Bài viết được tạo hoặc cập nhật |
