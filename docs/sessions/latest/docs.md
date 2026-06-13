# Latest Snapshot — `docs/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260613-183758-29bb868`
**Session file**: [`./20260613-183758-29bb868.md`](../20260613-183758-29bb868.md)
**Commit**: `29bb868` — polish(web2): ẩn source-pill (tên bảng DB kỹ thuật) khỏi UI sản xuất
**Last updated**: 2026-06-13 18:37:58 +07
**Summary**: polish(web2): ẩn source-pill (tên bảng DB kỹ thuật) khỏi UI sản xuất

## Files changed in this commit (`docs/`)

- `docs/dev-log.md`

## Last 5 commits touching `docs/`

- `29bb8688f` polish(web2): ẩn source-pill (tên bảng DB kỹ thuật) khỏi UI sản xuất _(2026-06-13)_
- `0ba741eff` chore(session): RESUME:20260613-183053-6806b7f _(2026-06-13)_
- `6806b7f4f` perf(live-chat): encode JPEG off main-thread (OffscreenCanvas+Worker) + rVFC trigger _(2026-06-13)_
- `31b684781` chore(session): RESUME:20260613-182723-2a90d4d _(2026-06-13)_
- `ad0ed3193` chore(session): RESUME:20260613-182027-6b301a8 _(2026-06-13)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260613-183758-29bb868` cho Claude walk chain theo CLAUDE.md protocol.
