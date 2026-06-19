# Latest Snapshot — `so-order/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260619-090219-f599421`
**Session file**: [`./20260619-090219-f599421.md`](../20260619-090219-f599421.md)
**Commit**: `f599421` — feat(live-chat): Phase D — smoke-live-chat-server.sh (post-deploy verify cho server.js split) + dev-log tổng hợp A/B/C/D
**Last updated**: 2026-06-19 09:02:19 +07
**Summary**: Làm tất cả XONG: 0 oversized + adoption §4 (41 file) + 6 shared module + server.js smoke script. Modularization Web2 hoàn chỉnh

## Files changed in this commit (`so-order/`)

- `so-order/index.html`
- `so-order/js/so-order-format.js`
- `so-order/js/so-order-storage-sync.js`
- `so-order/js/so-order-storage.js`

## Last 5 commits touching `so-order/`

- `27296dea5` refactor(web2): Phase C — adopt shared utils (thin-delegate + fallback) → '1 nguồn' _(2026-06-19)_
- `f32834f09` refactor(web2): Phase A tail — so-order-storage(962→795+212) split + pancake-token-manager(802→800 trim) _(2026-06-19)_
- `eaf9213a4` refactor(web2): Wave 3 — tách so-order-app.js (5932, file lớn nhất) → 23 module MOVE-only _(2026-06-19)_
- `36445c0bd` feat(so-order): Quét mã (camera) + Đọc nhãn (OCR) trong modal Thêm SP — nhập kho từ pack (a/b/c xong) _(2026-06-18)_
- `6d1fc53f2` fix(web2): audit toàn bộ Web 2.0 — 16 bug (IME, race, null-deref, leak, double-submit, money display) _(2026-06-18)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260619-090219-f599421` cho Claude walk chain theo CLAUDE.md protocol.
