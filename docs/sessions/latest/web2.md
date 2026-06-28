# Latest Snapshot — `web2/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260628-233732-88ae387`
**Session file**: [`./20260628-233732-88ae387.md`](../20260628-233732-88ae387.md)
**Commit**: `88ae387` — fix(so-order): import "Đã nhận" → draft (tránh row kẹt) + dev-log Task 4 verified
**Last updated**: 2026-06-28 23:37:32 +07
**Summary**: Auto-gán unit theo giỏ STT (ít lịch sử→seq) + In tem per-unit + bỏ nút Gán + import fix — verified live

## Files changed in this commit (`web2/`)

- `web2/products/index.html`
- `web2/products/js/web2-products-actions.js`
- `web2/products/js/web2-products-render.js`
- `web2/unit-scan/index.html`
- `web2/unit-scan/js/unit-scan.js`

## Last 5 commits touching `web2/`

- `85d908fe1` feat(web2-products,unit-scan): per-unit In tem + bỏ nút Gán thủ công (gán auto theo giỏ) _(2026-06-28)_
- `f3fe30c5c` fix(unit-scan): camera den moi trinh duyet - id #scanHost{display:block} de .w2bc{display:flex} cua scanner lam stage sap 0px; chi giu width/height; relax retry 2.5->5s; bump v20260628d _(2026-06-28)_
- `f50644a60` feat(permissions+scan): đăng ký phân quyền unit-scan + clearance; fix camera đen trên PWA _(2026-06-28)_
- `81ef7612a` fix(web2-vn-address): gate ghi city/ward theo isReady() — chặn data-loss cửa sổ đang-tải _(2026-06-28)_
- `ac6e7b042` auto: session update _(2026-06-28)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260628-233732-88ae387` cho Claude walk chain theo CLAUDE.md protocol.
