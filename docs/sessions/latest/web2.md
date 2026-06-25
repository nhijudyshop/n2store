# Latest Snapshot — `web2/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260625-115356-8deb164`
**Session file**: [`./20260625-115356-8deb164.md`](../20260625-115356-8deb164.md)
**Commit**: `8deb164` — feat(web2/ai-assistant): 3 công cụ dùng chung trong widget ✨ (Ghép đồ · Card/Video · AI viết mô tả) + fix bảo mật & race
**Last updated**: 2026-06-25 11:53:56 +07
**Summary**: 3 công cụ AI dùng chung trong widget ✨ (ghép đồ/card-video/viết mô tả) + fix XSS openTab + race lazy-load

## Files changed in this commit (`web2/`)

- `web2/ai-hub/ai-hub.css`
- `web2/ai-hub/index.html`
- `web2/ai-hub/js/ai-html.js`
- `web2/ai-hub/js/ai-image.js`
- `web2/ai-hub/js/ai-tryon.js`
- `web2/shared/web2-ai-assistant.js`
- `web2/shared/web2-ai-describe.js`
- `web2/shared/web2-ai-page-registry.js`
- `web2/shared/web2-content-maker.js`
- `web2/shared/web2-sidebar.js`
- `web2/shared/web2-tryon.js`
- `web2/system/data/web2-modules.json`

## Last 5 commits touching `web2/`

- `8deb16492` feat(web2/ai-assistant): 3 công cụ dùng chung trong widget ✨ (Ghép đồ · Card/Video · AI viết mô tả) + fix bảo mật & race _(2026-06-25)_
- `09a1d6dec` feat(web2/ai-assistant): đọc DB thông minh (reducer) + 16 DB*SOURCES mới (audit 23 trang) *(2026-06-25)\_
- `4625b4aec` feat(web2/ai-assistant): AI đọc DATABASE qua API app (Option B) — trang phân trang thấy full bảng _(2026-06-25)_
- `3cdebeae8` fix(web2/ai-assistant): gợi ý luôn hiện (thanh chip cố định, không mất sau khi chat) _(2026-06-25)_
- `c8c04991f` feat(web2/ai-assistant): gợi ý + đọc data sâu + model theo trang + streaming + fix bug _(2026-06-25)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260625-115356-8deb164` cho Claude walk chain theo CLAUDE.md protocol.
