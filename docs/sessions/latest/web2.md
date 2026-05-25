# Latest Snapshot — `web2/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260525-104428-29de8f9`
**Session file**: [`./20260525-104428-29de8f9.md`](../20260525-104428-29de8f9.md)
**Commit**: `29de8f9` — auto: session update
**Last updated**: 2026-05-25 10:44:28 +07
**Summary**: auto: session update

## Files changed in this commit (`web2/`)

- `web2/live-campaign/index.html`
- `web2/live-campaign/js/live-campaign-api.js`
- `web2/live-campaign/js/live-campaign-app.js`

## Last 5 commits touching `web2/`

- `29de8f9e7` auto: session update _(2026-05-25)_
- `ecce60053` feat(web2): TPOS-clone Chiến dịch Live page với sync 2 chiều TPOS _(2026-05-25)_
- `11182caf3` feat(web2/products): In tem sản phẩm — WEB 2.0 dedicated module, no TPOS API _(2026-05-25)_
- `5798b95ba` auto: session update _(2026-05-25)_
- `5e5ec5372` fix(web2/products SSE): tách _sseReloadTimer + \_sseUsageTimer riêng _(2026-05-23)\_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260525-104428-29de8f9` cho Claude walk chain theo CLAUDE.md protocol.
