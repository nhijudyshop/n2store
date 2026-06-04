# Latest Snapshot — `inventory-tracking/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260604-093633-445b0c1`
**Session file**: [`./20260604-093633-445b0c1.md`](../20260604-093633-445b0c1.md)
**Commit**: `445b0c1` — feat(inventory-tracking): tab Lịch Sử diff toàn bộ field + filter đợt/ngày/search
**Last updated**: 2026-06-04 09:36:33 +07
**Summary**: feat(inventory-tracking): tab Lịch Sử diff toàn bộ field + filter đợt/ngày/search

## Files changed in this commit (`inventory-tracking/`)

- `inventory-tracking/css/modern.css`
- `inventory-tracking/index.html`
- `inventory-tracking/js/history-tab.js`

## Last 5 commits touching `inventory-tracking/`

- `445b0c1c4` feat(inventory-tracking): tab Lịch Sử diff toàn bộ field + filter đợt/ngày/search _(2026-06-04)_
- `e91e6cf61` auto: session update _(2026-06-03)_
- `12094b837` fix(inventory-tracking): modal-shipment re-parse ghi đè maSP/mauSac inline-edited + tab Lịch Sử query/recover _(2026-06-03)_
- `7033a0ec7` auto: session update _(2026-06-03)_
- `9216ea885` feat(inventory-tracking): iPad — nút STT/NCC luôn hiện (bỏ phụ thuộc :hover) _(2026-06-03)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260604-093633-445b0c1` cho Claude walk chain theo CLAUDE.md protocol.
