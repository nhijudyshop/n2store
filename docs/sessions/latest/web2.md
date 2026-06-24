# Latest Snapshot — `web2/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260624-144222-2fdb66f`
**Session file**: [`./20260624-144222-2fdb66f.md`](../20260624-144222-2fdb66f.md)
**Commit**: `2fdb66f` — auto: session update
**Last updated**: 2026-06-24 14:42:22 +07
**Summary**: auto: session update

## Files changed in this commit (`web2/`)

- `web2/ai-hub/index.html`
- `web2/ai-hub/js/ai-chat.js`
- `web2/ai-hub/js/ai-hub.js`
- `web2/shared/web2-sidebar.js`

## Last 5 commits touching `web2/`

- `2fdb66f8e` auto: session update _(2026-06-24)_
- `d18d10057` fix(web2/ai-hub): enforce Web2 auth on load + graceful 401 (chat history 401 fix) _(2026-06-24)_
- `4810ecb47` feat(printer-settings): nút 1-click tải & cài agent Chấm công DG-600 từ web _(2026-06-24)_
- `66c749a42` fix(web2/avatar): consistent default DiceBear avatar everywhere (footer + table + preview) _(2026-06-24)_
- `c61fecd4f` feat(web2/profile): full DiceBear avatar customizer (schema-driven, all options per style) _(2026-06-24)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260624-144222-2fdb66f` cho Claude walk chain theo CLAUDE.md protocol.
