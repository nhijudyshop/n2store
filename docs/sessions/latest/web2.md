# Latest Snapshot — `web2/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260630-084412-a45eb07`
**Session file**: [`./20260630-084412-a45eb07.md`](../20260630-084412-a45eb07.md)
**Commit**: `a45eb07` — feat(unit-scan): modal chi tiết ghi rõ SP nào đang chờ hàng (pill ⏳ từ cho_hang.detail)
**Last updated**: 2026-06-30 08:44:12 +07
**Summary**: feat(unit-scan): modal chi tiết ghi rõ SP nào đang chờ hàng (pill ⏳ từ cho_hang.detail)

## Files changed in this commit (`web2/`)

- `web2/unit-scan/css/unit-scan.css`
- `web2/unit-scan/index.html`
- `web2/unit-scan/js/unit-scan.js`

## Last 5 commits touching `web2/`

- `a45eb07b8` feat(unit-scan): modal chi tiết ghi rõ SP nào đang chờ hàng (pill ⏳ từ cho*hang.detail) *(2026-06-30)\_
- `e69f96129` feat(unit-scan): bấm ô sơ đồ kệ → mở modal chi tiết đơn (thay vì cuộn xuống) _(2026-06-30)_
- `c26539902` feat(unit-scan): hiện tag đơn ngay trên ô sơ đồ kệ (pill trắng đọc rõ trên ô cam/xanh) _(2026-06-30)_
- `0d00e40a1` feat(unit-scan): modal đặt lên kệ hiện tag đơn (CHỜ HÀNG/PBH…) — tái dùng engine order-tags _(2026-06-30)_
- `6fc002794` feat(web2-zalo): đăng nhập GLOBAL always-on — admin, 2 cách (cookie/QR), lưu server + auto-refresh _(2026-06-30)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260630-084412-a45eb07` cho Claude walk chain theo CLAUDE.md protocol.
