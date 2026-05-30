# Latest Snapshot — `web2/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260530-191841-4528e65`
**Session file**: [`./20260530-191841-4528e65.md`](../20260530-191841-4528e65.md)
**Commit**: `4528e65` — auto: session update
**Last updated**: 2026-05-30 19:18:41 +07
**Summary**: auto: session update

## Files changed in this commit (`web2/`)

- `web2/balance-history/css/web2-balance-history.css`
- `web2/balance-history/js/web2-balance-history-app.js`

## Last 5 commits touching `web2/`

- `b8cec14a0` fix(balance-history): hiển thị tên NCC cho manual deposit thay vì 'Chưa gán' _(2026-05-30)_
- `c4f0a7d39` feat(manual-deposit): NCC select dropdown visible + Tạo mới button kế label _(2026-05-30)_
- `c3a17177d` feat(manual-deposit): support withdraw (rút tay) + NCC datalist + filter chip MANUAL _(2026-05-30)_
- `e01b4d77e` fix(manual-deposit): column body→raw*data + search-as-you-type debounce + Web 2.0 fast path *(2026-05-30)\_
- `fc47649f4` feat(web2-manual-deposit): NCC dropdown + KH search-by-name+Enter _(2026-05-30)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260530-191841-4528e65` cho Claude walk chain theo CLAUDE.md protocol.
