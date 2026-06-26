# Latest Snapshot — `web2/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260626-115243-9256bd0`
**Session file**: [`./20260626-115243-9256bd0.md`](../20260626-115243-9256bd0.md)
**Commit**: `9256bd0` — auto: session update
**Last updated**: 2026-06-26 11:52:43 +07
**Summary**: auto: session update

## Files changed in this commit (`web2/`)

- `web2/purchase-refund/index.html`
- `web2/purchase-refund/js/purchase-refund-actions.js`
- `web2/purchase-refund/js/purchase-refund-modal.js`
- `web2/shared/web2-auth.js`

## Last 5 commits touching `web2/`

- `9256bd09f` auto: session update _(2026-06-26)_
- `ee87d0d9c` feat(web2/auth): global fetch guard — web2 WRITE 401 → đăng xuất re-login (Part B) _(2026-06-26)_
- `ec8e33aa7` auto: session update _(2026-06-26)_
- `95a9bbeb0` feat(web2 print): đổi tiêu đề modal in 'In mã vạch' → 'In mã sản phẩm' (module dùng chung) _(2026-06-26)_
- `39372353d` fix(so-order): in tem/mã SP dùng CHUNG module web2/products, gỡ modal 'In mã vạch' legacy fork _(2026-06-26)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260626-115243-9256bd0` cho Claude walk chain theo CLAUDE.md protocol.
