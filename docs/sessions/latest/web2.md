# Latest Snapshot — `web2/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260530-105500-b8a5061`
**Session file**: [`./20260530-105500-b8a5061.md`](../20260530-105500-b8a5061.md)
**Commit**: `b8a5061` — feat(web2/purchase-refund): refactor lớn — auto Sổ Order + quick refund + ví NCC
**Last updated**: 2026-05-30 10:55:00 +07
**Summary**: feat(web2/purchase-refund): refactor lớn — auto Sổ Order + quick refund + ví NCC

## Files changed in this commit (`web2/`)

- `web2/purchase-refund/css/purchase-refund.css`
- `web2/purchase-refund/index.html`
- `web2/purchase-refund/js/purchase-refund-app.js`

## Last 5 commits touching `web2/`

- `b8a5061c8` feat(web2/purchase-refund): refactor lớn — auto Sổ Order + quick refund + ví NCC _(2026-05-30)_
- `916df85c9` auto: session update _(2026-05-30)_
- `68aa4f864` auto: session update _(2026-05-30)_
- `0a4d9de33` feat(web2/purchase-refund): picker chọn SP từ Kho group by NCC _(2026-05-30)_
- `f2451b14b` fix(web2-products): sheet lẻ (1 label) đẩy về slot 1 bên trái _(2026-05-30)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260530-105500-b8a5061` cho Claude walk chain theo CLAUDE.md protocol.
