# Latest Snapshot — `web2/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260615-142600-e03aba2`
**Session file**: [`./20260615-142600-e03aba2.md`](../20260615-142600-e03aba2.md)
**Commit**: `e03aba2` — feat(web2-zalo): allowlist 2 nhóm XỬ LÝ NJD + wipe + retention 7 ngày
**Last updated**: 2026-06-15 14:26:00 +07
**Summary**: feat(web2-zalo): allowlist 2 nhóm XỬ LÝ NJD + wipe + retention 7 ngày

## Files changed in this commit (`web2/`)

- `web2/jt-tracking/index.html`
- `web2/jt-tracking/js/jt-tracking-app.js`

## Last 5 commits touching `web2/`

- `bde146298` fix(web2/jt-tracking): classifier khớp từ vựng J&T thật (audit 121 sự kiện) _(2026-06-15)_
- `31fcb2442` fix(web2/jt-tracking): 'chuyển hoàn' = status returned (Đã hoàn), không phải đã giao _(2026-06-15)_
- `27d2849a6` feat(web2-shared): Web2Lottie — Lottie (airbnb/lottie-web) dùng chung toàn bộ Web 2.0 _(2026-06-15)_
- `6828feb8b` feat(web2-jt): mã đơn bấm copy + mở chat tự cuộn tới tin có mã (nháy sáng) _(2026-06-15)_
- `bde4c849b` feat(web2-jt): nút 'Xóa hết & quét lại' + POST /clear (beta wipe) → quét lại sạch theo format dòng đơn _(2026-06-15)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260615-142600-e03aba2` cho Claude walk chain theo CLAUDE.md protocol.
