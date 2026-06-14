# Latest Snapshot — `so-order/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260614-114439-4a8d6ab`
**Session file**: [`./20260614-114439-4a8d6ab.md`](../20260614-114439-4a8d6ab.md)
**Commit**: `4a8d6ab` — feat(web2): cross-page deep-linking — NCC công nợ↔ví↔sổ order + so-order→Kho SP
**Last updated**: 2026-06-14 11:44:39 +07
**Summary**: feat(web2): cross-page deep-linking — NCC công nợ↔ví↔sổ order + so-order→Kho SP

## Files changed in this commit (`so-order/`)

- `so-order/index.html`
- `so-order/js/so-order-app.js`

## Last 5 commits touching `so-order/`

- `4a8d6aba3` feat(web2): cross-page deep-linking — NCC công nợ↔ví↔sổ order + so-order→Kho SP _(2026-06-14)_
- `78e4ed358` feat(web2): UX đợt B — skeleton loading + error+retry + mobile + keyboard/empty-state (17 trang) _(2026-06-14)_
- `e30d9930f` refactor(web2,shared): dọn cross-folder dep — move native-orders css → web2/shared (web2-base + web2-components), repoint 31 files _(2026-06-13)_
- `e0a74e0d0` feat(web2): bắt buộc đăng nhập — page guard redirect /web2/login khi chưa auth _(2026-06-13)_
- `124fe747f` refactor(web2): gỡ dead Firebase — 8 trang firebase-free + fix manual-deposit stale ledger _(2026-06-13)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260614-114439-4a8d6ab` cho Claude walk chain theo CLAUDE.md protocol.
