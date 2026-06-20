# Latest Snapshot — `live-chat/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260620-103013-8059794`
**Session file**: [`./20260620-103013-8059794.md`](../20260620-103013-8059794.md)
**Commit**: `8059794` — chore(web2): bump ?v=20260620b (sidebar escapeHtml + chat double-send guard) -> deploy frontend security fixes
**Last updated**: 2026-06-20 10:30:13 +07
**Summary**: chore(web2): bump ?v=20260620b (sidebar escapeHtml + chat double-send guard) -> deploy frontend security fixes

## Files changed in this commit (`live-chat/`)

- `live-chat/chat.html`
- `live-chat/index.html`

## Last 5 commits touching `live-chat/`

- `805979487` chore(web2): bump ?v=20260620b (sidebar escapeHtml + chat double-send guard) -> deploy frontend security fixes _(2026-06-20)_
- `b2b899b9d` fix(web2/pwa): bo start*url co dinh -> them man hinh chinh luu DUNG trang dang mo (share trang nao luu trang do) *(2026-06-20)\_
- `9d9fcee8b` fix(live-chat): comments-mobile manifest RIÊNG (start*url=chính nó) → add màn hình chính mở đúng trang comment, không nhảy overview *(2026-06-20)\_
- `071ae4514` fix(live-chat): comments-mobile thêm apple-touch-icon + apple meta → 'Thêm màn hình chính' hiện logo (thay chữ C) _(2026-06-20)_
- `23b5e998a` feat(web2): PWA dùng chung (Thêm vào Màn hình chính, iOS/Android) — manifest+apple meta+icon auto-inject qua sidebar.js, không App Store/dev account; bump sidebar ?v _(2026-06-20)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260620-103013-8059794` cho Claude walk chain theo CLAUDE.md protocol.
