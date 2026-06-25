# Latest Snapshot — `so-order/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260625-163554-dfde626`
**Session file**: [`./20260625-163554-dfde626.md`](../20260625-163554-dfde626.md)
**Commit**: `dfde626` — auto: session update
**Last updated**: 2026-06-25 16:35:54 +07
**Summary**: auto: session update

## Files changed in this commit (`so-order/`)

- `so-order/index.html`
- `so-order/js/so-order-kho-sync.js`

## Last 5 commits touching `so-order/`

- `dfde62633` auto: session update _(2026-06-25)_
- `66a2f707d` fix(web2): split-PBH cancel restocks ALL splits + 5 frontend silent-failure surfaces _(2026-06-24)_
- `03f16bb21` fix(web2): so-order syncRowsToKho surfaces per-item upsert errors (no silent swallow) _(2026-06-24)_
- `153a6091a` refactor(web2): migrate products/variants/customer caches onto Web2SmartCache _(2026-06-23)_
- `fceb82e86` feat(web2): Web2SmartCache primitive (SWR+IDB+SSE+dedup) + adopt in suppliers-cache _(2026-06-23)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260625-163554-dfde626` cho Claude walk chain theo CLAUDE.md protocol.
