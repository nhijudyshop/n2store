# Latest Snapshot — `native-orders/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260609-162412-100ef03`
**Session file**: [`./20260609-162412-100ef03.md`](../20260609-162412-100ef03.md)
**Commit**: `100ef03` — fix(native-orders): icon 🖨 → XEM bill (preview) thay vì in; thêm Web2Bill.openPreview
**Last updated**: 2026-06-09 16:24:12 +07
**Summary**: fix(native-orders): icon 🖨 → XEM bill (preview) thay vì in; thêm Web2Bill.openPreview

## Files changed in this commit (`native-orders/`)

- `native-orders/js/native-orders-app.js`

## Last 5 commits touching `native-orders/`

- `100ef0323` fix(native-orders): icon 🖨 → XEM bill (preview) thay vì in; thêm Web2Bill.openPreview _(2026-06-09)_
- `5a2899aeb` feat(native-orders): bấm icon 🖨 in lại bill PBH 1 đơn — đúng loại theo trạng thái _(2026-06-09)_
- `284a8daff` auto: session update _(2026-06-09)_
- `c597262c7` auto: session update _(2026-06-09)_
- `1cd449d45` fix(native-orders): tab Đơn Inbox trống — bỏ qua filter chiến dịch livestream-only _(2026-06-09)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260609-162412-100ef03` cho Claude walk chain theo CLAUDE.md protocol.
