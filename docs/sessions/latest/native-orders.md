# Latest Snapshot — `native-orders/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260607-195841-a1037d2`
**Session file**: [`./20260607-195841-a1037d2.md`](../20260607-195841-a1037d2.md)
**Commit**: `a1037d2` — refactor(web2): rename design-system tpos-_ → web2-_ (classes + --vars), files + theme class
**Last updated**: 2026-06-07 19:58:41 +07
**Summary**: refactor(web2): rename design-system tpos-_ → web2-_ (classes + --vars), files + theme class

## Files changed in this commit (`native-orders/`)

- `native-orders/css/native-orders.css`
- `native-orders/css/web2-theme.css`
- `native-orders/index.html`
- `native-orders/js/native-orders-app.js`

## Last 5 commits touching `native-orders/`

- `a1037d2a1` refactor(web2): rename design-system tpos-_ → web2-_ (classes + --vars), files + theme class _(2026-06-07)_
- `f1f0b7690` refactor(live-chat): rename tpos-pancake→live-chat, purge chữ 'tpos' + comment qua pages.fm _(2026-06-07)_
- `d8b59e44e` feat(web2/bill): PBH đổi Code128 → QR Code _(2026-06-07)_
- `2b1a72bb8` feat(web2/chat): Feature 2 sticker-send (built-in pack qua REPLY*INBOX_PHOTO STICKER, không cần sửa extension); test OK *(2026-06-07)\_
- `cdd7bd14a` auto: session update _(2026-06-07)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260607-195841-a1037d2` cho Claude walk chain theo CLAUDE.md protocol.
