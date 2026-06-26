# Latest Snapshot — `web2/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260626-143745-9b51f2d`
**Session file**: [`./20260626-143745-9b51f2d.md`](../20260626-143745-9b51f2d.md)
**Commit**: `9b51f2d` — chore(web2): SUP_SEP dùng escape '\u0000' thay NUL byte (file binary → text, grep/diff lại được)
**Last updated**: 2026-06-26 14:37:45 +07
**Summary**: Báo cáo kho Web 2.0: mua vào/bán ra/chưa nhận theo Địa danh→NCC→SP, lọc ngày, adversarial review fixed

## Files changed in this commit (`web2/`)

- `web2/report-warehouse/index.html`

## Last 5 commits touching `web2/`

- `a7866d391` feat(web2): Báo cáo kho thêm ĐỊA DANH (cha NCC+SP) + fix adversarial review _(2026-06-26)_
- `e64754570` auto: session update _(2026-06-26)_
- `556aa7965` refactor(web2-variant-picker): genName dùng toLocaleUpperCase('vi-VN') (defensive) _(2026-06-26)_
- `bb894ec87` feat(so-order): tự tạo TÊN SP từ biến thể đã chọn (sửa được) _(2026-06-26)_
- `f2d18996a` feat(web2): Báo cáo kho — mua vào (Sổ Order) vs bán ra (PBH) theo SP + NCC, cột Chưa nhận hàng _(2026-06-26)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260626-143745-9b51f2d` cho Claude walk chain theo CLAUDE.md protocol.
