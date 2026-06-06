# Latest Snapshot — `web2/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260606-134820-214bc43`
**Session file**: [`./20260606-134820-214bc43.md`](../20260606-134820-214bc43.md)
**Commit**: `214bc43` — feat(web2-reconcile): ẩn lịch sử mặc định (toggle) + ưu tiên list SP + scan lỗi liệt kê mã
**Last updated**: 2026-06-06 13:48:20 +07
**Summary**: feat(web2-reconcile): ẩn lịch sử mặc định (toggle) + ưu tiên list SP + scan lỗi liệt kê mã

## Files changed in this commit (`web2/`)

- `web2/reconcile/css/reconcile.css`
- `web2/reconcile/index.html`
- `web2/reconcile/js/reconcile-app.js`

## Last 5 commits touching `web2/`

- `214bc43ee` feat(web2-reconcile): ẩn lịch sử mặc định (toggle) + ưu tiên list SP + scan lỗi liệt kê mã _(2026-06-06)_
- `98f584ada` feat(web2/partner-customer): bỏ cột Nợ hiện tại (th/td/toggle/CSS + export Excel) — số dư ví đã hiện qua pill cạnh SĐT _(2026-06-06)_
- `5202d1b67` feat(web2-reconcile): endpoint + nút hủy đóng gói (cancel-pack) _(2026-06-06)_
- `7e1101ebf` feat(web2-reconcile): modal lịch sử toàn bộ + filter đối chiếu camera _(2026-06-06)_
- `76b3edacd` auto: session update _(2026-06-06)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260606-134820-214bc43` cho Claude walk chain theo CLAUDE.md protocol.
