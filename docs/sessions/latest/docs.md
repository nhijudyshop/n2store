# Latest Snapshot — `docs/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260626-092435-4e3cd21`
**Session file**: [`./20260626-092435-4e3cd21.md`](../20260626-092435-4e3cd21.md)
**Commit**: `4e3cd21` — fix(web2/cham-cong): sync strip tách KẾT NỐI vs DỮ LIỆU mới nhất — cảnh báo máy online nhưng không đẩy chấm công mới
**Last updated**: 2026-06-26 09:24:35 +07
**Summary**: fix(web2/cham-cong): sync strip tách KẾT NỐI vs DỮ LIỆU mới nhất — cảnh báo máy online nhưng khô...

## Files changed in this commit (`docs/`)

- `docs/dev-log.md`

## Last 5 commits touching `docs/`

- `4e3cd217a` fix(web2/cham-cong): sync strip tách KẾT NỐI vs DỮ LIỆU mới nhất — cảnh báo máy online nhưng không đẩy chấm công mới _(2026-06-26)_
- `f8ac2e886` chore(session): RESUME:20260626-091440-65c9694 _(2026-06-26)_
- `65c969445` feat(web2/cham-cong): hàng đợi đối soát chấm thiếu + a11y (glyph chấm/aria/Esc) + perf (event delegation) + name truncate _(2026-06-26)_
- `8c93064f0` fix(web2/cham-cong BE): secret ingest fail-closed + web2-users/list bỏ PII non-admin + validate snapshot chốt lương _(2026-06-26)_
- `ccb3bd40a` fix(web2/cham-cong): grace smooth (bỏ cliff) + lương tháng không auto phạt muộn + dup-PIN không cộng đôi tổng _(2026-06-26)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260626-092435-4e3cd21` cho Claude walk chain theo CLAUDE.md protocol.
