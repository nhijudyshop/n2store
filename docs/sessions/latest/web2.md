# Latest Snapshot — `web2/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260620-114903-65d6ba9`
**Session file**: [`./20260620-114903-65d6ba9.md`](../20260620-114903-65d6ba9.md)
**Commit**: `65d6ba9` — fix(web2): medium/low audit fixes (25 file) — leaks/races/guards + bump ?v=20260620c
**Last updated**: 2026-06-20 11:49:03 +07
**Summary**: fix(web2): medium/low audit fixes (25 file) — leaks/races/guards + bump ?v=20260620c

## Files changed in this commit (`web2/`)

- `web2/delivery-zone/index.html`
- `web2/fb-posts/index.html`
- `web2/fb-posts/js/fb-posts-app.js`
- `web2/photo-studio/index.html`
- `web2/photo-studio/photo-studio-bg.js`
- `web2/photo-studio/photo-studio-canvas.js`
- `web2/photo-studio/photo-studio-ui.js`
- `web2/product-category/index.html`
- `web2/product-counter/index.html`
- `web2/product-counter/js/product-counter.js`
- `web2/products/index.html`
- `web2/products/js/web2-product-detail.js`
- `web2/products/js/web2-products-actions.js`
- `web2/products/js/web2-products-modal.js`
- `web2/reconcile/index.html`
- `web2/reconcile/js/reconcile-actions.js`
- `web2/reconcile/js/reconcile-api.js`
- `web2/shared/page-builder.js`
- `web2/shared/web2-ck-assign-picker.js`
- `web2/shared/web2-msg-template.js`
- `web2/shared/web2-product-counter.js`
- `web2/supplier-wallet/index.html`
- `web2/supplier-wallet/js/supplier-wallet-actions.js`
- `web2/variants/index.html`
- `web2/variants/js/web2-variants-app.js`
- `web2/video-beauty/index.html`
- `web2/video-beauty/js/video-beauty-export.js`
- `web2/video-beauty/js/video-beauty.js`
- `web2/video-maker/index.html`
- `web2/video-maker/js/video-maker.js`

## Last 5 commits touching `web2/`

- `65d6ba9b4` fix(web2): medium/low audit fixes (25 file) — leaks/races/guards + bump ?v=20260620c _(2026-06-20)_
- `805979487` chore(web2): bump ?v=20260620b (sidebar escapeHtml + chat double-send guard) -> deploy frontend security fixes _(2026-06-20)_
- `c42670c11` fix(web2): audit fixes — gate auth + SSRF + money + idempotency (21 file) _(2026-06-20)_
- `5c4f6d941` feat(web2/pos-installer): bo cai .bat -> MENU bam so (Print Bridge / VieNeu / OmniVoice / cai het) + rule doc shared truoc khi code _(2026-06-20)_
- `04af663e2` feat(web2/picker): xem SP dang DANH SACH (anh + ten + ma + gia) thay vi luoi anh _(2026-06-20)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260620-114903-65d6ba9` cho Claude walk chain theo CLAUDE.md protocol.
