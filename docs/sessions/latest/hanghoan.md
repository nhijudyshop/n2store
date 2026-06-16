# Latest Snapshot — `hanghoan/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260616-143128-7bd7dbe`
**Session file**: [`./20260616-143128-7bd7dbe.md`](../20260616-143128-7bd7dbe.md)
**Commit**: `7bd7dbe` — fix(auth): tab3 dùng tokenManager (company-correct) thay vì tự login
**Last updated**: 2026-06-16 14:31:28 +07
**Summary**: fix(auth): tab3 dùng tokenManager (company-correct) thay vì tự login

## Files changed in this commit (`hanghoan/`)

- `hanghoan/index.html`

## Last 5 commits touching `hanghoan/`

- `85771c3f7` fix(auth): SwitchCompany theo công ty đang chọn — NJD Live = Company 1 (kho live) _(2026-06-16)_
- `7cfb01320` chore(cache-bust): opt-in toàn bộ 88 pages còn lại vào ?v=20260521b _(2026-05-21)_
- `a3d9e87c9` style: clean body{} font props in module CSS (typography.css now owns) _(2026-04-08)_
- `9e588e01c` style: unify typography across all pages (Inter 20px weight 600) _(2026-04-08)_
- `ea059fd13` feat(docs): add #Note AI-instruction header to all HTML+JS files + module overview in dev-log _(2026-04-04)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260616-143128-7bd7dbe` cho Claude walk chain theo CLAUDE.md protocol.
