# Latest Snapshot — `inventory-tracking/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260524-101710-72dc224`
**Session file**: [`./20260524-101710-72dc224.md`](../20260524-101710-72dc224.md)
**Commit**: `72dc224` — test(snap): expose debug accessors + bench-iframe-capture script
**Last updated**: 2026-05-24 10:17:10 +07
**Summary**: test(snap): expose debug accessors + bench-iframe-capture script

## Files changed in this commit (`inventory-tracking/`)

- `inventory-tracking/css/modern.css`
- `inventory-tracking/js/table-renderer.js`

## Last 5 commits touching `inventory-tracking/`

- `97df329e1` feat(inventory): đổi Tổng TT thành Số dư (prev Còn dư + payments-in-window) per row _(2026-05-24)_
- `37999a3b9` feat(inventory): row 2 thêm Tổng TT + đổi công thức Còn dư = TT - HD - CP (per đợt) _(2026-05-24)_
- `fcc258571` feat(inventory/header): tách 2 hàng — Ngày+Đợt+Kiện row 1, Tổng HĐ+CP+Còn dư row 2 _(2026-05-24)_
- `fc6799241` fix(inventory/header): ép data 1 hàng — nowrap + overflow-x scroll cho row dài _(2026-05-24)_
- `9f2389d61` fix(inventory): bỏ ' CNY' suffix khỏi header — giữ $ prefix _(2026-05-24)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260524-101710-72dc224` cho Claude walk chain theo CLAUDE.md protocol.
