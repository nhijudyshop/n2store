# Latest Snapshot — `nhanhang/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260521-153901-7cfb013`
**Session file**: [`./20260521-153901-7cfb013.md`](../20260521-153901-7cfb013.md)
**Commit**: `7cfb013` — chore(cache-bust): opt-in toàn bộ 88 pages còn lại vào ?v=20260521b
**Last updated**: 2026-05-21 15:39:01 +07
**Summary**: chore(cache-bust): opt-in toàn bộ 88 pages còn lại vào ?v=20260521b

## Files changed in this commit (`nhanhang/`)

- `nhanhang/index.html`

## Last 5 commits touching `nhanhang/`

- `7cfb0132` chore(cache-bust): opt-in toàn bộ 88 pages còn lại vào ?v=20260521b _(2026-05-21)_
- `df9bf3f1` refactor(nhanhang): bỏ cột "Trạng thái" — 2 tabs Chưa/Đã KT đã thực hiện chức năng này _(2026-05-04)_
- `0a3fab8a` fix(nhanhang): bug đa máy hiển thị khác nhau — fingerprint cache check + Firestore realtime listener _(2026-05-04)_
- `37c9d0a0` chore(nhanhang): backfill 239 phiếu legacy trước 01/04/2026 → daKiemTra=true + gỡ cutoff filter _(2026-05-04)_
- `4155728a` auto: session update _(2026-05-04)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260521-153901-7cfb013` cho Claude walk chain theo CLAUDE.md protocol.
