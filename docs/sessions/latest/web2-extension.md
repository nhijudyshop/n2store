# Latest Snapshot — `web2-extension/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260521-111833-ca2a95d`
**Session file**: [`./20260521-111833-ca2a95d.md`](../20260521-111833-ca2a95d.md)
**Commit**: `ca2a95d` — docs(web2-extension): dev-log entry cho fork + --ext flag
**Last updated**: 2026-05-21 11:18:33 +07
**Summary**: docs(web2-extension): dev-log entry cho fork + --ext flag

## Files changed in this commit (`web2-extension/`)

- `web2-extension/README.md`
- `web2-extension/STORE-LISTING.md`
- `web2-extension/_metadata/generated_indexed_rulesets/_ruleset1`
- `web2-extension/background/facebook/commenter.js`
- `web2-extension/background/facebook/doc-id-interceptor.js`
- `web2-extension/background/facebook/global-id.js`
- `web2-extension/background/facebook/sender.js`
- `web2-extension/background/facebook/session.js`
- `web2-extension/background/facebook/uploader.js`
- `web2-extension/background/facebook/utils.js`
- `web2-extension/background/server/notifications.js`
- `web2-extension/background/server/sse-listener.js`
- `web2-extension/background/service-worker.js`
- `web2-extension/background/sync/badge.js`
- `web2-extension/background/sync/storage.js`
- `web2-extension/content/contentscript.js`
- `web2-extension/content/tpos-interceptor.js`
- `web2-extension/images/icon-128.png`
- `web2-extension/images/icon-16.png`
- `web2-extension/images/icon-32.png`
- `web2-extension/images/icon-48.png`
- `web2-extension/manifest.json`
- `web2-extension/pages/phone.html`
- `web2-extension/pages/phone.js`
- `web2-extension/pages/settings.html`
- `web2-extension/pages/settings.js`
- `web2-extension/popup/popup.css`
- `web2-extension/popup/popup.html`
- `web2-extension/popup/popup.js`
- `web2-extension/rules.json`
- `web2-extension/shared/config.js`
- `web2-extension/shared/constants.js`
- `web2-extension/shared/logger.js`
- `web2-extension/store-assets.html`

## Last 5 commits touching `web2-extension/`

- `62b4ac76` feat(web2-extension): fork n2store-extension thành Web 2.0 Messenger v2.0.0 + browser-test --ext flag _(2026-05-21)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260521-111833-ca2a95d` cho Claude walk chain theo CLAUDE.md protocol.
