# Latest Snapshot — `live-chat/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260608-202809-6ede237`
**Session file**: [`./20260608-202809-6ede237.md`](../20260608-202809-6ede237.md)
**Commit**: `6ede237` — feat(web2): admin backfill SDT+fb_id tu Pancake INBOX -> kho (1 lan)
**Last updated**: 2026-06-08 20:28:09 +07
**Summary**: feat(web2): admin backfill SDT+fb_id tu Pancake INBOX -> kho (1 lan)

## Files changed in this commit (`live-chat/`)

- `live-chat/index.html`
- `live-chat/js/pancake/inventory-panel.js`

## Last 5 commits touching `live-chat/`

- `791256f2a` revert(live-chat): bo click-to-add (chi giu keo-tha) - tranh vo tinh tao don khi bam SP roi bam comment _(2026-06-08)_
- `256546a71` feat(live-chat): pill so du vi Web 2.0 chuyen len KE BEN TEN KH (tu Row 3 SDT) _(2026-06-08)_
- `76bfd6602` feat(web2): SDT phu cho KH (uu tien kho, khong ghi de) - giong dedup 1 KH nhieu SDT _(2026-06-08)_
- `a83467a4a` feat(live): trich SDT tu noi dung comment (khach tu go) + profile Pancake _(2026-06-08)_
- `f799937cd` feat(live-chat): khach comment lay SDT tu Pancake recent*phone_numbers neu co *(2026-06-08)\_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260608-202809-6ede237` cho Claude walk chain theo CLAUDE.md protocol.
