# Latest Snapshot — `web2/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260623-160910-4b829cc`
**Session file**: [`./20260623-160910-4b829cc.md`](../20260623-160910-4b829cc.md)
**Commit**: `4b829cc` — docs(web2-codemap): regen sau khi thêm Web2ImagePaste shared module
**Last updated**: 2026-06-23 16:09:10 +07
**Summary**: docs(web2-codemap): regen sau khi thêm Web2ImagePaste shared module

## Files changed in this commit (`web2/`)

- `web2/ai-hub/index.html`
- `web2/shared/web2-image-paste.js`

## Last 5 commits touching `web2/`

- `2db98bc13` feat(web2-image): module ảnh dùng chung — Web2ImagePaste (paste/kéo-thả/chọn + nén) + lightbox click-phóng-to catch-all + hover-zoom auto-load _(2026-06-23)_
- `2218178d9` feat(web2-ai): tab Cấu hình thêm mục 'Giọng nói (TTS)' — trạng thái ElevenLabs/Giọng AI Pro/VieNeu (read-only, pool riêng vendor) _(2026-06-23)_
- `42be2eab7` auto: session update _(2026-06-23)_
- `0d6014779` auto: session update _(2026-06-23)_
- `af9eb99af` feat(web2-sidebar): tạo group menu 'AI' — gom Trợ lý AI + Xưởng Video AI; bump sidebar v=20260623ai3 _(2026-06-23)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260623-160910-4b829cc` cho Claude walk chain theo CLAUDE.md protocol.
