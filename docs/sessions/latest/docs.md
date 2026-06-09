# Latest Snapshot — `docs/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260609-154150-9a30d10`
**Session file**: [`./20260609-154150-9a30d10.md`](../20260609-154150-9a30d10.md)
**Commit**: `9a30d10` — fix(native-orders): avatar đơn inbox — fbUserId rác → fallback chữ cái + hydrate avatar thật theo SĐT
**Last updated**: 2026-06-09 15:41:50 +07
**Summary**: fix(native-orders): avatar đơn inbox — fbUserId rác → fallback chữ cái + hydrate avatar thật theo SĐT

## Files changed in this commit (`docs/`)

- `docs/dev-log.md`

## Last 5 commits touching `docs/`

- `9a30d1007` fix(native-orders): avatar đơn inbox — fbUserId rác → fallback chữ cái + hydrate avatar thật theo SĐT _(2026-06-09)_
- `80d377734` chore(session): RESUME:20260609-154015-c597262 _(2026-06-09)_
- `bdc14b2a0` chore(session): RESUME:20260609-153926-e6bfde9 _(2026-06-09)_
- `e6bfde911` feat(web2): tem mã SP — biến thể vào giữa QR, mã SP góc phải dưới (EC=H) _(2026-06-09)_
- `488ac2fa0` chore(session): RESUME:20260609-153512-03d48a1 _(2026-06-09)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260609-154150-9a30d10` cho Claude walk chain theo CLAUDE.md protocol.
