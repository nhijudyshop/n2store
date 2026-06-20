# Latest Snapshot — `web2/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260620-190402-b16d82b`
**Session file**: [`./20260620-190402-b16d82b.md`](../20260620-190402-b16d82b.md)
**Commit**: `b16d82b` — auto: session update
**Last updated**: 2026-06-20 19:04:02 +07
**Summary**: auto: session update

## Files changed in this commit (`web2/`)

- `web2/fb-posts/index.html`
- `web2/photo-editor/index.html`
- `web2/product-card/index.html`
- `web2/products/index.html`
- `web2/purchase-refund/index.html`
- `web2/reconcile/index.html`
- `web2/reconcile/js/reconcile-state.js`
- `web2/shared/web2-base.css`
- `web2/shared/web2-products-api.js`
- `web2/shared/web2-products-cache.js`
- `web2/supplier-wallet/index.html`
- `web2/video-maker/index.html`

## Last 5 commits touching `web2/`

- `b16d82b83` auto: session update _(2026-06-20)_
- `784b6d0e7` fix(web2): cache tu nap Web2ProductsApi (shared) -> picker load SP khong can vao Kho SP truoc _(2026-06-20)_
- `3f8e516a5` auto: session update _(2026-06-20)_
- `7eef1e1be` fix(web2/reconcile): client gui x-web2-token (regression tu audit gate reconcile route) - sua 'thieu/sai token' _(2026-06-20)_
- `919af1153` feat(web2/multi-tool): job tang comment nen XONG tu don comment da tang khoi live-chat _(2026-06-20)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260620-190402-b16d82b` cho Claude walk chain theo CLAUDE.md protocol.
