# Latest Snapshot — `docs/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260615-174236-38a1ee8`
**Session file**: [`./20260615-174236-38a1ee8.md`](../20260615-174236-38a1ee8.md)
**Commit**: `38a1ee8` — auto: session update
**Last updated**: 2026-06-15 17:42:36 +07
**Summary**: auto: session update

## Files changed in this commit (`docs/`)

- `docs/dev-log.md`

## Last 5 commits touching `docs/`

- `8ec707cdd` fix(web2/jt-tracking): /refresh gentler (CONC 3 + retry + nhịp 350ms + batch 15) — hết kẹt 'Chưa tra' do jtexpress throttle _(2026-06-15)_
- `825b636ba` chore(session): RESUME:20260615-173810-29ed75a _(2026-06-15)_
- `29ed75a8a` fix(web2): ẩn+dọn spam tăng comment khỏi live-chat (boost-mark XOÁ + nút Dọn) _(2026-06-15)_
- `e2616c8f4` chore(session): RESUME:20260615-173620-1f0fe17 _(2026-06-15)_
- `18b749cc0` feat(web2/jt-tracking): bỏ nút 'Xóa hết & quét lại' (tránh xoá nhầm); bump app v=20260615w _(2026-06-15)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260615-174236-38a1ee8` cho Claude walk chain theo CLAUDE.md protocol.
