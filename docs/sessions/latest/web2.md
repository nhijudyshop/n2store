# Latest Snapshot — `web2/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260624-103026-f0637de`
**Session file**: [`./20260624-103026-f0637de.md`](../20260624-103026-f0637de.md)
**Commit**: `f0637de` — feat(web2): expand AI presets shared module — +6 chat roles, dual global, sidebar autoload
**Last updated**: 2026-06-24 10:30:26 +07
**Summary**: web2: promote AI presets shared module + 13 vai trò chat + rename env WEB2_NANOBANANA_API_KEY + audit 9 repos

## Files changed in this commit (`web2/`)

- `web2/ai-hub/index.html`
- `web2/shared/web2-ai-presets.js`
- `web2/shared/web2-sidebar.js`

## Last 5 commits touching `web2/`

- `f0637de38` feat(web2): expand AI presets shared module — +6 chat roles, dual global, sidebar autoload _(2026-06-24)_
- `635a74d5b` refactor(web2): promote AI presets to shared module + thêm 6 vai trò chat (awesome-chatgpt-prompts) _(2026-06-24)_
- `00347f3cd` feat(web2/ai-hub): tách key chat/Nano Banana + gate quyền + quota + lưu ảnh/prompt/chat + thư viện mẫu _(2026-06-24)_
- `6bd2facae` feat(web2): ai-hub reuse Web2VideoStock free image/video picker in Tạo ảnh + Ghép đồ _(2026-06-24)_
- `dddf5f64a` feat(web2): ai-hub 'Ghép đồ / Thử đồ' — 1 person + N garment images + scene prompt → Gemini multi-image composite _(2026-06-24)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260624-103026-f0637de` cho Claude walk chain theo CLAUDE.md protocol.
