<!-- #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | WEB2.0 — blueprint rebuild CSS live-chat trên shared native-orders. -->

# Live-chat CSS Rebuild Blueprint (trên nền SHARED native-orders)

> Nguồn: workflow phân tích 5-agent (2026-06-13). Mục tiêu user: "xóa & làm lại
> toàn bộ CSS live-chat" dùng shared design native-orders. Làm THEO TỪNG BƯỚC
> có verify — KHÔNG xóa mù làm vỡ trang.

## Nền SHARED đã có (web2/shared/) — live-chat phải dùng

`web2-base.css` (tokens `--web2-*` #0068ff + layout/tab/filter/data-table/button) ·
`web2-components.css` (`.web2-*` label/btn/cell/count-pill) · `web2-theme.css` (overlay
normalize `.btn`/`.modal`/`.tab`/`.badge`) · `web2-effects.css` (anim/hover/glow/shimmer) ·
`web2-motion.js` (Motion) · `web2-sidebar.css`. Light, anti-lag.

## ⚠ OFF-LIMITS

Chat pane (cả 2 trang) = **SHARED Web2ChatPanel `.w2cp-*`** (web2-chat-panel.css). KHÔNG đụng.
`pancake-chat-window.js` chỉ là wrapper mount `Web2ChatPanel.mount(host,{mode:'full'})`.
KHÔNG còn JS nào emit `.pk-message*`/`.pk-bubble`/`.pk-chat-input*`/`.pk-chat-messages` → dead.

## Disposition từng file (live-chat/css/)

| File                            | Dòng | Disposition    | Ghi chú                                                                                                                                                                                                                                                                 |
| ------------------------------- | ---- | -------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| live-chat.css                   | 1754 | ✅ **ĐÃ XÓA**  | zero ref, không link đâu                                                                                                                                                                                                                                                |
| modern.css                      | 644  | ✅ **ĐÃ XÓA**  | zero ref, duplicate                                                                                                                                                                                                                                                     |
| chat-motion.css                 | 200  | delete         | 2/11 class dùng → fold 2 keyframe vào web2-effects; link ở cả 2 trang                                                                                                                                                                                                   |
| pancake/pancake-chat-window.css | 480  | delete         | 67% dead, chat-window cũ; CẨN THẬN `.pk-chat-window` container có thể còn dùng làm mount target                                                                                                                                                                         |
| pancake-redesign-tokens.css     | 208  | retoken→shared | `--pkr-*` (164 usages) → alias `var(--web2-*)`. **ĐÃ fix: index.html nay load file này** (trước thiếu → --pkr undefined)                                                                                                                                                |
| pancake-chat.css                | 2761 | **rebuild**    | 103/167 `.pk-` chết (chat pane cũ dòng ~663-2253). GIỮ: conversation-list, filter/header/tabs, search, page-selector, tags-menu, context-menu, modal `.pk-modal-*`, shell. XÓA: `.pk-message*`/`.pk-chat-*`/`.pk-bubble` + section đợt 1-8 cruft. Retoken --pkr→--web2. |
| layout.css                      | 345  | rebuild        | giữ shell 2-cột; bỏ resize-manager/settings-manager/placeholder dead (JS không còn load)                                                                                                                                                                                |
| components.css                  | 413  | adopt-shared   | primitives duplicate shared (bị web2-theme override) — bỏ dần                                                                                                                                                                                                           |
| variables.css                   | 74   | adopt-shared   | token cũ KHÔNG phải --web2 — thay bằng shared                                                                                                                                                                                                                           |
| inventory-panel.css             | 857  | **keep**       | Kho SP `.inv-*` 94% sống; retoken --pkr→--web2                                                                                                                                                                                                                          |
| live-comments.css               | 638  | **keep**       | core Live Comment (index.html); retoken                                                                                                                                                                                                                                 |
| live-livestream-gallery.css     | 318  | **keep**       | `.live-lsimg-*` sống; map màu →--web2                                                                                                                                                                                                                                   |

## Class surface BẮT BUỘC style (rebuild không được làm mất)

- **Shell:** web2-shell/aside/theme, main-content, top-bar(+left/right/divider), btn-icon, server-mode-indicator, live-status-indicator/status-dot/status-text, dual-column-section/container, column-wrapper/content/header/title, #liveColumn #khoSpColumn(.collapsed) #pancakeColumn, html.lc-mobile
- **List `.pk-*`:** pancake-chat-container, pk-conversations(-layout/-list), pk-conversation-item(.active/.is-unread)/-content/-header/-name/-sub/-meta/-time/-preview, pk-avatar(-placeholder), pk-ch-badge(.inbox/.comment/.phone), pk-page-badge, pk-debt-badge, pk-tag-badge, pk-unread-pill, pk-search-header/-box/-wrapper, pk-filter-tabs/-tab, pk-header-tabs/-tab/-icon-btn, pk-page-_ (selector), pk-socket-_, pk-tags-menu/-tag-dot, pk-context-menu\*, pk-mode-switch/-content/pk-mobile-back, pk-tab-content(-container), pk-chat-window (mount shell), pk-empty-state, pk-loading(-spinner), pk-clear-search-btn, pk-remove-web2-btn, pk-load-more-indicator
- **Inventory `.inv-*`:** panel/tabs/tab/search/stats/list/card(.oos)/-imgwrap/-img/-body/-code/-name/-variant/-meta/-price/-stock/-add, cart-_, hist-_, toast-\*, drop-hover
- **Live Comment:** live-comments, live-conversation-list/-item(.is-hidden), live-conv-\*, avatar-img/-placeholder, channel-badge, customer-name
- **Livestream:** live-lsimg-_, snap-_/live-snap-\*
- **Modals:** lcm-_ (live-chat-modal mount Web2ChatPanel), lhc-_, loh-_, pk-modal-_

## Lộ trình rebuild (các bước còn lại)

1. ✅ Xóa dead unlinked (live-chat.css, modern.css). Fix index --pkr.
2. Retoken: `pancake-redesign-tokens.css` → alias `--pkr-* : var(--web2-*)` (giữ blue scale local) → live-chat palette = shared native-orders. Hoặc retoken trực tiếp pancake-chat/inventory.
3. Trim `pancake-chat.css`: xóa block chat-pane cũ (`.pk-message*`/`.pk-chat-*`/`.pk-bubble`, ~663-2253) + cruft đợt 1-8. Verify list/filter/modal còn nguyên class.
4. Xóa `chat-motion.css` + `pancake-chat-window.css` + gỡ link (sau khi confirm `.pk-chat-window` container được pancake-chat.css/inline lo).
5. Trim `layout.css` dead. Cân nhắc bỏ `components.css`/`variables.css` (dùng shared).
6. Verify mỗi bước: smoke chat.html (list + mở hội thoại + Kho SP) + index.html (live comments + gallery). KHÔNG vỡ class surface ở trên.
