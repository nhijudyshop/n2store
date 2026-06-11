# Latest Snapshot — `balance-history/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260611-164934-77fb3cb`
**Session file**: [`./20260611-164934-77fb3cb.md`](../20260611-164934-77fb3cb.md)
**Commit**: `77fb3cb` — docs(dev-log): chat-db 15GB + realtime starter + nghi hết build minutes Render
**Last updated**: 2026-06-11 16:49:34 +07
**Summary**: docs(dev-log): chat-db 15GB + realtime starter + nghi hết build minutes Render

## Files changed in this commit (`balance-history/`)

- `balance-history/index.html`
- `balance-history/js/accountant.js`

## Last 5 commits touching `balance-history/`

- `f8a0e3fea` fix(wallet): vòng 2 audit — 8 fix còn sót (don-inbox refund-first, order-wide guard, UI kế toán REFUND*DUE) *(2026-06-11)\_
- `66595d417` fix(balance-history): Live Mode Xác nhận đẩy GD qua Kế Toán Chờ Duyệt _(2026-05-22)_
- `7cfb01320` chore(cache-bust): opt-in toàn bộ 88 pages còn lại vào ?v=20260521b _(2026-05-21)_
- `c87a7b5b2` fix(balance-history): tab 'Lịch Sử' thiếu entries hôm nay — Firestore query không orderBy → 300 docs random _(2026-05-06)_
- `ce0a4d459` fix(balance-history): use vietqr.io compact2 template for full logo + bank info _(2026-05-06)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260611-164934-77fb3cb` cho Claude walk chain theo CLAUDE.md protocol.
