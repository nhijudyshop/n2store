# Latest Snapshot — `web2/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260625-195912-b1008b1`
**Session file**: [`./20260625-195912-b1008b1.md`](../20260625-195912-b1008b1.md)
**Commit**: `b1008b1` — fix(web2/live-control): picker 'Chờ hàng' tìm theo MÃ + tên (thiếu match code)
**Last updated**: 2026-06-25 19:59:12 +07
**Summary**: Tìm SP theo mã+tên: fix picker Chờ hàng thiếu match code; các search khác đã đúng

## Files changed in this commit (`web2/`)

- `web2/live-control/index.html`
- `web2/live-control/js/live-control.js`

## Last 5 commits touching `web2/`

- `b1008b18c` fix(web2/live-control): picker 'Chờ hàng' tìm theo MÃ + tên (thiếu match code) _(2026-06-25)_
- `308ce60ba` fix(web2): unique theo mã triệt để — default by:'code' + modal/supplier-wallet variant-aware _(2026-06-25)_
- `05649cde5` fix(web2/live-control,live-tv): SP unique theo MÃ — bỏ gom theo tên _(2026-06-25)_
- `3d1161297` auto: session update _(2026-06-25)_
- `927c3e8a3` fix(web2/zalo): focus-lease phiên Zalo — hết spam 'Đổi thiết bị' trên chat.zalo.me _(2026-06-25)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260625-195912-b1008b1` cho Claude walk chain theo CLAUDE.md protocol.
