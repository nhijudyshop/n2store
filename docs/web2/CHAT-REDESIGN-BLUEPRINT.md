<!-- #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | WEB2.0 — blueprint redesign giao diện live-chat Chat Pancake + Kho SP. -->

# Blueprint Redesign — live-chat/chat.html (Chat Pancake + Kho SP)

> **Chốt hướng (2026-06-13): Phương án C — "Zalo Bento Commerce"** = chat kiểu Soft Depth (blue-scale Zalo + soft-shadow nhẹ + nền slate-tinted, bo mềm tăng dần) + **Kho SP nổi bật dạng bento** (ảnh SP lớn 3:4 portrait grid 2-col khi panel rộng ≥360px, tự đổi LIST khi cột hẹp; giá + tồn kho như "thẻ giá"; card depth rõ shadow-md).
>
> **Scope cứng**: CHỈ thay lớp VISUAL (HTML shell + CSS + render template). GIỮ NGUYÊN tầng data/logic vừa rebuild: `Web2Chat`, SSE realtime (`PancakeRealtime` → `web2:messages`), `Web2ChatPanel` (adapter), `PancakeState`, `PancakeAPI`, native HTML5 DnD (drag SP → live-comment rows). Mọi `id`/class JS-hook (`pk-*`, `w2cp-*`, `inv-*`, `data-conv-id`, `data-filter`, `data-mode`, `data-product`) GIỮ — chỉ đổi CSS + thêm class trang trí.

## Design tokens (file mới `live-chat/css/pancake-redesign-tokens.css`, load TRƯỚC pancake-chat.css)

⚠ **Namespace IMPLEMENT = `--pkr-*`** (KHÔNG phải `--pk-*` như block dưới). Lý do: pancake-chat.css CŨ đã chiếm `--pk-*` (vd `--pk-primary:#00a884` xanh lá WhatsApp) → đổi sang `--pkr-*` để tránh collision. `--pkr-primary` anchor THẲNG `#0068ff` (xanh Zalo, user chốt), KHÔNG alias `--web2-primary` (trang này = teal). Block CSS dưới minh hoạ giá trị — khi đọc code thực tế là `--pkr-*`.

```css
:root {
    --pk-blue-50: #eef5ff;
    --pk-blue-100: #d9e8ff;
    --pk-blue-200: #bcd6ff;
    --pk-blue-300: #8fbaff;
    --pk-blue-400: #5996ff;
    --pk-blue-500: #0068ff;
    --pk-blue-600: #0058db;
    --pk-blue-700: #0047b3;
    --pk-blue-800: #073a8c;
    --pk-blue-900: #0a316e;
    --pk-primary: var(--web2-primary, #0068ff);
    --pk-primary-hover: var(--pk-blue-600);
    --pk-primary-active: var(--pk-blue-700);
    --pk-primary-soft: var(--pk-blue-50);
    --pk-on-primary: #fff;
    --pk-accent-500: #06b6d4;
    --pk-accent-600: #0891b2;
    --pk-success-50: #ecfdf3;
    --pk-success-500: #12b76a;
    --pk-success-600: #039855;
    --pk-warning-50: #fffaeb;
    --pk-warning-500: #f79009;
    --pk-warning-600: #dc6803;
    --pk-error-50: #fef3f2;
    --pk-error-500: #f04438;
    --pk-error-600: #d92d20;
    --pk-online: #31a24c;
    --pk-gray-25: #fcfcfd;
    --pk-gray-50: #f8fafc;
    --pk-gray-100: #f1f4f9;
    --pk-gray-200: #e6eaf0;
    --pk-gray-300: #d2d9e3;
    --pk-gray-400: #98a4b5;
    --pk-gray-500: #667085;
    --pk-gray-700: #344054;
    --pk-gray-800: #1d2939;
    --pk-gray-900: #101828;
    --pk-bg: #f8fafc;
    --pk-surface: #fff;
    --pk-surface-sunken: #f1f4f9;
    --pk-surface-hover: #f1f4f9;
    --pk-border: #e6eaf0;
    --pk-border-strong: #d2d9e3;
    --pk-divider: #eef1f6;
    --pk-text: #1d2939;
    --pk-text-strong: #101828;
    --pk-text-secondary: #667085;
    --pk-text-muted: #98a4b5;
    --pk-bubble-out-bg: var(--pk-primary);
    --pk-bubble-out-text: #fff;
    --pk-bubble-in-bg: #f1f4f9;
    --pk-bubble-in-text: #1d2939;
    --pk-font: 'Be Vietnam Pro', 'Inter', system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif;
    --pk-text-h1: 1.5rem;
    --pk-text-h2: 1.25rem;
    --pk-text-h3: 1.0625rem;
    --pk-text-body-lg: 1rem;
    --pk-text-body: 0.9375rem;
    --pk-text-bubble: 0.97rem;
    --pk-text-label: 0.875rem;
    --pk-text-caption: 0.78rem;
    --pk-text-overline: 0.6875rem;
    --pk-fw-regular: 400;
    --pk-fw-medium: 500;
    --pk-fw-semibold: 600;
    --pk-fw-bold: 700;
    --pk-lh-tight: 1.25;
    --pk-lh-snug: 1.4;
    --pk-lh-normal: 1.5;
    --pk-sp-1: 4px;
    --pk-sp-2: 8px;
    --pk-sp-3: 12px;
    --pk-sp-4: 16px;
    --pk-sp-5: 20px;
    --pk-sp-6: 24px;
    --pk-sp-8: 32px;
    --pk-r-xs: 6px;
    --pk-r-sm: 8px;
    --pk-r-md: 10px;
    --pk-r-lg: 14px;
    --pk-r-xl: 18px;
    --pk-r-2xl: 22px;
    --pk-r-full: 9999px;
    --pk-bubble-tail: 6px;
    --pk-shadow-xs: 0 1px 2px rgba(16, 24, 40, 0.05);
    --pk-shadow-sm: 0 1px 2px rgba(16, 24, 40, 0.06), 0 1px 3px rgba(16, 24, 40, 0.1);
    --pk-shadow-md: 0 2px 4px rgba(16, 24, 40, 0.06), 0 4px 8px rgba(16, 24, 40, 0.08);
    --pk-shadow-lg: 0 4px 8px rgba(16, 24, 40, 0.05), 0 8px 16px rgba(16, 24, 40, 0.1);
    --pk-shadow-xl: 0 8px 16px rgba(16, 24, 40, 0.06), 0 12px 24px rgba(16, 24, 40, 0.12);
    --pk-ring-primary: 0 0 0 3px rgba(0, 104, 255, 0.18);
    --pk-ring-error: 0 0 0 3px rgba(240, 68, 56, 0.18);
    --pk-dur-instant: 100ms;
    --pk-dur-fast: 150ms;
    --pk-dur-base: 220ms;
    --pk-dur-slow: 300ms;
    --pk-ease-emphasized: cubic-bezier(0.2, 0, 0, 1);
    --pk-ease-decel: cubic-bezier(0.05, 0.7, 0.1, 1);
    --pk-ease-accel: cubic-bezier(0.3, 0, 0.8, 0.15);
    --pk-ease-standard: cubic-bezier(0.2, 0, 0, 1);
    --pk-ease-spring: cubic-bezier(0.34, 1.56, 0.64, 1);
    --pk-z-sticky: 100;
    --pk-z-dropdown: 400;
    --pk-z-drag: 600;
    --pk-z-overlay: 900;
    --pk-z-sheet: 1000;
    --pk-z-toast: 1200;
    --pk-list-w: clamp(300px, 28vw, 360px);
    --pk-row-h: 68px;
    --pk-avatar: 48px;
    --pk-bubble-maxw: min(75%, 560px);
    --pk-gap-group: 10px;
    --pk-gap-same: 2px;
    --pk-composer-maxh: 120px;
    --pk-app-h: 100dvh;
    --pk-kb: 0px;
    --pk-safe-b: env(safe-area-inset-bottom);
}
[data-theme='dark'] {
    --pk-bg: #0b1220;
    --pk-surface: #131c2e;
    --pk-surface-sunken: #0e1626;
    --pk-surface-hover: #1b2740;
    --pk-border: #243049;
    --pk-border-strong: #324063;
    --pk-text: #e6ebf4;
    --pk-text-strong: #f5f8fd;
    --pk-text-secondary: #95a3bd;
    --pk-text-muted: #5e6e8c;
    --pk-primary: #4d94ff;
    --pk-primary-soft: #16243f;
    --pk-bubble-in-bg: #1a2438;
    --pk-bubble-in-text: #e6ebf4;
    --pk-bubble-out-bg: #2f7bff;
}
```

## Breakpoints

- **≤767px** phone: single-pane swap (list↔chat full-screen `data-view`), Kho SP = bottom-sheet (peek/half/full, `translateY`), composer dính bàn phím (visualViewport → `--pk-kb`), tap-to-add thay drag.
- **768–1023px** tablet: split list ~320px + chat; Kho SP off-canvas phải.
- **1024–1439px**: list ~340 + chat + Kho SP ~340 (bento grid 2-col), drag bật (`pointer:fine`).
- **≥1440px**: list ~360 + chat rộng + Kho SP cố định bento.

## Build plan (đợt) — map file

- **Đợt 0** TẠO: `live-chat/css/pancake-redesign-tokens.css` (tokens), `live-chat/css/chat-motion.css` (keyframes + reduced-motion), `live-chat/js/pancake/pancake-mobile-shell.js` (--app-height/visualViewport/single-pane swap/swipe-back/sheet snap). Link vào `chat.html` (token TRƯỚC pancake-chat.css).
- **Đợt 1** Conversation list (rủi ro thấp): `pancake-chat.css` override `.pk-conversation-item/.pk-filter-tab/.pk-search-box/.pk-page-badge/.pk-unread-badge` + `pancake-conversation-list.js` thêm class trang trí (`is-unread`, online dot) — GIỮ logic + inline onclick sanitize.
- **Đợt 2** Shell + header + sticky filter/search: `pancake-init.js` `_renderShell` (thêm class wrapper, sticky; GIỮ id/data-tab/data-filter) + `pancake-chat.css`. ⚠ shell re-render khi reconnect/live → giữ cấu trúc id.
- **Đợt 4** Kho SP BENTO (điểm nhấn C): `inventory-panel.css` (grid 2-col ảnh 3:4 khi rộng / list khi hẹp + density toggle, stock tiers màu, thẻ giá, nút `.inv-card-add`, OOS grayscale) + `inventory-panel.js` (thêm nút `+` tap-to-add gọi cùng hàm add; feature-detect pointer; stock tier class). Drag native GIỮ NGUYÊN — chỉ thêm tap-to-add song song; nút có `pointer-events` riêng không chặn dragstart.
- **Đợt 5** Mode-switcher segmented pill (thumb trượt, giữ `data-mode`/`applyMode`/observer `.pk-mode-switch`) + mobile shell (bottom-sheet Kho SP ≤767px).
- **Đợt 3** (LÀM CUỐI, rủi ro CAO — SHARED) Chat window/bubble/composer: `web2/shared/chat-panel/web2-chat-panel.css` + `.js` render (thêm class `tail`/`mid`/`same-group`, composer pill, FAB, quick-reply chips). ⚠ SHARED native-orders+balance-history → dùng **fallback token** `var(--pk-bubble-out-bg, var(--web2-primary,#0068ff))`, KHÔNG đổi tên class JS-hook, **test 3 trang** sau đổi.

## Animation (file `chat-motion.css`, compositor-friendly transform/opacity)

must-have: message-in (incoming slide-up+fade / outgoing spring pop), stagger ≤6×35ms, send-button press scale(.9), skeleton shimmer translateX, new-conv slideIn (class `.pk-conv-updated`), FAB show/hide + badge bump, mode-switch thumb + crossfade, mobile list↔chat slideX, bottom-sheet translateY, drag ghost/drop-hover. nice: typing dots, unread pulse, sticker pop.
`@media (prefers-reduced-motion:reduce)` reset tất cả về 0.001ms + transform none.
TRÁNH: animate box-shadow/backdrop-filter blur/width/height/top/left/margin; will-change cố định; shadow blur >24px.

## Verify mỗi đợt

Browser session LUÔN `--ext n2store-extension` + mở `web2/overview` trước → nav `live-chat/chat.html` → eval state + screenshot 320/768/1440. Thứ tự: đợt 0→1→2→4→5→3 (shared cuối, test 3 trang). Cache-bust HTML `?v=`.

## Ràng buộc đã verify từ code

1. `web2-chat-panel.*` SHARED (native-orders/balance-history) → fallback token + test 3 trang.
2. `_renderShell` + mode-switcher re-render khi Pancake reconnect/live → MutationObserver re-wrap bằng class `.pk-mode-switch` → giữ class.
3. Drag-to-cart = native HTML5 DnD drop vào **live-comment rows** (không phải conversation rows) — giữ nguyên, thêm tap-to-add song song.
4. Inline `onclick` trong render đã sanitize id (`replace(/[^\w.:-]/g,'')`) — giữ khi đổi markup.
