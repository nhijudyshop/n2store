# Latest Snapshot — `balance-history-home/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260618-130917-4a7def4`
**Session file**: [`./20260618-130917-4a7def4.md`](../20260618-130917-4a7def4.md)
**Commit**: `4a7def4` — feat(balance-history-home): phân biệt 2 TK SePay Home — cột 'Tài khoản' + bộ lọc 44 TL/481 NVK
**Last updated**: 2026-06-18 13:09:17 +07
**Summary**: feat(balance-history-home): phân biệt 2 TK SePay Home — cột 'Tài khoản' + bộ lọc 44 TL/481 NVK

## Files changed in this commit (`balance-history-home/`)

- `balance-history-home/css/home.css`
- `balance-history-home/index.html`
- `balance-history-home/js/balance-core.js`
- `balance-history-home/js/balance-filters.js`
- `balance-history-home/js/balance-table.js`
- `balance-history-home/js/config.js`
- `balance-history-home/js/main.js`

## Last 5 commits touching `balance-history-home/`

- `4a7def4d0` feat(balance-history-home): phân biệt 2 TK SePay Home — cột 'Tài khoản' + bộ lọc 44 TL/481 NVK _(2026-06-18)_
- `85771c3f7` fix(auth): SwitchCompany theo công ty đang chọn — NJD Live = Company 1 (kho live) _(2026-06-16)_
- `7cfb01320` chore(cache-bust): opt-in toàn bộ 88 pages còn lại vào ?v=20260521b _(2026-05-21)_
- `03347d941` feat(balance-history-home): page mới scaffold UI, chờ đấu SePay account thứ 2 _(2026-05-14)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260618-130917-4a7def4` cho Claude walk chain theo CLAUDE.md protocol.
