# Latest Snapshot — `native-orders/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260620-103013-8059794`
**Session file**: [`./20260620-103013-8059794.md`](../20260620-103013-8059794.md)
**Commit**: `8059794` — chore(web2): bump ?v=20260620b (sidebar escapeHtml + chat double-send guard) -> deploy frontend security fixes
**Last updated**: 2026-06-20 10:30:13 +07
**Summary**: chore(web2): bump ?v=20260620b (sidebar escapeHtml + chat double-send guard) -> deploy frontend security fixes

## Files changed in this commit (`native-orders/`)

- `native-orders/index.html`

## Last 5 commits touching `native-orders/`

- `805979487` chore(web2): bump ?v=20260620b (sidebar escapeHtml + chat double-send guard) -> deploy frontend security fixes _(2026-06-20)_
- `23b5e998a` feat(web2): PWA dùng chung (Thêm vào Màn hình chính, iOS/Android) — manifest+apple meta+icon auto-inject qua sidebar.js, không App Store/dev account; bump sidebar ?v _(2026-06-20)_
- `d7296bcfa` feat(web2): shared mobile responsive (web2-mobile.css) — 1 nguồn cho mọi trang qua sidebar.js inject; bump sidebar ?v _(2026-06-19)_
- `95cdafe62` fix(native-orders): đơn Inbox hiện avatar — resolve fbId từ kho KH trước (không cần Pancake login) _(2026-06-19)_
- `140eb7ea7` fix(web2): product-card bỏ placeholder 'Tên sản phẩm' khi rỗng + nhắc đăng nhập FB/Pancake khi gửi tin lỗi _(2026-06-19)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260620-103013-8059794` cho Claude walk chain theo CLAUDE.md protocol.
