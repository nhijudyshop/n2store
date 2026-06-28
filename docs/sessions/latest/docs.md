# Latest Snapshot — `docs/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260628-145932-ca6df46`
**Session file**: [`./20260628-145932-ca6df46.md`](../20260628-145932-ca6df46.md)
**Commit**: `ca6df46` — feat(web2/system): sổ tay SSE trong tab SSE + fix 4 gap subscribe web2:so-order (supplier-debt/purchase-refund/live-chat/dashboard)
**Last updated**: 2026-06-28 14:59:32 +07
**Summary**: feat(web2/system): sổ tay SSE trong tab SSE + fix 4 gap subscribe web2:so-order (supplier-debt/purchase-refund/live...

## Files changed in this commit (`docs/`)

- `docs/dev-log.md`

## Last 5 commits touching `docs/`

- `ca6df464a` feat(web2/system): sổ tay SSE trong tab SSE + fix 4 gap subscribe web2:so-order (supplier-debt/purchase-refund/live-chat/dashboard) _(2026-06-28)_
- `88aeedf1c` fix(so-order): in tem sau nhận hàng ra giá 0 — lấy giá bán dòng order/Kho SP (fallback theo code) _(2026-06-28)_
- `b74bde015` chore(session): RESUME:20260628-131713-4383e15 _(2026-06-28)_
- `4383e15d2` feat(ai-widget): full-data theo cache browser (Web2SmartCache/IDB) + freshness gate + nút nạp _(2026-06-28)_
- `2a18baa36` chore(session): RESUME:20260628-125813-e1c137b _(2026-06-28)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260628-145932-ca6df46` cho Claude walk chain theo CLAUDE.md protocol.
