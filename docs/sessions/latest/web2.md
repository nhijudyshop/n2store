# Latest Snapshot — `web2/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260628-145932-ca6df46`
**Session file**: [`./20260628-145932-ca6df46.md`](../20260628-145932-ca6df46.md)
**Commit**: `ca6df46` — feat(web2/system): sổ tay SSE trong tab SSE + fix 4 gap subscribe web2:so-order (supplier-debt/purchase-refund/live-chat/dashboard)
**Last updated**: 2026-06-28 14:59:32 +07
**Summary**: feat(web2/system): sổ tay SSE trong tab SSE + fix 4 gap subscribe web2:so-order (supplier-debt/purchase-refund/live...

## Files changed in this commit (`web2/`)

- `web2/dashboard/index.html`
- `web2/purchase-refund/js/purchase-refund-app.js`
- `web2/supplier-debt/js/supplier-debt-app.js`
- `web2/system/css/system.css`
- `web2/system/data/web2-sse-registry.json`
- `web2/system/index.html`
- `web2/system/js/system-sse-registry.js`
- `web2/system/js/system-sse.js`

## Last 5 commits touching `web2/`

- `ca6df464a` feat(web2/system): sổ tay SSE trong tab SSE + fix 4 gap subscribe web2:so-order (supplier-debt/purchase-refund/live-chat/dashboard) _(2026-06-28)_
- `4383e15d2` feat(ai-widget): full-data theo cache browser (Web2SmartCache/IDB) + freshness gate + nút nạp _(2026-06-28)_
- `e1c137b99` feat(web2/system): tab 'Gợi ý AI' — quản lý gợi ý + accessor widget AI theo từng trang _(2026-06-28)_
- `d2b9c0b6b` auto: session update _(2026-06-28)_
- `20c99cbbd` feat(sepay-invoices): push snapshot từ máy IP nhà + link trực tiếp khi Cloudflare chặn _(2026-06-28)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260628-145932-ca6df46` cho Claude walk chain theo CLAUDE.md protocol.
