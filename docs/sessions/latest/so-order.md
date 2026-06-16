# Latest Snapshot — `so-order/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260616-170353-d6df92a`
**Session file**: [`./20260616-170353-d6df92a.md`](../20260616-170353-d6df92a.md)
**Commit**: `d6df92a` — feat(so-order): nhóm NCC 'Đã nhận' dồn xuống cuối lô (render-only, giữ rowspan + pending lên trên)
**Last updated**: 2026-06-16 17:03:53 +07
**Summary**: feat(so-order): nhóm NCC 'Đã nhận' dồn xuống cuối lô (render-only, giữ rowspan + pending lên trên)

## Files changed in this commit (`so-order/`)

- `so-order/index.html`
- `so-order/js/so-order-app.js`

## Last 5 commits touching `so-order/`

- `d6df92a4e` feat(so-order): nhóm NCC 'Đã nhận' dồn xuống cuối lô (render-only, giữ rowspan + pending lên trên) _(2026-06-16)_
- `f9e397868` auto: session update _(2026-06-16)_
- `3d2106113` auto: session update _(2026-06-16)_
- `558680a25` fix(so-order): lấy SP từ Kho SP (VND) vào đơn → quy đổi ÷tab.rate ra tiền tab (helper fromVnd); chống corrupt giá kho khi re-save tab ngoại tệ _(2026-06-16)_
- `c7b772e14` auto: session update _(2026-06-16)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260616-170353-d6df92a` cho Claude walk chain theo CLAUDE.md protocol.
