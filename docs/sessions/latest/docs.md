# Latest Snapshot — `docs/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260626-100745-131aa95`
**Session file**: [`./20260626-100745-131aa95.md`](../20260626-100745-131aa95.md)
**Commit**: `131aa95` — refactor(web2/cham-cong): gỡ tham chiếu lay-du-lieu.bat — trỏ về 1 nguồn auto duy nhất (Cài máy chấm công DG-600 ở printer-settings)
**Last updated**: 2026-06-26 10:07:45 +07
**Summary**: refactor(web2/cham-cong): gỡ tham chiếu lay-du-lieu.bat — trỏ về 1 nguồn auto duy nhất (Cài máy chấ...

## Files changed in this commit (`docs/`)

- `docs/dev-log.md`

## Last 5 commits touching `docs/`

- `131aa950b` refactor(web2/cham-cong): gỡ tham chiếu lay-du-lieu.bat — trỏ về 1 nguồn auto duy nhất (Cài máy chấm công DG-600 ở printer-settings) _(2026-06-26)_
- `fcefc12be` chore(session): RESUME:20260626-092435-4e3cd21 _(2026-06-26)_
- `4e3cd217a` fix(web2/cham-cong): sync strip tách KẾT NỐI vs DỮ LIỆU mới nhất — cảnh báo máy online nhưng không đẩy chấm công mới _(2026-06-26)_
- `f8ac2e886` chore(session): RESUME:20260626-091440-65c9694 _(2026-06-26)_
- `65c969445` feat(web2/cham-cong): hàng đợi đối soát chấm thiếu + a11y (glyph chấm/aria/Esc) + perf (event delegation) + name truncate _(2026-06-26)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260626-100745-131aa95` cho Claude walk chain theo CLAUDE.md protocol.
