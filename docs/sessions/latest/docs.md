# Latest Snapshot — `docs/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260621-164059-e7a767d`
**Session file**: [`./20260621-164059-e7a767d.md`](../20260621-164059-e7a767d.md)
**Commit**: `e7a767d` — feat(web2): TAG đơn hàng auto theo trigger + chặn PBH khi có SP chờ hàng
**Last updated**: 2026-06-21 16:40:59 +07
**Summary**: feat web2: TAG đơn hàng auto theo trigger + chặn PBH khi có SP chờ hàng (engine + route + cột Thẻ + trang Cấu hình)

## Files changed in this commit (`docs/`)

- `docs/dev-log.md`

## Last 5 commits touching `docs/`

- `e7a767d77` feat(web2): TAG đơn hàng auto theo trigger + chặn PBH khi có SP chờ hàng _(2026-06-21)_
- `ae75e3816` chore(session): RESUME:20260621-162423-af61f19 _(2026-06-21)_
- `583a739fc` chore(session): RESUME:20260621-162133-0ebd62e _(2026-06-21)_
- `0cfb19a01` chore(session): RESUME:20260621-162051-b1dd2d0 _(2026-06-21)_
- `b1dd2d08d` fix(web2) audit-d verify: #9 sepay race — connection-safe re-check (revert deadlock-prone advisory wrapper) _(2026-06-21)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260621-164059-e7a767d` cho Claude walk chain theo CLAUDE.md protocol.
