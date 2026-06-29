# Latest Snapshot — `web2/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260629-073740-f789f16`
**Session file**: [`./20260629-073740-f789f16.md`](../20260629-073740-f789f16.md)
**Commit**: `f789f16` — feat(supplier-debt,native-orders): gate admin TT NCC + hiện mã đơn vị "-xxx" trong đơn
**Last updated**: 2026-06-29 07:37:40 +07
**Summary**: feat(supplier-debt,native-orders): gate admin TT NCC + hiện mã đơn vị "-xxx" trong đơn

## Files changed in this commit (`web2/`)

- `web2/supplier-debt/index.html`
- `web2/supplier-debt/js/supplier-debt-actions.js`

## Last 5 commits touching `web2/`

- `f789f1642` feat(supplier-debt,native-orders): gate admin TT NCC + hiện mã đơn vị "-xxx" trong đơn _(2026-06-29)_
- `85d908fe1` feat(web2-products,unit-scan): per-unit In tem + bỏ nút Gán thủ công (gán auto theo giỏ) _(2026-06-28)_
- `f3fe30c5c` fix(unit-scan): camera den moi trinh duyet - id #scanHost{display:block} de .w2bc{display:flex} cua scanner lam stage sap 0px; chi giu width/height; relax retry 2.5->5s; bump v20260628d _(2026-06-28)_
- `f50644a60` feat(permissions+scan): đăng ký phân quyền unit-scan + clearance; fix camera đen trên PWA _(2026-06-28)_
- `81ef7612a` fix(web2-vn-address): gate ghi city/ward theo isReady() — chặn data-loss cửa sổ đang-tải _(2026-06-28)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260629-073740-f789f16` cho Claude walk chain theo CLAUDE.md protocol.
