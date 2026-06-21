# Latest Snapshot — `render.com/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260621-164059-e7a767d`
**Session file**: [`./20260621-164059-e7a767d.md`](../20260621-164059-e7a767d.md)
**Commit**: `e7a767d` — feat(web2): TAG đơn hàng auto theo trigger + chặn PBH khi có SP chờ hàng
**Last updated**: 2026-06-21 16:40:59 +07
**Summary**: feat web2: TAG đơn hàng auto theo trigger + chặn PBH khi có SP chờ hàng (engine + route + cột Thẻ + trang Cấu hình)

## Files changed in this commit (`render.com/`)

- `render.com/routes/web2-order-tags.js`
- `render.com/services/web2-order-tags-service.js`

## Last 5 commits touching `render.com/`

- `e7a767d77` feat(web2): TAG đơn hàng auto theo trigger + chặn PBH khi có SP chờ hàng _(2026-06-21)_
- `af61f1950` auto: session update _(2026-06-21)_
- `0ebd62e4c` auto: session update _(2026-06-21)_
- `b1dd2d08d` fix(web2) audit-d verify: #9 sepay race — connection-safe re-check (revert deadlock-prone advisory wrapper) _(2026-06-21)_
- `b9f567be7` fix(web2) audit-d: 9 money-path bugs (over-refund regression, PBH oversell/drift, wallet double-credit, sepay race) _(2026-06-21)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260621-164059-e7a767d` cho Claude walk chain theo CLAUDE.md protocol.
