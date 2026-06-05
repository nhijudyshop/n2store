# Latest Snapshot — `scripts/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260605-154649-f3109d6`
**Session file**: [`./20260605-154649-f3109d6.md`](../20260605-154649-f3109d6.md)
**Commit**: `f3109d6` — auto: session update
**Last updated**: 2026-06-05 15:46:49 +07
**Summary**: auto: session update

## Files changed in this commit (`scripts/`)

- `scripts/test-payment-signals.js`

## Last 5 commits touching `scripts/`

- `551ddbf82` fix(web2): detect 'KH báo đã CK' cả trên update*conversation (fix bỏ sót) *(2026-06-05)\_
- `70e32bb69` refactor(web2): unread logic authoritative thuần (bỏ mirror Web 1.0 + nút Đã đọc) _(2026-06-05)_
- `528b07a1c` feat(web2): unread DB riêng Web 2.0 + harden Pancake WS 24/7 _(2026-06-05)_
- `35731e4ad` feat(web2): detect 'CK XONG'/'ĐÃ CK' từ inbox Pancake 24/7 → trang Xác nhận CK _(2026-06-05)_
- `0a9bb7bb3` feat(print-bridge): ban PowerShell (khong can Node) cho Windows _(2026-06-04)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260605-154649-f3109d6` cho Claude walk chain theo CLAUDE.md protocol.
