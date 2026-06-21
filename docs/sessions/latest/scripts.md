# Latest Snapshot — `scripts/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260621-212530-f91e1da`
**Session file**: [`./20260621-212530-f91e1da.md`](../20260621-212530-f91e1da.md)
**Commit**: `f91e1da` — docs(dev-log): hệ KPI verified live đa-user (mask pill + scope 401/403/self) + web2 session tooling
**Last updated**: 2026-06-21 21:25:30 +07
**Summary**: docs(dev-log): hệ KPI verified live đa-user (mask pill + scope 401/403/self) + web2 session tooling

## Files changed in this commit (`scripts/`)

- `scripts/save-login-session.js`
- `scripts/save-web2-session.js`

## Last 5 commits touching `scripts/`

- `b80527e5e` chore(test): scripts/save-web2-session.js — lưu phiên WEB 2.0 (web2*auth) riêng → browser test web2 vào thẳng (không phải web1) *(2026-06-21)\_
- `5f31054ad` chore(test): save-login-session cũng login web2 + lưu web2*auth → browser test web2 vào thẳng bằng cookies *(2026-06-21)\_
- `1940a8e00` auto: session update _(2026-06-19)_
- `c55c0f9b9` auto: session update _(2026-06-19)_
- `b6f944eca` chore(live-chat): server.js split DEPLOYED + smoke 3/3 PASS live (web2-realtime, client connected 265 events) _(2026-06-19)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260621-212530-f91e1da` cho Claude walk chain theo CLAUDE.md protocol.
