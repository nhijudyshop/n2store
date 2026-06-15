# Latest Snapshot — `web2/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260615-140912-29a14db`
**Session file**: [`./20260615-140912-29a14db.md`](../20260615-140912-29a14db.md)
**Commit**: `29a14db` — refactor(live-chat): bỏ HẾT hiệu ứng comment mới (fade/trượt) — hiện tức thì, cả 2 trang
**Last updated**: 2026-06-15 14:09:12 +07
**Summary**: refactor(live-chat): bỏ HẾT hiệu ứng comment mới (fade/trượt) — hiện tức thì, cả 2 trang

## Files changed in this commit (`web2/`)

- `web2/jt-tracking/css/jt-tracking.css`
- `web2/jt-tracking/index.html`
- `web2/jt-tracking/js/jt-tracking-app.js`

## Last 5 commits touching `web2/`

- `31fcb2442` fix(web2/jt-tracking): 'chuyển hoàn' = status returned (Đã hoàn), không phải đã giao _(2026-06-15)_
- `27d2849a6` feat(web2-shared): Web2Lottie — Lottie (airbnb/lottie-web) dùng chung toàn bộ Web 2.0 _(2026-06-15)_
- `6828feb8b` feat(web2-jt): mã đơn bấm copy + mở chat tự cuộn tới tin có mã (nháy sáng) _(2026-06-15)_
- `bde4c849b` feat(web2-jt): nút 'Xóa hết & quét lại' + POST /clear (beta wipe) → quét lại sạch theo format dòng đơn _(2026-06-15)_
- `f550ecfb3` feat(web2-jt): bấm SĐT trong tin nhắn để copy — không đụng click mở modal _(2026-06-15)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260615-140912-29a14db` cho Claude walk chain theo CLAUDE.md protocol.
