# Pancake API Documentation

> Tài liệu Pancake API cho n2store inbox. Cập nhật: 2026-04-11.

## Tổng quan

Pancake (pancake.vn / pages.fm) là nền tảng quản lý tin nhắn Facebook Pages. Có **2 domain API**:

| Domain | Auth | Dùng cho |
|--------|------|----------|
| `pancake.vn/api/v1/` | JWT (`access_token` query param) | API nội bộ — conversations, messages, customers, posts |
| `pages.fm/api/public_api/v1/` | Page Access Token (`page_access_token`) | Public API v1 — messages, tags, mark read |
| `pages.fm/api/public_api/v2/` | Page Access Token | Public API v2 — conversations (richer data) |

## Authentication

### JWT Token
- Lấy từ cookie `jwt` trên `pancake.vn`
- Truyền qua query: `?access_token=<JWT>`
- Một số endpoint cần thêm header `Referer: https://pancake.vn/<page_username>`
- JWT payload chứa: `uid`, `name`, `fb_id`, `fb_name`, `exp`, `session_id`
- Hết hạn theo `exp` (unix timestamp)

### Page Access Token (PAT)
- Lấy từ `page.settings.page_access_token` trong response `/pages` hoặc `/pages/<id>/settings`
- Hoặc generate: `GET /api/v1/pages/<id>/generate_page_access_token?access_token=<JWT>`
- Truyền qua query: `?page_access_token=<PAT>`

---

## Khái niệm quan trọng

### Customer IDs — Cùng 1 người, mỗi page có ID khác
| Field | Ý nghĩa | Ví dụ |
|-------|---------|-------|
| `fb_id` | Facebook User ID trên page đó | `25717004554573583` (Store), `24948162744877764` (House) |
| `id` (UUID) | Pancake internal customer ID | `a4396516-b395-478c-8d2a-83985356cb63` |
| `psid` | Page-Scoped ID (= fb_id cho INBOX) | `25717004554573583` |
| `global_id` | Facebook Global ID (cross-page, hiếm có) | `null` hoặc số dài |

> **⚠ CRITICAL:** Cùng 1 người "Huỳnh Thành Đạt" có fb_id **KHÁC NHAU** trên mỗi page. Không thể dùng fb_id để link cross-page. Chỉ `conversations/search` bằng tên mới tìm được cross-page.

### Conversation ID Format
| Type | Format | Ví dụ |
|------|--------|-------|
| INBOX | `<page_id>_<customer_fb_id>` | `270136663390370_25717004554573583` |
| COMMENT | `<post_id>_<comment_id>` | `1573633073980967_890142437017229` |

### Message ID Format
| Type | Format |
|------|--------|
| INBOX | `m_<random_hash>` |
| COMMENT | `<post_id>_<comment_id>` |

---

## API Endpoints

### 1. Account & Auth

#### `GET /api/v1/me`
Thông tin tài khoản đang login.

```
Response: {
  success: boolean,
  data: {
    id: string (UUID),
    name: string,
    email: string,
    fb_id: string,
    pancake_id: string (UUID),
    phone_number: string|null,
    avatar_url: string|null,
    timezone: string,
    user_name: string,
    enable_2fa: boolean,
    signatures: { [page_id]: { enable, signature } }
  },
  me: {
    uid: string (UUID),
    fb_id: string,
    fb_name: string,
    session_id: string (UUID),
    application: number
  }
}
```

---

### 2. Pages

#### `GET /api/v1/pages`
Danh sách tất cả pages của account.

```
Response: {
  success: boolean,
  categorized: {
    activated: Page[],        // Pages đang hoạt động
    activated_page_ids: string[],
    hidden: Page[],           // Pages ẩn
    inactivated: Page[],      // Pages chưa kích hoạt
    nopermission: Page[]      // Không có quyền
  }
}
```

**Page object:**
| Field | Type | Mô tả |
|-------|------|-------|
| `id` | string | Page ID (`270136663390370`) |
| `name` | string | Tên page |
| `username` | string | Username (`NhiJudyStore`) |
| `platform` | string | `"facebook"` / `"instagram_official"` |
| `shop_id` | number | Shop ID cho đơn hàng |
| `avatar_url` | string | URL avatar |
| `connected` | boolean | Đã kết nối FB |
| `is_activated` | boolean | Đã kích hoạt |
| `timezone` | string | Timezone |
| `role_in_page` | string | `"ADMINISTER"` / `"EDIT_PROFILE"` |
| `active_user_ids` | string[] | UUIDs nhân viên đang active |
| `users` | PageUser[] | Danh sách nhân viên |
| `settings` | PageSettings | Cấu hình page |
| `platform_extra_info` | object | Thông tin platform thêm |

#### `GET /api/v1/pages/<page_id>`
Chi tiết 1 page. Trả về cùng Page object.

#### `GET /api/v1/pages/<page_id>/users`
Danh sách nhân viên quản lý page.

```
Response: {
  users: [{
    id: string (UUID),
    fb_id: string,
    name: string,
    role_in_page: string,      // "ADMINISTER" / "EDIT_PROFILE"
    status_in_page: string     // "active" / "removed"
  }]
}
```

---

### 3. Page Settings

#### `GET /api/v1/pages/<page_id>/settings`
**Cần header:** `Referer: https://pancake.vn/<username>`

Trả về settings + tags + quick replies + warehouses.

```
Response: {
  success: boolean,
  settings: PageSettings,
  warehouses: Warehouse[],
  pinned_photos: Photo[],
  recent_photos: Photo[],
  shop_id: number
}
```

**Settings quan trọng:**
| Field | Type | Mô tả |
|-------|------|-------|
| `page_access_token` | string | PAT cho Public API |
| `tags` | Tag[] | Danh sách tags |
| `quick_replies` | QuickReply[] | Tin nhắn nhanh |
| `quick_reply_types` | QuickReplyType[] | Nhóm tin nhắn nhanh |
| `auto_create_order` | boolean | Tự tạo đơn |
| `hard_round_robin` | boolean | Phân công tự động |
| `unread_first` | boolean | Ưu tiên chưa đọc |
| `notification` | boolean | Bật thông báo |
| `multi_tag` | boolean | Cho phép nhiều tag |

**Tag object:**
```
{ id: number, text: string, color: string (hex), lighten_color: string (rgba) }
```

**QuickReply object:**
```
{
  id: string (UUID),
  shortcut: string,           // Từ khóa tắt
  type_id: string,            // Nhóm
  messages: [{
    message: string,           // Nội dung
    message_type: string,
    photos: [],
    folders: []
  }]
}
```

---

### 4. Conversations

#### `GET /api/v1/conversations` (v1 — danh sách)
**Params:**
| Param | Type | Mô tả |
|-------|------|-------|
| `pages[<page_id>]` | number | Cursor (0 = từ đầu) |
| `access_token` | string | JWT |
| `cursor_mode` | boolean | Bật cursor pagination |
| `type` | string | `INBOX` / `COMMENT` |
| `unread_first` | boolean | Sắp xếp chưa đọc trước |
| `seen` | boolean | Filter đã đọc/chưa |
| `assignee_id` | UUID | Filter theo nhân viên |
| `tags[]` | number | Filter theo tag |
| `last_conversation_id` | string | Cursor cho pagination |

```
Response: {
  success: boolean,
  conversations: Conversation[],
  pages_with_current_count: { [page_id]: number }
}
```

#### `GET pages.fm/api/public_api/v2/pages/<page_id>/conversations` (v2 — richer data)
Trả thêm: `page_customer`, `tag_histories`, `ad_clicks`, `customer_id`.

**Conversation object:**
| Field | Type | Mô tả |
|-------|------|-------|
| `id` | string | Conversation ID |
| `type` | string | `"INBOX"` / `"COMMENT"` |
| `page_id` | string | Page ID |
| `post_id` | string\|null | Post ID (COMMENT only) |
| `from` | object | `{ id, name, email? }` |
| `from_id` | string | Customer fb_id |
| `from_psid` | string\|null | PSID (INBOX only) |
| `customers` | array | `[{ fb_id, id (UUID), name }]` |
| `snippet` | string | Tin nhắn cuối |
| `message_count` | number | Tổng tin nhắn |
| `unread_count` | number | **Chưa đọc** (0 = đã đọc) |
| `seen` | boolean | Nhân viên đã xem |
| `updated_at` | string | Thời gian cập nhật |
| `last_sent_by` | object | Ai gửi cuối `{ id, name, admin_name? }` |
| `last_customer_interactive_at` | string\|null | Khách tương tác cuối |
| `tags` | Tag[] | Tags gắn |
| `assignee_ids` | string[] | Nhân viên phụ trách |
| `has_phone` | boolean | Có số điện thoại |
| `is_combined` | boolean | Đã gộp conversation |
| `is_removed` | boolean | Đã xóa |
| `thread_id` | string\|null | Facebook thread ID |
| `thread_key` | string\|null | Facebook thread key |
| `recent_phone_numbers` | PhoneNumber[] | Số điện thoại gần đây |
| `recent_seen_users` | array\|null | Nhân viên xem gần đây |

---

### 5. Messages

#### `GET /api/v1/pages/<page_id>/conversations/<conv_id>/messages`
**Cần:** `?customer_id=<UUID>&access_token=<JWT>` + `Referer` header

#### `GET pages.fm/api/public_api/v1/pages/<page_id>/conversations/<conv_id>/messages`
**Cần:** `?page_access_token=<PAT>` (KHÔNG cần customer_id)

**Response cực kỳ giàu thông tin** — không chỉ messages mà còn customer detail, orders, post info:

```
Response: {
  success: boolean,
  messages: Message[],
  customers: CustomerDetail[],
  conversation: Conversation,      // Full conversation detail
  conv_customers: ConvCustomer[],
  conv_phone_numbers: PhoneNumber[],
  activities: Activity[],
  notes: Note[]|null,
  recent_orders: Order[],
  post: Post|null,                 // Bài viết (nếu COMMENT)
  reports_by_phone: object,
  read_watermarks: ReadWatermark[],
  comment_count: number,
  global_id: string|null,
  gender: string|null,
  birthday: string|null,
  can_inbox: boolean,
  is_banned: boolean
}
```

**Message object:**
| Field | Type | Mô tả |
|-------|------|-------|
| `id` | string | Message ID |
| `message` | string | Nội dung (HTML cho INBOX) |
| `original_message` | string | Nội dung gốc (plain text) |
| `type` | string | `"INBOX"` / `"COMMENT"` |
| `from` | object | `{ id, name, ai_generated? }` |
| `inserted_at` | string | Thời gian gửi |
| `attachments` | Attachment[] | File đính kèm |
| `phone_info` | PhoneInfo[] | Số điện thoại trong tin nhắn |
| `seen` | boolean | Đã đọc |
| `is_hidden` | boolean | Đã ẩn comment |
| `is_removed` | boolean | Đã xóa |
| `is_parent` | boolean | Comment gốc (không phải reply) |
| `parent_id` | string\|null | ID comment cha |
| `has_phone` | boolean | Có SĐT |
| `can_comment` | boolean | Có thể reply |
| `can_hide` | boolean | Có thể ẩn |
| `can_reply_privately` | boolean | Có thể nhắn riêng |
| `like_count` | number\|null | Số like |
| `comment_count` | number\|null | Số reply |
| `user_likes` | any\|null | User đã like |

---

### 6. Search

#### `POST /api/v1/conversations/search`
**Params:** `?q=<query>&access_token=<JWT>&cursor_mode=true`
**Body (FormData):** `page_ids=<id1>,<id2>,...`

Tìm conversations theo tên/SĐT **cross-page** (1 request, tất cả pages).

```
Response: {
  success: boolean,
  conversations: Conversation[]    // Mỗi conv có fb_id khác nhau per page
}
```

> **Lưu ý:** Error 122 = page hết hạn subscription. Retry loại page lỗi.

#### `GET /api/v1/conversations/customer/<fb_id>`
**Params:** `?pages[<id1>]=0&pages[<id2>]=0&access_token=<JWT>`

Tìm tất cả conversations của 1 customer (by fb_id) trên nhiều pages.
Chỉ tìm được trên pages mà fb_id đó tồn tại.

#### `GET /api/v1/pages/<page_id>/customers/<fb_id>/conversations`
**Params:** `?access_token=<JWT>`
**Cần:** `Referer` header

Tìm conversations của customer trên 1 page cụ thể.

---

### 7. Customers

#### CustomerDetail (từ messages response)
| Field | Type | Mô tả |
|-------|------|-------|
| `id` | string (UUID) | Pancake customer ID |
| `customer_id` | string (UUID) | Alias của `id` |
| `fb_id` | string | Facebook ID trên page này |
| `name` | string | Tên khách |
| `global_id` | string\|null | Facebook Global ID |
| `can_inbox` | boolean | Có thể gửi tin nhắn |
| `is_followed` | boolean\|null | Page đang follow |
| `personal_info` | object | Thông tin cá nhân |
| `recent_phone_numbers` | PhoneNumber[] | SĐT gần đây |

#### PageCustomer (từ v2 conversations)
| Field | Type |
|-------|------|
| `id` | string (UUID) |
| `name` | string |
| `customer_id` | string (UUID) |
| `psid` | string |
| `global_id` | string\|null |
| `gender` | string\|null |
| `birthday` | string\|null |

---

### 8. Posts

#### `GET /api/v1/pages/<page_id>/posts`
**Params:** `?access_token=<JWT>&limit=<n>`

```
Response: { success: boolean, done: boolean, data: Post[] }
```

**Post object:**
| Field | Type | Mô tả |
|-------|------|-------|
| `id` | string | `<page_id>_<post_id>` |
| `message` | string | Nội dung bài viết |
| `type` | string | Loại (`livestream`, `video`, `photo`, ...) |
| `live_video_status` | string\|null | `"live"` / `"vod"` / null |
| `comment_count` | number | Số comment |
| `share_count` | number | Số share |
| `reactions` | object | Reactions chi tiết |
| `attachments` | PostAttachments | Ảnh/video |
| `inserted_at` | string | Ngày đăng |
| `is_removed` | boolean | Đã xóa |

**Detect livestream:** `type === 'livestream'` HOẶC `live_video_status === 'vod'|'live'`

---

### 9. Mark Read/Unread

#### Mark Read (Public API v1)
```
POST pages.fm/api/public_api/v1/pages/<page_id>/conversations/<conv_id>/read
?page_access_token=<PAT>
```

#### Mark Unread
```
POST pages.fm/api/public_api/v1/pages/<page_id>/conversations/<conv_id>/unread
?page_access_token=<PAT>
```

---

### 10. Avatar

#### `GET /api/v1/pages/<page_id>/avatar/<fb_id>`
Redirect 301 tới URL ảnh avatar. Cần follow redirect.

---

### 11. WebSocket (Real-time)

**URL:** `wss://pancake.vn/socket/websocket?vsn=2.0.0&access_token=<JWT>`
**Protocol:** Phoenix Framework channels

**Events nhận được:**
| Event | Mô tả |
|-------|-------|
| `pages:update_conversation` | Conversation cập nhật (tin mới, thay đổi status) |
| `pages:new_message` | Tin nhắn mới |
| `pages:seen_conversation` | Ai đó đã xem conversation → unread=0 |
| `viewing_conversation:append` | Ai đang xem conversation |
| `viewing_conversation:remove` | Ai rời conversation |

---

## Sub-objects

### PhoneNumber
```
{ phone_number: string, captured: string, m_id: string, offset: number, length: number, status: number }
```

### ReadWatermark
```
{ psid: string, message_id: string, watermark: number (unix ts), is_group_conv: boolean|null }
```

### Attachment (Message)
```
{ type: string, url: string, preview_url: string, image_data: { height, width } }
```

### Activity (từ messages response)
```
{ message: string, inserted_at: string, source: string, post_id: string, attachments: PostAttachments }
```

---

## Pages hiện tại

| Page ID | Tên | Platform | Username |
|---------|-----|----------|----------|
| `270136663390370` | NhiJudy Store | Facebook | NhiJudyStore |
| `117267091364524` | Nhi Judy House | Facebook | NhiJudyHouse.VietNam |
| `112678138086607` | Nhi Judy Ơi | Facebook | NhiJudyOi |
| `193642490509664` | NhiJudy Nè | Facebook | (subscription expired) |
| `324873917372219` | Sách Nói | Facebook | - |
| `igo_17841474211813256` | Nhi Judy | Instagram | - |

---

## Lưu ý quan trọng

### 1. Customer fb_id khác nhau trên mỗi page
- "Huỳnh Thành Đạt" trên Store = `25717004554573583`
- "Huỳnh Thành Đạt" trên House = `24948162744877764`
- "Huỳnh Thành Đạt" trên Ơi = `26140045085657251`
- → **Không thể dùng fb_id để link cross-page**
- → Dùng `conversations/search` bằng tên để tìm cross-page

### 2. Error codes
| Code | Ý nghĩa | Xử lý |
|------|---------|-------|
| 100 | Token không hợp lệ | Regenerate token |
| 102 | Thiếu JWT cookie | Thêm cookie header |
| 105 | Token đã được renew | Regenerate và retry |
| 122 | Gói cước hết hạn (page-level) | Loại page khỏi request, retry |
| 429 | Rate limit | Chờ và retry |

### 3. Referer header
Một số endpoint (settings, conversations, messages) cần `Referer` header:
- Multi-page: `https://pancake.vn/multi_pages`
- Page cụ thể: `https://pancake.vn/<username>`

### 4. v1 vs v2 API
| | v1 (pancake.vn) | v2 (pages.fm) |
|---|---|---|
| Auth | JWT | Page Access Token |
| Data | Cơ bản | Richer (tag_histories, ad_clicks, page_customer) |
| Messages | Cần `customer_id` UUID | Không cần |
| Rate limit | Thấp hơn | Cao hơn |

### 5. Subscription expired (Error 122)
- Page `193642490509664` (NhiJudy Nè) đã hết hạn
- Không thể fetch conversations hay search trên page này
- Cần loại khỏi request params, cache `_searchablePageIds`

### 6. Instagram pages
- ID bắt đầu bằng `igo_` (vd: `igo_17841474211813256`)
- Filter ra khỏi search/conversation queries (`!id.startsWith('igo_')`)
- Có `platform_extra_info.linked_fb_page` link tới FB page

---

## Mapping sang Render DB

### Bảng `customers` — link với Pancake
| Render DB | Pancake Source | Lưu ý |
|-----------|---------------|-------|
| `fb_id` | `conversation.customers[0].fb_id` | Khác nhau per page! |
| `name` | `conversation.customers[0].name` | |
| `phone` | `conversation.recent_phone_numbers[0].phone_number` | |

### Bảng `pancake_accounts` — JWT accounts
| Render DB | Pancake Source |
|-----------|---------------|
| `account_id` | JWT payload `uid` |
| `token` | JWT string |
| `token_exp` | JWT payload `exp` |
| `name` | JWT payload `name` |
| `fb_id` | JWT payload `fb_id` |
| `fb_name` | JWT payload `fb_name` |
| `pages` | Response từ `/pages` API |

### Bảng `fb_global_id_cache` — PSID → Global ID
| Render DB | Pancake Source |
|-----------|---------------|
| `page_id` | `conversation.page_id` |
| `psid` | `conversation.from_psid` |
| `global_user_id` | `messages_response.global_id` hoặc `page_customer.global_id` |
| `customer_name` | `conversation.customers[0].name` |
