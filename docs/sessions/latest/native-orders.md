# Latest Snapshot — `native-orders/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260619-002426-eaf9213`
**Session file**: [`./20260619-002426-eaf9213.md`](../20260619-002426-eaf9213.md)
**Commit**: `eaf9213` — refactor(web2): Wave 3 — tách so-order-app.js (5932, file lớn nhất) → 23 module MOVE-only
**Last updated**: 2026-06-19 00:24:26 +07
**Summary**: Wave 3 standalone tier XONG: 18 file split (foundation+W1+W2+W3-standalone incl so-order 5932→23). Còn chat-infra+native-orders surgery+live-chat cluster

## Files changed in this commit (`native-orders/`)

- `native-orders/index.html`

## Last 5 commits touching `native-orders/`

- `156a906c9` refactor(web2): Wave 3 batch C — photo-studio(2348→7) + products-app(2010→7) + msg-template(961→4) MOVE-only _(2026-06-18)_
- `559786ffb` refactor(web2-chat): Phase 1b — retire Web2ChatReadonly → Web2CustomerChat({layout:'modal',readonly}) _(2026-06-18)_
- `26a18e91c` fix(native-orders): giữ modal 3-cột Pancake (có tìm kiếm) + fallback resolve hội thoại theo SĐT khi fbid lệch PSID _(2026-06-18)_
- `5f656a890` feat(web2/product-counter): phone-only app-like UI (full-screen, safe-area, bottom-bar thumb-zone) _(2026-06-18)_
- `6d1fc53f2` fix(web2): audit toàn bộ Web 2.0 — 16 bug (IME, race, null-deref, leak, double-submit, money display) _(2026-06-18)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260619-002426-eaf9213` cho Claude walk chain theo CLAUDE.md protocol.
