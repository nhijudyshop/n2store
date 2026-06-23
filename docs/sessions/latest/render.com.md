# Latest Snapshot — `render.com/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260623-124731-0f689e4`
**Session file**: [`./20260623-124731-0f689e4.md`](../20260623-124731-0f689e4.md)
**Commit**: `0f689e4` — fix(web2-attendance): auto-tạo device-user khi nhập punch (ADMS/import/manual hiện ngay bảng công)
**Last updated**: 2026-06-23 12:47:31 +07
**Summary**: fix(web2-attendance): auto-tạo device-user khi nhập punch (ADMS/import/manual hiện ngay bảng công)

## Files changed in this commit (`render.com/`)

- `render.com/routes/web2-attendance.js`

## Last 5 commits touching `render.com/`

- `0f689e444` fix(web2-attendance): auto-tạo device-user khi nhập punch (ADMS/import/manual hiện ngay bảng công) _(2026-06-23)_
- `fadcac906` feat(web2-admin): group Quản trị viên (admin-only) + Chấm công DG-600 + Quản lý chi tiêu _(2026-06-23)_
- `45530fad2` fix(purchase-refund): quick-refund cap amount theo cost so-order (đồng bộ /tx #2) _(2026-06-23)_
- `ddbe635c9` fix(web2-supplier-wallet): #2 — /tx recompute amount theo cost so-order (chống mint ledger NCC) _(2026-06-23)_
- `d94047ab9` fix(web2-returns): over-restock khi thu*ve_1_phan trên PBH rồi cancel (returned_line_qty) *(2026-06-23)\_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260623-124731-0f689e4` cho Claude walk chain theo CLAUDE.md protocol.
