# Latest Snapshot — `docs/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260627-094945-41294a1`
**Session file**: [`./20260627-094945-41294a1.md`](../20260627-094945-41294a1.md)
**Commit**: `41294a1` — fix(web2 sepay R4 MEDIUM): CHECK constraint thiếu pending_no_order → gate marker fail → retry storm
**Last updated**: 2026-06-27 09:49:45 +07
**Summary**: Test SePay webhook → ví Web 2.0 (nhánh web2 thuần, không đụng web1): 22 assertions + FIX bug CHECK constraint thiếu pending_no_order (gate marker fail → retry storm)

## Files changed in this commit (`docs/`)

- `docs/dev-log.md`
- `docs/web2/FLOW-AUDIT-2026-06-27-R4.md`

## Last 5 commits touching `docs/`

- `41294a16b` fix(web2 sepay R4 MEDIUM): CHECK constraint thiếu pending*no_order → gate marker fail → retry storm *(2026-06-27)\_
- `2ae11f8df` chore(session): RESUME:20260627-092838-1a667cc _(2026-06-27)_
- `1a667cc17` docs(web2 flow R4): verify báo cáo kho (29 assertions) + revenue + công thức lương — 0 bug code _(2026-06-27)_
- `82cf3e073` chore(session): RESUME:20260627-091420-fd83d24 _(2026-06-27)_
- `fd83d2453` fix(web2/overview): sửa 404 toàn bộ link card/tĩnh (thiếu resolveOur) + login → native-orders _(2026-06-27)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260627-094945-41294a1` cho Claude walk chain theo CLAUDE.md protocol.
