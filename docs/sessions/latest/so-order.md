# Latest Snapshot — `so-order/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260628-145932-ca6df46`
**Session file**: [`./20260628-145932-ca6df46.md`](../20260628-145932-ca6df46.md)
**Commit**: `ca6df46` — feat(web2/system): sổ tay SSE trong tab SSE + fix 4 gap subscribe web2:so-order (supplier-debt/purchase-refund/live-chat/dashboard)
**Last updated**: 2026-06-28 14:59:32 +07
**Summary**: feat(web2/system): sổ tay SSE trong tab SSE + fix 4 gap subscribe web2:so-order (supplier-debt/purchase-refund/live...

## Files changed in this commit (`so-order/`)

- `so-order/index.html`
- `so-order/js/so-order-barcode.js`
- `so-order/js/so-order-receive.js`

## Last 5 commits touching `so-order/`

- `88aeedf1c` fix(so-order): in tem sau nhận hàng ra giá 0 — lấy giá bán dòng order/Kho SP (fallback theo code) _(2026-06-28)_
- `c4da6cce1` fix(web2): HET*HANG review-fixes — preserve manual pause + parent badge + refund paths *(2026-06-28)\_
- `73195acbd` auto: session update _(2026-06-28)_
- `32a6ce594` fix(so-order): picker không auto-đặt tên cho dòng đã chọn SP (matchedCode) _(2026-06-28)_
- `71b9d98e9` auto: session update _(2026-06-28)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260628-145932-ca6df46` cho Claude walk chain theo CLAUDE.md protocol.
