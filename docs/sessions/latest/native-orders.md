# Latest Snapshot — `native-orders/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260615-174532-96805cf`
**Session file**: [`./20260615-174532-96805cf.md`](../20260615-174532-96805cf.md)
**Commit**: `96805cf` — feat(web2): 'Đa dụng Web 2.0' thành group sidebar, 'Tăng số lượng comment' là trang trong group
**Last updated**: 2026-06-15 17:45:32 +07
**Summary**: feat(web2): 'Đa dụng Web 2.0' thành group sidebar, 'Tăng số lượng comment' là trang trong group

## Files changed in this commit (`native-orders/`)

- `native-orders/index.html`

## Last 5 commits touching `native-orders/`

- `96805cf64` feat(web2): 'Đa dụng Web 2.0' thành group sidebar, 'Tăng số lượng comment' là trang trong group _(2026-06-15)_
- `81adccb7e` refactor(web2): gỡ TPOS perm registry + 3 N+1 batch endpoint (đợt 2) _(2026-06-15)_
- `a5d0f7abb` perf(web2,wallet-pill): gom N request /by-phone → 1 POST /batch-summary + browser-verify Firebase removal sạch _(2026-06-14)_
- `797c2c301` auto: session update _(2026-06-14)_
- `805a08866` fix(web2-split): route delivery-invoices/refunds to web2-api + repoint hardcoded web2→fallback URLs _(2026-06-14)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260615-174532-96805cf` cho Claude walk chain theo CLAUDE.md protocol.
