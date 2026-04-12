# Pancake.vn Website — Full Source Analysis

> **LƯU Ý:** Đây là file tài liệu duy nhất về Pancake. Nếu có thông tin mới mà file này chưa có, cập nhật trực tiếp vào đây (không tạo file mới).

> Phân tích toàn bộ source code website Pancake.vn từ HTML, JS bundles, __NEXT_DATA__, và build manifest.
> Ngày phân tích: 2026-04-12

---

## Mục lục

| # | Section | Nội dung | Dòng |
|---|---------|----------|------|
| 1 | [Tổng quan kiến trúc](#1-tổng-quan-kiến-trúc) | Tech stack, multi-domain, API domains | ~10 |
| 2 | [Route Map](#2-route-map-build-manifest) | 70+ routes: conversation, post, statistic, setting, tools | ~51 |
| 3 | [Redux Store](#3-redux-store--state-shape) | 16 state slices: auth, pages, conversations, messages, CRM, calling, SIP | ~152 |
| 4 | [API Endpoints (v1)](#4-api-endpoints-v1) | 100+ endpoints: users, pages, posts, shops, CRM, shopee, tiktok, whatsapp, zalo, line, telegram | ~325 |
| 5 | [WebSocket Events](#5-websocket-events-phoenix-channels) | 50+ Phoenix channel events: pages:*, users:*, content:*, calling, WhatsApp | ~535 |
| 6 | [Tính năng theo trang](#6-tính-năng-theo-trang) | Chi tiết 16 trang: conversation, post, dashboard, KPI, statistics x7, settings x10 | ~625 |
| 7 | [Platform Integrations](#7-platform-integrations) | 13 platforms: Facebook, Instagram, TikTok, WhatsApp, Zalo, LINE, Telegram, Shopee... | ~815 |
| 8 | [Tính năng đặc biệt](#8-tính-năng-đặc-biệt) | Multi-page mode, AI (CakeAI), CRM, VoIP/SIP, E-commerce, Zero-width encoding | ~845 |
| 9 | [CSS / UI Components](#9-css--ui-components) | Ant Design v3, custom components, layout structure | ~896 |
| 10 | [i18n](#10-i18n-internationalization) | 5 locales (vi, en, id, th, ph), error codes tiếng Việt | ~920 |
| 11 | [JS Bundle Structure](#11-js-bundle-structure) | Shared chunks, page-specific chunks với size | ~949 |
| 12 | [Tóm tắt](#12-tóm-tắt) | Overview ngắn gọn toàn bộ platform | ~990 |
| 13 | [API Response Schemas](#13-api-response-schemas-chi-tiết) | JSON response chi tiết: /me, /pages, /conversations, /messages, search, mark read | ~1009 |
| 14 | [Customer ID System](#14-customer-id-system-cross-page) | fb_id vs global_id, cross-page lookup strategy, ID formats | ~1199 |
| 15 | [Sub-object Schemas](#15-sub-object-schemas) | Tag, QuickReply, Warehouse, PhoneNumber, Note, Attachment, TagHistory... | ~1231 |
| 16 | [Error Codes](#16-error-codes) | Mã lỗi 100-429, Referer header requirement | ~1294 |
| 17 | [N2Store Mapping](#17-n2store-specific-mapping) | Render DB ↔ Pancake: customers, fb_global_id_cache, pancake_accounts | ~1312 |
| 18 | [Pages & Accounts](#18-pages--accounts-hiện-tại) | Danh sách pages (6) và accounts (6) hiện tại | ~1362 |
| 19 | [Environment & Config](#19-environment--config-keys) | FB_APP_ID, Stripe, extension ID, currencies, 31 shipping carriers | ~1392 |

---

## 1. Tổng quan kiến trúc

### Tech Stack
| Thành phần | Công nghệ |
|------------|-----------|
| Framework | **Next.js** (Pages Router, SSR) |
| State Management | **Redux** (global store) |
| UI Library | **Ant Design v3** (antd) |
| Rich Text | **Draft.js** |
| Realtime | **Phoenix WebSocket** (Elixir backend) |
| Charts | **Highcharts** (spline, area, bar, pie/donut) via `react-highcharts` |
| CDN | `content.pancake.vn` |
| Build ID | `0f1b050542be9edca219492ca4a910464895bbb1` |

### Multi-domain / Multi-region
| Domain | Region |
|--------|--------|
| `pancake.vn` | Vietnam |
| `pancake.ph` | Philippines |
| `pancake.id` | Indonesia |
| `pancake.th` | Thailand |
| `pancake.in` | India |
| `pages.fm` | Legacy domain (API) |
| `pancake.biz` | Business/Docs |

### API Domains
| Domain | Mục đích |
|--------|----------|
| `pages.fm/api` | API chính (v1) |
| `pancake.vn/api` | API chính (alias) |
| `dev.pancake.vn/api` | Dev environment |
| `crm.pancake.vn/api` | CRM API |
| `pos.pancake.vn/api` | POS API |
| `account.pancake.vn` | Account management |
| `chat-plugin.pancake.vn` | Chat plugin |
| `content.pancake.vn` | CDN (images, files, stickers) |
| `docs.pancake.vn` | Documentation |
| `docs.pancake.biz` | Documentation (biz) |

---

## 2. Route Map (Build Manifest)

### Trang chính (Top-level)
| Route | Mô tả |
|-------|-------|
| `/login` | Đăng nhập |
| `/dashboard` | Dashboard tổng quan |
| `/account` | Quản lý tài khoản |
| `/account/commission` | Hoa hồng giới thiệu |
| `/payment` | Thanh toán/gói cước |
| `/referral-subscription` | Chương trình giới thiệu |
| `/blog` | Blog |
| `/contact` | Liên hệ |
| `/marketing` | Marketing |
| `/terms` | Điều khoản |
| `/connect/success` | Kết nối thành công |
| `/fb-business-integration` | Tích hợp FB Business |
| `/mobile-open-conversation` | Mở hội thoại (mobile) |

### Conversation (Inbox chính)
| Route | Mô tả |
|-------|-------|
| `/page/conversation` | **Trang inbox chính** - quản lý hội thoại |

### Post Management
| Route | Mô tả |
|-------|-------|
| `/page/post` | Quản lý bài viết, livestream |

### KPI & Processing
| Route | Mô tả |
|-------|-------|
| `/page/kpi` | KPI nhân viên |
| `/page/processing` | Đang xử lý |

### Statistics (Thống kê)
| Route | Mô tả |
|-------|-------|
| `/page/statistic` | Trang thống kê chính |
| `/page/statistic/overview` | Tổng quan thống kê |
| `/page/statistic/page` | Thống kê theo trang |
| `/page/statistic/user` | Thống kê theo nhân viên |
| `/page/statistic/tag` | Thống kê theo tag |
| `/page/statistic/engagement` | Thống kê tương tác |
| `/page/statistic/feedback` | Thống kê feedback |
| `/page/statistic/ads` | Thống kê quảng cáo |
| `/page/statistic/call-center` | Thống kê tổng đài |
| `/page/statistic/export` | Xuất dữ liệu thống kê |

### Settings (Cài đặt)
| Route | Mô tả |
|-------|-------|
| `/page/setting` | Trang cài đặt chính |
| `/page/setting/general` | Cài đặt chung |
| `/page/setting/display` | Cài đặt hiển thị |
| `/page/setting/reply` | Trả lời tự động |
| `/page/setting/tag` | Quản lý tag |
| `/page/setting/round-robin` | Phân công tự động |
| `/page/setting/ai` | Cài đặt AI |
| `/page/setting/call` | Cài đặt cuộc gọi/SIP |
| `/page/setting/chat_plugin` | Chat plugin |
| `/page/setting/sync` | Đồng bộ dữ liệu |
| `/page/setting/tools` | Công cụ |
| `/page/setting/setting_permissions` | Phân quyền |
| `/page/setting/google_agent` | Google Agent |
| `/page/setting/google_location` | Google Location |
| `/page/setting/update_histories` | Lịch sử cập nhật |

### Settings — Sub-components
| Route | Mô tả |
|-------|-------|
| `/page/setting/tools/GenAccessToken` | Tạo access token |
| `/page/setting/tools/InviteLikePage` | Mời like trang |
| `/page/setting/tools/LiveShoppingChecker` | Kiểm tra live shopping |
| `/page/setting/tools/MarkReadAll` | Đánh dấu đã đọc tất cả |
| `/page/setting/tools/ShowHideComment` | Ẩn/hiện comment |
| `/page/setting/tools/SignatureSettings` | Chữ ký |
| `/page/setting/tools/SyncPzlZaloData` | Đồng bộ Zalo |
| `/page/setting/tools/WhatsappMessage` | Tin nhắn WhatsApp |
| `/page/setting/reply/MessagePreview` | Xem trước tin nhắn |
| `/page/setting/update_histories/SettingHistories` | Lịch sử cài đặt |
| `/page/setting/update_histories/RoundRobinHistories` | Lịch sử phân công |
| `/page/setting/update_histories/ColumnBanCustomerHistory` | Lịch sử cấm khách |
| `/page/setting/update_histories/ColumnRemovedCommentHistory` | Lịch sử xóa comment |
| `/page/setting/update_histories/ColumnViolateFacebook` | Vi phạm Facebook |

### Statistics — Sub-components (Charts)
| Route | Mô tả |
|-------|-------|
| `/page/statistic/page/InboxAndCommentStatisticChart` | Biểu đồ inbox & comment |
| `/page/statistic/page/ViewRatioPageStatistic` | Tỷ lệ xem trang |
| `/page/statistic/user/ColumnChartTopFiveUserResponse` | Top 5 nhân viên phản hồi |
| `/page/statistic/user/DonutRatioChartResposeByUser` | Tỷ lệ phản hồi theo nhân viên |
| `/page/statistic/tag/ColumnChartTopFiveMostUsedTags` | Top 5 tag sử dụng nhiều |
| `/page/statistic/tag/DonutChartRatioUsingTag` | Tỷ lệ sử dụng tag |
| `/page/statistic/engagement/SemiDonutChartCustomerInteract` | Tương tác khách hàng |
| `/page/statistic/engagement/SemiDonutChartOrder` | Đơn hàng |
| `/page/statistic/ads/AdsByTimeChart` | Quảng cáo theo thời gian |

---

## 3. Redux Store — State Shape

### Top-level State Keys
```
auth            — Authentication & user info
pages           — Page management (activated, inactivated, settings)
conversations   — Conversation list, filters, selected conversation
messages        — Message data, attachments, notes, AI
posts           — Post/livestream management
crm             — CRM tables, records, automations, workspaces
customer        — Customer lookup, warnings, returned orders
navigation      — Current route/navigation state
notification    — User notifications
calling         — VoIP calling state (WebRTC)
sip             — SIP/VoIP configuration
tasks           — Running tasks
group           — Facebook Group management
print           — Print message functionality
preview         — Message preview
routing         — Router state
appActions      — Global app actions
```

### Auth State (Chi tiết)
```javascript
{
  fbId: "113829328380970",        // Facebook ID
  fbName: "Thu Huyền",            // Facebook name
  userId: "c2177f20-...",         // Pancake user ID (UUID)
  accessToken: "eyJhbG...",       // JWT token
  locale: "vi",                   // Ngôn ngữ
  country: "VN",                  // Quốc gia
  currency: "VND",                // Tiền tệ
  multipleGroups: [               // Nhóm trang
    { name: "Group 0", page_ids: ["117267091364524", "112678138086607"] },
    { name: "Group 1", page_ids: [] },
    { name: "Group 2", page_ids: [] }
  ],
  settings: {
    can_notification: false,
    notification: true,
    sound: true,
    isMac: false
  },
  extraInfo: {
    avatar_hash: "43930ea508d...",
    enable_2fa: false,
    favorite_pages: ["270136663390370"],
    report_spam_modal_shown: true
  },
  chatPluginSession: {
    email: "ptduyen@hotmail.com",
    name: "Thu Huyền",
    phone: "84907777674",
    session_id: "PvgramS4w..."
  },
  stickers: null,                 // Sticker packs
  packStickers: null,
  signatures: null,               // Email signatures
  onlineStatus: null,
  lockedAt: null,                 // Account lock
  extension: null,                // Browser extension info
  extensionVersion: null
}
```

### Conversations State
```javascript
{
  fetching: false,
  filteredType: false,            // Filter by type (inbox/comment/...)
  filteredTag: "ALL",             // Filter by tag
  selectedId: null,               // Currently selected conversation ID
  selectedType: null,             // Type (inbox/comment/review/...)
  selectedTags: [],               // Tags on selected conversation
  selectedIsCombined: false,      // Combined conversation
  selectedIsRemoved: false,       // Removed/deleted
  selectedFrom: null,             // Customer info
  selectedCustomers: [],          // Customer list for conversation
  selectedThreadId: null,         // Thread ID
  selectedThreadKey: null,        // Thread key
  selectedAssigneeIds: [],        // Assigned users
  selectedAssigneeGroupId: null,  // Assigned group
  data: [],                       // Conversation list
  pinned: [],                     // Pinned conversations
  roundRobin: false,              // Round-robin enabled
  viewingUsers: [],               // Users viewing this conv
  usersTyping: [],                // Users typing
  unreadConvCount: 0,             // Unread count
  filteredAdIds: null,            // Filter by ad ID
  filteredWebs: [],               // Filter by web source
  filterShopCustomers: {},        // Filter by shop customer
  selectedIsPinnedConversation: false,
  filterByCustomer: false
}
```

### Messages State
```javascript
{
  fetching: false,
  post: null,                     // Post data if comment thread
  data: [],                       // Message list
  canInbox: false,                // Can send inbox message
  notes: [],                      // Internal notes
  recentOrders: false,            // Recent orders
  recentPhoneNumbers: [],         // Recent phone numbers
  isBanned: false,                // Customer banned
  bannedCount: 0,
  reportedCount: 0,               // Report count
  reportsByPhone: {},             // Reports by phone
  commentCount: 0,
  selectedReplyTo: false,         // Reply-to message
  globalId: null,                 // Global customer ID
  gender: null,
  loadedAttachments: [],          // Loaded attachments
  activities: null,               // Customer activities
  birthday: null,
  repliedMessage: null,           // Replied message
  customers: [],                  // Customer data
  aiMarker: {},                   // AI marker data
  aiAgent: {},                    // AI agent data
  dummyPinnedMessages: [],        // Pinned messages
  hasMoreMessages: false
}
```

### CRM State
```javascript
{
  tables: {},                     // CRM tables
  recordOptions: {},              // Record field options
  users: {},                      // CRM users
  records: [],                    // CRM records
  selectedRecord: null,
  tableName: null,                // Current table name
  taskCategories: {},             // Task categories
  crmSource: {},                  // CRM sources
  crmModules: [],                 // CRM modules
  automations: [],                // CRM automations
  workspaces: [],                 // CRM workspaces
  tickets: [],                    // Support tickets
  fieldsPermissions: {}           // Field-level permissions
}
```

### Calling/SIP State
```javascript
// Calling (WebRTC)
{
  session: null,                  // Current call session
  incomingSession: null,          // Incoming call
  callingList: [],                // Call history
  currentCallingConv: null,       // Conversation being called
  callingState: "",               // "ringing", "connected", etc.
  handlers: {}
}

// SIP
{
  sipUA: [],                      // SIP User Agents
  callingList: [],                // SIP call list
  session: null,
  incomingSession: null,
  calledCustomer: null,
  calledPhoneNumber: null,
  sipPhoneNumber: null,
  logCustomer: null
}
```

---

## 4. API Endpoints (v1)

### Authentication & Users
```
GET  /v1/me?access_token=
GET  /v1/users/info?access_token=
GET  /v1/users/avatar/{id}
GET  /v1/users/avatar?jid=
POST /v1/users/change_locale?access_token=
POST /v1/users/update_extra_info?access_token=
POST /v1/users/update_multiple_page_group?access_token=
GET  /v1/users/notifications?access_token=
POST /v1/users/notifications/hide?access_token=
POST /v1/users/notifications/read?access_token=
GET  /v1/users/permisstions/fb?user_id=
GET  /v1/users/search?access_token=
GET  /v1/users/signatures?access_token=
POST /v1/users/signatures?access_token=
GET  /v1/users/pancake_id_login_success
```

### Pages
```
GET  /v1/pages
GET  /v1/pages/{id}
GET  /v1/pages/inactivated
POST /v1/pages/connect?access_token=
POST /v1/pages/deactive_page?access_token=
POST /v1/pages/remove_connect?access_token=
POST /v1/pages/change_shop?access_token=
GET  /v1/pages/pages_reload?is_connect=
GET  /v1/pages/settings?access_token=
GET  /v1/pages/users?page_ids=
GET  /v1/pages/users_pages?access_token=
GET  /v1/pages/round_robin_users?page_ids=
GET  /v1/pages/get_user_role_permissions?page_ids=
POST /v1/pages/update_user_role_permissions?access_token=
GET  /v1/pages/sources/ad_ids_for_page?access_token=
GET  /v1/pages/sources/web?access_token=
GET  /v1/pages/unread_conv_pages_count?access_token=
GET  /v1/pages/facebook_ui_version?access_token=
POST /v1/pages/create_connect_code?access_token=
GET  /v1/pages/connect_code?page_id=
POST /v1/pages/activate_bot?access_token=
```

### Pages — AI (Cake AI)
```
GET  /v1/pages/cake_ai/get_configs?access_token=
POST /v1/pages/cake_ai/link_wallets?access_token=
```

### Posts & Livestream
```
GET  /v1/pages/posts
GET  /v1/pages/posts/search?post=
GET  /v1/pages/posts/livestream
POST /v1/pages/posts/export_posts?access_token=
GET  /v1/pages/posts/get_customers_extra_info
```

### Multi-pages
```
POST /v1/multi_pages/conversations/assign_user_to_conversation?access_token=
```

### Activation & Subscriptions
```
GET  /v1/activation?access_token=
POST /v1/subscriptions/create_mkt_subscription?access_token=
GET  /v1/subscriptions/shared_account?access_token=
GET  /v1/subscriptions/webhook_callback/config?page_id=
POST /v1/subscriptions/webhook_callback/clear_config?page_id=
GET  /v1/subscriptions/webhook_callback/get_configs?access_token=
GET  /v1/subscriptions/webhook_callback/find_best_fit_subscription?page_id=
```

### Statistics
```
GET  /v1/statistics/page
GET  /v1/statistics/ctx_optimization_eligibility
```

### SIP/Call Center
```
GET  /v1/sip_subscriptions/extensions
POST /v1/sip_subscriptions/extensions?access_token=
GET  /v1/sip_subscriptions/statistics?since=
GET  /v1/sip_subscriptions/download?business_ids=
```

### Shops / E-commerce
```
GET  /v1/shops?access_token=
GET  /v1/shops/{id}
GET  /v1/shops/get_multiple_shops?access_token=
POST /v1/shops/update_active?access_token=
```

### CRM
```
GET  /api/v1/shops/*/crm/tables
POST /api/v1/shops/*/crm/tables/init
GET  /api/v1/shops/*/crm/*/records
POST /api/v1/shops/*/crm/*/record
GET  /api/v1/shops/*/crm/*/history
POST /api/v1/shops/*/crm/*/create_media
GET  /api/v1/shops/*/crm/crm_entities
POST /api/v1/shops/*/crm/crm_entities/*
GET  /api/v1/shops/*/crm/crm_order/get_order_data
GET  /api/v1/shops/*/crm/customer_sources
POST /api/v1/shops/*/crm/field/*
GET  /api/v1/shops/*/crm/get_user_settings
POST /api/v1/shops/*/crm/set_user_settings
GET  /api/v1/shops/*/crm/init_task_categories
GET  /api/v1/shops/*/crm/new_tasks
POST /api/v1/shops/*/crm/new_tasks/*
GET  /api/v1/shops/*/crm/task_categories
GET  /api/v1/shops/*/crm/modules
POST /api/v1/shops/*/crm/automation
GET  /api/v1/shops/*/crm/shop_order_record
GET  /api/v1/shops/*/users
```

### Shopee Integration
```
GET  /v1/shopee/{id}
GET  /v1/shopee/avatar/{id}
GET  /v1/shopee/get_url_shopee?access_token=
POST /v1/shopee/reply_offer?&access_token=
POST /v1/shopee_official/login?access_token=
GET  /v1/shopee_official/{id}
```

### TikTok Integration
```
GET  /v1/tiktok/qrcode?access_token=
POST /v1/tiktok/seller_2fa/check_code?access_token=
POST /v1/tiktok/set_session_has_shop?access_token=
GET  /v1/tiktok_ads/{id}
POST /v1/tiktok_business/login?access_token=
POST /v1/tiktok_shop/login?access_token=
POST /v1/tiktok_shop/pos_auth?access_token=
GET  /v1/tiktok_shop/{id}
```

### WhatsApp Integration
```
GET  /v1/whatsapp/qrcode?access_token=
GET  /v1/whatsapp/pairing_code?access_token=
POST /v1/whatsapp/reconnect?access_token=
GET  /v1/whatsapp/avatar?jid=
GET  /v1/whatsapp/avatar?page_id=
POST /v1/whatsapp/broadcast?access_token=
POST /v1/whatsapp/group/add_participant?access_token=
POST /v1/whatsapp/group/remove_participant?access_token=
GET  /v1/whatsapp/products?access_token=
GET  /v1/whatsapp/stickers?access_token=
POST /v1/whatsapp/set_group?access_token=
POST /v1/whatsapp_official/login_success?access_token=
GET  /v1/whatsapp_official/{id}
```

### Other Platforms
```
POST /v1/zalov4/auth?access_token=            # Zalo
GET  /v1/personal_zalo/{id}                    # Personal Zalo
GET  /v1/personal_zalo/qr?access_token=        # Zalo QR
GET  /v1/telegram/{id}                         # Telegram
POST /v1/telegram/login_session                # Telegram login
GET  /v1/line/pages?access_token=              # LINE
POST /v1/line/pages/reconnect_webhook          # LINE webhook
GET  /v1/line/stickers?access_token=           # LINE stickers
POST /v1/messenger/login?access_token=         # Messenger
POST /v1/youtube/login?access_token=           # YouTube
POST /v1/google_location/login?access_token=   # Google Business
POST /v1/google_location/connect_location      # Google Location
POST /v1/google_location/create_page           # Create Google page
GET  /v1/google_location/get_locations         # Get locations
POST /v1/google_location/verify_page           # Verify page
```

### Content & Sync
```
GET  /v1/contents?access_token=
GET  /v1/content_sync_groups?access_token=
GET  /v1/content_sync_groups/{id}
GET  /v1/content_sync_groups_histories?page=
POST /v1/content_sync_groups_histories/restore/{id}
GET  /v1/quick_reply_sync_groups?access_token=
GET  /v1/quick_reply_sync_groups/{id}
GET  /v1/tag_sync_groups?access_token=
GET  /v1/tag_sync_groups/{id}
```

### Misc
```
POST /v1/encode_zero_width_payload?access_token=
GET  /v1/refresh_url_preview?access_token=
POST /v1/facebook_shop/sync?access_token=
GET  /v1/fpt_shop/{id}
GET  /v1/fpt_shop/summary_statistics?date_range=
GET  /v1/geo/{id}
GET  /v1/google_ads/{id}
POST /v1/pke_chat_plugin/create_page?access_token=
POST /v1/logs/pancake_exception_logs?access_token=
```

---

## 5. WebSocket Events (Phoenix Channels)

### Page Channel Events
```
pages:update_conversation          — Cập nhật hội thoại
pages:update_messages              — Cập nhật tin nhắn
pages:update_settings              — Cập nhật cài đặt
pages:update_page                  — Cập nhật thông tin trang
pages:update_conversation_assignee_ids — Cập nhật phân công
pages:update_conversation_avatar   — Cập nhật avatar hội thoại
pages:update_conversation_task     — Cập nhật task hội thoại
pages:update_mark_order            — Cập nhật đánh dấu đơn
pages:update_printed_messages      — Cập nhật tin nhắn đã in
pages:update_table_plan            — Cập nhật kế hoạch bàn
pages:seen_conversation            — Đã xem hội thoại
pages:tag_conversation             — Gắn tag hội thoại
pages:tag_conversations            — Gắn tag nhiều hội thoại
pages:toggle_ban_customer          — Cấm/bỏ cấm khách hàng
pages:unassign_from_conv           — Bỏ phân công hội thoại
```

### Calling Events
```
pages:user_calling                 — Đang gọi
pages:users_receive_call           — Nhận cuộc gọi
pages:facebook_call_update_status  — Cập nhật trạng thái gọi FB
pages:facebook_call_media_update   — Cập nhật media gọi FB
```

### WhatsApp Events
```
pages:wa_qrcode                    — QR code WhatsApp
pages:wa_pairing_code              — Mã ghép nối WhatsApp
pages:wa_contacts                  — Danh bạ WhatsApp
pages:wa_disconnected              — WhatsApp mất kết nối
pages:wa_reconnected               — WhatsApp kết nối lại
pages:wa_mobile_has_connection     — Mobile có kết nối
pages:wa_start_check_has_mobile_connection — Kiểm tra kết nối mobile
pages:wa_update_name               — Cập nhật tên WA
pages:wa_page_avatar_tag           — Cập nhật avatar WA
```

### Platform Connection Events
```
pages:ig:connected                 — Instagram đã kết nối
pages:tiktok_connected             — TikTok đã kết nối
pages:tiktok_qrcode_scanned        — TikTok QR đã quét
pages:tiktok_seller_connected      — TikTok Seller đã kết nối
pages:tiktok_seller_2fa_required   — TikTok cần 2FA
pages:tiktok_seller_error          — TikTok lỗi
```

### User Events
```
users:new_pages                    — Trang mới
users:add_page                     — Thêm trang
users:show_notifications           — Hiện thông báo
users:hide_notifications           — Ẩn thông báo
users:update_notifications         — Cập nhật thông báo
users:deactive_current_session     — Hủy phiên hiện tại
users:active_subscription_success  — Kích hoạt gói thành công
users:login_qr_code_success        — Đăng nhập QR thành công
users:tl_login_session             — Telegram login session
users:pzl_connected                — Personal Zalo connected
users:pzl_new_qr                   — Personal Zalo new QR
```

### Content Events
```
page_contents:facebook_uploaded    — Nội dung Facebook đã upload
pinned_contents:add                — Thêm nội dung ghim
pinned_contents:move               — Di chuyển nội dung ghim
pinned_contents:remove             — Xóa nội dung ghim
recent_contents:add                — Thêm nội dung gần đây
recent_contents:remove             — Xóa nội dung gần đây
```

### Other Events
```
conversation:read_watermarks       — Đánh dấu đã đọc
message:update_reactions_and_replies — Cập nhật reactions & replies
messages:mark_as_deleted           — Đánh dấu tin nhắn đã xóa
bulk_tagging:done                  — Gắn tag hàng loạt xong
viewing_conversation:typing        — Đang gõ trong hội thoại
crawled_fb_messages:               — Tin nhắn FB đã crawl
fetch_quick_reply_cache:           — Cache trả lời nhanh
```

---

## 6. Tính năng theo trang

### 6.1 Conversation (Inbox) — `/page/conversation`
**File:** `conversation-7c2543edd34a6051.v6.js` (1.37MB - lớn nhất)

**Tính năng chính:**
- Danh sách hội thoại (inbox, comment, review)
- Tìm kiếm hội thoại
- Lọc theo tag, nhân viên, nguồn quảng cáo, web source
- Phân công hội thoại cho nhân viên (manual + round-robin)
- Gắn/bỏ tag hội thoại (đơn & hàng loạt)
- Ghim hội thoại
- Kết hợp hội thoại (combine)
- Gửi tin nhắn (text, ảnh, video, file, sticker)
- Reply comment
- Inbox qua comment (gửi inbox từ comment)
- Ghi chú nội bộ (notes)
- Cấm khách hàng (ban)
- Báo xấu khách hàng (report spam)
- In hội thoại (print)
- Xem thông tin khách hàng
- Lịch sử đơn hàng
- Tạo đơn hàng nhanh (quick order)
- AI Agent & AI Marker
- Quick Reply (trả lời nhanh)
- Stickers
- URL preview
- Seen/read indicators
- Typing indicators
- Real-time update via WebSocket
- Multi-page mode (quản lý nhiều trang cùng lúc)
- Call (VoIP/SIP) integration
- WhatsApp, Zalo, TikTok, LINE, Telegram integration
- Shopee offer/reply
- Facebook Group integration
- CRM integration (customer records, tasks)
- Chat plugin session

### 6.2 Post Management — `/page/post`
**File:** `post-906bf7953d70378a.v6.js` (117KB)

**Tính năng:**
- Danh sách bài viết
- Tìm kiếm bài viết
- Livestream management
- Live view mode
- Multi-post mode
- Xem comment trên post
- Xuất dữ liệu bài viết (export)
- Xem thông tin khách hàng từ comment
- Tạo đơn từ livestream (live shopping)
- Thống kê khách hàng tương tác

### 6.3 Dashboard — `/dashboard`
**File:** `dashboard-27dbb5955b5f8e07.v6.js` (46KB)

**Tính năng:**
- Tổng quan nhanh
- Số hội thoại chưa đọc
- Hiệu suất nhân viên
- Thống kê nhanh

### 6.4 KPI — `/page/kpi`
**File:** `kpi-2bdb95a34a4c7f49.v6.js` (32KB)

**Tính năng:**
- KPI nhân viên
- Thời gian phản hồi
- Số hội thoại xử lý
- Đánh giá hiệu suất

### 6.5 Statistics Overview — `/page/statistic/overview`
**File:** `statistic/overview-9c1818237c090103.v6.js` (133KB)

**Tính năng:**
- Biểu đồ tổng quan (Recharts)
- Thống kê theo khoảng thời gian
- So sánh metrics
- Bộ lọc ngày (date range picker tùy chỉnh)
- Metrics: tin nhắn, hội thoại, phản hồi, đơn hàng
- Xuất dữ liệu

### 6.6 Settings — General
**File:** `setting/general-c7307109869c899c.v6.js` (6.6KB)

**Cài đặt:**
- Thông tin trang
- Thời gian làm việc
- Ngôn ngữ
- Múi giờ
- Cài đặt thông báo
- Kết nối/ngắt kết nối trang

### 6.7 Settings — Auto Reply
**File:** `setting/reply-33317f500da2911d.v6.js` (225KB - lớn nhất trong settings)

**Tính năng:**
- Trả lời tự động theo keyword
- Trả lời tự động theo giờ (ngoài giờ làm việc)
- Template tin nhắn
- Quick reply management
- Rule-based auto reply
- Message preview
- Sync groups (đồng bộ cài đặt giữa các trang)

### 6.8 Settings — Round Robin
**File:** `setting/round-robin-93e163759716496e.v6.js` (87KB)

**Tính năng:**
- Phân công tự động (round-robin)
- Cấu hình nhân viên tham gia
- Lịch phân công
- Lịch sử phân công

### 6.9 Settings — Chat Plugin
**File:** `setting/chat_plugin-c487877a27603b2f.v6.js` (96KB)

**Tính năng:**
- Cài đặt chat plugin cho website
- Tùy chỉnh giao diện
- Welcome message
- Audio greeting
- Button styles

### 6.10 Settings — Tools
**File:** `setting/tools-cf47c51da6072824.v6.js` (114KB)

**Công cụ:**
- Generate Access Token
- Invite Like Page
- Live Shopping Checker
- Mark Read All (đánh dấu đã đọc tất cả)
- Show/Hide Comment
- Signature Settings (chữ ký tin nhắn)
- Sync PZL Zalo Data
- WhatsApp Message tools
- Zero-width encoding

### 6.11 Settings — Permissions
**File:** `setting/setting_permissions-dacedab064583d47.v6.js` (51KB)

**Tính năng:**
- Phân quyền nhân viên
- Role-based access control
- Permission per feature

### 6.12 Settings — Display
**File:** `setting/display-d43eddd81175996b.v6.js` (42KB)

**Tính năng:**
- Cài đặt hiển thị giao diện
- Tùy chỉnh sidebar
- Cài đặt notification sound

### 6.13 Settings — Sync
**File:** `setting/sync-7d5869155cb1b522.v6.js` (34KB)

**Tính năng:**
- Đồng bộ cài đặt giữa các trang
- Content sync groups
- Quick reply sync groups
- Tag sync groups

### 6.14 Settings — Tag
**File:** `setting/tag-b1894351c9d7d67b.v6.js` (48KB)

**Tính năng:**
- Quản lý tag
- Tạo/sửa/xóa tag
- Nhóm tag
- Đồng bộ tag giữa các trang

### 6.15 Settings — AI
**File:** `setting/ai-d4ce843eb35b3242.v6.js` (5.5KB)

**Tính năng:**
- Cài đặt Cake AI
- Link AI wallets
- AI configuration

### 6.16 Settings — Call
**File:** `setting/call-6dc27ea541cc8b81.v6.js` (19KB)

**Tính năng:**
- Cài đặt tổng đài SIP
- Quản lý extension
- Cấu hình cuộc gọi

---

## 7. Platform Integrations

### Đã tích hợp
| Platform | Loại | Chi tiết |
|----------|------|----------|
| **Facebook** | Page, Group, Messenger, Ads, Shop | Chính, đầy đủ nhất |
| **Instagram** | Page | Comment & DM |
| **TikTok** | Page, Seller, Ads, Shop | QR login, 2FA support |
| **WhatsApp** | Personal & Official | QR, pairing code, broadcast, groups |
| **Zalo** | Official & Personal (PZL) | QR login, data sync |
| **LINE** | Page | Webhook, stickers |
| **Telegram** | Bot | Login session |
| **Shopee** | Official & Legacy | Auth, offers, avatars |
| **Lazada** | OAuth | Via pos.pancake.vn redirect |
| **YouTube** | Channel | OAuth login |
| **Google** | Business Profile, Location, Ads, Calendar | Multi-feature |
| **FPT Shop** | POS | Statistics |
| **Threads** | Meta | Login |

### Chat Plugin
- Custom chat widget cho website (`chat-plugin.pancake.vn`)
- Welcome audio support
- Session-based (email, name, phone)

### Browser Extension
- Chrome Extension: `oehooocookcnclgniepdgaiankfifmmn`
- Hỗ trợ: send inbox via comment, extension version tracking

---

## 8. Tính năng đặc biệt

### Multi-Page Mode
- Quản lý nhiều Facebook page cùng lúc
- Group trang (tối đa 3 groups)
- Unread count per page
- Cross-page operations

### AI Features
- **Cake AI**: AI chatbot integration
- **AI Marker**: Đánh dấu tin nhắn cho AI
- **AI Agent**: Agent tự động trả lời
- **AI Dataset**: Dữ liệu training AI

### CRM System
- Multi-table CRM
- Custom fields
- Record management
- Task management (categories, assignments)
- Automation rules
- Customer sources tracking
- Workspaces
- Tickets/Support

### VoIP/SIP Calling
- WebRTC calling
- SIP integration
- Call statistics
- Extension management
- Call recording download
- Facebook call integration

### E-commerce
- Shop management (multi-shop)
- Order from conversation
- Live shopping (livestream + orders)
- Warehouse management
- Workspace management

### Report & Export
- Post export
- Statistics export
- Customer data export
- SIP recording download

### Zero-Width Encoding
- Encode payload vào text bằng zero-width characters
- Dùng để tracking nguồn tin nhắn

---

## 9. CSS / UI Components

### UI Framework
- **Ant Design v3** (base CSS)
- **Custom Pancake components**:
  - `pancake-date-range-picker` — Custom date range picker
  - Notification system
  - Custom modals
  - Drawer components

### Layout
- Fixed navbar (55px top padding)
- Sidebar navigation
- Main content area
- Chat panel (right side)
- Customer info panel

### External Resources
- Draft.css (rich text editor)
- Google Fonts (preconnect)
- Favicon: `/static/images/new_fa_icon.svg`

---

## 10. i18n (Internationalization)

### Supported Locales
- `vi` (Vietnamese) — Default
- `en` (English)
- `id` (Indonesian)
- `th` (Thai)
- `ph` (Filipino)

### Error Codes (vi)
| Code | Message |
|------|---------|
| 100 | Không thể cấm người quản lý trang |
| 103 | Phiên đăng nhập hết hạn |
| 104 | Sai page_id |
| 105 | Không có quyền trên trang này |
| 106 | Thời gian không hợp lệ |
| 107 | Chưa kết nối Google Calendar |
| 108 | Không được phân công cho hội thoại |
| 109 | Số lịch hẹn trong ngày đã đầy |
| 123 | Trang mất kết nối, cần kết nối lại |
| 125 | Trang đã hủy kích hoạt |
| 126 | Tính năng không khả dụng trong chế độ an toàn |
| 131 | Sai mật khẩu Instagram |
| 136 | Mã khách hàng không chính xác |
| 145 | Không thể gửi trả lời - chưa xác định mã hội thoại |

---

## 11. JS Bundle Structure

### Shared Chunks (load trên mọi trang)
| File | Size | Mô tả |
|------|------|-------|
| `polyfills-*.js` | - | Polyfills |
| `webpack-*.v6.js` | - | Webpack runtime |
| `framework-*.v6.js` | - | React framework |
| `large-vendor-*.v6.js` (x16) | - | Third-party libraries |
| `main-*.v6.js` | - | Main app code |
| `_app-*.v6.js` | 1.2MB | App shell, Redux store, WebSocket |

### Page-Specific Chunks
| File | Size | Trang |
|------|------|-------|
| `conversation-*.v6.js` | 1.37MB | Inbox (lớn nhất) |
| `post-*.v6.js` | 117KB | Bài viết |
| `setting/reply-*.v6.js` | 225KB | Auto reply |
| `statistic/overview-*.v6.js` | 133KB | Thống kê tổng quan |
| `setting/tools-*.v6.js` | 114KB | Công cụ |
| `setting/chat_plugin-*.v6.js` | 96KB | Chat plugin |
| `setting/round-robin-*.v6.js` | 87KB | Phân công tự động |
| `statistic/ads-*.v6.js` | 87KB | Thống kê quảng cáo |
| `statistic/engagement-*.v6.js` | 71KB | Thống kê tương tác |
| `setting/setting_permissions-*.v6.js` | 51KB | Phân quyền |
| `statistic/user-*.v6.js` | 50KB | Thống kê nhân viên |
| `setting/tag-*.v6.js` | 48KB | Quản lý tag |
| `dashboard-*.v6.js` | 46KB | Dashboard |
| `setting/display-*.v6.js` | 42KB | Cài đặt hiển thị |
| `statistic/page-*.v6.js` | 42KB | Thống kê trang |
| `statistic/call-center-*.v6.js` | 35KB | Thống kê tổng đài |
| `statistic/feedback-*.v6.js` | 34KB | Thống kê feedback |
| `setting/sync-*.v6.js` | 34KB | Đồng bộ |
| `kpi-*.v6.js` | 32KB | KPI |
| `statistic/tag-*.v6.js` | 29KB | Thống kê tag |
| `setting/call-*.v6.js` | 19KB | Cài đặt cuộc gọi |
| `setting/general-*.v6.js` | 6.6KB | Cài đặt chung |
| `setting/ai-*.v6.js` | 5.5KB | Cài đặt AI |

---

## 12. Tóm tắt

Pancake.vn là **nền tảng quản lý bán hàng đa kênh** (omnichannel) với các tính năng chính:

1. **Inbox đa kênh**: Facebook, Instagram, TikTok, WhatsApp, Zalo, LINE, Telegram, Shopee — tất cả trong một giao diện
2. **Quản lý bài viết & Livestream**: Theo dõi comment, tạo đơn từ livestream
3. **CRM tích hợp**: Quản lý khách hàng, task, automation
4. **Thống kê chi tiết**: Overview, per-user, per-tag, engagement, ads, call center, feedback
5. **Tổng đài VoIP**: SIP integration, WebRTC, call recording
6. **AI chatbot**: Cake AI, auto-reply, AI agent
7. **E-commerce**: Multi-shop, order management, warehouse
8. **Team management**: Round-robin, KPI, permissions, multi-user
9. **Công cụ**: Zero-width encoding, bulk operations, sync giữa các trang
10. **Multi-region**: VN, PH, ID, TH, IN

**Tech stack**: Next.js (Pages Router) + Redux + MobX + Ant Design v3 + Phoenix WebSocket + Highcharts

---

## 13. API Response Schemas (Chi tiết)

> Phần này document response schemas chi tiết cho các endpoint chính, dùng cho development.

### Authentication

#### JWT Token
- Lấy từ cookie `jwt` trên `pancake.vn`
- Truyền qua query: `?access_token=<JWT>`
- Một số endpoint cần thêm header `Referer: https://pancake.vn/<page_username>`
- JWT payload chứa: `uid`, `name`, `fb_id`, `fb_name`, `exp`, `session_id`

#### Page Access Token (PAT)
- Lấy từ `page.settings.page_access_token` trong response `/pages` hoặc `/pages/<id>/settings`
- Hoặc generate: `GET /api/v1/pages/<id>/generate_page_access_token?access_token=<JWT>`
- Truyền qua query: `?page_access_token=<PAT>`

### v1 vs v2 API
| | v1 (pancake.vn) | v2 (pages.fm) |
|---|---|---|
| Auth | JWT (`access_token`) | Page Access Token (`page_access_token`) |
| Data | Cơ bản | Richer (tag_histories, ad_clicks, page_customer) |
| Messages | Cần `customer_id` UUID | Không cần |
| Rate limit | Thấp hơn | Cao hơn |

### `GET /api/v1/me` — Thông tin tài khoản
```json
{
  "success": true,
  "data": {
    "id": "UUID",
    "name": "string",
    "email": "string",
    "fb_id": "string",
    "pancake_id": "UUID",
    "phone_number": "string|null",
    "avatar_url": "string|null",
    "timezone": "string",
    "user_name": "string",
    "enable_2fa": "boolean",
    "signatures": { "[page_id]": { "enable": "bool", "signature": "string" } }
  },
  "me": {
    "uid": "UUID", "fb_id": "string", "fb_name": "string",
    "session_id": "UUID", "application": "number"
  }
}
```

### `GET /api/v1/pages` — Danh sách pages
```json
{
  "success": true,
  "categorized": {
    "activated": ["Page[]"],
    "activated_page_ids": ["string[]"],
    "hidden": ["Page[]"],
    "inactivated": ["Page[]"],
    "nopermission": ["Page[]"]
  }
}
```

**Page object:**
| Field | Type | Mô tả |
|-------|------|-------|
| `id` | string | Page ID |
| `name` | string | Tên page |
| `username` | string | Username |
| `platform` | string | `"facebook"` / `"instagram_official"` |
| `shop_id` | number | Shop ID cho đơn hàng |
| `avatar_url` | string | URL avatar |
| `connected` | boolean | Đã kết nối FB |
| `is_activated` | boolean | Đã kích hoạt |
| `role_in_page` | string | `"ADMINISTER"` / `"EDIT_PROFILE"` |
| `users` | PageUser[] | Danh sách nhân viên |
| `settings` | PageSettings | Cấu hình page |

### `GET /api/v1/pages/<page_id>/settings` — Page Settings
**Cần header:** `Referer: https://pancake.vn/<username>`

```json
{
  "success": true,
  "settings": "PageSettings",
  "warehouses": "Warehouse[]",
  "pinned_photos": "Photo[]",
  "recent_photos": "Photo[]",
  "shop_id": "number"
}
```

**Settings keys quan trọng:**
`page_access_token`, `tags`, `quick_replies`, `quick_reply_types`, `auto_create_order`, `hard_round_robin`, `unread_first`, `notification`, `multi_tag`, `full_tag`, `filter_multi_tag`, `show_assigned`, `show_only_assigned_conv`, `show_viewing_conv_in_list`, `self_assignment_round_robin`, `call_config`, `custom_page_color`, `staff_detail`, `post_topics`

### `GET /api/v1/conversations` — Danh sách conversations
**Params:**
| Param | Type | Mô tả |
|-------|------|-------|
| `pages[<page_id>]` | number | Cursor (0 = từ đầu) |
| `access_token` | string | JWT |
| `cursor_mode` | boolean | Bật cursor pagination |
| `type` | string | `INBOX` / `COMMENT` |
| `unread_first` | boolean | Ưu tiên chưa đọc |
| `assignee_id` | UUID | Filter theo nhân viên |
| `tags[]` | number | Filter theo tag |

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
| `unread_count` | number | Chưa đọc (0 = đã đọc) |
| `seen` | boolean | Nhân viên đã xem |
| `updated_at` | string | Thời gian cập nhật |
| `tags` | Tag[] | Tags gắn |
| `assignee_ids` | string[] | Nhân viên phụ trách |
| `has_phone` | boolean | Có số điện thoại |
| `is_combined` | boolean | Đã gộp conversation |
| `thread_id` | string\|null | Facebook thread ID |
| `thread_key` | string\|null | Facebook thread key |
| `recent_phone_numbers` | PhoneNumber[] | Số điện thoại gần đây |

### `GET /api/v1/pages/<page_id>/conversations/<conv_id>/messages` — Messages
**Cần:** `?customer_id=<UUID>&access_token=<JWT>` + `Referer` header

```json
{
  "success": true,
  "messages": "Message[]",
  "customers": "CustomerDetail[]",
  "conversation": "Conversation",
  "conv_customers": "ConvCustomer[]",
  "conv_phone_numbers": "PhoneNumber[]",
  "activities": "Activity[]",
  "notes": "Note[]|null",
  "recent_orders": "Order[]",
  "post": "Post|null",
  "reports_by_phone": "object",
  "read_watermarks": "ReadWatermark[]",
  "comment_count": "number",
  "global_id": "string|null",
  "gender": "string|null",
  "birthday": "string|null",
  "can_inbox": "boolean",
  "is_banned": "boolean"
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
| `is_parent` | boolean | Comment gốc |
| `parent_id` | string\|null | ID comment cha |
| `has_phone` | boolean | Có SĐT |
| `can_reply_privately` | boolean | Có thể nhắn riêng |

### `POST /api/v1/conversations/search` — Search cross-page
**Params:** `?q=<query>&access_token=<JWT>&cursor_mode=true`
**Body (FormData):** `page_ids=<id1>,<id2>,...`

Tìm conversations theo tên/SĐT cross-page (1 request, tất cả pages).

### Mark Read/Unread (Public API v1)
```
POST pages.fm/api/public_api/v1/pages/<page_id>/conversations/<conv_id>/read?page_access_token=<PAT>
POST pages.fm/api/public_api/v1/pages/<page_id>/conversations/<conv_id>/unread?page_access_token=<PAT>
```

---

## 14. Customer ID System (Cross-page)

> **CRITICAL**: Cùng 1 người có `fb_id` KHÁC NHAU trên mỗi page.

### ID Types
| Field | Ý nghĩa | Ví dụ |
|-------|---------|-------|
| `fb_id` | Page-Scoped ID (khác mỗi page) | `25717004554573583` (Store), `24948162744877764` (House) |
| `id` (UUID) | Pancake internal customer ID | `a4396516-b395-478c-8d2a-83985356cb63` |
| `psid` | Page-Scoped ID (= fb_id cho INBOX) | `25717004554573583` |
| `global_id` | Facebook Global ID (cross-page, giống nhau) | `100001957832900` |

### Conversation/Message ID Format
| Type | Conv ID Format | Message ID Format |
|------|----------------|-------------------|
| INBOX | `<page_id>_<customer_fb_id>` | `m_<random_hash>` |
| COMMENT | `<post_id>_<comment_id>` | `<post_id>_<comment_id>` |

### Cross-page Customer Lookup Strategy
```
Strategy 0: DB Lookup Chain (chính xác 100%)
  ① fb_global_id_cache: (source_page, source_psid) → global_user_id
  ② customers table: phone → global_id (backup nếu ① miss)
  ③ fb_global_id_cache reverse: (global_user_id, target_page) → target_psid
  ④ Pancake API: /pages/{target}/customers/{target_psid}/conversations

Fallback: POST /conversations/search bằng tên (strip diacritics, exact match)
Last resort: /pages/{target}/customers/{source_psid}/conversations (chỉ work nếu cùng PSID)
```

---

## 15. Sub-object Schemas

### Tag
```json
{ "id": "number", "text": "string", "color": "string (hex)", "lighten_color": "string (rgba)" }
```

### QuickReply
```json
{
  "id": "UUID", "shortcut": "string", "type_id": "string",
  "messages": [{ "message": "string", "message_type": "string", "photos": [], "folders": [] }]
}
```

### Warehouse
```json
{
  "id": "UUID", "name": "string", "full_address": "string", "phone_number": "string",
  "province_id": "string", "district_id": "string", "allow_create_order": "boolean"
}
```

### PhoneNumber
```json
{ "phone_number": "string", "captured": "string", "m_id": "string", "offset": "number", "length": "number", "status": "number" }
```

### ReadWatermark
```json
{ "psid": "string", "message_id": "string", "watermark": "number (unix ts)", "is_group_conv": "boolean|null" }
```

### Attachment (Message)
```json
{ "type": "string", "url": "string", "preview_url": "string", "image_data": { "height": "number", "width": "number" } }
```

### Note (ghi chú khách hàng)
```json
{
  "id": "UUID", "message": "string", "order_id": "string|null",
  "images": [], "links": [], "edit_history": [], "removed_at": "null",
  "created_at": "number (unix ms)",
  "created_by": { "uid": "UUID", "fb_id": "string", "fb_name": "string" }
}
```

### TagHistory (v2 conversations)
```json
{
  "inserted_at": "string", "conversation_id": "string",
  "payload": { "action": "add|remove", "editor_id": "string", "editor_name": "string", "tag": "Tag" }
}
```

### AdClick (v2 conversations)
```json
{ "ad_id": "string", "inserted_at": "string", "post_id": "string" }
```

---

## 16. Error Codes
| Code | Ý nghĩa | Xử lý |
|------|---------|-------|
| 100 | Token không hợp lệ / Không thể cấm người quản lý | Regenerate token |
| 102 | Thiếu JWT cookie | Thêm cookie header |
| 103 | Phiên đăng nhập hết hạn | Re-login |
| 105 | Token đã được renew / Không có quyền trên trang | Regenerate và retry |
| 122 | Gói cước hết hạn (page-level) | Loại page khỏi request, retry |
| 126 | Tính năng không khả dụng trong chế độ an toàn | - |
| 429 | Rate limit | Chờ và retry |

### Referer Header
Một số endpoint (settings, conversations, messages) cần `Referer` header:
- Multi-page: `https://pancake.vn/multi_pages`
- Page cụ thể: `https://pancake.vn/<username>`

---

## 17. N2Store-specific Mapping

### Render DB ↔ Pancake Mapping

#### Bảng `customers` — link với Pancake
Auto-sync khi mở conversation qua `POST /api/v2/customers/sync-pancake`.
Match: `global_id → phone → fb_id`.

| Render DB | Pancake Source |
|-----------|---------------|
| `fb_id` | `customers[0].fb_id` (Page-scoped) |
| `global_id` | `messages.global_id` (Cross-page Real ID) |
| `name` | `customers[0].name` |
| `phone` | `conv_phone_numbers[0].phone_number` |
| `pancake_id` | `customers[0].id` (UUID) |
| `gender` | `customers[0].personal_info.gender` |
| `birthday` | `customers[0].personal_info.birthday` |
| `can_inbox` | `messages.can_inbox` |
| `pancake_data` | JSONB `{ ad_clicks, page_fb_ids: { pageId: fbId } }` |

#### Bảng `fb_global_id_cache` — PSID → Global ID
| Column | Type | Ý nghĩa |
|--------|------|---------|
| `page_id` | VARCHAR | Facebook Page ID |
| `psid` | VARCHAR | Page-Scoped ID |
| `global_user_id` | VARCHAR | Facebook Global ID (cross-page) |
| `customer_name` | VARCHAR | Tên khách |
| `send_success_count` | INTEGER | Gửi tin thành công |
| `send_fail_count` | INTEGER | 3 fail → auto-delete |

#### Bảng `pancake_accounts` — JWT accounts
Auto-sync qua `POST /api/pancake-accounts/sync`.

| Render DB | Pancake Source |
|-----------|---------------|
| `account_id` | JWT payload `uid` |
| `token` | JWT string |
| `token_exp` | JWT payload `exp` |
| `fb_id` | JWT payload `fb_id` |
| `pages` | JSONB từ `/pages` API |

#### Render DB Endpoints cho cross-page lookup
| Endpoint | Input | Output |
|----------|-------|--------|
| `GET /api/fb-global-id?pageId=X&psid=Y` | source page + psid | `global_user_id` |
| `GET /api/fb-global-id/by-global?globalUserId=X&pageId=Y` | global_id + target page | `psid` trên target page |
| `GET /api/v2/customers/by-phone/:phone` | SĐT | `global_id`, `pancake_data.page_fb_ids` |

---

## 18. Pages & Accounts hiện tại

### Pages
| Page ID | Tên | Platform | Username |
|---------|-----|----------|----------|
| `270136663390370` | NhiJudy Store | Facebook | NhiJudyStore |
| `117267091364524` | Nhi Judy House | Facebook | NhiJudyHouse.VietNam |
| `112678138086607` | Nhi Judy Ơi | Facebook | NhiJudyOi |
| `193642490509664` | NhiJudy Nè | Facebook | (subscription expired) |
| `324873917372219` | Sách Nói | Facebook | - |
| `igo_17841474211813256` | Nhi Judy | Instagram | - |

### Accounts
| Account | UID | FB ID |
|---------|-----|-------|
| Kỳ Thuật NJD | `c42ef91d-...` | `130759086650522` |
| Thu Huyền | `c2177f20-4b9f-4a38-b97a-7de087116034` | `113829328380970` |
| Thu Lai | - | - |
| Con Nhoc | - | - |
| Chloe Duongg | - | - |
| Huyền Nhi | - | - |

> Danh sách đầy đủ lưu trong Render DB bảng `pancake_accounts`.

### Instagram Notes
- ID bắt đầu bằng `igo_` → filter ra khỏi search/conversation queries
- Có `platform_extra_info.linked_fb_page` link tới FB page

---

## 19. Environment & Config Keys

| Key | Production | Dev |
|-----|-----------|-----|
| `FB_APP_ID` | `1733556690196497` | `1935017500085340` |
| `STRIPE_PK` | `pk_live_5kqPfdo3eNDbY13H5x68VxAN` | `pk_test_ecNA8r5ErJT8aMcHR8DlZyKr` |
| `THREADS_APP_ID` | `1147875670230988` | - |
| `IG_UNIFIED_ONBOARDING_CONFIG_ID` | `0x47cf42df67bae` | - |
| `FPT_PAGE` | `332042093538446` | `256469571178082` |
| `GOOGLE_MAP_API_KEY` | `AIzaSyBkeSHnerWPkqVM1-b5kk1xvtol7qAOi-A` | - |
| Chrome Extension ID | `oehooocookcnclgniepdgaiankfifmmn` | - |

### Supported Currencies
VND, USD, THB, PHP, INR, IDR, LAK, BRL, MXN

### Shipping Carriers (31)
GHN, GHTK, ViettelPost, VNPost, JT Express, NinjaVan, SPX, Ahamove, GrabExpress, FlashExpress, DHL, EMS, Snappy, SuperShip, 247Post, NTX, LWE, TIUI, VELOCES, URBANO, SERVIENTREGA, LionParcel, Best Express, ZTO, YTO, Hola, PFG, GHTC, LZL, VPX, BYA
