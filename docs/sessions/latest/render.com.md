# Latest Snapshot — `render.com/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260607-125910-ba8e1cb`
**Session file**: [`./20260607-125910-ba8e1cb.md`](../20260607-125910-ba8e1cb.md)
**Commit**: `ba8e1cb` — auto: session update
**Last updated**: 2026-06-07 12:59:10 +07
**Summary**: auto: session update

## Files changed in this commit (`render.com/`)

- `render.com/routes/native-orders.js`
- `render.com/routes/v2/web2-customer-orders.js`
- `render.com/routes/web2-returns.js`

## Last 5 commits touching `render.com/`

- `ba8e1cbea` auto: session update _(2026-06-07)_
- `e65ef7069` fix(web2-customer-orders): PBH dùng amount*total (bug total_amount nuốt → PBH mất khỏi list KH) *(2026-06-07)\_
- `20ac0b4a8` fix(web2-returns): fast*sale_orders dùng amount_total (không phải total_amount) trong source-order pbh *(2026-06-07)\_
- `b3d273449` auto: session update _(2026-06-07)_
- `a7224dc71` auto: session update _(2026-06-07)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260607-125910-ba8e1cb` cho Claude walk chain theo CLAUDE.md protocol.
