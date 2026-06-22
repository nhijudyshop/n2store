# Modal Anti-Lag Playbook — Web 2.0

> **Khi nào đọc**: BẮT BUỘC trước khi code modal mới hoặc fix modal đang lag.
> **TL;DR**: Shared CSS [`web2/shared/web2-theme.css`](../../web2/shared/web2-theme.css) đã có Tier 1 fixes global. Code modal mới chỉ cần đặt đúng class (`modal-content` + `modal-body`) là auto inherit. Đọc tiếp nếu modal có > 100 rows hoặc vẫn lag.

---

## 1. Nguyên nhân modal lag (theo độ phổ biến)

1. **Layout thrashing** — JS read/write layout properties (offsetHeight, scrollTop) xen kẽ → forced sync reflow 60×/s.
2. **Scroll handlers non-passive** — `scroll/wheel/touchmove` không có `{passive:true}` → block compositor.
3. **DOM modal quá lớn** — render hết content kể cả ngoài viewport → reflow cost cao mỗi frame.
4. **backdrop-filter blur** — kill GPU trên mobile/Mac retina.
5. **box-shadow lớn** — repaint vùng rộng mỗi animation step.
6. **position: fixed body** trên iOS Safari → jank khi scroll content.

---

## 2. Tier 1 Fixes — Đã apply global (không cần làm gì thêm)

Shared CSS đã có sẵn cho mọi modal Web 2.0:

```css
/* Trong web2/shared/web2-theme.css */

.web2-theme .modal-body,
.web2-theme .modal-content {
    contain: layout style paint; /* cô lập reflow + repaint scope */
}

.web2-theme .modal-body,
.web2-theme .modal-scroll {
    overscroll-behavior: contain; /* chặn scroll chaining ra body */
    -webkit-overflow-scrolling: touch; /* smooth touch iOS */
    scrollbar-gutter: stable; /* tránh layout shift khi scrollbar xuất hiện */
}

.web2-theme .modal .cv-row,
.web2-theme .modal .modal-row {
    content-visibility: auto; /* skip render khi ngoài viewport — 7x faster */
    contain-intrinsic-size: 0 64px; /* placeholder height, tránh CLS */
}

.web2-theme .modal-content {
    will-change: transform, opacity;
    transition:
        transform 0.18s,
        opacity 0.18s; /* compositor-only */
}
```

**Điều kiện**: page phải `<body class="web2-theme">` hoặc wrap nội dung trong `.web2-theme`. Đa số page Web 2.0 đã có.

---

## 3. Checklist khi code modal mới

```html
<!-- ✅ ĐÚNG -->
<div class="modal" id="myModal">
    <div class="modal-overlay" data-close></div>
    <div class="modal-content">
        <div class="modal-header">
            <h3>Tiêu đề</h3>
            <button class="modal-close">×</button>
        </div>
        <div class="modal-body">
            <!-- Content dài? Mỗi row thêm class modal-row hoặc cv-auto -->
            <div class="modal-row">Row 1</div>
            <div class="modal-row">Row 2</div>
            <!-- ... -->
        </div>
    </div>
</div>
```

- [ ] Dùng class `modal-content` + `modal-body` (auto inherit Tier 1)
- [ ] Row dài → class `modal-row` hoặc `cv-auto`
- [ ] KHÔNG dùng `backdrop-filter: blur()`
- [ ] KHÔNG dùng `box-shadow` lớn hơn `0 8px 24px rgba(0,0,0,0.12)` trên modal-content
- [ ] Animation chỉ trên `transform` + `opacity` (compositor)
- [ ] Scroll handler trong JS: `{passive: true}`
- [ ] > 100 rows → virtualize (xem Section 4)

---

## 4. Khi cần virtualize (modal > 100 rows)

Pattern dùng IntersectionObserver + content-visibility (vanilla, ~0 deps):

```js
// Quan sát mỗi row, set content-visibility theo viewport
function setupRowVirtualization(modalBody) {
    const rows = modalBody.querySelectorAll('.modal-row');
    const io = new IntersectionObserver(
        (entries) => {
            entries.forEach((entry) => {
                entry.target.style.contentVisibility = entry.isIntersecting ? 'visible' : 'auto';
            });
        },
        { root: modalBody, rootMargin: '200px' } // buffer 200px above/below
    );
    rows.forEach((row) => io.observe(row));
    return () => io.disconnect(); // cleanup khi modal close
}
```

**Nếu vẫn lag với > 1000 rows** → dùng [TanStack Virtual](https://tanstack.com/virtual/latest) (vanilla JS adapter, ~10KB):

```html
<script src="https://cdn.jsdelivr.net/npm/@tanstack/virtual-core@3.x/dist/index.global.js"></script>
```

---

## 5. JS patterns BẮT BUỘC nhớ

### 5.1 Passive scroll listeners

```js
// ✅ ĐÚNG
modalBody.addEventListener('scroll', onScroll, { passive: true });
modalBody.addEventListener('wheel', onWheel, { passive: true });
modalBody.addEventListener('touchmove', onTouchMove, { passive: true });

// ❌ SAI (block compositor)
modalBody.addEventListener('scroll', onScroll);
```

> Lý do: nếu handler có khả năng `preventDefault()`, browser phải đợi handler chạy xong mới scroll → block compositor thread → jank.

### 5.2 Body scroll lock (iOS-safe pattern)

```js
let _savedScrollY = 0;

function lockBodyScroll() {
    _savedScrollY = window.scrollY;
    document.body.style.cssText = `
        position: fixed;
        top: -${_savedScrollY}px;
        left: 0;
        right: 0;
        width: 100%;
        overflow: hidden;
    `;
}

function unlockBodyScroll() {
    document.body.style.cssText = '';
    window.scrollTo(0, _savedScrollY);
}

// Mở modal
function openModal(id) {
    lockBodyScroll();
    document.getElementById(id).classList.add('show');
}

// Đóng modal
function closeModal(id) {
    document.getElementById(id).classList.remove('show');
    setTimeout(unlockBodyScroll, 180); // sau khi animation xong
}
```

> Lý do dùng `position: fixed` thay vì chỉ `overflow: hidden`: iOS Safari bỏ qua `overflow:hidden` trên body, vẫn cho scroll bằng touch.

### 5.3 Avoid layout thrashing trong modal

```js
// ❌ SAI — read/write xen kẽ → forced reflow mỗi vòng lặp
items.forEach((item) => {
    item.style.height = '50px'; // write
    const h = item.offsetHeight; // read → forced reflow!
    item.dataset.h = h; // write
});

// ✅ ĐÚNG — batch read trước, batch write sau
const heights = items.map((item) => item.offsetHeight); // read all
items.forEach((item, i) => {
    // write all
    item.style.height = '50px';
    item.dataset.h = heights[i];
});
```

### 5.4 Debounce/throttle expensive callbacks

```js
// Search trong modal — debounce 200ms
let searchTimer;
input.addEventListener('input', (e) => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => doSearch(e.target.value), 200);
});

// Resize observer — throttle bằng requestAnimationFrame
let rafId;
const ro = new ResizeObserver(() => {
    if (rafId) return;
    rafId = requestAnimationFrame(() => {
        rafId = null;
        recomputeLayout();
    });
});
```

---

## 6. Khi nào bỏ modal, dùng alternative

| Symptom                                                              | Alternative                                                                 |
| -------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| Content dài, người dùng muốn scroll xem tham khảo bên ngoài cùng lúc | **Side drawer / panel** (slide từ phải)                                     |
| Workflow nhiều step, cần share URL, back button hoạt động            | **Routed page** (URL riêng)                                                 |
| List item có chi tiết, click row thấy expand                         | **Inline expand row** (accordion)                                           |
| Mobile UX (touch)                                                    | **Bottom sheet** (slide từ dưới)                                            |
| Modal đơn giản (confirm, alert)                                      | Native `<dialog>` element — browser tự handle top-layer, escape, focus trap |

### Native `<dialog>` example (nhẹ nhất)

```html
<dialog id="confirmDialog" class="web2-theme">
    <div class="modal-content">
        <div class="modal-body">
            <p>Xác nhận xóa?</p>
        </div>
        <div class="modal-footer">
            <button onclick="confirmDialog.close('cancel')">Hủy</button>
            <button onclick="confirmDialog.close('ok')">OK</button>
        </div>
    </div>
</dialog>

<script>
    const dialog = document.getElementById('confirmDialog');
    dialog.showModal(); // auto top-layer, auto escape close, auto body-scroll-lock

    dialog.addEventListener('close', () => {
        if (dialog.returnValue === 'ok') doDelete();
    });
</script>
```

> Native `<dialog>` ăn đứt custom modal về performance vì browser tự lift lên top layer (skip toàn bộ stacking context recalculation).

---

## 7. Đo và verify performance

### Chrome DevTools Performance tab

1. Mở DevTools → Performance tab → Record
2. Mở modal + scroll
3. Stop record
4. Check **Frames**: phải đa số xanh (60fps). Vàng/đỏ = jank.
5. Check **Bottom-Up**: nếu "Recalculate Style" hoặc "Layout" > 5ms/frame → layout thrashing.

### Console one-liner check passive listeners

```js
// Paste vào console khi modal đang mở
getEventListeners(document.querySelector('.modal-body'));
// Xem `scroll`, `wheel`, `touchmove` → field `passive` phải = true
```

---

## 8. References

- [content-visibility — web.dev](https://web.dev/articles/content-visibility) — defer offscreen render 7x
- [CSS Containment — MDN](https://developer.mozilla.org/en-US/docs/Web/CSS/CSS_containment/Using_CSS_containment) — cách ly reflow scope
- [Passive event listeners — Chrome](https://developer.chrome.com/docs/lighthouse/best-practices/uses-passive-event-listeners)
- [Locking body scroll on iOS — Jay Freestone](https://www.jayfreestone.com/writing/locking-body-scroll-ios/)
- [Layout Thrashing — webperf.tips](https://webperf.tips/tip/layout-thrashing/)
- [Popover API vs Dialog API — CSS-Tricks](https://css-tricks.com/popover-api-or-dialog-api-which-to-choose/)
- [TanStack Virtual](https://tanstack.com/virtual/latest) — virtualization library framework-agnostic
