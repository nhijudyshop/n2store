# Latest Snapshot — `tpos-pancake/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260602-190046-f3f7741`
**Session file**: [`./20260602-190046-f3f7741.md`](../20260602-190046-f3f7741.md)
**Commit**: `f3f7741` — feat(web2): hiển thị số dư ví KH khắp nơi + tìm 5-10 số đuôi SĐT + ẩn Tổng tiền vào
**Last updated**: 2026-06-02 19:00:46 +07
**Summary**: feat(web2): hiển thị số dư ví KH khắp nơi + tìm 5-10 số đuôi SĐT + ẩn Tổng tiền vào

## Files changed in this commit (`tpos-pancake/`)

- `tpos-pancake/index.html`
- `tpos-pancake/js/tpos/tpos-customer-panel.js`

## Last 5 commits touching `tpos-pancake/`

- `f3f77419b` feat(web2): hiển thị số dư ví KH khắp nơi + tìm 5-10 số đuôi SĐT + ẩn Tổng tiền vào _(2026-06-02)_
- `e28a6a3c2` feat(native-orders): Pancake upload fallback cho anh — gui anh duoc ca khi khong co extension _(2026-06-02)_
- `b85fc91e6` feat(tpos-pancake): kho Hình Livestream — chụp iframe thủ công + sidebar gallery filter campaign _(2026-06-02)_
- `37f707dac` auto: session update _(2026-06-02)_
- `d5d0266b9` feat(tpos-pancake): gui attachment day du (anh/audio/video/file) qua extension, fallback Pancake _(2026-06-02)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260602-190046-f3f7741` cho Claude walk chain theo CLAUDE.md protocol.
