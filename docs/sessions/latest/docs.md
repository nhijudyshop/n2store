# Latest Snapshot — `docs/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260616-161403-cd81ab5`
**Session file**: [`./20260616-161403-cd81ab5.md`](../20260616-161403-cd81ab5.md)
**Commit**: `cd81ab5` — docs(dev-log): money-model so-order — status auto + nợ NCC khi nhận hàng + discount/ship per-đơn
**Last updated**: 2026-06-16 16:14:03 +07
**Summary**: docs(dev-log): money-model so-order — status auto + nợ NCC khi nhận hàng + discount/ship per-đơn

## Files changed in this commit (`docs/`)

- `docs/dev-log.md`

## Last 5 commits touching `docs/`

- `cd81ab588` docs(dev-log): money-model so-order — status auto + nợ NCC khi nhận hàng + discount/ship per-đơn _(2026-06-16)_
- `d2bb1cef1` chore(session): RESUME:20260616-161145-c7b772e _(2026-06-16)_
- `cf5227765` chore(session): RESUME:20260616-160137-3090aec _(2026-06-16)_
- `d9c0609e4` fix(so-order): nền bảng xen kẽ theo NHÓM NCC/đơn (parity class JS) thay zebra :nth-child lệch nhóm — tăng tương phản đọc từng khối _(2026-06-16)_
- `a56d9d55c` fix(render): pending*customers sai múi giờ -7h — server emit ISO-UTC (strip báo trễ 7h) *(2026-06-16)\_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260616-161403-cd81ab5` cho Claude walk chain theo CLAUDE.md protocol.
