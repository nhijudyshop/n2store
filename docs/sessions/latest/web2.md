# Latest Snapshot — `web2/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260519-091856-3c5d5c1`
**Session file**: [`./20260519-091856-3c5d5c1.md`](../20260519-091856-3c5d5c1.md)
**Commit**: `3c5d5c1` — feat(web2-products): SSE pub/sub thay Firestore tickle — server broadcast khi DB write
**Last updated**: 2026-05-19 09:18:56 +07
**Summary**: feat(web2-products): SSE pub/sub thay Firestore tickle — server broadcast khi DB write

## Files changed in this commit (`web2/`)

- `web2/products/index.html`
- `web2/shared/web2-products-cache.js`
- `web2/shared/web2-sse-bridge.js`
- `web2/supplier-wallet/index.html`

## Last 5 commits touching `web2/`

- `3c5d5c10` feat(web2-products): SSE pub/sub thay Firestore tickle — server broadcast khi DB write _(2026-05-19)_
- `c6f1321f` feat(web2-products+so-order): full 2-way sync delete/edit qty ⇄ pending*qty *(2026-05-18)\_
- `40df3b7b` fix(web2-products+so-order): show CHỜ HÀNG status + VND price ×1000 shorthand _(2026-05-18)_
- `cbba186a` feat(web2-effects+so-order+products): paste-only image upload + compress JPEG _(2026-05-18)_
- `c43e9eaf` auto: session update _(2026-05-18)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260519-091856-3c5d5c1` cho Claude walk chain theo CLAUDE.md protocol.
