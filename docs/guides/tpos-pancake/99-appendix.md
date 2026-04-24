# Appendix — Reference đầy đủ

Bảng tra cứu nhanh khi đang code theo guide. Mọi thứ đều cross-reference với file thật trong repo.

## A. Design tokens (từ `variables.css`)

| Nhóm | Tên | Giá trị | Dùng ở đâu |
|---|---|---|---|
| Brand | `--primary` | `#6366f1` | Nút primary, focus ring, TPOS hover border |
| Brand | `--primary-dark` | `#4f46e5` | Primary button hover |
| Brand | `--secondary` | `#8b5cf6` | (reserved) |
| Brand | `--success` | `#10b981` | Status OK, TPOS order badge icon |
| Brand | `--danger` | `#ef4444` | SSE dot, debt badge, unread Pancake |
| Brand | `--warning` | `#f59e0b` | Pancake logo, warning |
| Brand | `--info` | `#3b82f6` | Campaign "Hôm nay" button, TPOS order BG |
| Gray | `--gray-50..900` | `#f9fafb..#111827` | Background, border, text scale |
| Column | `--tpos-color` | `#3b82f6` | (reserved cho accent TPOS) |
| Column | `--pancake-color` | `#f59e0b` | Pancake logo icon |
| Shadow | `--shadow-sm..xl` | Tailwind-ish | Modal, floating panel, action row |
| Space | `--spacing-xs..xl` | `0.25rem..2rem` | Padding/gap thống nhất |
| Radius | `--radius-sm..full` | `0.25rem..9999px` | Corners |
| Motion | `--transition-fast/normal/slow` | 150/200/300ms | Hover, state change |
| Font | `--font-sans` | Inter, system-ui | Body |
| Font | `--font-display` | Manrope | Topbar title |
| Size | `--topbar-height` | `48px` | Topbar height + settings panel offset |

Native-web order badge **không** dùng CSS variable — inline:
- BG `#ede9fe`, text `#6d28d9`, icon color `#7c3aed`.

TPOS order badge (khác native):
- BG `#dbeafe`, text `#1d4ed8`, icon color `#10b981`.

## B. TposState shape (real fields)

```javascript
{
    // Selection
    selectedTeamId, selectedPage, selectedPages, selectedCampaign, selectedCampaignIds,

    // Data loaded from TPOS
    crmTeams,           // [{Id, Name, Childs: [{Facebook_PageId, Facebook_TypeId, ...}]}]
    allPages,           // flattened list with {...page, teamId, teamName}
    liveCampaigns,      // [{Id, Facebook_UserId, Facebook_LiveId, Facebook_UserName, ...}]

    // Comment stream
    comments,           // [{ id, from: {id,name,picture}, message, created_time, _pageObj, _campaignId }]
    nextPageUrl,
    hasMore,
    isLoading,

    // Realtime
    _sseConnections: Map,   // sseKey `pageId_postId` → EventSource
    _sseRetryState: Map,    // sseKey → { attempts }
    sseConnected,

    // Caches
    sessionIndexMap: Map,   // fbUserId → { index, code, source?, session? }
    partnerCache: SharedCache,
    partnerFetchPromises: Map,

    // Settings
    showDebt, showZeroDebt,
    savedToTposIds: Set,

    // Context
    containerId,

    // URL
    proxyBaseUrl, workerUrl,
}
```

### sessionIndexMap entry shape

```javascript
// TPOS order (hydrated from loadSessionIndex)
{ index: 285, code: "260404240", session: "..." }

// NATIVE-WEB order (created via NativeOrdersApi or hydrated via list())
{ index: 1, code: "NW-20260424-0001", source: "NATIVE_WEB" }
```

Merge rule: `loadSessionIndex()` **skip** entries có `source === 'NATIVE_WEB'` để không ghi đè.

## C. PancakeState shape

```javascript
{
    // Conversations
    conversations, activeConversation, messages,

    // Pages
    pages,                  // [{id, name, avatar, settings: {page_access_token}}]
    pagesWithUnread,        // [{page_id, unread_conv_count}]
    selectedPageId, pageIds,

    // Pagination
    hasMoreConversations, isLoadingMoreConversations, lastConversationId,
    hasMoreMessages, isLoadingMoreMessages,

    // Search + filter
    searchQuery, searchResults, isSearching,
    activeFilter,           // 'all' | 'inbox' | 'comment' | 'tpos-saved'
    tposSavedIds: Set,

    // UI
    isLoading, isPageDropdownOpen, isScrolledToBottom,

    // Realtime
    typingIndicators: Map, isSocketConnected, isSocketConnecting, socketReconnectAttempts,

    // Settings
    serverMode,             // 'pancake' | 'n2store'
    showDebt, showZeroDebt,

    // URLs
    proxyBaseUrl,

    // Static
    quickReplies,
}
```

## D. TposApi method → URL

| Method | HTTP + URL (qua CF Worker proxy) |
|---|---|
| `loadCRMTeams()` | `GET /facebook/crm-teams` |
| `loadLiveCampaigns(pageId)` | `GET /facebook/live-campaigns?top=20` |
| `loadLiveCampaignsFromAllPages()` | `GET /facebook/live-campaigns?top=50` |
| `loadComments(pageId, postId, after?)` | `GET /facebook/comments?pageid=…&postId=…&limit=50&after=…` |
| `loadSessionIndex(postId)` | `GET /facebook/comment-orders?postId=…` → `{value:[{asuid, orders:[{index,session,code}]}]}` |
| `hideComment(pageId, commentId, hide)` | `POST /api/rest/v2.0/facebook-graph/comment/hide` body `{pageid, commentId, is_hidden}` |
| `replyToComment(pageId, commentId, message)` | `POST /api/rest/v2.0/facebook-graph/comment/reply` body `{pageid, commentId, message}` |
| `getPartnerInfo(crmTeamId, fbUserId)` | `GET /api/rest/v2.0/chatomni/info/{crmTeamId}_{fbUserId}` (path-based) |
| `confirmOrder(orderId)` | `POST /api/odata/SaleOnline_Order/ODataService.ActionConfirm` |
| `cancelOrder(orderId)` | `POST /api/odata/SaleOnline_Order/ODataService.ActionCancel` |
| `getLatestOrder(fbUserId)` | `GET /api/odata/SaleOnline_Order/ODataService.GetViewV2?$filter=Facebook_ASUserId eq '…'&$top=1&$orderby=DateCreated desc` |

**Đã gỡ**: `createOrderFromComment`. Xem [NativeOrdersApi](#e-nativeordersapi) thay thế.

Auth: mọi call dùng `tposTokenManager.authenticatedFetch()` — tự gắn `Authorization: Bearer <access_token>` và retry 401.

## E. NativeOrdersApi

Backend: [render.com/routes/native-orders.js](../../../render.com/routes/native-orders.js). Proxy qua CF Worker: pattern `NATIVE_ORDERS` trong [cloudflare-worker/modules/config/routes.js](../../../cloudflare-worker/modules/config/routes.js).

| Method | HTTP + URL | Body | Response |
|---|---|---|---|
| `createFromComment(p)` | `POST /api/native-orders/from-comment` | `{fbUserId, fbUserName?, fbPageId?, fbPostId?, fbCommentId?, crmTeamId?, message?, phone?, address?, note?, createdBy?, createdByName?}` | `{success, order: {code, sessionIndex, source, ...}, idempotent?}` |
| `getByUser(fbUserId)` | `GET /api/native-orders/by-user/:id` | — | `{success, order}` |
| `list({status?, search?, fbPostId?, page=1, limit=200})` | `GET /api/native-orders/load?…` | — | `{success, orders, total, page, limit, hasMore}` |
| `update(code, fields)` | `PATCH /api/native-orders/:code` | `{customerName?, phone?, address?, note?, products?, status?, tags?, ...}` | `{success, order}` |
| `remove(code)` | `DELETE /api/native-orders/:code` | — | `{success}` |
| `health` | `GET /api/native-orders/health` | — | `{ok, count}` |

**Không cần token** (public endpoint). Idempotency: unique index trên `fb_comment_id` → POST 2 lần cùng commentId trả lại order cũ + `idempotent: true`.

**Code format**: `NW-YYYYMMDD-NNNN` (timezone VN, UTC+7). Sequence reset theo ngày.

## F. PancakeAPI

Base: `WORKER_URL/api/pancake/*` (không chính thức) và `WORKER_URL/api/pancake-official-v2/*` (qua access_token).

| Method | HTTP + URL |
|---|---|
| `fetchPages(forceRefresh?)` | `GET /api/pancake/pages?access_token=<jwt>` |
| `fetchPagesWithUnreadCount()` | `GET /api/pancake/pages/unread_conv_pages_count?access_token=<jwt>` |
| `fetchConversations(pageId?, refresh?)` | `GET /api/pancake/conversations?page_id=…&limit=20&after=…` |
| `fetchMessages(pageId, convId, after?)` | `GET /api/pancake/conversations/:convId/messages?limit=50` |
| `sendMessage(pageId, convId, text, attachments)` | `POST /api/pancake/conversations/:convId/messages` |
| `markAsRead(pageId, convId)` | `POST /api/pancake/conversations/:convId/mark-read` |
| `markAsUnread(pageId, convId)` | `POST /api/pancake/conversations/:convId/mark-unread` |
| `loadTposSavedIds()` | `GET /api/tpos-saved/ids` |

**Auth**: `Authorization: Bearer <JWT>` + query `access_token=<JWT>` (tùy route).

## G. Event bus

| Event | Payload | Emitter → Listener(s) |
|---|---|---|
| `tpos:crmTeamChanged` | pageId / "all" / "team:page" | TposCommentList → TposColumnManager |
| `tpos:campaignsChanged` | `[campaignIds]` | TposCommentList → TposColumnManager |
| `tpos:refreshRequested` | — | Button → TposColumnManager |
| `tpos:loadMoreRequested` | — | scroll → TposColumnManager |
| `tpos:newComment` | `{ comment, pageName }` | TposRealtime (SSE) → TposColumnManager |
| `tpos:commentSelected` | `{ userId, comment }` | TposCommentList click → AppInit → PancakeConversationList.highlightByUserId |
| `tpos:orderCreated` | `{ code, fromId }` | TposCommentList.createOrder → AppInit |
| `pancake:pageChanged` | `{ pageId }` | PancakePageSelector → PancakeColumnManager |
| `pancake:conversationSelected` | `{ convId, pageId }` | PancakeConversationList → PancakeChatWindow |
| `pancake:messageSent` | `{ convId, message }` | PancakeChatWindow | — |
| `pancake:newMessage` | Phoenix payload | PancakeRealtime WS → PancakeChatWindow |
| `pancake:conversationUpdate` | Phoenix payload | PancakeRealtime WS → PancakeConversationList |
| `debt:updated` | `{ phones }` | sharedDebtManager.loadBatch → AppInit → both columns |
| `layout:columnSwapped` | `{ order }` | ColumnManager | — |
| `layout:refresh` | — | ColumnManager.refreshColumns | both columns |

## H. LocalStorage keys

| Key | Owner | Value |
|---|---|---|
| `tpos_pancake_column_order` | ColumnManager | JSON `["tpos","pancake"]` hoặc đổi |
| `tpos_selected_page` | TposState | `"teamId:pageId"` hoặc `"all"` |
| `tpos_selected_campaigns` | TposState | JSON array campaign IDs |
| `tpos_show_debt` | SettingsManager | `"true"`/`"false"` |
| `tpos_show_zero_debt` | SettingsManager | `"true"`/`"false"` |
| `bearer_token_data_1` | TokenManager (TPOS) | JSON `{access_token, refresh_token, expires_at}` |
| `pancake_server_mode` | SettingsManager | `"pancake"`/`"n2store"` |
| `pancake_jwt_token` | pancakeTokenManager | JWT string |
| `pancake_jwt_token_expiry` | pancakeTokenManager | epoch ms |
| `tpos_pancake_active_account_id` | pancakeTokenManager | account UUID |
| `pancake_page_access_tokens` | pancakeTokenManager | JSON `{pageId: {token, pageName}}` |
| `pancake_selected_page_id` | PancakePageSelector | string |

## I. Firestore schema

| Collection | Document ID | Fields |
|---|---|---|
| `pancake_accounts` | `{accountId}` (uid hoặc UUID) | `{id, email, fb_name, jwt_token, expiry, added_at}` |
| `pancake_page_tokens` | auto | `{pageId, token, pageName}` |
| `tokens` | `tpos_token_{companyId}` | `{access_token, refresh_token, expires_at, issued_at}` — legacy backup, app ưu tiên localStorage |

## J. Backend endpoints dùng trong trang

Tất cả qua CF Worker proxy `chatomni-proxy.nhijudyshop.workers.dev`:

- `/facebook/crm-teams` → TPOS chatomni API (pages list)
- `/facebook/live-campaigns` → TPOS live campaigns
- `/facebook/comments` → TPOS comments (lazy list)
- `/facebook/comments/stream` → TPOS SSE (live comments)
- `/facebook/comment-orders?postId=…` → TPOS comment-order map cho sessionIndex hydrate
- `/api/odata/SaleOnline_Order/…` → TPOS OData (ở trang này chỉ **read-only**: GetView, GetViewV2, ActionConfirm, ActionCancel — KHÔNG còn POST-create)
- `/api/rest/v2.0/chatomni/info/{crmTeamId}_{fbUserId}` → TPOS partner info
- `/api/rest/v2.0/facebook-graph/comment/{hide,reply}` → FB Graph write (hide/reply)
- `/api/token` → TPOS OAuth token (password grant, có cache)
- `/api/tpos-credentials?username=…&company_id=…` → lookup credentials per-user
- `/api/rest/v2.0/facebook-graph/comment/hide|reply` → FB Graph write
- `/api/native-orders/*` → **Render PostgreSQL** (đơn của chúng ta)
- `/api/pancake/*` → Pancake unofficial/official API proxy
- `/api/pancake-page-tokens/generate` → generate `page_access_token`
- `/api/tpos-saved/ids` → TPOS "đã lưu" list
- `/api/v2/wallets/batch-summary` → công nợ batch
- `wss://n2store-realtime.onrender.com/socket` → Pancake WS fallback

## K. File size cap

Hook project chặn Write/Edit file > 800 dòng. Khi file phình to, split theo responsibility:

- `tpos-comment-list.js` nếu > 800 dòng → tách `tpos-comment-list-render.js` + `tpos-comment-list-actions.js`.
- `pancake-chat-window.js` → tách `pancake-chat-messages.js`, `pancake-chat-input.js`.

## L. Icons đã dùng (Lucide 0.294)

`shopping-cart`, `layout-grid`, `sliders`, `settings`, `columns`, `refresh-cw`, `x`, `chevron-down`, `facebook`, `message-square`, `message-circle`, `loader-2`, `save`, `user`, `reply`, `eye`, `eye-off`, `package-open`, `package-check`, `phone`, `trash-2`, `plus`, `minus`, `search`, `check`, `alert-circle`, `inbox`.

Nhớ `lucide.createIcons()` **sau mọi lần** innerHTML có `<i data-lucide="...">`.

## M. Các file không cần dựng lại

| File | Tại sao |
|---|---|
| `js/tpos-chat.js`, `js/pancake-chat.js` | Legacy class cũ — không còn wire trong index.html. |
| `js/realtime-manager.js` | Đã split thành `tpos-realtime.js` + `pancake-realtime.js`. |
| `js/pancake-data-manager.js` | Đã split thành `pancake-api.js`. |
| `js/pancake-token-manager.js` (root) | Đã move vào `js/pancake/pancake-token-manager.js`. |
| `js/tpos-token-manager.js` (root) | Đã move vào `js/tpos/tpos-token-manager.js`. |
| `js/debug-realtime.js` | Dev-only debugging helper. |
| `css/modern.css` | Duplicate của `variables.css + layout.css`. |
| `css/tpos-chat.css`, `css/pancake-chat.css` | Legacy base styles, vẫn load để không vỡ class cũ nhưng không cần sửa. |

Chỉ dựng lại các file có trong cây ở [README.md](README.md#cây-thư-mục-cuối-cùng).
