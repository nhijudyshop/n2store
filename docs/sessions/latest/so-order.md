# Latest Snapshot — `so-order/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260618-210709-36445c0`
**Session file**: [`./20260618-210709-36445c0.md`](../20260618-210709-36445c0.md)
**Commit**: `36445c0` — feat(so-order): Quét mã (camera) + Đọc nhãn (OCR) trong modal Thêm SP — nhập kho từ pack (a/b/c xong)
**Last updated**: 2026-06-18 21:07:09 +07
**Summary**: feat(so-order): Quét mã (camera) + Đọc nhãn (OCR) trong modal Thêm SP — nhập kho từ pack (a/b/c xong)

## Files changed in this commit (`so-order/`)

- `so-order/index.html`
- `so-order/js/so-order-app.js`

## Last 5 commits touching `so-order/`

- `36445c0bd` feat(so-order): Quét mã (camera) + Đọc nhãn (OCR) trong modal Thêm SP — nhập kho từ pack (a/b/c xong) _(2026-06-18)_
- `6d1fc53f2` fix(web2): audit toàn bộ Web 2.0 — 16 bug (IME, race, null-deref, leak, double-submit, money display) _(2026-06-18)_
- `d68cf952d` feat(web2): Popup dùng chung — alert/confirm/popup nhiều loại + hiệu ứng custom + migrate toàn cục _(2026-06-17)_
- `8ffcdb496` fix(so-order): meta per-NCC sub-header value-driven + cụm Sửa lô luôn hiện đủ 5 ô (verified end-to-end) _(2026-06-17)_
- `f5b81826f` auto: session update _(2026-06-17)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260618-210709-36445c0` cho Claude walk chain theo CLAUDE.md protocol.
