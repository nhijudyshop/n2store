# Latest Snapshot — `web2/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260531-151353-30e688d`
**Session file**: [`./20260531-151353-30e688d.md`](../20260531-151353-30e688d.md)
**Commit**: `30e688d` — feat(web2-balance-history): filter modal + custom KH picker cho pending matches
**Last updated**: 2026-05-31 15:13:53 +07
**Summary**: feat(web2-balance-history): filter modal + custom KH picker cho pending matches

## Files changed in this commit (`web2/`)

- `web2/balance-history/js/web2-pending-match.js`

## Last 5 commits touching `web2/`

- `30e688da0` feat(web2-balance-history): filter modal + custom KH picker cho pending matches _(2026-05-31)_
- `b8cec14a0` fix(balance-history): hiển thị tên NCC cho manual deposit thay vì 'Chưa gán' _(2026-05-30)_
- `c4f0a7d39` feat(manual-deposit): NCC select dropdown visible + Tạo mới button kế label _(2026-05-30)_
- `c3a17177d` feat(manual-deposit): support withdraw (rút tay) + NCC datalist + filter chip MANUAL _(2026-05-30)_
- `e01b4d77e` fix(manual-deposit): column body→raw*data + search-as-you-type debounce + Web 2.0 fast path *(2026-05-30)\_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260531-151353-30e688d` cho Claude walk chain theo CLAUDE.md protocol.
