# Latest Snapshot — `soquy/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260521-153901-7cfb013`
**Session file**: [`./20260521-153901-7cfb013.md`](../20260521-153901-7cfb013.md)
**Commit**: `7cfb013` — chore(cache-bust): opt-in toàn bộ 88 pages còn lại vào ?v=20260521b
**Last updated**: 2026-05-21 15:39:01 +07
**Summary**: chore(cache-bust): opt-in toàn bộ 88 pages còn lại vào ?v=20260521b

## Files changed in this commit (`soquy/`)

- `soquy/huong_dan_so_quy.html`
- `soquy/index.html`

## Last 5 commits touching `soquy/`

- `7cfb0132` chore(cache-bust): opt-in toàn bộ 88 pages còn lại vào ?v=20260521b _(2026-05-21)_
- `4065a28c` feat(soquy-report): chi tiết theo loại full-width, bỏ max-height _(2026-04-29)_
- `48b4c897` feat(soquy-report): biểu đồ thu chi mặc định collapsed, click header để mở _(2026-04-29)_
- `db910321` feat(soquy-report): drill-down "Chi tiết theo loại" phân trang 50 phiếu/trang _(2026-04-29)_
- `8ff572c3` fix(remaining): resident probe race + soquy/huong*dan KiotViet CORS + smoke regex tighten *(2026-04-28)\_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260521-153901-7cfb013` cho Claude walk chain theo CLAUDE.md protocol.
