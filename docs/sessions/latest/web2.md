# Latest Snapshot — `web2/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260630-185348-6eef43c`
**Session file**: [`./20260630-185348-6eef43c.md`](../20260630-185348-6eef43c.md)
**Commit**: `6eef43c` — auto: session update
**Last updated**: 2026-06-30 18:53:48 +07
**Summary**: auto: session update

## Files changed in this commit (`web2/`)

- `web2/chi-tieu/js/chi-tieu-app.js`
- `web2/clearance/js/clearance.js`
- `web2/fastsaleorder-delivery/dlv-app.js`
- `web2/fastsaleorder-refund/rf-app.js`
- `web2/goods-weight/js/goods-weight.js`
- `web2/purchase-refund/js/purchase-refund-app.js`
- `web2/system/data/web2-dedup-audit.json`

## Last 5 commits touching `web2/`

- `6eef43c84` auto: session update _(2026-06-30)_
- `7e6f56823` feat(web2 sse): Web2SSE.subscribeReload (1 nguồn subscribe+debounce) + wire variants [dedup hoàn chỉnh] _(2026-06-30)_
- `4a5208919` auto: session update _(2026-06-30)_
- `1cc04a641` auto: session update _(2026-06-30)_
- `85f9fe063` refactor(web2 util): gộp money(11)→Web2Format.vnd + escape(76)→Web2Escape.escapeHtml (delegate-with-fallback); date đã-delegate, phone hoãn _(2026-06-30)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260630-185348-6eef43c` cho Claude walk chain theo CLAUDE.md protocol.
