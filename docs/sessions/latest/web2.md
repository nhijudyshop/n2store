# Latest Snapshot — `web2/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260702-095220-995c2a0`
**Session file**: [`./20260702-095220-995c2a0.md`](../20260702-095220-995c2a0.md)
**Commit**: `995c2a0` — feat(cham-cong): bỏ cột Phụ cấp khỏi bảng lương (UI + Excel + phiếu in)
**Last updated**: 2026-07-02 09:52:20 +07
**Summary**: feat(cham-cong): bỏ cột Phụ cấp khỏi bảng lương (UI + Excel + phiếu in)

## Files changed in this commit (`web2/`)

- `web2/cham-cong/index.html`
- `web2/cham-cong/js/cham-cong-payroll.js`
- `web2/system/index.html`

## Last 5 commits touching `web2/`

- `995c2a054` feat(cham-cong): bỏ cột Phụ cấp khỏi bảng lương (UI + Excel + phiếu in) _(2026-07-02)_
- `6fe3825fa` docs(web2-system): thêm note 'Chuẩn debug browser' vào tab Services + KB sync _(2026-07-02)_
- `2e643bab5` feat(cham-cong): bảng lương bấm ô mở modal kiểu TPOS (bỏ nút Sửa) + chấm đủ = trọn lương ngày _(2026-07-02)_
- `573db79f5` refactor(web2): worker-base dedup hoàn tất — 18 file config-first, 0 primary-literal còn _(2026-07-02)_
- `441e548c2` refactor(web2-shared): dedup worker-base — config-first 5 file primary-literal (re-scope group) _(2026-07-02)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260702-095220-995c2a0` cho Claude walk chain theo CLAUDE.md protocol.
