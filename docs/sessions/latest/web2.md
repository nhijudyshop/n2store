# Latest Snapshot — `web2/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260519-154003-afade1d`
**Session file**: [`./20260519-154003-afade1d.md`](../20260519-154003-afade1d.md)
**Commit**: `afade1d` — feat(bill+reconcile): barcode PBH trên bill có thể quét → reconcile tự mở PBH
**Last updated**: 2026-05-19 15:40:03 +07
**Summary**: feat(bill+reconcile): barcode PBH trên bill có thể quét → reconcile tự mở PBH

## Files changed in this commit (`web2/`)

- `web2/fastsaleorder-invoice/index.html`
- `web2/reconcile/index.html`
- `web2/reconcile/js/reconcile-app.js`
- `web2/shared/web2-bill-service.js`

## Last 5 commits touching `web2/`

- `afade1d8` feat(bill+reconcile): barcode PBH trên bill có thể quét → reconcile tự mở PBH _(2026-05-19)_
- `5e460acf` fix(web2/reconcile): hide empty-state when list has items (CSS display:flex overrode [hidden]) _(2026-05-19)_
- `956084fa` fix(web2/reconcile): mount sidebar via Web2Sidebar.mount + redeploy CF Worker _(2026-05-19)_
- `a7133271` feat(web2/reconcile): Phase 1 MVP — Đối soát đóng gói PBH (scan + pack + ship + deliver) _(2026-05-19)_
- `9f628163` feat(native-orders): tách nút 'Gộp đơn' riêng + redesign bill 80mm đẹp hơn _(2026-05-19)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260519-154003-afade1d` cho Claude walk chain theo CLAUDE.md protocol.
