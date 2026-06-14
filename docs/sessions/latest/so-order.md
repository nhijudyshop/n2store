# Latest Snapshot — `so-order/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260614-122010-cde645d`
**Session file**: [`./20260614-122010-cde645d.md`](../20260614-122010-cde645d.md)
**Commit**: `cde645d` — auto: session update
**Last updated**: 2026-06-14 12:20:10 +07
**Summary**: auto: session update

## Files changed in this commit (`so-order/`)

- `so-order/index.html`
- `so-order/js/so-order-app.js`

## Last 5 commits touching `so-order/`

- `cde645d26` auto: session update _(2026-06-14)_
- `db2e029ee` auto: session update _(2026-06-14)_
- `4a8d6aba3` feat(web2): cross-page deep-linking — NCC công nợ↔ví↔sổ order + so-order→Kho SP _(2026-06-14)_
- `78e4ed358` feat(web2): UX đợt B — skeleton loading + error+retry + mobile + keyboard/empty-state (17 trang) _(2026-06-14)_
- `e30d9930f` refactor(web2,shared): dọn cross-folder dep — move native-orders css → web2/shared (web2-base + web2-components), repoint 31 files _(2026-06-13)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260614-122010-cde645d` cho Claude walk chain theo CLAUDE.md protocol.
