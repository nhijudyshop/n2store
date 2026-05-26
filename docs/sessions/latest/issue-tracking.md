# Latest Snapshot — `issue-tracking/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260526-110108-06828cd`
**Session file**: [`./20260526-110108-06828cd.md`](../20260526-110108-06828cd.md)
**Commit**: `06828cd` — auto: session update
**Last updated**: 2026-05-26 11:01:08 +07
**Summary**: auto: session update

## Files changed in this commit (`issue-tracking/`)

- `issue-tracking/index.html`
- `issue-tracking/js/tpos-fastsale-tab.js`

## Last 5 commits touching `issue-tracking/`

- `06828cd7d` auto: session update _(2026-05-26)_
- `b73add055` feat(issue-tracking): bỏ icon ở cột trạng thái BÁN HÀNG + TRẢ HÀNG _(2026-05-26)_
- `2ecd69c9b` feat(issue-tracking): In bill cho BÁN HÀNG + TRẢ HÀNG (TPOS template 80mm) _(2026-05-26)_
- `ddf6d3da0` auto: session update _(2026-05-26)_
- `24b60da6b` feat(issue-tracking): trả hàng từ BILL — chọn toàn bộ / chọn từng line trong expanded detail _(2026-05-26)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260526-110108-06828cd` cho Claude walk chain theo CLAUDE.md protocol.
