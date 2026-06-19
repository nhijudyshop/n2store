# Latest Snapshot — `web2/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260619-231831-ba7dd15`
**Session file**: [`./20260619-231831-ba7dd15.md`](../20260619-231831-ba7dd15.md)
**Commit**: `ba7dd15` — auto: session update
**Last updated**: 2026-06-19 23:18:31 +07
**Summary**: auto: session update

## Files changed in this commit (`web2/`)

- `web2/fb-posts/index.html`
- `web2/fb-posts/js/fb-posts-composer.js`

## Last 5 commits touching `web2/`

- `c3d009824` ux(web2/fb): gop 2 nut tao noi dung thanh 1 (AI free + tu fallback mau) - bo du thua _(2026-06-19)_
- `2c73f6a76` feat(web2/fb): chọn NHIỀU SP từ Kho cho AI (caption tổng hợp + tự thêm ảnh) qua shared Web2ProductPicker; sort page Store→House→Ơi→Nè _(2026-06-19)_
- `d70b709d6` feat(vieneu-tts): installer 1-click Win/Mac + serve.py + tự dò máy online (registry) _(2026-06-19)_
- `046821aa0` auto: session update _(2026-06-19)_
- `5333b61ab` refactor(web2/fb): promote FB API client → web2/shared/web2-fb-client.js (1 nguồn, mọi trang đọc vào); alias FBPostsApi; xoá fb-posts/js/fb-posts-api.js _(2026-06-19)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260619-231831-ba7dd15` cho Claude walk chain theo CLAUDE.md protocol.
