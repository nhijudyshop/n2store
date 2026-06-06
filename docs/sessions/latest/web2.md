# Latest Snapshot — `web2/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260606-185212-4c06d93`
**Session file**: [`./20260606-185212-4c06d93.md`](../20260606-185212-4c06d93.md)
**Commit**: `4c06d93` — merge origin/main: barcode crisp fix + CK ví; KPI NET + edit-modal (dev-log both)
**Last updated**: 2026-06-06 18:52:12 +07
**Summary**: merge origin/main: barcode crisp fix + CK ví; KPI NET + edit-modal (dev-log both)

## Files changed in this commit (`web2/`)

- `web2/products/js/web2-products-print.js`

## Last 5 commits touching `web2/`

- `207dbc12c` fix(web2-products-print): barcode crisp dot-aligned (quét được mã dài) + giữ khổ 2 Tem 25mm mặc định _(2026-06-06)_
- `723c7d924` feat(web2-products-print): đặt khổ tem rộng 50×30mm làm mặc định _(2026-06-06)_
- `a0418691e` feat(web2-products-print): cảnh báo mã quá dài cho khổ tem + thêm tem rộng 50mm _(2026-06-06)_
- `214bc43ee` feat(web2-reconcile): ẩn lịch sử mặc định (toggle) + ưu tiên list SP + scan lỗi liệt kê mã _(2026-06-06)_
- `98f584ada` feat(web2/partner-customer): bỏ cột Nợ hiện tại (th/td/toggle/CSS + export Excel) — số dư ví đã hiện qua pill cạnh SĐT _(2026-06-06)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260606-185212-4c06d93` cho Claude walk chain theo CLAUDE.md protocol.
