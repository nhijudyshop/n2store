# Latest Snapshot — `docs/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260630-090535-904effd`
**Session file**: [`./20260630-090535-904effd.md`](../20260630-090535-904effd.md)
**Commit**: `904effd` — feat(order-tags): tag SOẠN HÀNG cho giỏ khi in phiếu soạn hàng + toggle admin bật/tắt in
**Last updated**: 2026-06-30 09:05:35 +07
**Summary**: feat(order-tags): tag SOẠN HÀNG cho giỏ khi in phiếu soạn hàng + toggle admin bật/tắt in

## Files changed in this commit (`docs/`)

- `docs/dev-log.md`

## Last 5 commits touching `docs/`

- `904effde6` feat(order-tags): tag SOẠN HÀNG cho giỏ khi in phiếu soạn hàng + toggle admin bật/tắt in _(2026-06-30)_
- `ab463acb7` chore(session): RESUME:20260630-084412-a45eb07 _(2026-06-30)_
- `a45eb07b8` feat(unit-scan): modal chi tiết ghi rõ SP nào đang chờ hàng (pill ⏳ từ cho*hang.detail) *(2026-06-30)\_
- `d92d5f4a0` chore(session): RESUME:20260630-084032-e69f961 _(2026-06-30)_
- `e69f96129` feat(unit-scan): bấm ô sơ đồ kệ → mở modal chi tiết đơn (thay vì cuộn xuống) _(2026-06-30)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260630-090535-904effd` cho Claude walk chain theo CLAUDE.md protocol.
