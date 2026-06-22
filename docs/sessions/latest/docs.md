# Latest Snapshot — `docs/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260622-181557-a9b4a5b`
**Session file**: [`./20260622-181557-a9b4a5b.md`](../20260622-181557-a9b4a5b.md)
**Commit**: `a9b4a5b` — fix(native-orders) tag-add jank: in-place .col-tag update + smooth pop-in for new pills only (compositor-only, no avatar reload, no re-pop)
**Last updated**: 2026-06-22 18:15:57 +07
**Summary**: fix(native-orders) tag-add jank: in-place .col-tag update + smooth pop-in for new pills only (compositor-only, no ava...

## Files changed in this commit (`docs/`)

- `docs/dev-log.md`

## Last 5 commits touching `docs/`

- `a9b4a5b13` fix(native-orders) tag-add jank: in-place .col-tag update + smooth pop-in for new pills only (compositor-only, no avatar reload, no re-pop) _(2026-06-22)_
- `da2788338` feat(inventory-tracking): cây bút ở ô STT — tìm nhanh SP từ kho, điền tên vào ô Mã hàng _(2026-06-22)_
- `1fea4f783` chore(session): RESUME:20260622-173632-7d62986 _(2026-06-22)_
- `7d629864b` change(so-order): random fill tạo data test KHÔNG kèm hình _(2026-06-22)_
- `47e48e553` fix(web2-video-maker): default voice = Adam 3 + auto-select khi thêm giọng + bỏ pitch giọng server (giọng tạo ra không giống) _(2026-06-22)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260622-181557-a9b4a5b` cho Claude walk chain theo CLAUDE.md protocol.
