# Latest Snapshot — `web2/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260605-153422-d556ecb`
**Session file**: [`./20260605-153422-d556ecb.md`](../20260605-153422-d556ecb.md)
**Commit**: `d556ecb` — auto: session update
**Last updated**: 2026-06-05 15:34:22 +07
**Summary**: auto: session update

## Files changed in this commit (`web2/`)

- `web2/overview/index.html`
- `web2/products/index.html`
- `web2/products/js/web2-products-app.js`
- `web2/products/js/web2-products-print.js`

## Last 5 commits touching `web2/`

- `67c16589a` docs(dev-log): print count Phase 2 _(2026-06-05)_
- `001b22382` feat(web2 print-count Phase2): ghi so lan in - don (native*orders.print_count) khi in bill/soan hang + SP (web2_products.print_count) khi in tem -> badge 'Da in Nx' tranh in trung. Endpoints /mark-printed (native + products) *(2026-06-05)\_
- `70e32bb69` refactor(web2): unread logic authoritative thuần (bỏ mirror Web 1.0 + nút Đã đọc) _(2026-06-05)_
- `c4557d45a` feat(web2 overview): card dang nhap/danh tinh (web2/login + web2/users) - phan quyen + gan danh tinh nguoi thuc hien + lich su hanh dong; chua login bill ghi 'an danh' _(2026-06-05)_
- `c751cf9fa` fix(web2 bill): tat ca bill in ten nguoi ban = user dang dang nhap (Web2UserInfo.get().userName), fallback NV gan don _(2026-06-05)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260605-153422-d556ecb` cho Claude walk chain theo CLAUDE.md protocol.
