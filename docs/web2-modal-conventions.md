# Web 2.0 — Modal performance conventions

> **TL;DR**: dùng các class shared trong [`web2-shared/popup.js`](../web2-shared/popup.js). KHÔNG dùng `backdrop-filter: blur(…)` cho modal có nội dung scroll/tương tác nhiều. Cho mỗi card + scroll container dùng `transform: translateZ(0)` để promote thành GPU layer riêng.

## Bối cảnh

Khi modal "Tạo PBH hàng loạt" có 23 đơn (~280px scroll area), user gặp lag khi cuộn nội dung bên trong modal. Phân tích cho thấy nguyên nhân chính:

1. **`backdrop-filter: blur(4px)`** ở backdrop — browser recompute filter mỗi frame paint khi child content thay đổi (kể cả scroll nội bộ).
2. **Modal không có compositor layer riêng** — paint chung với background, nên mọi nội dung thay đổi trigger repaint cả block.
3. **`position: sticky` thead trong overflow container** — Sticky + nested overflow gây extra layout work.

Sau fix: avg frame **16.28ms** (~60fps), 0 slow frames.

## Class utility shared (auto-load mọi trang Web 2.0)

Định nghĩa trong [`web2-shared/popup.js`](../web2-shared/popup.js), inject vào `<head>` lúc script load:

| Class                                          | Mục đích                                                                                          |
| ---------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| `.w2p-overlay`                                 | Backdrop full-screen — solid rgba(15,23,42,0.65), `contain: layout style`, **KHÔNG** blur         |
| `.w2p-card`                                    | Modal card trắng — `transform: translateZ(0)` + `will-change: transform` (compositor layer riêng) |
| `.w2p-scroll-area`                             | Container có overflow scroll — `contain: layout paint` + `transform: translateZ(0)`               |
| `.w2p-form-grid`                               | Auto-responsive 2-col grid cho input form                                                         |
| `.w2p-input` / `.w2p-textarea` / `.w2p-select` | Form controls thống nhất                                                                          |

### Cách dùng

```html
<div class="w2p-overlay">
    <div class="w2p-card" style="max-width: 760px;">
        <header style="padding: 18px 20px; border-bottom: 1px solid #f1f5f9;">
            <strong>Tiêu đề modal</strong>
        </header>
        <div class="w2p-scroll-area" style="max-height: 280px;">
            <!-- 100 rows of heavy content here — scrolls smoothly -->
        </div>
        <div class="w2p-form-grid">
            <input class="w2p-input" type="text" />
            <select class="w2p-select">
                <option>...</option>
            </select>
        </div>
    </div>
</div>
```

## Quy tắc (DO + DON'T)

### ✅ DO

- **Solid rgba backdrop**: `rgba(15, 23, 42, 0.65)` đủ tối để focus, không cần blur
- **GPU layer cho mọi compose-heavy element**: `transform: translateZ(0)` hoặc `will-change: transform`
- **`contain: layout paint`** trên scroll container — scope repaint
- **Static thead** ngoài scroll area (table header + body riêng) nếu cần header cố định, thay vì `position: sticky`
- **`table-layout: fixed` + `<colgroup>`** khi cột phải align giữa header + body riêng
- **Lazy-render** rows lớn (>200): chỉ render rows trong viewport (virtual list)

### ❌ DON'T

- ❌ `backdrop-filter: blur(...)` cho modal có scroll/animation nội bộ
- ❌ `box-shadow` lớn + động (transition) trên element scroll → trigger repaint của shadow mỗi frame
- ❌ `position: sticky` thead inside `overflow: auto` container — gây layout thrash khi scroll
- ❌ Mutation rows nhiều lần (re-render toàn list mỗi keystroke) — debounce hoặc dùng key-diff
- ❌ Inline-styling shadow/border-radius lớn lên 100+ row giống nhau — dùng CSS class

## Workflow xây custom modal mới

1. Import sẵn (auto-load qua `tpos-sidebar.js`) → mọi page Web 2.0 đã có class
2. Skeleton:
    ```js
    const overlay = document.createElement('div');
    overlay.className = 'w2p-overlay';
    overlay.innerHTML = `
        <div class="w2p-card" style="max-width: 720px;">
            <header>...</header>
            <div class="w2p-scroll-area" style="max-height: 320px;">
                ${rowsHtml}
            </div>
            <footer>...</footer>
        </div>`;
    document.body.appendChild(overlay);
    ```
3. Listen `keydown` cho Escape + click overlay (ngoài card) để close
4. Cleanup khi đóng: `overlay.remove()` + `document.removeEventListener('keydown', ...)`
5. Nếu scroll list > 200 items → cân nhắc virtual scroll (chỉ render 30-50 row visible)

## References

- [`web2-shared/popup.js`](../web2-shared/popup.js) — source of truth
- [`native-orders/js/native-orders-app.js`](../native-orders/js/native-orders-app.js) → `bulkCreatePbh` + `openCustomFormPopup` — reference implementation
- MDN: [CSS Containment](https://developer.mozilla.org/en-US/docs/Web/CSS/CSS_containment)
- MDN: [will-change](https://developer.mozilla.org/en-US/docs/Web/CSS/will-change)
