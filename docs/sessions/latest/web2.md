# Latest Snapshot — `web2/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260604-155846-6de7c3c`
**Session file**: [`./20260604-155846-6de7c3c.md`](../20260604-155846-6de7c3c.md)
**Commit**: `6de7c3c` — auto: session update
**Last updated**: 2026-06-04 15:58:46 +07
**Summary**: auto: session update

## Files changed in this commit (`web2/`)

- `web2/shared/delivery-method-picker.js`
- `web2/shared/tpos-sidebar.js`
- `web2/supplier-debt/index.html`
- `web2/supplier-debt/js/supplier-debt-app.js`

## Last 5 commits touching `web2/`

- `6de7c3cc7` auto: session update _(2026-06-04)_
- `d1982a67b` refactor(web2 supplier-debt): cat sach coupling TPOS/inventory*shipments (Web 1.0) *(2026-06-04)\_
- `3807c609f` feat(web2): auto-detect dia chi 2-method (offline fuzzy + Goong) cross-validate _(2026-06-04)_
- `1ff12a8c5` chore(web2): photo-studio bump asset v=20260604i (cache-bust Cloud HD default) _(2026-06-04)_
- `d7a7e1920` feat(web2): photo-studio — mặc định AI nét = Cloud HD (withoutbg, 11 key xoay tua) _(2026-06-04)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260604-155846-6de7c3c` cho Claude walk chain theo CLAUDE.md protocol.
