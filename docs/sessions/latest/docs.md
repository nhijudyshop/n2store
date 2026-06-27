# Latest Snapshot — `docs/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260627-114933-a8933df`
**Session file**: [`./20260627-114933-a8933df.md`](../20260627-114933-a8933df.md)
**Commit**: `a8933df` — feat(inventory-tracking): cho nhập giá thập phân (ô Sản phẩm) + kg thập phân (ô Kiện Hàng), dấu phẩy kiểu VN
**Last updated**: 2026-06-27 11:49:33 +07
**Summary**: inventory-tracking: nhập giá/kg thập phân dấu phẩy VN

## Files changed in this commit (`docs/`)

- `docs/dev-log.md`

## Last 5 commits touching `docs/`

- `a8933df1a` feat(inventory-tracking): cho nhập giá thập phân (ô Sản phẩm) + kg thập phân (ô Kiện Hàng), dấu phẩy kiểu VN _(2026-06-27)_
- `870e70b02` chore(session): RESUME:20260627-114652-a607fb1 _(2026-06-27)_
- `cc0b096b1` chore(session): RESUME:20260627-114539-254da26 _(2026-06-27)_
- `254da264b` feat(gemini-tryon): đa account xoay tua + cài 1-click (bộ cài máy POS [4]) + route free vào tab Ghép đồ _(2026-06-27)_
- `df73ac218` chore(session): RESUME:20260627-112759-41e8054 _(2026-06-27)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260627-114933-a8933df` cho Claude walk chain theo CLAUDE.md protocol.
