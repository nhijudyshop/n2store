# Latest Snapshot — `issue-tracking/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260616-143128-7bd7dbe`
**Session file**: [`./20260616-143128-7bd7dbe.md`](../20260616-143128-7bd7dbe.md)
**Commit**: `7bd7dbe` — fix(auth): tab3 dùng tokenManager (company-correct) thay vì tự login
**Last updated**: 2026-06-16 14:31:28 +07
**Summary**: fix(auth): tab3 dùng tokenManager (company-correct) thay vì tự login

## Files changed in this commit (`issue-tracking/`)

- `issue-tracking/index.html`

## Last 5 commits touching `issue-tracking/`

- `85771c3f7` fix(auth): SwitchCompany theo công ty đang chọn — NJD Live = Company 1 (kho live) _(2026-06-16)_
- `845fe3649` fix(web2): icon columns-3→columns (Lucide 0.294.0) + revert WS proxy về broker n2store-realtime _(2026-06-16)_
- `5eef62c12` revert: gỡ bump api-config version nhầm trên 7 file Web 1.0 (Web1⊥Web2) _(2026-06-15)_
- `b5e2ad166` chore(web2): xóa sạch chữ TPOS trong comment/doc Web 2.0 (reword giữ nghĩa) _(2026-06-15)_
- `fadacf58d` feat(issue-tracking): cho phép trả bổ sung trên đơn đã hoàn tất (Khách gửi/Thu về) _(2026-06-12)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260616-143128-7bd7dbe` cho Claude walk chain theo CLAUDE.md protocol.
