# Latest Snapshot — `web2/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260624-144543-8d229d4`
**Session file**: [`./20260624-144543-8d229d4.md`](../20260624-144543-8d229d4.md)
**Commit**: `8d229d4` — auto: session update
**Last updated**: 2026-06-24 14:45:43 +07
**Summary**: auto: session update

## Files changed in this commit (`web2/`)

- `web2/ai-assistant/index.html`
- `web2/ai-assistant/js/ai-assistant.js`
- `web2/printer-settings/index.html`
- `web2/shared/web2-ai-assistant.js`
- `web2/shared/web2-attendance-installer.js`

## Last 5 commits touching `web2/`

- `8d229d41b` auto: session update _(2026-06-24)_
- `4883ab4ae` feat(web2): per-page floating AI assistant (reads visible page data -> free AI) + management page _(2026-06-24)_
- `2fdb66f8e` auto: session update _(2026-06-24)_
- `d18d10057` fix(web2/ai-hub): enforce Web2 auth on load + graceful 401 (chat history 401 fix) _(2026-06-24)_
- `4810ecb47` feat(printer-settings): nút 1-click tải & cài agent Chấm công DG-600 từ web _(2026-06-24)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260624-144543-8d229d4` cho Claude walk chain theo CLAUDE.md protocol.
