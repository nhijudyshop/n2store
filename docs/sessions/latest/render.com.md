# Latest Snapshot — `render.com/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260607-132016-a95df24`
**Session file**: [`./20260607-132016-a95df24.md`](../20260607-132016-a95df24.md)
**Commit**: `a95df24` — auto: session update
**Last updated**: 2026-06-07 13:20:16 +07
**Summary**: auto: session update

## Files changed in this commit (`render.com/`)

- `render.com/routes/admin-web2-data-reset.js`
- `render.com/routes/native-orders.js`

## Last 5 commits touching `render.com/`

- `a95df243c` auto: session update _(2026-06-07)_
- `8f4792a74` fix(admin): web2-all giữ web2*order_customers + KHÔNG truncate web2_records (chứa 92k partner-customer + TPOS shadow); bỏ CASCADE *(2026-06-07)\_
- `588ce3cf8` auto: session update _(2026-06-07)_
- `ba8e1cbea` auto: session update _(2026-06-07)_
- `e65ef7069` fix(web2-customer-orders): PBH dùng amount*total (bug total_amount nuốt → PBH mất khỏi list KH) *(2026-06-07)\_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260607-132016-a95df24` cho Claude walk chain theo CLAUDE.md protocol.
