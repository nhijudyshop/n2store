# Latest Snapshot — `web2/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260623-002517-15b846e`
**Session file**: [`./20260623-002517-15b846e.md`](../20260623-002517-15b846e.md)
**Commit**: `15b846e` — docs(web2-audit): Wave 3 done — all per-record history pages complete
**Last updated**: 2026-06-23 00:25:17 +07
**Summary**: Wave 3 done: 🕘 per-record history buttons on 10 sink-wired pages, verified prod

## Files changed in this commit (`web2/`)

- `web2/balance-history/index.html`
- `web2/balance-history/js/web2-bh-render.js`
- `web2/fastsaleorder-delivery/dlv-app.js`
- `web2/fastsaleorder-delivery/index.html`
- `web2/fastsaleorder-refund/index.html`
- `web2/fastsaleorder-refund/rf-app.js`
- `web2/fb-posts/index.html`
- `web2/fb-posts/js/fb-posts-drafts.js`
- `web2/fb-posts/js/fb-posts-list.js`
- `web2/jt-tracking/index.html`
- `web2/jt-tracking/js/jt-tracking-app.js`
- `web2/jt-tracking/js/jt-tracking-render.js`
- `web2/live-control/index.html`
- `web2/live-control/js/live-control.js`
- `web2/order-tags/index.html`
- `web2/order-tags/js/order-tags-app.js`
- `web2/supplier-debt/css/styles.css`
- `web2/supplier-debt/index.html`
- `web2/supplier-debt/js/supplier-debt-render.js`
- `web2/supplier-wallet/css/supplier-wallet.css`
- `web2/supplier-wallet/index.html`
- `web2/supplier-wallet/js/supplier-wallet-render.js`
- `web2/users/index.html`
- `web2/users/js/users-app.js`

## Last 5 commits touching `web2/`

- `e26fa4998` feat(web2-audit): Wave 3 FE — 🕘 per-record history buttons on 10 sink-wired pages _(2026-06-23)_
- `d5d79eb9a` feat(web2-audit): Wave 2 backend — 9 routes → event-sink + entityId purge + entity labels _(2026-06-23)_
- `28cd2d038` feat(web2-audit): per-record history FE — returns + reconcile(combined) + customers 🕘 buttons _(2026-06-22)_
- `6f8a3e67b` fix(web2-video-maker): hiện giọng đã thêm từ kho ngay lần đầu + dedup giọng trùng _(2026-06-22)_
- `b5a57112d` fix(web2-video-maker): tự tắt Tông giọng cho giọng AI Pro/Clone (giữ nguyên gốc) _(2026-06-22)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260623-002517-15b846e` cho Claude walk chain theo CLAUDE.md protocol.
