# Latest Snapshot — `web2-shared/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260518-101759-9f34fee`
**Session file**: [`./20260518-101759-9f34fee.md`](../20260518-101759-9f34fee.md)
**Commit**: `9f34fee` — feat(web2): Ví NCC + Ví KH — công nợ + trả hàng + 30-day cleanup
**Last updated**: 2026-05-18 10:17:59 +07
**Summary**: feat(web2): Ví NCC + Ví KH — công nợ + trả hàng + 30-day cleanup

## Files changed in this commit (`web2-shared/`)

- `web2-shared/tpos-sidebar.js`

## Last 5 commits touching `web2-shared/`

- `9f34fee9` feat(web2): Ví NCC + Ví KH — công nợ + trả hàng + 30-day cleanup _(2026-05-18)_
- `5922ea4d` fix(web2-shared): sidebar collapsed — labels bleed + toggle bị che _(2026-05-18)_
- `9c8a37db` feat(web2): Kho Biến Thể riêng — picker dropdown thay free-text variant _(2026-05-18)_
- `723f55f5` feat(web2): hover-zoom catch-all + Web2Effects.attachImageDropTarget — Ctrl+V upload area _(2026-05-17)_
- `775d5ceb` feat(web2,so-order): split Giá Mua/Bán, realtime kho SP, so-order multi-row + suggestion + auto-add _(2026-05-17)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260518-101759-9f34fee` cho Claude walk chain theo CLAUDE.md protocol.
