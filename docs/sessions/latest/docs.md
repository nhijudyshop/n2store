# Latest Snapshot — `docs/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260626-135928-29452c1`
**Session file**: [`./20260626-135928-29452c1.md`](../20260626-135928-29452c1.md)
**Commit**: `29452c1` — fix(purchase-orders): tạo đơn với SP cũ (lấy từ Kho) qua được Chờ mua, không kẹt Nháp
**Last updated**: 2026-06-26 13:59:28
**Summary**: fix(purchase-orders): tạo đơn SP cũ từ Kho qua được Chờ mua (không kẹt Nháp)

## Files changed in this commit (`docs/`)
- `docs/dev-log.md`

## Last 5 commits touching `docs/`
- `29452c181` fix(purchase-orders): tạo đơn với SP cũ (lấy từ Kho) qua được Chờ mua, không kẹt Nháp _(2026-06-26)_
- `c49ad95de` chore(session): RESUME:20260626-134911-7470460 _(2026-06-26)_
- `7470460f6` feat(issue-tracking): nút Xóa phiếu (🗑️) cho phiếu đã hoàn tất/đã hủy/chờ đối soát _(2026-06-26)_
- `34921d594` feat(so-order): Phase 3a — ô Biến Thể inline dùng Web2VariantPicker (nhiều biến thể theo món) _(2026-06-26)_
- `e4ea4af7e` feat(web2/shared): Phase 2 — Web2VariantPicker (biến thể theo món, dùng chung) _(2026-06-26)_

---
**Để tiếp tục context trong session mới:**
1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260626-135928-29452c1` cho Claude walk chain theo CLAUDE.md protocol.
