# Latest Snapshot — `native-orders/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260620-001022-dc07206`
**Session file**: [`./20260620-001022-dc07206.md`](../20260620-001022-dc07206.md)
**Commit**: `dc07206` — docs(web2): dev-log + codemap cho PWA dùng chung
**Last updated**: 2026-06-20 00:10:22 +07
**Summary**: docs(web2): dev-log + codemap cho PWA dùng chung

## Files changed in this commit (`native-orders/`)

- `native-orders/index.html`

## Last 5 commits touching `native-orders/`

- `23b5e998a` feat(web2): PWA dùng chung (Thêm vào Màn hình chính, iOS/Android) — manifest+apple meta+icon auto-inject qua sidebar.js, không App Store/dev account; bump sidebar ?v _(2026-06-20)_
- `d7296bcfa` feat(web2): shared mobile responsive (web2-mobile.css) — 1 nguồn cho mọi trang qua sidebar.js inject; bump sidebar ?v _(2026-06-19)_
- `95cdafe62` fix(native-orders): đơn Inbox hiện avatar — resolve fbId từ kho KH trước (không cần Pancake login) _(2026-06-19)_
- `140eb7ea7` fix(web2): product-card bỏ placeholder 'Tên sản phẩm' khi rỗng + nhắc đăng nhập FB/Pancake khi gửi tin lỗi _(2026-06-19)_
- `68d3642ea` Revert "fix(web2-chat): hiện rõ lý do Pancake bypass-extension lỗi + detect extension chắc hơn" _(2026-06-19)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260620-001022-dc07206` cho Claude walk chain theo CLAUDE.md protocol.
