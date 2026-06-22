# Latest Snapshot — `docs/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260623-014742-4be494a`
**Session file**: [`./20260623-014742-4be494a.md`](../20260623-014742-4be494a.md)
**Commit**: `4be494a` — fix(web2): bỏ Reset STT + fix khe hở 8px thanh menu (32 trang) + gỡ chữ TPOS + chặn tạo PBH tay
**Last updated**: 2026-06-23 01:47:42 +07
**Summary**: PBH gọn(bỏ ResetSTT)+fix khe 8px menu 32 trang+gỡ chữ TPOS web2+chặn tạo PBH tay(410)

## Files changed in this commit (`docs/`)

- `docs/api-samples/FastPurchaseOrder.txt`
- `docs/api-samples/FastSaleOrder_SaleOnlineRes_DecreaseAmount.txt`
- `docs/api-samples/FastSaleOrder_SaleOnlineRes_true.txt`
- `docs/api-samples/InsertListOrderModel.txt`
- `docs/api-samples/ProductVariants.txt`
- `docs/api-samples/PurchaseByExcel.txt`
- `docs/api-samples/bill_template.txt`
- `docs/api-samples/excelGiaMua.txt`
- `docs/api-samples/fetch1.txt`
- `docs/api-samples/fetch2.txt`
- `docs/api-samples/fetch3.txt`
- `docs/api-samples/fetch4.txt`
- `docs/api-samples/fetch5.txt`
- `docs/api-samples/html_bill.txt`
- `docs/api-samples/supplier-debt-response.txt`
- `docs/dev-log.md`
- `docs/web2/LIVE-CAMPAIGN-TPOS-API.md`
- `docs/web2/MODAL-ANTI-LAG.md`
- `docs/web2/UI-FIRST.md`
- `docs/web2/WEB2-CODEMAP.md`
- `docs/web2/WEB2-INDEX.md`
- `docs/web2/ZALO-CHAT-BUILD-SPEC.md`
- `docs/web2/web2-codemap.json`

## Last 5 commits touching `docs/`

- `4be494aaf` fix(web2): bỏ Reset STT + fix khe hở 8px thanh menu (32 trang) + gỡ chữ TPOS + chặn tạo PBH tay _(2026-06-23)_
- `22ad55c06` chore(session): RESUME:20260623-005037-c0681a9 _(2026-06-23)_
- `c0681a9df` chore(web2): xoá trang product-category (Nhóm sản phẩm) + khôi phục Kho Biến Thể (108) _(2026-06-23)_
- `2ac69c8cd` chore(session): RESUME:20260623-002517-15b846e _(2026-06-23)_
- `15b846e2a` docs(web2-audit): Wave 3 done — all per-record history pages complete _(2026-06-23)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260623-014742-4be494a` cho Claude walk chain theo CLAUDE.md protocol.
