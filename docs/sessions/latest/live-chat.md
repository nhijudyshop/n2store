# Latest Snapshot — `live-chat/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260609-094955-762eb0f`
**Session file**: [`./20260609-094955-762eb0f.md`](../20260609-094955-762eb0f.md)
**Commit**: `762eb0f` — docs(dev-log): 2026-06-09 - danh sach don theo chien dich, SDT phu, bo click-to-add, backfill Pancake
**Last updated**: 2026-06-09 09:49:55 +07
**Summary**: docs(dev-log): 2026-06-09 - danh sach don theo chien dich, SDT phu, bo click-to-add, backfill Pancake

## Files changed in this commit (`live-chat/`)

- `live-chat/index.html`
- `live-chat/js/live/live-order-history.js`

## Last 5 commits touching `live-chat/`

- `6ff008a81` feat(live-chat): danh sach don da tao theo chien dich (STT + tim kiem) _(2026-06-09)_
- `791256f2a` revert(live-chat): bo click-to-add (chi giu keo-tha) - tranh vo tinh tao don khi bam SP roi bam comment _(2026-06-08)_
- `256546a71` feat(live-chat): pill so du vi Web 2.0 chuyen len KE BEN TEN KH (tu Row 3 SDT) _(2026-06-08)_
- `76bfd6602` feat(web2): SDT phu cho KH (uu tien kho, khong ghi de) - giong dedup 1 KH nhieu SDT _(2026-06-08)_
- `a83467a4a` feat(live): trich SDT tu noi dung comment (khach tu go) + profile Pancake _(2026-06-08)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260609-094955-762eb0f` cho Claude walk chain theo CLAUDE.md protocol.
