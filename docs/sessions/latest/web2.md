# Latest Snapshot — `web2/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260609-162412-100ef03`
**Session file**: [`./20260609-162412-100ef03.md`](../20260609-162412-100ef03.md)
**Commit**: `100ef03` — fix(native-orders): icon 🖨 → XEM bill (preview) thay vì in; thêm Web2Bill.openPreview
**Last updated**: 2026-06-09 16:24:12 +07
**Summary**: fix(native-orders): icon 🖨 → XEM bill (preview) thay vì in; thêm Web2Bill.openPreview

## Files changed in this commit (`web2/`)

- `web2/shared/web2-bill-service.js`

## Last 5 commits touching `web2/`

- `100ef0323` fix(native-orders): icon 🖨 → XEM bill (preview) thay vì in; thêm Web2Bill.openPreview _(2026-06-09)_
- `e7bf6117d` feat(web2): tem mã SP — mã SP xuống dưới QR, canh giữa, rộng = QR _(2026-06-09)_
- `03d48a173` auto: session update _(2026-06-09)_
- `57a8823e5` fix(web2-kpi): sửa 5 lỗi logic KPI + dọn dead code projection _(2026-06-09)_
- `42a115d8e` auto: session update _(2026-06-09)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260609-162412-100ef03` cho Claude walk chain theo CLAUDE.md protocol.
