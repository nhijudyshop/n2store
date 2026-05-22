# Latest Snapshot — `web2/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260522-141653-8c818ce`
**Session file**: [`./20260522-141653-8c818ce.md`](../20260522-141653-8c818ce.md)
**Commit**: `8c818ce` — auto: session update
**Last updated**: 2026-05-22 14:16:53 +07
**Summary**: auto: session update

## Files changed in this commit (`web2/`)

- `web2/shared/web2-product-code.js`

## Last 5 commits touching `web2/`

- `8639f228f` feat(web2/product-code): update rule shop — 6 keyword + MM fallback + HC1 collision + SP default _(2026-05-22)_
- `6be61baf8` revert(web2): gỡ F10 variants-matrix — bỏ cách tạo mã SP auto <base>-<size>-<color> _(2026-05-22)_
- `bf4defa5d` auto: session update _(2026-05-22)_
- `0cdca0fbf` fix(web2): variants-matrix dùng v.value/groupName (API trả vậy) + ẩn mobile hamburger ở desktop _(2026-05-22)_
- `66595d417` fix(balance-history): Live Mode Xác nhận đẩy GD qua Kế Toán Chờ Duyệt _(2026-05-22)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260522-141653-8c818ce` cho Claude walk chain theo CLAUDE.md protocol.
