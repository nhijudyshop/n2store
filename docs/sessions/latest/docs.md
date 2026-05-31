# Latest Snapshot — `docs/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260531-141234-83f9046`
**Session file**: [`./20260531-141234-83f9046.md`](../20260531-141234-83f9046.md)
**Commit**: `83f9046` — docs(plans): KPI plan v2 — campaign-scoped + beneficiary-based + STT visibility
**Last updated**: 2026-05-31 14:12:34 +07
**Summary**: docs(plans): KPI plan v2 — campaign-scoped + beneficiary-based + STT visibility

## Files changed in this commit (`docs/`)

- `docs/dev-log.md`
- `docs/plans/kpi-attribution-system.md`

## Last 5 commits touching `docs/`

- `83f90467b` docs(plans): KPI plan v2 — campaign-scoped + beneficiary-based + STT visibility _(2026-05-31)_
- `3c14c4c30` fix(inventory-tracking): bỏ chia theo ngày — tách đợt thuần dotSo (giữ de-dup CP) _(2026-05-31)_
- `93149389e` chore(session): RESUME:20260531-135315-42a1982 _(2026-05-31)_
- `42a1982e6` docs(plans): KPI attribution system — detailed plan v1 _(2026-05-31)_
- `1652676f8` fix(inventory-tracking): khoảng ngày đợt = lọc duy nhất + sửa CP đếm trùng NCC (B & C) _(2026-05-31)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260531-141234-83f9046` cho Claude walk chain theo CLAUDE.md protocol.
