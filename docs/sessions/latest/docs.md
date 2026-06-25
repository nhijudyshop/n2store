# Latest Snapshot — `docs/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260625-195912-b1008b1`
**Session file**: [`./20260625-195912-b1008b1.md`](../20260625-195912-b1008b1.md)
**Commit**: `b1008b1` — fix(web2/live-control): picker 'Chờ hàng' tìm theo MÃ + tên (thiếu match code)
**Last updated**: 2026-06-25 19:59:12 +07
**Summary**: Tìm SP theo mã+tên: fix picker Chờ hàng thiếu match code; các search khác đã đúng

## Files changed in this commit (`docs/`)

- `docs/dev-log.md`

## Last 5 commits touching `docs/`

- `b1008b18c` fix(web2/live-control): picker 'Chờ hàng' tìm theo MÃ + tên (thiếu match code) _(2026-06-25)_
- `56a61d5e2` chore(session): RESUME:20260625-194528-308ce60 _(2026-06-25)_
- `308ce60ba` fix(web2): unique theo mã triệt để — default by:'code' + modal/supplier-wallet variant-aware _(2026-06-25)_
- `2fb834c3f` chore(session): RESUME:20260625-193028-05649cd _(2026-06-25)_
- `05649cde5` fix(web2/live-control,live-tv): SP unique theo MÃ — bỏ gom theo tên _(2026-06-25)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260625-195912-b1008b1` cho Claude walk chain theo CLAUDE.md protocol.
