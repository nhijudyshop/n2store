# Latest Snapshot — `web2/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260627-132551-fb59af0`
**Session file**: [`./20260627-132551-fb59af0.md`](../20260627-132551-fb59af0.md)
**Commit**: `fb59af0` — fix(gemini-tryon): bắt trọn log uvicorn (PIPE pump) + đọc/hiện log UTF-8 (hết mojibake)
**Last updated**: 2026-06-27 13:25:51 +07
**Summary**: fix(gemini-tryon): bắt trọn log uvicorn (PIPE pump) + đọc/hiện log UTF-8 (hết mojibake)

## Files changed in this commit (`web2/`)

- `web2/live-control/css/live-control.css`
- `web2/live-control/index.html`
- `web2/live-control/js/live-control.js`
- `web2/live-tv/index.html`
- `web2/live-tv/js/live-tv.js`
- `web2/shared/web2-campaign.js`
- `web2/shared/web2-variant-group.js`

## Last 5 commits touching `web2/`

- `4f7c77188` fix(web2/live-control): hpin guard removed=false + KH MỚI column width polish _(2026-06-27)_
- `49c7ee44f` auto: session update _(2026-06-27)_
- `4dd59e284` feat(gemini-tryon): thêm debug — launcher ghi log + health-check trong bat, endpoint /debug + tab chẩn đoán _(2026-06-27)_
- `6ceb6f4aa` feat(web2): trang chỉ-admin ẩn khỏi menu nhân viên + chặn URL trực tiếp _(2026-06-27)_
- `87bfab397` auto: session update _(2026-06-27)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260627-132551-fb59af0` cho Claude walk chain theo CLAUDE.md protocol.
