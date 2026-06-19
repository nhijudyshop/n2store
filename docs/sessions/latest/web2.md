# Latest Snapshot — `web2/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260619-191219-a420110`
**Session file**: [`./20260619-191219-a420110.md`](../20260619-191219-a420110.md)
**Commit**: `a420110` — auto: session update
**Last updated**: 2026-06-19 19:12:19 +07
**Summary**: auto: session update

## Files changed in this commit (`web2/`)

- `web2/shared/web2-zalo-api.js`
- `web2/zalo/index.html`

## Last 5 commits touching `web2/`

- `a4201105a` auto: session update _(2026-06-19)_
- `143222cb7` fix(web2/fb-posts): an toàn chính sách FB — bỏ engagement-bait/clickbait, cảnh báo bản quyền media, hashtag≤6, giãn nhịp đăng + xử lý rate-limit _(2026-06-19)_
- `e33f37797` feat(web2/video-maker): Goal 1 — Tạo video TỪ CHỦ ĐỀ (AI viết kịch bản) + route Gemini RIÊNG Web 2.0 _(2026-06-19)_
- `48ea42753` auto: session update _(2026-06-19)_
- `77bcfbcb1` feat(web2/fb-posts): Đăng nhập bằng Facebook (OAuth) — liên kết 1 lần dính web luôn, không cần dán token _(2026-06-19)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260619-191219-a420110` cho Claude walk chain theo CLAUDE.md protocol.
