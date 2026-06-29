# Latest Snapshot — `web2/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260629-085454-9fd3316`
**Session file**: [`./20260629-085454-9fd3316.md`](../20260629-085454-9fd3316.md)
**Commit**: `9fd3316` — feat(unit-scan): quét tem hiện số liệu live SP (Bán/KH mới/NCC/Còn/Tồn) như live-control
**Last updated**: 2026-06-29 08:54:54 +07
**Summary**: feat(unit-scan): quét tem hiện số liệu live SP (Bán/KH mới/NCC/Còn/Tồn) như live-control

## Files changed in this commit (`web2/`)

- `web2/unit-scan/index.html`
- `web2/unit-scan/js/unit-scan.js`

## Last 5 commits touching `web2/`

- `9fd3316f6` feat(unit-scan): quét tem hiện số liệu live SP (Bán/KH mới/NCC/Còn/Tồn) như live-control _(2026-06-29)_
- `8b49f216f` fix(web2/ai-assistant,login): phiên hết hạn → thông báo rõ + redirect chuẩn _(2026-06-29)_
- `da9564b40` auto: session update _(2026-06-29)_
- `f789f1642` feat(supplier-debt,native-orders): gate admin TT NCC + hiện mã đơn vị "-xxx" trong đơn _(2026-06-29)_
- `85d908fe1` feat(web2-products,unit-scan): per-unit In tem + bỏ nút Gán thủ công (gán auto theo giỏ) _(2026-06-28)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260629-085454-9fd3316` cho Claude walk chain theo CLAUDE.md protocol.
