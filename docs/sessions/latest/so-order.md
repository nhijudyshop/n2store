# Latest Snapshot — `so-order/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260623-234822-13d201c`
**Session file**: [`./20260623-234822-13d201c.md`](../20260623-234822-13d201c.md)
**Commit**: `13d201c` — feat(web2): MoneyPrinterTurbo stock footage (Pexels/Pixabay) in video-maker
**Last updated**: 2026-06-23 23:48:22 +07
**Summary**: 3 cache migrations onto Web2SmartCache + codegraph setup + MoneyPrinterTurbo stock footage in video-maker + repo re-audit

## Files changed in this commit (`so-order/`)

- `so-order/index.html`

## Last 5 commits touching `so-order/`

- `153a6091a` refactor(web2): migrate products/variants/customer caches onto Web2SmartCache _(2026-06-23)_
- `fceb82e86` feat(web2): Web2SmartCache primitive (SWR+IDB+SSE+dedup) + adopt in suppliers-cache _(2026-06-23)_
- `3c5b527dc` chore(web2): bump web2-sidebar.js/.css?v=20260623up1 (footer profile + avatar) trên 48 trang _(2026-06-23)_
- `af9eb99af` feat(web2-sidebar): tạo group menu 'AI' — gom Trợ lý AI + Xưởng Video AI; bump sidebar v=20260623ai3 _(2026-06-23)_
- `a47424f02` feat(web2-admin): Người dùng vào group Quản trị viên + bỏ badge số group + smart cache IndexedDB cho Chấm công _(2026-06-23)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260623-234822-13d201c` cho Claude walk chain theo CLAUDE.md protocol.
