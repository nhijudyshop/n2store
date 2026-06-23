# Latest Snapshot — `web2/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260623-164050-b3ae8c0`
**Session file**: [`./20260623-164050-b3ae8c0.md`](../20260623-164050-b3ae8c0.md)
**Commit**: `b3ae8c0` — feat(web2-image): Web2ImagePaste.enhance() — mọi Choose File ảnh dán Ctrl+V + kéo-thả
**Last updated**: 2026-06-23 16:40:50 +07
**Summary**: feat(web2-image): Web2ImagePaste.enhance() — mọi Choose File ảnh dán Ctrl+V + kéo-thả

## Files changed in this commit (`web2/`)

- `web2/ai-hub/index.html`
- `web2/fb-posts/index.html`
- `web2/photo-studio/index.html`
- `web2/shared/web2-image-paste.js`
- `web2/shared/web2-sidebar.js`
- `web2/video-maker/index.html`

## Last 5 commits touching `web2/`

- `b3ae8c021` feat(web2-image): Web2ImagePaste.enhance() — mọi Choose File ảnh dán Ctrl+V + kéo-thả _(2026-06-23)_
- `d33d61f3f` auto: session update _(2026-06-23)_
- `11b139eb0` feat(web2-printer): 2 chức năng tự chọn sẵn máy mặc định theo tên (PBH Huyền+Hạnh+Còi+Hồng, tem 2 mã SP) _(2026-06-23)_
- `2db98bc13` feat(web2-image): module ảnh dùng chung — Web2ImagePaste (paste/kéo-thả/chọn + nén) + lightbox click-phóng-to catch-all + hover-zoom auto-load _(2026-06-23)_
- `2218178d9` feat(web2-ai): tab Cấu hình thêm mục 'Giọng nói (TTS)' — trạng thái ElevenLabs/Giọng AI Pro/VieNeu (read-only, pool riêng vendor) _(2026-06-23)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260623-164050-b3ae8c0` cho Claude walk chain theo CLAUDE.md protocol.
