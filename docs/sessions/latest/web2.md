# Latest Snapshot — `web2/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260615-132536-27d2849`
**Session file**: [`./20260615-132536-27d2849.md`](../20260615-132536-27d2849.md)
**Commit**: `27d2849` — feat(web2-shared): Web2Lottie — Lottie (airbnb/lottie-web) dùng chung toàn bộ Web 2.0
**Last updated**: 2026-06-15 13:25:36 +07
**Summary**: feat(web2-shared): Web2Lottie — Lottie (airbnb/lottie-web) dùng chung toàn bộ Web 2.0

## Files changed in this commit (`web2/`)

- `web2/shared/lottie/empty.json`
- `web2/shared/lottie/error.json`
- `web2/shared/lottie/loading.json`
- `web2/shared/lottie/success.json`
- `web2/shared/web2-lottie.css`
- `web2/shared/web2-lottie.js`
- `web2/shared/web2-optimistic.js`
- `web2/shared/web2-sidebar.js`

## Last 5 commits touching `web2/`

- `27d2849a6` feat(web2-shared): Web2Lottie — Lottie (airbnb/lottie-web) dùng chung toàn bộ Web 2.0 _(2026-06-15)_
- `6828feb8b` feat(web2-jt): mã đơn bấm copy + mở chat tự cuộn tới tin có mã (nháy sáng) _(2026-06-15)_
- `bde4c849b` feat(web2-jt): nút 'Xóa hết & quét lại' + POST /clear (beta wipe) → quét lại sạch theo format dòng đơn _(2026-06-15)_
- `f550ecfb3` feat(web2-jt): bấm SĐT trong tin nhắn để copy — không đụng click mở modal _(2026-06-15)_
- `2deb63a01` feat(web2-jt): hiện TOÀN BỘ tin nhắn nhóm chứa mã (tên/SĐT/ghi chú KH) trên row + modal _(2026-06-15)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260615-132536-27d2849` cho Claude walk chain theo CLAUDE.md protocol.
