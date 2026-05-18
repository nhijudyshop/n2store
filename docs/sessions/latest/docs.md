# Latest Snapshot — `docs/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260518-130729-b555189`
**Session file**: [`./20260518-130729-b555189.md`](../20260518-130729-b555189.md)
**Commit**: `b555189` — feat(web2/supplier-debt): mặc định filter = đầu → cuối tháng hiện tại
**Last updated**: 2026-05-18 13:07:29 +07
**Summary**: feat(web2/supplier-debt): mặc định filter = đầu → cuối tháng hiện tại

## Files changed in this commit (`docs/`)

- `docs/dev-log.md`

## Last 5 commits touching `docs/`

- `68d80c75` chore(session): RESUME:20260518-122818-b835da6 _(2026-05-18)_
- `df56eec8` chore(session): RESUME:20260518-122814-f91badc _(2026-05-18)_
- `f91badc9` feat(web2/supplier-debt): toggle "TPOS (legacy)" — merge data từ TPOS Report API _(2026-05-18)_
- `b835da61` fix(orders-report): miss auto-tag XL "ĐÃ RA ĐƠN" sau tạo PBH (single + bulk) _(2026-05-18)_
- `bd553a69` chore(session): RESUME:20260518-121431-c6e4d31 _(2026-05-18)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260518-130729-b555189` cho Claude walk chain theo CLAUDE.md protocol.
