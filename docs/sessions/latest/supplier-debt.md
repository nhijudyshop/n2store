# Latest Snapshot — `supplier-debt/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260606-094645-6032f12`
**Session file**: [`./20260606-094645-6032f12.md`](../20260606-094645-6032f12.md)
**Commit**: `6032f12` — fix(supplier-debt): hóa đơn mới tự chèn theo ngày thay vì dồn cuối (sửa xáo thứ tự kéo tay) + reset thứ tự B24 bị hỏng
**Last updated**: 2026-06-06 09:46:45 +07
**Summary**: fix(supplier-debt): hóa đơn mới tự chèn theo ngày thay vì dồn cuối (sửa xáo thứ tự kéo tay) + r...

## Files changed in this commit (`supplier-debt/`)

- `supplier-debt/index.html`
- `supplier-debt/js/main.js`

## Last 5 commits touching `supplier-debt/`

- `6032f122f` fix(supplier-debt): hóa đơn mới tự chèn theo ngày thay vì dồn cuối (sửa xáo thứ tự kéo tay) + reset thứ tự B24 bị hỏng _(2026-06-06)_
- `8ddfc0b7b` feat(supplier-debt): lịch sử thay đổi bảng công nợ — kéo vị trí + sửa ghi chú + xóa thanh toán + reset, xem qua nút Lịch sử/modal timeline per-NCC _(2026-06-06)_
- `4e8761354` auto: session update _(2026-05-25)_
- `922d925e1` refactor(shared): extract ReturnOrderModal — issue-tracking + supplier-debt cùng dùng full TPOS-clone refund form _(2026-05-25)_
- `d100d4a98` auto: session update _(2026-05-25)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260606-094645-6032f12` cho Claude walk chain theo CLAUDE.md protocol.
