# Latest Snapshot — `native-orders/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260520-170202-2ec46af`
**Session file**: [`./20260520-170202-2ec46af.md`](../20260520-170202-2ec46af.md)
**Commit**: `2ec46af` — auto: session update
**Last updated**: 2026-05-20 17:02:02 +07
**Summary**: auto: session update

## Files changed in this commit (`native-orders/`)

- `native-orders/js/native-orders-app.js`

## Last 5 commits touching `native-orders/`

- `51e4f3cf` feat(web2/native-orders): tách nút Xoá (draft) vs Huỷ (confirmed) — draft xoá hẳn DB, confirmed cancel + restock PBH _(2026-05-20)_
- `6fe48527` feat(web2/PBH): split-PBH (tách đơn) — 1 native-order → nhiều PBH với STT 24-2, 24-3... _(2026-05-20)_
- `ea49f58f` feat(web2): 2-way state sync native-orders ↔ PBH + nút Huỷ đơn + bỏ Xác nhận PBH _(2026-05-20)_
- `0599b1dd` feat(web2): page-tag comments, frontend wire 3 endpoints, Trả hàng NCC stub _(2026-05-20)_
- `fca5c7ec` fix(web2/realtime): stop retry direct WS sau handshake fail + skip direct trong webdriver _(2026-05-20)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260520-170202-2ec46af` cho Claude walk chain theo CLAUDE.md protocol.
