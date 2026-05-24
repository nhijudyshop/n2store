# Latest Snapshot — `supplier-debt/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260524-110455-eeaa9ce`
**Session file**: [`./20260524-110455-eeaa9ce.md`](../20260524-110455-eeaa9ce.md)
**Commit**: `eeaa9ce` — feat(supplier-debt): auto refresh — polling 30s + cross-tab BroadcastChannel, no F5
**Last updated**: 2026-05-24 11:04:55 +07
**Summary**: feat(supplier-debt): auto refresh — polling 30s + cross-tab BroadcastChannel, no F5

## Files changed in this commit (`supplier-debt/`)

- `supplier-debt/index.html`
- `supplier-debt/js/main.js`
- `supplier-debt/js/return-order.js`

## Last 5 commits touching `supplier-debt/`

- `eeaa9ce89` feat(supplier-debt): auto refresh — polling 30s + cross-tab BroadcastChannel, no F5 _(2026-05-24)_
- `d2124597c` auto: session update _(2026-05-24)_
- `1a201728b` auto: session update _(2026-05-24)_
- `7cfb01320` chore(cache-bust): opt-in toàn bộ 88 pages còn lại vào ?v=20260521b _(2026-05-21)_
- `54de02e4c` fix(supplier-debt): opening balance từ summary thay vì API per-row Begin _(2026-05-13)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260524-110455-eeaa9ce` cho Claude walk chain theo CLAUDE.md protocol.
