# Latest Snapshot — `docs/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260618-175401-dadf493`
**Session file**: [`./20260618-175401-dadf493.md`](../20260618-175401-dadf493.md)
**Commit**: `dadf493` — fix(web2/fastsaleorder-invoice): nút Trả hàng crash — STATE.items→STATE.orders
**Last updated**: 2026-06-18 17:54:01 +07
**Summary**: fix(web2/fastsaleorder-invoice): nút Trả hàng crash — STATE.items→STATE.orders

## Files changed in this commit (`docs/`)

- `docs/dev-log.md`

## Last 5 commits touching `docs/`

- `dadf493f6` fix(web2/fastsaleorder-invoice): nút Trả hàng crash — STATE.items→STATE.orders _(2026-06-18)_
- `de8b66f37` chore(session): RESUME:20260618-163127-4aea4b7 _(2026-06-18)_
- `4aea4b7b0` fix(web2/money): vá 5 HIGH + 3 MED rủi ro tiền NCC + ví khách _(2026-06-18)_
- `54c725368` chore(session): RESUME:20260618-154134-625dd0c _(2026-06-18)_
- `625dd0c74` fix(wallets-v2): Rút tiền thủ công (Customer 360) trừ đúng số dư mọi lần _(2026-06-18)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260618-175401-dadf493` cho Claude walk chain theo CLAUDE.md protocol.
