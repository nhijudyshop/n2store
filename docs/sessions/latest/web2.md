# Latest Snapshot — `web2/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260625-213134-340ec94`
**Session file**: [`./20260625-213134-340ec94.md`](../20260625-213134-340ec94.md)
**Commit**: `340ec94` — auto: session update
**Last updated**: 2026-06-25 21:31:34 +07
**Summary**: auto: session update

## Files changed in this commit (`web2/`)

- `web2/ai-assistant/index.html`
- `web2/ai-assistant/js/ai-assistant.js`
- `web2/cham-cong/index.html`
- `web2/cham-cong/js/cham-cong-app.js`
- `web2/cham-cong/js/cham-cong-employees.js`
- `web2/cham-cong/js/cham-cong-payroll.js`
- `web2/ck-dashboard/index.html`
- `web2/ck-dashboard/js/ck-dashboard-app.js`
- `web2/fb-ads-stats/index.html`
- `web2/fb-ads-stats/js/fb-ads-stats.js`
- `web2/fb-insights/index.html`
- `web2/fb-insights/js/fb-insights.js`
- `web2/pancake-settings/index.html`
- `web2/pancake-settings/js/pancake-settings-api.js`
- `web2/purchase-refund/index.html`
- `web2/purchase-refund/js/purchase-refund-api.js`
- `web2/purchase-refund/js/purchase-refund-render.js`
- `web2/report-delivery/index.html`
- `web2/system/index.html`
- `web2/system/js/system-services.js`
- `web2/system/js/system-sse.js`
- `web2/users-permissions/index.html`

## Last 5 commits touching `web2/`

- `340ec94bd` auto: session update _(2026-06-25)_
- `883445c59` feat(web2): GitHub-style skeleton loading + global interaction polish _(2026-06-25)_
- `25b23634c` auto: session update _(2026-06-25)_
- `37bb8e846` auto: session update _(2026-06-25)_
- `501cf9933` fix(web2/ai-assistant): ẩn khối <think> reasoning model khỏi chat _(2026-06-25)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260625-213134-340ec94` cho Claude walk chain theo CLAUDE.md protocol.
