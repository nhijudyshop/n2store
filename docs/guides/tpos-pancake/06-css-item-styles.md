# CSS chi tiết cho conversation cards (TPOS + Pancake)

Bổ sung cho [01-html-css-shell.md](01-html-css-shell.md). Paste vào các file CSS tương ứng để card hiển thị pixel-close với bản gốc.

## `css/tpos/tpos-comments.css`

```css
/* ==================== WRAPPER ==================== */
.tpos-chat-wrapper {
    display: flex;
    flex-direction: column;
    height: 100%;
    background: #f8f9fb;
}

.tpos-conversation-list {
    flex: 1;
    overflow-y: auto;
    padding: 8px 12px;
    display: flex;
    flex-direction: column;
    gap: 6px;
}

.tpos-empty {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    color: var(--gray-500);
    font-size: 13px;
    gap: 8px;
    padding: 40px;
}
.tpos-empty i { width: 40px; height: 40px; color: var(--gray-300); }

.tpos-load-more {
    padding: 12px;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    color: var(--gray-500);
    font-size: 12px;
}

/* ==================== FILTER SELECT ==================== */
.tpos-filter-select {
    padding: 6px 10px;
    border: 1px solid var(--gray-200);
    border-radius: 8px;
    font-size: 12px;
    font-weight: 500;
    color: var(--gray-700);
    background: white;
    cursor: pointer;
    min-width: 0;
    max-width: 200px;
}
.tpos-filter-select:focus {
    outline: none;
    border-color: var(--primary);
    box-shadow: 0 0 0 2px rgba(99, 102, 241, 0.1);
}
.tpos-filter-select:disabled {
    background: var(--gray-50);
    color: var(--gray-400);
    cursor: not-allowed;
}

/* ==================== STATUS INDICATOR (LIVE dot) ==================== */
.tpos-status-indicator {
    display: flex;
    align-items: center;
    gap: 5px;
    padding: 3px 10px;
    border-radius: 20px;
    font-size: 10px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    background: var(--gray-100);
    color: var(--gray-600);
}
.tpos-status-indicator .status-dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: var(--gray-400);
}
.tpos-status-indicator .status-dot.connected {
    background: var(--danger);
    animation: pulse-dot 1.5s infinite;
}
@keyframes pulse-dot {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.4; }
}

/* ==================== CONVERSATION CARD ==================== */
.tpos-conversation-item {
    background: white;
    padding: 10px 12px;
    border-radius: 10px;
    border: 1px solid #eef0f4;
    transition: all 0.15s;
    cursor: pointer;
    position: relative;
}
.tpos-conversation-item:hover {
    border-color: var(--primary);
    box-shadow: 0 2px 8px rgba(99, 102, 241, 0.08);
}
.tpos-conversation-item:hover .tpos-conv-actions { opacity: 1; }
.tpos-conversation-item.selected {
    border-color: var(--primary);
    background: #f6f7ff;
}
.tpos-conversation-item.highlight {
    animation: highlight-flash 2s ease-out;
}
@keyframes highlight-flash {
    0%   { background: #dcfce7; border-color: #86efac; }
    100% { background: white; border-color: #eef0f4; }
}

/* ==================== ROW 1 ==================== */
.tpos-conv-row1 { display: flex; align-items: center; gap: 8px; }

.tpos-conv-avatar { position: relative; flex-shrink: 0; }
.tpos-conv-avatar .avatar-img,
.tpos-conv-avatar .avatar-placeholder {
    width: 36px;
    height: 36px;
    border-radius: 50%;
    object-fit: cover;
}
.tpos-conv-avatar .avatar-placeholder {
    display: flex;
    align-items: center;
    justify-content: center;
    color: white;
    font-weight: 700;
    font-size: 14px;
}

.session-index-badge {
    position: absolute;
    top: -4px; left: -4px;
    min-width: 18px; height: 18px;
    padding: 0 4px;
    border-radius: 9px;
    background: #10b981;
    color: white;
    font-size: 9px;
    font-weight: 700;
    border: 2px solid white;
    display: flex; align-items: center; justify-content: center;
}

.channel-badge {
    position: absolute;
    bottom: -2px; right: -2px;
    width: 14px; height: 14px;
    background: #1877f2; /* Facebook */
    border-radius: 50%;
    display: flex; align-items: center; justify-content: center;
    border: 2px solid white;
}
.channel-badge i { width: 7px; height: 7px; color: white; }

.tpos-conv-header-info { flex: 1; min-width: 0; }
.tpos-conv-header { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
.customer-name {
    font-weight: 700;
    font-size: 13px;
    color: var(--gray-900);
    cursor: pointer;
    max-width: 140px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
}
.customer-name:hover { color: var(--primary); }

.tpos-tag {
    display: inline-flex;
    align-items: center;
    font-size: 10px;
    padding: 1px 5px;
    border-radius: 3px;
    font-weight: 600;
}

.order-code-badge {
    font-size: 10px;
    padding: 1px 5px;
    border-radius: 3px;
    font-weight: 600;
    cursor: pointer;
}
/* (TPOS variant: BG #dbeafe, color #1d4ed8 — inline on the element) */
/* (NATIVE_WEB variant: BG #ede9fe, color #6d28d9 — inline on the element) */

.tpos-status-badge {
    display: inline-flex;
    align-items: center;
    font-size: 10px;
    font-weight: 700;
    padding: 2px 7px;
    border-radius: 4px;
    cursor: pointer;
    white-space: nowrap;
}
.tpos-status-badge:hover { filter: brightness(0.95); }

.tpos-status-dropdown {
    position: absolute;
    top: calc(100% + 2px);
    right: 0;
    background: white;
    border: 1px solid var(--border);
    border-radius: 6px;
    box-shadow: var(--shadow-md);
    z-index: 50;
    min-width: 120px;
    max-height: 220px;
    overflow-y: auto;
}

.tpos-conv-time { font-size: 11px; color: var(--gray-500); flex-shrink: 0; }

/* ==================== ROW 2 — message ==================== */
.tpos-conv-message {
    margin-top: 6px;
    color: #1e293b;
    font-size: 13px;
    line-height: 1.4;
    padding: 7px 10px;
    background: #f8f9fb;
    border-radius: 8px;
    border-left: 3px solid var(--primary);
}

/* ==================== ROW 3 — contact info ==================== */
.tpos-conv-info {
    display: flex;
    align-items: center;
    gap: 4px;
    margin-top: 6px;
    flex-wrap: wrap;
    font-size: 11px;
    color: var(--gray-500);
}
.tpos-conv-info input {
    padding: 3px 6px;
    border: 1px solid transparent;
    border-radius: 4px;
    background: #f8f9fb;
    font-size: 11px;
    color: var(--gray-700);
    min-width: 0;
    outline: none;
    transition: all 0.15s;
}
.tpos-conv-info input:hover { border-color: var(--gray-200); background: white; }
.tpos-conv-info input:focus {
    border-color: var(--primary);
    background: white;
    box-shadow: 0 0 0 2px rgba(99, 102, 241, 0.08);
}

.debt-badge {
    padding: 1px 6px;
    background: #fef2f2;
    color: #dc2626;
    border-radius: 4px;
    font-size: 10px;
    font-weight: 700;
    white-space: nowrap;
}

/* ==================== ACTIONS (hover reveal) ==================== */
.tpos-conv-actions {
    position: absolute;
    top: 8px;
    right: 8px;
    display: flex;
    gap: 2px;
    align-items: center;
    opacity: 0;
    transition: opacity 0.15s;
    background: white;
    border-radius: 6px;
    padding: 2px;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
}
.tpos-action-btn {
    width: 26px; height: 26px;
    border: none;
    background: transparent;
    color: var(--gray-400);
    border-radius: 5px;
    display: flex; align-items: center; justify-content: center;
    cursor: pointer;
    transition: all 0.12s;
}
.tpos-action-btn:hover {
    background: var(--primary);
    color: white;
}
.tpos-action-btn:disabled { opacity: 0.5; cursor: not-allowed; }
```

---

## `css/pancake/pancake-chat-window.css`

```css
/* ==================== SIDEBAR ==================== */
.pk-sidebar {
    width: 340px;
    flex-shrink: 0;
    display: flex;
    flex-direction: column;
    border-right: 1px solid var(--gray-100);
    background: white;
}

.pk-search-input {
    width: 100%;
    padding: 8px 12px;
    border: 1px solid var(--gray-200);
    border-radius: 10px;
    font-size: 13px;
    background: var(--gray-50);
    transition: all 0.15s;
    outline: none;
}
.pk-search-input:focus {
    border-color: var(--primary);
    background: white;
}

.pk-filter-tabs {
    display: flex;
    border-bottom: 1px solid var(--gray-100);
    padding: 0 16px;
}
.pk-filter-tab {
    padding: 10px 16px;
    font-size: 12px;
    font-weight: 600;
    color: var(--gray-500);
    cursor: pointer;
    border-bottom: 2px solid transparent;
    transition: all 0.15s;
    white-space: nowrap;
}
.pk-filter-tab.active {
    color: var(--primary);
    border-bottom-color: var(--primary);
}

.pk-conversations {
    flex: 1;
    overflow-y: auto;
}

/* ==================== CONVERSATION ITEM ==================== */
.pk-conversation-item {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 12px 16px;
    cursor: pointer;
    transition: background 0.1s;
    border-bottom: 1px solid var(--gray-50);
}
.pk-conversation-item:hover { background: var(--gray-50); }
.pk-conversation-item.active {
    background: #f0f7ff;
    border-left: 3px solid var(--primary);
    padding-left: 13px;
}

.pk-avatar { position: relative; flex-shrink: 0; }

.pk-conv-unread-badge {
    position: absolute;
    top: -2px; right: -2px;
    min-width: 18px; height: 18px;
    padding: 0 4px;
    border-radius: 9px;
    background: #ef4444;
    color: white;
    font-size: 10px;
    font-weight: 700;
    display: flex; align-items: center; justify-content: center;
    border: 2px solid white;
}

.pk-conv-name {
    font-weight: 600;
    font-size: 13px;
    color: var(--gray-900);
}
.pk-conv-snippet {
    font-size: 12px;
    color: var(--gray-500);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    margin-top: 2px;
}
.pk-conv-snippet.unread { color: var(--gray-900); font-weight: 600; }

/* ==================== CHAT WINDOW ==================== */
.pk-chat-window {
    flex: 1;
    display: flex;
    flex-direction: column;
    min-width: 0;
}
.pk-chat-header {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 12px 20px;
    border-bottom: 1px solid var(--gray-100);
    background: rgba(255, 255, 255, 0.9);
    backdrop-filter: blur(12px);
    flex-shrink: 0;
}

/* Messages */
.pk-message { display: flex; margin: 2px 0; }
.pk-message.outgoing { justify-content: flex-end; }
.pk-message.incoming { justify-content: flex-start; }

.pk-message-bubble {
    max-width: 70%;
    padding: 10px 14px;
    border-radius: 16px;
    font-size: 13px;
    line-height: 1.4;
    word-break: break-word;
}
.pk-message.incoming .pk-message-bubble {
    background: var(--gray-100);
    color: var(--gray-800);
    border-top-left-radius: 4px;
}
.pk-message.outgoing .pk-message-bubble {
    background: var(--primary);
    color: white;
    border-top-right-radius: 4px;
    box-shadow: 0 2px 8px rgba(99, 102, 241, 0.25);
}

/* Input area */
.pk-message-input-area {
    padding: 12px 16px;
    background: white;
    border-top: 1px solid var(--gray-100);
    flex-shrink: 0;
}
.pk-input-wrapper {
    display: flex;
    align-items: center;
    gap: 4px;
    background: var(--gray-50);
    border-radius: 16px;
    padding: 4px 8px;
    transition: all 0.15s;
}
.pk-input-wrapper:focus-within {
    background: white;
    box-shadow: 0 0 0 2px rgba(99, 102, 241, 0.1);
}
.pk-message-input {
    flex: 1;
    border: none;
    outline: none;
    background: transparent;
    padding: 6px 8px;
    font-size: 13px;
}
```

---

## `css/pancake-chat.css` (legacy base — giữ lại cho backward compat)

Không cần sửa; chỉ cần giữ file tồn tại (có thể để trống) để các class `pk-*` không vỡ khi thiếu.

## `css/tpos-chat.css` (legacy base — giữ lại)

Tương tự — file placeholder.
