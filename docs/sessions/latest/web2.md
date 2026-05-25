# Latest Snapshot — `web2/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260525-093831-5798b95`
**Session file**: [`./20260525-093831-5798b95.md`](../20260525-093831-5798b95.md)
**Commit**: `5798b95` — auto: session update
**Last updated**: 2026-05-25 09:38:31 +07
**Summary**: auto: session update

## Files changed in this commit (`web2/`)

- `web2/products/css/web2-products.css`
- `web2/products/index.html`
- `web2/products/js/web2-products-app.js`

## Last 5 commits touching `web2/`

- `5798b95ba` auto: session update _(2026-05-25)_
- `5e5ec5372` fix(web2/products SSE): tách _sseReloadTimer + \_sseUsageTimer riêng _(2026-05-23)\_
- `a8129c3dd` fix(web2/products): edit lưu SP không re-render bảng + giữ nguyên index _(2026-05-22)_
- `fd69447b4` fix(web2/products): variant click đóng dropdown + override mã bằng variant shortCode _(2026-05-22)_
- `1015d5bc4` feat(web2/products): NCC dropdown từ so*order_v2 + auto-regen mã khi đổi NCC/Tên/Biến thể *(2026-05-22)\_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260525-093831-5798b95` cho Claude walk chain theo CLAUDE.md protocol.
