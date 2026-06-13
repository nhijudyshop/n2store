# Latest Snapshot — `web2/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260613-195301-b89f32c`
**Session file**: [`./20260613-195301-b89f32c.md`](../20260613-195301-b89f32c.md)
**Commit**: `b89f32c` — auto: session update
**Last updated**: 2026-06-13 19:53:01 +07
**Summary**: auto: session update

## Files changed in this commit (`web2/`)

- `web2/zalo/js/web2-zalo-app.js`

## Last 5 commits touching `web2/`

- `b89f32ca6` auto: session update _(2026-06-13)_
- `123e6d54a` auto: session update _(2026-06-13)_
- `63446c668` auto: session update _(2026-06-13)_
- `e0a74e0d0` feat(web2): bắt buộc đăng nhập — page guard redirect /web2/login khi chưa auth _(2026-06-13)_
- `124fe747f` refactor(web2): gỡ dead Firebase — 8 trang firebase-free + fix manual-deposit stale ledger _(2026-06-13)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260613-195301-b89f32c` cho Claude walk chain theo CLAUDE.md protocol.
