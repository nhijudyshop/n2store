# Latest Snapshot — `scripts/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260607-133227-d8950e4`
**Session file**: [`./20260607-133227-d8950e4.md`](../20260607-133227-d8950e4.md)
**Commit**: `d8950e4` — feat(web2): gate auto-gán SePay — chỉ cộng ví khi KH có đơn active
**Last updated**: 2026-06-07 13:32:27 +07
**Summary**: feat(web2): gate auto-gán SePay — chỉ cộng ví khi KH có đơn active

## Files changed in this commit (`scripts/`)

- `scripts/test-sepay-gate-order.js`

## Last 5 commits touching `scripts/`

- `d8950e49b` feat(web2): gate auto-gán SePay — chỉ cộng ví khi KH có đơn active _(2026-06-07)_
- `667b58307` auto: session update _(2026-06-06)_
- `48c68c058` feat(web2): gán KH ở balance-history → tự nối tín hiệu CK + gửi tin báo _(2026-06-06)_
- `5346a521d` feat(web2): CK cộng ví → tự trừ vào PBH chưa trả của SĐT (đơn đã thanh toán) _(2026-06-06)_
- `8bab5f4cf` fix(web2): CK chỉ auto khi định danh khớp (tránh gửi nhầm khách) _(2026-06-06)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260607-133227-d8950e4` cho Claude walk chain theo CLAUDE.md protocol.
