# Web 2.0 — Hiệu ứng (effects) catalogue

> Bảng tra cứu hiệu ứng UI/animation cho toàn bộ Web 2.0.
> Đọc trước khi animate gì — tránh add lib mới khi đã có sẵn.

## Tổng quan

Web 2.0 dùng **2 file shared** cho hiệu ứng — đều thuộc `web2/shared/`:

| File                           | Vai trò                                                                                              | Size  |
| ------------------------------ | ---------------------------------------------------------------------------------------------------- | ----- |
| `web2/shared/web2-effects.js`  | JS API (`window.Web2Effects.*`) wrap Web Animations API + lazy-load `canvas-confetti` từ CDN khi cần | ~8 KB |
| `web2/shared/web2-effects.css` | Utility classes + keyframes (`.w2fx-*`)                                                              | ~3 KB |

Zero 3rd-party dependency upfront. Confetti chỉ load (28 KB) khi gọi `Web2Effects.confetti()` lần đầu.

Tất cả hiệu ứng tự động **honor `prefers-reduced-motion`** — khi user OS bật giảm motion thì duration → 0.01ms, motion → opacity-only fallback.

## Tại sao tự build thay vì lib lớn?

| Lib phổ biến (2025) | Size    | Lý do không chọn                                                     |
| ------------------- | ------- | -------------------------------------------------------------------- |
| GSAP                | 60 KB+  | Mạnh nhất nhưng overkill cho admin app — không cần timeline phức tạp |
| Anime.js            | 17 KB   | Tốt nhưng phần lớn API đã có sẵn trong Web Animations API native     |
| Motion One          | 4 KB    | Đáng cân nhắc — nhưng tự build cho mình lib gọn 8 KB ổn hơn          |
| Animate.css         | 50 KB   | Quá nhiều keyframe không dùng                                        |
| AOS                 | 14 KB   | Scroll-triggered, admin app ít scroll → không cần                    |
| Lottie              | 100 KB+ | Chỉ cần khi có file `.json` After Effects (chưa có use case)         |

Native Web Animations API + 1 file CSS đủ phủ 95% use case. Khi cần motion nâng cao (path morphing, SVG, scrubbing) → lúc đó mới pull Motion / GSAP.

## Load module

Để dùng trong 1 page Web 2.0, thêm 2 dòng vào `<head>`:

```html
<link rel="stylesheet" href="../../web2/shared/web2-effects.css?v=20260514a" />
<script src="../../web2/shared/web2-effects.js?v=20260514a"></script>
```

Hoặc thêm vào `web2/shared/page-shell.js` (CSS_FILES + SCRIPTS_PRELOAD) → mọi page Web2 tự nhận.

---

## I. JS API — `window.Web2Effects`

### Entrance / exit

| Hàm                        | Tham số                                             | Mô tả                      |
| -------------------------- | --------------------------------------------------- | -------------------------- |
| `fadeIn(el, opts?)`        | element, `{duration?, delay?, easing?, translate?}` | Fade + nhích nhẹ lên       |
| `fadeOut(el, opts?)`       | —                                                   | Fade + nhích nhẹ xuống/lên |
| `slideIn(el, dir, opts?)`  | dir: `'top'\|'right'\|'bottom'\|'left'`             | Trượt vào                  |
| `slideOut(el, dir, opts?)` | —                                                   | Trượt ra                   |

### Attention

| Hàm                 | Mô tả                                      |
| ------------------- | ------------------------------------------ |
| `pulse(el)`         | Scale 1 → 1.06 → 1 (bouncy)                |
| `shake(el)`         | Lắc trái phải — báo lỗi                    |
| `bounce(el)`        | Nhảy lên rồi xuống                         |
| `flash(el, color?)` | Đổi background vàng (mặc định) rồi fade về |
| `highlightRow(el)`  | Flash vàng nhẹ — dùng cho row update       |

### Stagger / sequence

```js
Web2Effects.staggerIn(document.querySelectorAll('tr.order-row'), {
    duration: 320,
    stagger: 40,
});
```

### Count-up

```js
Web2Effects.countUp(document.getElementById('totalCounter'), 0, 1234, 800);
// hiện 0 → 1.234 (vi-VN format) trong 800ms
```

### Ripple — material click feedback

```js
button.addEventListener('pointerdown', (ev) => Web2Effects.ripple(ev, button));
// hoặc declarative:
// <button data-w2-effect="ripple">…</button>
```

### Confetti — lazy-load từ CDN

```js
await Web2Effects.confetti(); // burst tím-vàng mặc định
await Web2Effects.confetti({ particleCount: 200, spread: 100 });
await Web2Effects.confetti({ origin: { x: 0.5, y: 0.3 } });
```

`canvas-confetti@1.9.3` (~28 KB) chỉ load lần đầu — cache sau đó.

### Misc

| Hàm                                 | Mô tả                                                          |
| ----------------------------------- | -------------------------------------------------------------- |
| `typewriter(el, text, speed=28)`    | Gõ từng ký tự                                                  |
| `morphHeight(el, fromH, toH, opts)` | Animate height (cho collapse/expand)                           |
| `smoothScroll(el)`                  | `scrollIntoView({behavior:'smooth'})` + respect reduced-motion |
| `animate(el, keyframes, opts)`      | Wrap raw Web Animations API                                    |
| `stop(el)`                          | Cancel tất cả animation đang chạy trên element                 |
| `scan(root?)`                       | Quét lại `[data-w2-effect]` sau render                         |

### Constants

```js
Web2Effects.EASE.out; // 'cubic-bezier(0.16, 1, 0.3, 1)' — ease-out-expo
Web2Effects.EASE.inOut; // 'cubic-bezier(0.65, 0, 0.35, 1)'
Web2Effects.EASE.bounce; // overshoot 1.56
Web2Effects.EASE.linear;
Web2Effects.prefersReducedMotion; // bool
```

---

## II. Declarative API — `data-w2-effect`

Đặt attribute trên HTML, scanner tự pickup khi load page hoặc sau khi gọi `Web2Effects.scan(parent)`.

```html
<div data-w2-effect="fade-in" data-w2-delay="200">Hero text</div>
<div data-w2-effect="slide-in" data-w2-dir="left">Sidebar</div>
<button data-w2-effect="ripple">Click me</button>
<span data-w2-effect="count-up">12345</span>
<div data-w2-effect="pulse">Notification badge</div>
<input data-w2-effect="shake" />
<!-- on validation error -->
```

Hỗ trợ:

- `fade-in` — `data-w2-delay`, `data-w2-duration`
- `slide-in` — `data-w2-dir` (top/right/bottom/left), `data-w2-delay`
- `pulse`, `shake`, `bounce`
- `flash` — `data-w2-color`
- `ripple` — attaches click handler
- `count-up` — đọc textContent → parse số → animate

---

## III. CSS-only utility classes (`web2-effects.css`)

Dùng khi không cần JS — chỉ add class lên element là chạy.

### Entrance (1-shot, dùng cho mount)

- `.w2fx-fade-in`
- `.w2fx-slide-in-top` / `.w2fx-slide-in-bottom` / `.w2fx-slide-in-left` / `.w2fx-slide-in-right`
- `.w2fx-pop` — scale 0.92 → 1.02 → 1 (cho modal)
- `.w2fx-backdrop` — fade in backdrop với blur

### Looping (vô hạn, dùng cho indicator)

- `.w2fx-pulse-soft` — halo tím nhịp 1.6s
- `.w2fx-spin` — spinner 1s linear
- `.w2fx-shimmer` (qua class `.w2fx-skeleton`) — loading placeholder

### One-shot attention

- `.w2fx-flash` — đổi vàng nhạt 1.2s rồi về trong suốt

### Skeleton placeholder

```html
<span class="w2fx-skeleton" style="width: 120px; height: 14px;"></span>
<span class="w2fx-skeleton" style="width: 80%; height: 12px;"></span>
```

### Hover micro-interactions

| Class               | Hiệu ứng hover                 |
| ------------------- | ------------------------------ |
| `.w2fx-hover-lift`  | Nâng lên 2px + shadow          |
| `.w2fx-hover-scale` | Scale 1.04                     |
| `.w2fx-hover-glow`  | Ring tím 3px + border tím      |
| `.w2fx-press`       | Scale 0.97 khi active          |
| `.w2fx-underline`   | Underline scaleX 0 → 1 từ giữa |

```html
<button class="w2fx-hover-lift w2fx-press">Đẹp nhẹ</button>
<a class="w2fx-underline">Link với underline slide</a>
```

### Stagger children

```html
<ul class="w2fx-stagger">
    <!-- 12 con đầu tự fade-in delay 20ms/con -->
    <li>Row 1</li>
    <li>Row 2</li>
    …
</ul>
```

Nhiều hơn 12 con → gọi `Web2Effects.staggerIn(parent.children)` thay vì class.

---

## IV. Recipe — khi nào dùng cái gì?

| Use case                      | Recommended                                                       |
| ----------------------------- | ----------------------------------------------------------------- |
| Mở modal                      | CSS `.w2fx-pop` cho card + `.w2fx-backdrop` cho overlay           |
| Đóng modal                    | JS `Web2Effects.fadeOut(card)` + remove sau finish                |
| Toast notification slide vào  | JS `Web2Effects.slideIn(toast, 'right')`                          |
| Row đơn vừa update            | JS `Web2Effects.highlightRow(tr)`                                 |
| Bảng render 30+ rows          | JS `Web2Effects.staggerIn(rows, {stagger: 30})`                   |
| Counter pill đổi số           | JS `Web2Effects.countUp(span, oldVal, newVal)`                    |
| Button hover state            | CSS `.w2fx-hover-lift w2fx-press`                                 |
| Tab active underline          | CSS `.w2fx-underline.is-active`                                   |
| Tạo PBH thành công            | JS `Web2Effects.confetti({ origin: { y: 0.7 } })`                 |
| Validation lỗi input          | JS `Web2Effects.shake(input)`                                     |
| Notification badge có tin mới | CSS `.w2fx-pulse-soft`                                            |
| Loading row skeleton          | CSS `<span class="w2fx-skeleton">`                                |
| Sidebar collapse 260 ↔ 56 px  | JS `Web2Effects.morphHeight` (hoặc CSS `transition: width 0.25s`) |
| Welcome hero text             | JS `Web2Effects.typewriter(el, "Chào bạn", 35)`                   |
| Page hero entrance            | HTML `<h1 data-w2-effect="fade-in" data-w2-delay="100">…</h1>`    |

---

## V. Caveats / khi nào không dùng

- **Đừng animate `width/height/top/left`** — không phải GPU-compositor friendly → giật. Animate `transform` + `opacity` thay vì.
- **Đừng add class `.w2fx-*` rồi remove ngay** — animation phải chạy đủ duration, hoặc gọi `Web2Effects.stop(el)` rồi remove.
- **Stagger > 50 elements**: chuyển sang IntersectionObserver-based, chỉ animate khi vào viewport (tránh paint cùng lúc).
- **Reduced motion**: code đã auto-respect nhưng đừng dùng motion để gửi info quan trọng (chỉ supplement).
- **Confetti**: cần internet để load CDN lần đầu. Nếu cần offline → host file `confetti.browser.min.js` local rồi đổi URL trong `web2-effects.js`.

---

## VI. Roadmap — ý tưởng thêm sau

| Effect                                         | Khi nào cần                                    |
| ---------------------------------------------- | ---------------------------------------------- |
| Page transition (route change)                 | Khi build SPA router cho Web 2.0               |
| Modal nested (drawer trong modal)              | Nếu UX yêu cầu                                 |
| Drag-drop snap animation                       | Khi build Kanban board                         |
| Lottie integration                             | Khi có file After Effects animation cần render |
| Chart entrance (sparkline animate-in)          | Khi build dashboard widgets                    |
| Number-flip flap-board (đếm số kiểu Las Vegas) | Cho landing/marketing page                     |

Khi cần thêm → mở rộng `web2/shared/web2-effects.js` thay vì pull lib mới.

---

## VII. Quick reference cheat sheet

```js
// JS
Web2Effects.fadeIn(el);
Web2Effects.slideIn(el, 'right');
Web2Effects.pulse(badge);
Web2Effects.shake(input);
Web2Effects.flash(row); // yellow flash
Web2Effects.highlightRow(tr); // alias of flash with paler tone
Web2Effects.staggerIn(rows, { stagger: 30 });
Web2Effects.countUp(el, 0, 1234);
Web2Effects.ripple(event, btn);
Web2Effects.typewriter(h1, 'Hello', 30);
Web2Effects.morphHeight(panel, 0, 200);
Web2Effects.smoothScroll(target);
Web2Effects.confetti(); // success!
Web2Effects.stop(el);
Web2Effects.scan(parent); // re-scan after table re-render
```

```css
/* CSS classes */
.w2fx-fade-in
.w2fx-slide-in-{top|bottom|left|right}
.w2fx-pop                   /* modal */
.w2fx-backdrop              /* overlay */
.w2fx-pulse-soft            /* halo */
.w2fx-spin                  /* spinner */
.w2fx-shimmer               /* (via .w2fx-skeleton) */
.w2fx-flash                 /* yellow flash 1.2s */
.w2fx-skeleton              /* loading box */
.w2fx-hover-lift            /* +shadow on hover */
.w2fx-hover-scale           /* scale 1.04 on hover */
.w2fx-hover-glow            /* purple ring on hover */
.w2fx-press                 /* scale 0.97 on active */
.w2fx-underline             /* underline slide */
.w2fx-stagger > *           /* sequential children fade-in (max 12) */
```

```html
<!-- declarative -->
<div data-w2-effect="fade-in" data-w2-delay="200">…</div>
<div data-w2-effect="slide-in" data-w2-dir="left">…</div>
<button data-w2-effect="ripple">Click</button>
<span data-w2-effect="count-up">12345</span>
<div data-w2-effect="pulse">Badge</div>
<input data-w2-effect="shake" />
<!-- after validation fail -->
```
