# Latest Snapshot — `balance-history/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260522-123541-7ca8b09`
**Session file**: [`./20260522-123541-7ca8b09.md`](../20260522-123541-7ca8b09.md)
**Commit**: `7ca8b09` — fix(inventory/dot-tabs): order ASC (Đợt 1, 2, 3, ...) + wire render in flattenNCCData
**Last updated**: 2026-05-22 12:35:41 +07
**Summary**: fix(inventory/dot-tabs): order ASC (Đợt 1, 2, 3, ...) + wire render in flattenNCCData

## Files changed in this commit (`balance-history/`)

- `balance-history/js/live-mode.js`

## Last 5 commits touching `balance-history/`

- `66595d417` fix(balance-history): Live Mode Xác nhận đẩy GD qua Kế Toán Chờ Duyệt _(2026-05-22)_
- `7cfb01320` chore(cache-bust): opt-in toàn bộ 88 pages còn lại vào ?v=20260521b _(2026-05-21)_
- `c87a7b5b2` fix(balance-history): tab 'Lịch Sử' thiếu entries hôm nay — Firestore query không orderBy → 300 docs random _(2026-05-06)_
- `ce0a4d459` fix(balance-history): use vietqr.io compact2 template for full logo + bank info _(2026-05-06)_
- `6f3e04140` feat(balance-history): hiển thị ảnh ghi chú giao dịch trong modal Kiểm tra _(2026-05-06)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260522-123541-7ca8b09` cho Claude walk chain theo CLAUDE.md protocol.
