# Latest Snapshot — `web2/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260619-154657-ba14605`
**Session file**: [`./20260619-154657-ba14605.md`](../20260619-154657-ba14605.md)
**Commit**: `ba14605` — docs: dev-log Goal 1 video từ chủ đề (AI Gemini riêng Web 2.0)
**Last updated**: 2026-06-19 15:46:57 +07
**Summary**: docs: dev-log Goal 1 video từ chủ đề (AI Gemini riêng Web 2.0)

## Files changed in this commit (`web2/`)

- `web2/video-maker/js/video-ai-script.js`

## Last 5 commits touching `web2/`

- `e33f37797` feat(web2/video-maker): Goal 1 — Tạo video TỪ CHỦ ĐỀ (AI viết kịch bản) + route Gemini RIÊNG Web 2.0 _(2026-06-19)_
- `48ea42753` auto: session update _(2026-06-19)_
- `77bcfbcb1` feat(web2/fb-posts): Đăng nhập bằng Facebook (OAuth) — liên kết 1 lần dính web luôn, không cần dán token _(2026-06-19)_
- `3d3b873cf` feat(web2/fb-posts): trang Đăng bài Facebook — quản lý + soạn/đăng/lên lịch 2 page qua Graph API + AI caption free (Groq) _(2026-06-19)_
- `5002a0888` perf(web2/beauty): warp chỉ xử lý VÙNG BAO brush (mặt) thay vì toàn ảnh → hết kẹt main-thread khi làm đẹp mặt trên ảnh lớn _(2026-06-19)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260619-154657-ba14605` cho Claude walk chain theo CLAUDE.md protocol.
