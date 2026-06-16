# Latest Snapshot — `inventory-tracking/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260616-143128-7bd7dbe`
**Session file**: [`./20260616-143128-7bd7dbe.md`](../20260616-143128-7bd7dbe.md)
**Commit**: `7bd7dbe` — fix(auth): tab3 dùng tokenManager (company-correct) thay vì tự login
**Last updated**: 2026-06-16 14:31:28 +07
**Summary**: fix(auth): tab3 dùng tokenManager (company-correct) thay vì tự login

## Files changed in this commit (`inventory-tracking/`)

- `inventory-tracking/index.html`

## Last 5 commits touching `inventory-tracking/`

- `85771c3f7` fix(auth): SwitchCompany theo công ty đang chọn — NJD Live = Company 1 (kho live) _(2026-06-16)_
- `fa7fffe37` style(inventory-tracking): bo gach cheo + hien ro hon cho NCC an khi reveal _(2026-06-08)_
- `7e9fed66d` fix(inventory-tracking): NCC ẩn không thực sự ẩn hàng SP — apply hidden state sau render + khi expand _(2026-06-04)_
- `2868223af` auto: session update _(2026-06-04)_
- `3965f842d` fix(inventory-tracking): nút 🕐 lịch sử từng đơn — modal vô hình do .hidden !important + dùng chung diff giàu _(2026-06-04)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260616-143128-7bd7dbe` cho Claude walk chain theo CLAUDE.md protocol.
