# Latest Snapshot — `web2/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260618-163127-4aea4b7`
**Session file**: [`./20260618-163127-4aea4b7.md`](../20260618-163127-4aea4b7.md)
**Commit**: `4aea4b7` — fix(web2/money): vá 5 HIGH + 3 MED rủi ro tiền NCC + ví khách
**Last updated**: 2026-06-18 16:31:27 +07
**Summary**: fix(web2/money): vá 5 HIGH + 3 MED rủi ro tiền NCC + ví khách

## Files changed in this commit (`web2/`)

- `web2/purchase-refund/js/purchase-refund-app.js`
- `web2/supplier-debt/index.html`
- `web2/supplier-debt/js/supplier-debt-app.js`
- `web2/supplier-wallet/js/supplier-wallet-app.js`

## Last 5 commits touching `web2/`

- `4aea4b7b0` fix(web2/money): vá 5 HIGH + 3 MED rủi ro tiền NCC + ví khách _(2026-06-18)_
- `e5516f263` auto: session update _(2026-06-18)_
- `f6a935af6` fix(purchase-refund): bố cục lại modal trả hàng — không tràn viền _(2026-06-18)_
- `0a8e5f397` feat(purchase-refund): modal trả cả đơn = full browser (96vw×94vh, flex layout) _(2026-06-18)_
- `a4358ba0f` feat(purchase-refund): click thumbnail SP → xem ảnh FULL (lightbox, không crop) _(2026-06-18)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260618-163127-4aea4b7` cho Claude walk chain theo CLAUDE.md protocol.
