# Latest Snapshot — `facebook-services/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260616-003508-274721b`
**Session file**: [`./20260616-003508-274721b.md`](../20260616-003508-274721b.md)
**Commit**: `274721b` — chore: gỡ HẲN autofb.pro khỏi toàn project (shop không xài nữa)
**Last updated**: 2026-06-16 00:35:08 +07
**Summary**: chore: gỡ HẲN autofb.pro khỏi toàn project (shop không xài nữa)

## Files changed in this commit (`facebook-services/`)

- `facebook-services/css/facebook-services.css`
- `facebook-services/index.html`
- `facebook-services/js/facebook-services.js`

## Last 5 commits touching `facebook-services/`

- `274721baf` chore: gỡ HẲN autofb.pro khỏi toàn project (shop không xài nữa) _(2026-06-16)_
- `4a59600b9` fix(pancake): PIVOT sang query-param ?client*key (CORS) — X-API-Key header bị worker preflight chặn *(2026-06-13)\_
- `342b08713` fix(pancake): áp Fix B vào file LIVE shared/js/pancake-token-manager.js + bump ?v (fix lỗi 102 chat Web 1.0) _(2026-06-13)_
- `248532b73` feat(web2): ENFORCE-PREP — wire x-web2-token toàn bộ client gọi route soft-gated _(2026-06-12)_
- `7cfb01320` chore(cache-bust): opt-in toàn bộ 88 pages còn lại vào ?v=20260521b _(2026-05-21)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260616-003508-274721b` cho Claude walk chain theo CLAUDE.md protocol.
