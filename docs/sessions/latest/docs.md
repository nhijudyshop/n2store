# Latest Snapshot — `docs/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260701-095349-2d32968`
**Session file**: [`./20260701-095349-2d32968.md`](../20260701-095349-2d32968.md)
**Commit**: `2d32968` — fix(fast-sale-orders): huỷ PBH → revert phiếu thu về consumed về 'queued'
**Last updated**: 2026-07-01 09:53:49 +07
**Summary**: fix(fast-sale-orders): huỷ PBH → revert phiếu thu về consumed về 'queued'

## Files changed in this commit (`docs/`)

- `docs/dev-log.md`

## Last 5 commits touching `docs/`

- `2d32968e5` fix(fast-sale-orders): huỷ PBH → revert phiếu thu về consumed về 'queued' _(2026-07-01)_
- `df9bbe586` chore(session): RESUME:20260701-090707-07ad3c9 _(2026-07-01)_
- `07ad3c9d5` feat(web2 unit-scan): nút gạt 'Quét nhanh' — ẩn thẻ chi tiết khi quét liên tục _(2026-07-01)_
- `ea1d6ef2d` chore(session): RESUME:20260701-083929-4a2852d _(2026-07-01)_
- `4a2852d19` feat(web2 unit-scan): quét nhanh liên tiếp + danh sách in chỉ nhận tem CÓ STT _(2026-07-01)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260701-095349-2d32968` cho Claude walk chain theo CLAUDE.md protocol.
