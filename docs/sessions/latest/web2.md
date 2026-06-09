# Latest Snapshot — `web2/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260609-162818-74098ca`
**Session file**: [`./20260609-162818-74098ca.md`](../20260609-162818-74098ca.md)
**Commit**: `74098ca` — auto: session update
**Last updated**: 2026-06-09 16:28:18 +07
**Summary**: auto: session update

## Files changed in this commit (`web2/`)

- `web2/kpi/js/kpi-assignments.js`

## Last 5 commits touching `web2/`

- `74098cab5` auto: session update _(2026-06-09)_
- `100ef0323` fix(native-orders): icon 🖨 → XEM bill (preview) thay vì in; thêm Web2Bill.openPreview _(2026-06-09)_
- `e7bf6117d` feat(web2): tem mã SP — mã SP xuống dưới QR, canh giữa, rộng = QR _(2026-06-09)_
- `03d48a173` auto: session update _(2026-06-09)_
- `57a8823e5` fix(web2-kpi): sửa 5 lỗi logic KPI + dọn dead code projection _(2026-06-09)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260609-162818-74098ca` cho Claude walk chain theo CLAUDE.md protocol.
