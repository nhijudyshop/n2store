# Latest Snapshot — `web2/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260603-162445-7305973`
**Session file**: [`./20260603-162445-7305973.md`](../20260603-162445-7305973.md)
**Commit**: `7305973` — docs(web2): chốt quyết định tách DB (wipe OK, bỏ Phase 3) + tiến độ + inventory cutover route
**Last updated**: 2026-06-03 16:24:45 +07
**Summary**: docs(web2): chốt quyết định tách DB (wipe OK, bỏ Phase 3) + tiến độ + inventory cutover route

## Files changed in this commit (`web2/`)

- `web2/balance-history/js/web2-balance-history-app.js`
- `web2/balance-history/js/web2-pending-match.js`

## Last 5 commits touching `web2/`

- `050f29fcc` feat(web2): Phase 1 tách DB — web2*customers (kho KH riêng web2Db) thay /api/v2/customers Web 1.0 *(2026-06-03)\_
- `4ed5ff3e6` auto: session update _(2026-06-03)_
- `f3f77419b` feat(web2): hiển thị số dư ví KH khắp nơi + tìm 5-10 số đuôi SĐT + ẩn Tổng tiền vào _(2026-06-02)_
- `e28a6a3c2` feat(native-orders): Pancake upload fallback cho anh — gui anh duoc ca khi khong co extension _(2026-06-02)_
- `815ea8553` feat(tpos-pancake): fallback gửi qua N2 Extension bypass-24h khi Pancake API lỗi (giống native-orders) _(2026-06-02)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260603-162445-7305973` cho Claude walk chain theo CLAUDE.md protocol.
