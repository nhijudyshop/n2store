# Latest Snapshot — `so-order/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260619-002426-eaf9213`
**Session file**: [`./20260619-002426-eaf9213.md`](../20260619-002426-eaf9213.md)
**Commit**: `eaf9213` — refactor(web2): Wave 3 — tách so-order-app.js (5932, file lớn nhất) → 23 module MOVE-only
**Last updated**: 2026-06-19 00:24:26 +07
**Summary**: Wave 3 standalone tier XONG: 18 file split (foundation+W1+W2+W3-standalone incl so-order 5932→23). Còn chat-infra+native-orders surgery+live-chat cluster

## Files changed in this commit (`so-order/`)

- `so-order/index.html`
- `so-order/js/so-order-app.js`
- `so-order/js/so-order-barcode.js`
- `so-order/js/so-order-bulk-edit.js`
- `so-order/js/so-order-confirm.js`
- `so-order/js/so-order-delete.js`
- `so-order/js/so-order-format.js`
- `so-order/js/so-order-image-modal.js`
- `so-order/js/so-order-import.js`
- `so-order/js/so-order-inline-edit.js`
- `so-order/js/so-order-kho-sync.js`
- `so-order/js/so-order-modal-core.js`
- `so-order/js/so-order-modal-image.js`
- `so-order/js/so-order-modal-open.js`
- `so-order/js/so-order-modal-random.js`
- `so-order/js/so-order-modal-submit.js`
- `so-order/js/so-order-modal-suggest.js`
- `so-order/js/so-order-receive.js`
- `so-order/js/so-order-render-cells.js`
- `so-order/js/so-order-render.js`
- `so-order/js/so-order-settings.js`
- `so-order/js/so-order-shipment.js`
- `so-order/js/so-order-state.js`
- `so-order/js/so-order-toolbar.js`

## Last 5 commits touching `so-order/`

- `eaf9213a4` refactor(web2): Wave 3 — tách so-order-app.js (5932, file lớn nhất) → 23 module MOVE-only _(2026-06-19)_
- `36445c0bd` feat(so-order): Quét mã (camera) + Đọc nhãn (OCR) trong modal Thêm SP — nhập kho từ pack (a/b/c xong) _(2026-06-18)_
- `6d1fc53f2` fix(web2): audit toàn bộ Web 2.0 — 16 bug (IME, race, null-deref, leak, double-submit, money display) _(2026-06-18)_
- `d68cf952d` feat(web2): Popup dùng chung — alert/confirm/popup nhiều loại + hiệu ứng custom + migrate toàn cục _(2026-06-17)_
- `8ffcdb496` fix(so-order): meta per-NCC sub-header value-driven + cụm Sửa lô luôn hiện đủ 5 ô (verified end-to-end) _(2026-06-17)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260619-002426-eaf9213` cho Claude walk chain theo CLAUDE.md protocol.
