# Latest Snapshot — `web2/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260530-103348-0a4d9de`
**Session file**: [`./20260530-103348-0a4d9de.md`](../20260530-103348-0a4d9de.md)
**Commit**: `0a4d9de` — feat(web2/purchase-refund): picker chọn SP từ Kho group by NCC
**Last updated**: 2026-05-30 10:33:48 +07
**Summary**: feat(web2/purchase-refund): picker chọn SP từ Kho group by NCC

## Files changed in this commit (`web2/`)

- `web2/purchase-refund/css/purchase-refund.css`
- `web2/purchase-refund/index.html`
- `web2/purchase-refund/js/purchase-refund-app.js`

## Last 5 commits touching `web2/`

- `0a4d9de33` feat(web2/purchase-refund): picker chọn SP từ Kho group by NCC _(2026-05-30)_
- `f2451b14b` fix(web2-products): sheet lẻ (1 label) đẩy về slot 1 bên trái _(2026-05-30)_
- `aac5b3241` auto: session update _(2026-05-30)_
- `514d8b204` auto: session update _(2026-05-30)_
- `ec4c6d2b6` fix(web2/purchase-refund): modal pr-modal luôn open khi load page _(2026-05-30)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260530-103348-0a4d9de` cho Claude walk chain theo CLAUDE.md protocol.
