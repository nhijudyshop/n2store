# N2Store Inbox Chat — UI Redesign Brief for Stitch AI

> **Purpose:** This document is a complete functional specification of the N2Store Inbox Chat page. It is intended as input for Stitch AI (Google) to redesign the interface.
> **Scope:** Structure, components, data, UX, and interactions only. **Do not include any color, typography, theme, or visual style guidance** — those decisions are left to the designer.

---

## 1. Product Goal

A unified, real-time customer messaging workspace for an e-commerce shop on Facebook (Messenger inbox + post comments + livestream comments), built on top of the Pancake API. The page must let one operator:

1. Triage hundreds of conversations across multiple Facebook Pages and multiple Pancake accounts.
2. Reply to messages and comments (publicly or privately) from a single input.
3. Tag/group conversations for workflow status (new → processing → done).
4. Create an order directly from a conversation without leaving the page.
5. Handle livestream comment surges with dedicated filters and bulk actions.
6. Stay synchronized in real time across devices via WebSocket.

---

## 2. High-Level Layout

A **three-column desktop workspace**, all columns independently scrollable, with draggable column resizers. Right column is collapsible.

```
┌────────────────┬──────────────────────────────┬──────────────────┐
│  COLUMN 1      │  COLUMN 2                    │  COLUMN 3        │
│  Conversation  │  Active Chat                 │  Context Panel   │
│  List          │  (header + messages + input) │  (tabs)          │
└────────────────┴──────────────────────────────┴──────────────────┘
```

Mobile/responsive behavior should stack columns and allow navigation between them (list → chat → context).

---

## 3. COLUMN 1 — Conversation List

### 3.1 Header
- Title: **Inbox**
- Action icon buttons:
  - Render DB sync
  - Pancake Settings (opens modal)
  - Refresh

### 3.2 Search
- Single text input — placeholder "Search customer…"
- Debounced (300ms) hybrid search:
  - Instant local filter (name + phone, diacritics-insensitive)
  - Server search merged into the list

### 3.3 Page Selector
- Multi-select dropdown listing all connected Facebook Pages
- Each row: page name + unread count badge
- "All Pages" option as default
- Empty selection = all pages

### 3.4 Filter Tabs (status)
Four mutually-exclusive tabs:
1. **All**
2. **Unread** (default)
3. **Livestream**
4. **Inbox My** (custom assignment)

### 3.5 Type Filter (message kind)
Three buttons (multi-select):
- All
- Messages (INBOX)
- Comments (COMMENT)

### 3.6 Livestream Sub-controls
Visible only when **Livestream** tab is active:
- Post selector dropdown (post name + conversation count)
- Button: "Fetch post names"
- Button: "Clear livestream for this post"

### 3.7 Conversation List Items
Infinite-scroll list. Each row contains:
- Avatar (or placeholder)
- Customer name
- Last-message snippet (one line, truncated)
- Relative timestamp ("5m", "2h", "Yesterday", "Jan 15")
- Unread count badge
- Type icon (message vs comment)
- Active/selected highlight state
- Indicator if customer sent the last message

---

## 4. COLUMN 2 — Active Chat

### 4.1 Chat Header
- Customer avatar + name + status line
- Optional header note
- WebSocket status indicator (connected / disconnected)
- Buttons:
  - Mark as unread
  - Toggle livestream flag
  - Toggle right panel

### 4.2 Customer Stats Bar
A horizontal strip below the header:
- Phone number(s) — clickable, copy-to-clipboard
- Comment count
- Successful orders count
- Failed orders count
- Return rate %

### 4.3 Post Info Banner
Shown only for comment/livestream conversations:
- Post thumbnail
- Post title
- "View on Facebook" link

### 4.4 Messages Area
Scrollable, lazy-loads older messages on upward scroll.

**Empty state** when no conversation is selected.

**Floating "scroll to bottom" button** appears when scrolled up.

**Message bubble** elements:
- Avatar of sender
- Sender label (customer / staff / page)
- Message text
- Timestamp (Vietnam timezone)
- Attachments — must support: image, image grid, video, audio, file with download, sticker, quoted/replied message
- Reaction summary chips (emoji + count)
- Status indicators: read receipt (✓✓), "Deleted", "Hidden", "Private reply"
- Type badge (Inbox vs Comment)
- Hover-revealed action toolbar:
  - For comments: Like/Unlike, Reply, React, Hide/Unhide, Delete
  - For all: Copy text

### 4.5 Reaction Picker (popover)
Floating popover anchored to a message — six emoji buttons: 👍 ❤️ 😆 😮 😢 😠.

### 4.6 Label / Group Assignment Bar
- Inline strip below messages, above input
- Label: "Tags:"
- One toggleable button per available group
- Draggable resize handle to expand/collapse
- "Done" group is exclusive (auto-clears other groups)

### 4.7 Quick Reply Bar
- Up to two horizontal rows of quick-reply shortcut buttons
- Click inserts the template into the input

### 4.8 Reply Preview Bar
Appears when replying to a specific message:
- Visual quote indicator
- Original sender name + message text
- Cancel (×) button

### 4.9 Composer / Input Area

**Top of composer (conditional):**
- **Send-from page selector** — when conversation spans multiple pages
- **Reply-type selector** — for COMMENT conversations: "Public Comment" vs "Private Message"

**Input toolbar buttons:**
- Quick reply templates
- Attach image (file picker, image types)
- Attach file (file picker, any type)
- Emoji picker
- Send

**Image preview row** — shows pasted/selected image with × to remove.

**Textarea** — auto-expanding, multi-line, placeholder "Type a message…".

**Send button** — submit.

### 4.10 Emoji Picker (popover above composer)
- Seven category tabs: Recent, Smileys, Gestures, Hearts, Animals, Food, Objects
- Searchable emoji grid
- Insert at cursor

---

## 5. COLUMN 3 — Context Panel

Three top-level tabs:

### 5.1 Tab "Groups" (default)
- **Notes section** — list of conversation notes + input to add a note
- **Group cards** — one card per group:
  - Group name
  - Color indicator (style chosen by designer)
  - Conversation count
  - "Manage Groups" gear icon
  - Card is clickable to filter the list by that group

### 5.2 Tab "Activities"
- Customer's related Facebook posts/activities
- Each activity item: thumbnail, title, video icon if applicable, link

### 5.3 Tab "Order" (permission-gated)
A complete order-creation form, auto-filled from the conversation.

**Customer Info section**
- Name (auto-filled, editable)
- Phone (auto-filled, editable)
- Address (with Goong Places autocomplete)

**Products section**
- Dynamic rows, each with: product name, variant, quantity, unit price, remove button
- "Add Product" button

**Shipping & Payment section**
- Shipping fee
- Discount
- Payment method dropdown: COD / Transfer / Partial Deposit
- Deposit amount (visible only when Partial Deposit selected)
- Order notes (textarea)

**Order Summary (read-only)**
- Subtotal
- Shipping fee
- Discount
- **Total** (emphasized)

**Actions**
- Reset form
- Create Order

---

## 6. Modals & Overlays

### 6.1 Pancake Settings Modal
- Connected accounts list (each with remove button)
- "Add Account" form: JWT token textarea + validation message + helper instructions; buttons: "Get from Cookie", "Debug", "Add Token"
- Page Access Tokens list
- "Add Page Token" form: page selector + token textarea + helper; buttons: "Auto-create", "Save Token"
- Footer: Close, Clear All

### 6.2 Manage Groups Modal
- List of editable group rows:
  - Color picker (popover with palette)
  - Name input
  - Note textarea
  - Delete (×)
- "+ Add group"
- Footer: Close, Save Changes

### 6.3 Quick Reply Manager Modal
- Template list with edit/delete
- Add/Edit template sub-modal:
  - Shortcut key
  - Topic / category
  - Color
  - Template text
  - Save / Cancel
- Inline autocomplete dropdown when user types `/` in the composer

### 6.4 Color Picker Popover
- Small palette of preset colors for group color selection.

### 6.5 Toast Notification Container
- Stackable toasts, auto-dismiss
- Variants: info, success, warning, error

---

## 7. Core User Flows

### 7.1 Send a Message
1. Select conversation
2. Type in composer (optionally attach image/file, paste image, pick emoji)
3. Press Enter or click Send
4. Message appears immediately (optimistic UI)
5. On success: conversation marked read, list snippet updates
6. On failure: automatic fallback chain (alternate API method → alternate page → alternate account); show error toast only if all fail

### 7.2 Reply to a Specific Message (comments)
1. Hover message → click Reply
2. Reply preview bar appears
3. Type and send → message sent as threaded reply
4. Cancel via × on the preview bar

### 7.3 React to a Message
1. Hover message → click React
2. Reaction picker opens
3. Select emoji → reaction sent and shown on the message

### 7.4 Hide / Delete a Comment
- Hover comment → eye-off icon hides; trash icon deletes
- Visual state: "Hidden" / "Deleted"

### 7.5 Filter Conversations
- Status tab + Type buttons + Page selector + Group card click + Search — all stack additively

### 7.6 Tag a Conversation
- Click any group button in the label bar to toggle assignment
- "Done" auto-removes the others
- State syncs to server in real time

### 7.7 Manage Groups
- Open Manage Groups modal → add / rename / recolor / delete → Save

### 7.8 Switch Conversation
- Click an item in the list → header, stats, post banner, messages, label bar, activities, and order form all update

### 7.9 Mark Read / Unread
- Auto-mark read on open
- Manual mark unread via header button

### 7.10 Copy Message
- Hover → Copy → toast confirms

### 7.11 Attach Image / File
- Toolbar button or paste → preview appears → send → uploaded with the message

### 7.12 Livestream Workflow
- Switch to Livestream tab → choose post → see only that post's conversations
- Bulk: mark all conversations from a customer as livestream
- Bulk: clear all livestream conversations for a post

### 7.13 Quick Reply
- Click templates button → modal; or type `/` in composer → autocomplete suggestions
- Pick template → text inserted, editable before send

### 7.14 Create Order from Conversation
- Open Order tab → form auto-filled → add products → fill shipping/payment → Create Order

### 7.15 Search
- Type in search input → instant local filter + debounced server search merged into the list

### 7.16 Pagination
- Conversation list: infinite scroll downward
- Messages: lazy-load older messages when scrolling up; preserve scroll position

---

## 8. Real-Time & Sync Behaviors

- **WebSocket** connection to a Pancake proxy. Receives:
  - `update_conversation` — list item updates
  - `new_message` — append to messages and update list
  - `post_type_detected` — auto-mark conversation as livestream
- **Status indicator** in chat header reflects WS state.
- **Polling fallback**: if WebSocket fails, refresh every 30s.
- **Optimistic UI** for all user actions (send, react, tag, mark read).
- **Cross-device sync** for groups, labels, livestream flag, pending customers.

---

## 9. Data Each Component Must Display

### Conversation list item
`avatar, name, lastSnippet, relativeTime, unreadCount, typeIcon, customerLastFlag`

### Conversation (internal, drives filtering)
`id, psid, pageId, customerId, unread, time, phone[], labels[], isLivestream, livestreamPostId, isCustomerLast`

### Chat header
`name, avatar, statusText, headerNote, wsStatus`

### Customer stats bar
`phone[], commentCount, successOrders, failedOrders, returnRate`

### Message
`id, text, sender, time, attachments[], reactions[], reactionSummary{}, isOutgoing, isHidden, isRemoved, isPrivateReply, readReceipt`

### Attachment types
`photo | video | audio | file | sticker | quote`

### Post banner
`postId, title, thumbnail, url`

### Activity item
`id, title, thumbnail, url, type`

### Group
`id, name, color, count, note`

### Order form
`customer{name, phone, address}, products[{name, variant, qty, price}], shippingFee, discount, paymentMethod, depositAmount, notes, summary{subtotal, shipping, discount, total}`

---

## 10. Permissions

UI elements respect a permission system. Elements may be hidden based on:
- `inbox:settings` — Pancake Settings, token management
- `inbox:manage_labels` — Manage Groups modal
- `inbox:create_order` — Order tab in context panel
- Comment moderation — Hide / Delete actions

The redesigned UI must accommodate elements that may or may not be present per user.

---

## 11. Keyboard & Input

- **Enter** — send message
- **Shift+Enter** — newline
- **`/`** in composer — open quick-reply autocomplete
- **Esc** — close active modal/popover
- **Click outside** — close dropdowns/popovers
- **Tab** — standard focus traversal
- Image paste in composer must be supported

---

## 12. Responsive Requirements

- Desktop: three-column layout with draggable resizers
- Tablet: collapsible right panel; left + center visible
- Mobile: single-column navigation (List → Chat → Context); back navigation between views; composer pinned to bottom; modals full-screen

---

## 13. Empty States Required

- No conversation selected (chat area)
- No conversations match current filters (list)
- No messages in conversation
- No activities for customer
- No products added to order
- No groups defined
- WebSocket disconnected (warning state in header)

---

## 14. Loading & Error States Required

- Conversation list initial load + "load more" spinner
- Messages loading older history
- Sending message (optimistic + spinner if slow)
- Order submission in progress
- Toasts for success/warning/error on every async action

---

## 15. Out of Scope for the Designer

- Color palette
- Typography
- Iconography style
- Spacing system
- Motion / animation specifics
- Brand identity

These will be defined separately. Stitch should focus on **layout, hierarchy, component composition, information density, and interaction patterns**.

---

## 16. Deliverables Requested from Stitch

1. Desktop layout (3 columns) — default view
2. Desktop layout — context panel collapsed
3. Tablet layout
4. Mobile layouts: list view, chat view, context view
5. All modals (Pancake Settings, Manage Groups, Quick Reply Manager)
6. All popovers (Reaction picker, Emoji picker, Color picker, Page selector)
7. Empty states
8. Loading states
9. Composer states: idle, with attachment preview, with reply preview, with quick-reply autocomplete open
10. Message bubble variants: text, image, image grid, video, file, audio, sticker, quoted reply, deleted, hidden, private reply, with reactions
