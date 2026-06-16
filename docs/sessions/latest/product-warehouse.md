# Latest Snapshot — `product-warehouse/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260616-143128-7bd7dbe`
**Session file**: [`./20260616-143128-7bd7dbe.md`](../20260616-143128-7bd7dbe.md)
**Commit**: `7bd7dbe` — fix(auth): tab3 dùng tokenManager (company-correct) thay vì tự login
**Last updated**: 2026-06-16 14:31:28 +07
**Summary**: fix(auth): tab3 dùng tokenManager (company-correct) thay vì tự login

## Files changed in this commit (`product-warehouse/`)

- `product-warehouse/index.html`

## Last 5 commits touching `product-warehouse/`

- `85771c3f7` fix(auth): SwitchCompany theo công ty đang chọn — NJD Live = Company 1 (kho live) _(2026-06-16)_
- `5eef62c12` revert: gỡ bump api-config version nhầm trên 7 file Web 1.0 (Web1⊥Web2) _(2026-06-15)_
- `b5e2ad166` chore(web2): xóa sạch chữ TPOS trong comment/doc Web 2.0 (reword giữ nghĩa) _(2026-06-15)_
- `a2204092d` auto: session update _(2026-06-04)_
- `333852af0` feat(product-warehouse): tìm kiếm theo mã + tên đổ thẳng vào bảng, bỏ dropdown gợi ý _(2026-06-04)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260616-143128-7bd7dbe` cho Claude walk chain theo CLAUDE.md protocol.
