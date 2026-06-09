# Latest Snapshot — `web2/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260609-175140-2801011`
**Session file**: [`./20260609-175140-2801011.md`](../20260609-175140-2801011.md)
**Commit**: `2801011` — feat(web2): tem SP — biến thể bake vào giữa QR (Web2QR.centerLabel), đồng bộ bill
**Last updated**: 2026-06-09 17:51:40 +07
**Summary**: feat(web2): tem SP — biến thể bake vào giữa QR (Web2QR.centerLabel), đồng bộ bill

## Files changed in this commit (`web2/`)

- `web2/fastsaleorder-invoice/index.html`
- `web2/printer-settings/index.html`
- `web2/products/index.html`
- `web2/products/js/web2-products-print.js`

## Last 5 commits touching `web2/`

- `28010116d` feat(web2): tem SP — biến thể bake vào giữa QR (Web2QR.centerLabel), đồng bộ bill _(2026-06-09)_
- `602a658e3` feat(web2-kpi): tách Dự báo(draft)/Thực(confirmed) theo status + KPI strip trên native-orders (scope admin/staff) _(2026-06-09)_
- `3db60ad23` feat(web2-kpi): KPI model base-delta (livestream) + 100% (inbox), gộp 1 KPI _(2026-06-09)_
- `04331544d` feat(web2): mã PBH vào giữa QR (Web2QR.centerLabel, EC H) — vẫn quét được _(2026-06-09)_
- `b72e5a85e` auto: session update _(2026-06-09)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260609-175140-2801011` cho Claude walk chain theo CLAUDE.md protocol.
