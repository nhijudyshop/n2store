# Latest Snapshot — `web2/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260629-103954-bc8640b`
**Session file**: [`./20260629-103954-bc8640b.md`](../20260629-103954-bc8640b.md)
**Commit**: `bc8640b` — feat(clearance): admin-only chuyển SP rớt xả ↔ kho chính (gate POST /:id/clearance + ẩn nút non-admin)
**Last updated**: 2026-06-29 10:39:54 +07
**Summary**: feat(clearance): admin-only chuyển SP rớt xả ↔ kho chính (gate POST /:id/clearance + ẩn nút non-admin)

## Files changed in this commit (`web2/`)

- `web2/clearance/index.html`
- `web2/clearance/js/clearance.js`

## Last 5 commits touching `web2/`

- `bc8640b9f` feat(clearance): admin-only chuyển SP rớt xả ↔ kho chính (gate POST /:id/clearance + ẩn nút non-admin) _(2026-06-29)_
- `b5afc142f` fix(web2/ai-assistant): lỗi provider chứa "token" bị nhầm là phiên hết hạn → đăng xuất oan _(2026-06-29)_
- `b95677bbf` auto: session update _(2026-06-29)_
- `9fd3316f6` feat(unit-scan): quét tem hiện số liệu live SP (Bán/KH mới/NCC/Còn/Tồn) như live-control _(2026-06-29)_
- `8b49f216f` fix(web2/ai-assistant,login): phiên hết hạn → thông báo rõ + redirect chuẩn _(2026-06-29)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260629-103954-bc8640b` cho Claude walk chain theo CLAUDE.md protocol.
