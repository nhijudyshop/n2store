# Latest Snapshot — `so-order/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260624-021229-a9ea99a`
**Session file**: [`./20260624-021229-a9ea99a.md`](../20260624-021229-a9ea99a.md)
**Commit**: `a9ea99a` — docs(web2): refine RLQ flag — verified narrow (per-line cap vs total-sold, not remaining), fix needs in-tx refactor
**Last updated**: 2026-06-24 02:12:29 +07
**Summary**: docs(web2): refine RLQ flag — verified narrow (per-line cap vs total-sold, not remaining), fix needs in-tx refactor

## Files changed in this commit (`so-order/`)

- `so-order/js/so-order-barcode.js`
- `so-order/js/so-order-kho-sync.js`
- `so-order/js/so-order-receive.js`

## Last 5 commits touching `so-order/`

- `66a2f707d` fix(web2): split-PBH cancel restocks ALL splits + 5 frontend silent-failure surfaces _(2026-06-24)_
- `03f16bb21` fix(web2): so-order syncRowsToKho surfaces per-item upsert errors (no silent swallow) _(2026-06-24)_
- `153a6091a` refactor(web2): migrate products/variants/customer caches onto Web2SmartCache _(2026-06-23)_
- `fceb82e86` feat(web2): Web2SmartCache primitive (SWR+IDB+SSE+dedup) + adopt in suppliers-cache _(2026-06-23)_
- `3c5b527dc` chore(web2): bump web2-sidebar.js/.css?v=20260623up1 (footer profile + avatar) trên 48 trang _(2026-06-23)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260624-021229-a9ea99a` cho Claude walk chain theo CLAUDE.md protocol.
