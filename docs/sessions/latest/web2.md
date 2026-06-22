# Latest Snapshot — `web2/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260623-001510-4a05118`
**Session file**: [`./20260623-001510-4a05118.md`](../20260623-001510-4a05118.md)
**Commit**: `4a05118` — docs(web2-audit): update rollout tracker — Wave 1+2 done, Wave 3 roadmap
**Last updated**: 2026-06-23 00:15:10 +07
**Summary**: per-record history: FE returns/reconcile/customers + Wave 2 backend 9 routes → event-sink + entityId purge

## Files changed in this commit (`web2/`)

- `web2/customers/index.html`
- `web2/customers/js/customers-detail.js`
- `web2/customers/js/customers-render.js`
- `web2/reconcile/css/reconcile.css`
- `web2/reconcile/index.html`
- `web2/reconcile/js/reconcile-render.js`
- `web2/returns/css/returns.css`
- `web2/returns/index.html`
- `web2/returns/js/returns-app.js`
- `web2/returns/js/returns-tabs.js`
- `web2/shared/web2-audit-log.js`
- `web2/shared/web2-sidebar.js`

## Last 5 commits touching `web2/`

- `d5d79eb9a` feat(web2-audit): Wave 2 backend — 9 routes → event-sink + entityId purge + entity labels _(2026-06-23)_
- `28cd2d038` feat(web2-audit): per-record history FE — returns + reconcile(combined) + customers 🕘 buttons _(2026-06-22)_
- `6f8a3e67b` fix(web2-video-maker): hiện giọng đã thêm từ kho ngay lần đầu + dedup giọng trùng _(2026-06-22)_
- `b5a57112d` fix(web2-video-maker): tự tắt Tông giọng cho giọng AI Pro/Clone (giữ nguyên gốc) _(2026-06-22)_
- `1cc23853f` feat(web2-audit-log): per-record history (openRecord modal) + reference native-orders/so-order _(2026-06-22)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260623-001510-4a05118` cho Claude walk chain theo CLAUDE.md protocol.
