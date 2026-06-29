# Latest Snapshot — `docs/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260629-120124-09123bc`
**Session file**: [`./20260629-120124-09123bc.md`](../20260629-120124-09123bc.md)
**Commit**: `09123bc` — docs(native-orders): dọn comment STT cũ ('1 + 2') cho khớp hành vi gộp mới
**Last updated**: 2026-06-29 12:01:25 +07
**Summary**: STT kệ 1 nguồn (campaign_stt) trên MỌI surface — native-orders/tem/unit-scan/board; đơn gộp hiện kệ mới + dấu ⛓

## Files changed in this commit (`docs/`)

- `docs/dev-log.md`

## Last 5 commits touching `docs/`

- `04579a1c5` fix(native-orders): đơn GỘP hiện STT kệ MỚI (campaign*stt) khớp tem, bỏ "1 + 2" *(2026-06-29)\_
- `007c69119` chore(session): RESUME:20260629-114803-038a746 _(2026-06-29)_
- `038a74651` fix(units): thêm lib/web2-shelf-stt thiếu (routes require → tránh crash web2-api) + dev-log _(2026-06-29)_
- `2eba8f8e3` chore(session): RESUME:20260629-113943-fd8f3eb _(2026-06-29)_
- `343ba2e48` fix(goods-weight): hết tràn ngang mobile — number input co được trong grid (min-width:0 + width:100%) _(2026-06-29)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260629-120124-09123bc` cho Claude walk chain theo CLAUDE.md protocol.
