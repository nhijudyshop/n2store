# Latest Snapshot — `so-order/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260613-232811-e30d993`
**Session file**: [`./20260613-232811-e30d993.md`](../20260613-232811-e30d993.md)
**Commit**: `e30d993` — refactor(web2,shared): dọn cross-folder dep — move native-orders css → web2/shared (web2-base + web2-components), repoint 31 files
**Last updated**: 2026-06-13 23:28:11 +07
**Summary**: refactor(web2,shared): dọn cross-folder dep — move native-orders css → web2/shared (web2-base + web2-components...

## Files changed in this commit (`so-order/`)

- `so-order/index.html`

## Last 5 commits touching `so-order/`

- `e30d9930f` refactor(web2,shared): dọn cross-folder dep — move native-orders css → web2/shared (web2-base + web2-components), repoint 31 files _(2026-06-13)_
- `e0a74e0d0` feat(web2): bắt buộc đăng nhập — page guard redirect /web2/login khi chưa auth _(2026-06-13)_
- `124fe747f` refactor(web2): gỡ dead Firebase — 8 trang firebase-free + fix manual-deposit stale ledger _(2026-06-13)_
- `fd7e95207` feat(so-order): skeleton lúc load đầu — hết 'nháy bảng trống' _(2026-06-13)_
- `bd2020566` feat(web2): UX per-page đợt 3 + de-purple sâu (violet/indigo scale → xanh, 54 file) _(2026-06-13)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260613-232811-e30d993` cho Claude walk chain theo CLAUDE.md protocol.
