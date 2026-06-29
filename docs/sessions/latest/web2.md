# Latest Snapshot — `web2/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260629-232944-8446e7b`
**Session file**: [`./20260629-232944-8446e7b.md`](../20260629-232944-8446e7b.md)
**Commit**: `8446e7b` — feat(web2-variants): trường Nhóm modal → SELECT bắt buộc (Màu/Size)
**Last updated**: 2026-06-29 23:29:44 +07
**Summary**: web2-variants: trường Nhóm modal biến thể → SELECT bắt buộc Màu/Size + guard validation

## Files changed in this commit (`web2/`)

- `web2/variants/index.html`
- `web2/variants/js/web2-variants-app.js`

## Last 5 commits touching `web2/`

- `8446e7bac` feat(web2-variants): trường Nhóm modal → SELECT bắt buộc (Màu/Size) _(2026-06-29)_
- `9403ec175` perf(in-bill): gộp Phiếu Soạn Hàng vào đường in chung Web2Bill + bridge _(2026-06-29)_
- `c09724e18` feat(putwall): đèn put-to-light (ESP32+WS2811) cho Quét tem + tài liệu lắp/mua _(2026-06-29)_
- `f92f54010` auto: session update _(2026-06-29)_
- `80d81ca1b` feat(web2/system): nút mở link tunnel máy Gemini trong tab Services _(2026-06-29)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260629-232944-8446e7b` cho Claude walk chain theo CLAUDE.md protocol.
