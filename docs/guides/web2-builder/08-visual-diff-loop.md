<!-- #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | Read these files before coding, update dev-log after changes. -->

# 08 — Visual Diff Loop (Phase D)

Mục tiêu: clone TPOS UI 100%. Sau khi tạo trang xong, diff visual đến khi `< 5 entries` khác biệt.

## Setup Playwright headed (login thủ công)

```bash
mkdir -p /tmp/tpos-pw-profile
# Folder này là persistent context — login 1 lần dùng mãi
```

Nếu đã login từ session trước, profile vẫn còn cookie.

## Watch script (dual-tab)

File: `/tmp/tpos-crawl-manual/watch.js` (đã có từ phase trước, tạo lại nếu cần):

```js
import { chromium } from 'playwright';

const SLUG = process.argv[2] || 'productcategory';
const TPOS_URL = `https://tomato.tpos.vn/#/app/${SLUG}/list`;
const OUR_URL = `https://nhijudyshop.github.io/web2/${SLUG.replace(/(?=[A-Z])/g, '-').toLowerCase()}/index.html?_=${Date.now()}`;

const ctx = await chromium.launchPersistentContext('/tmp/tpos-pw-profile', { headless: false });
const tpos = await ctx.newPage();
const ours = await ctx.newPage();
await tpos.goto(TPOS_URL);
await ours.goto(OUR_URL);

// Reload our tab every 30s to pick up GitHub Pages updates
setInterval(async () => {
    try { await ours.reload({ waitUntil: 'domcontentloaded' }); } catch {}
}, 30_000);

// Keep alive
await new Promise(() => {});
```

Chạy: `node /tmp/tpos-crawl-manual/watch.js productcategory`

## Compare script

File: `/tmp/tpos-crawl-manual/compare.js`:

```js
// Pseudocode — đã có từ phase trước
// 1. Lấy classList + computedStyle của các selector quan trọng (.btn, .label, table, etc.) ở cả 2 tab
// 2. Diff entry-by-entry
// 3. Output JSON với property khác biệt
```

Output mẫu:
```json
[
    { "selector": ".tpos-btn-primary", "prop": "background-color", "tpos": "rgb(60,141,188)", "ours": "rgb(70,150,200)" },
    { "selector": ".data-table th", "prop": "padding", "tpos": "8px 6px", "ours": "10px 8px" }
]
```

## Quy tắc lặp

| Iter | Mục tiêu | Hành động |
|------|---------|----------|
| 1 | Set base palette + classes | Áp dụng `tpos-theme.css`, đếm diff |
| 2 | Fix top-3 visual mismatches | Sửa từng property cụ thể |
| 3 | Edge cases (alignment, font) | textAlign, font-family |
| ... | < 5 entries | Stop |

> Đừng over-engineer. Diff 1-2 entry còn lại thường là:
> - Test data khác (TPOS có data, ours rỗng)
> - Font fallback (TPOS có Tahoma local, ours fallback Arial)
> Có thể chấp nhận.

## Pitfalls đã gặp (Phase 1-6)

1. **Pill vs plain text** — TPOS render status là plain text màu, không pill background. Đừng wrap span pill.
2. **textAlign Channel TD** — TPOS center, ours mặc định left. Cần `tpos-cell-center` class.
3. **GitHub Pages cache** — sau push 30s mới deploy. Browser cache thêm 5 phút. Dùng `?_=Date.now()` query string.
4. **Singleton lock Playwright** — nếu Watch script crash, xóa: `rm -rf /tmp/tpos-pw-profile/Singleton*`.
5. **Avatar flicker khi expand row** — đừng replace `tbody.innerHTML`. Patch DOM in-place.

## Done criteria

- [ ] Visual diff < 5 entries (sau khi loại trừ test data + font local).
- [ ] Hover/focus/active states giống TPOS.
- [ ] Responsive ở 1280px, 1440px, 1920px.
- [ ] Empty state, loading state, error state đầy đủ.
