# Latest Snapshot — `docs/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260623-105516-e2d9dce`
**Session file**: [`./20260623-105516-e2d9dce.md`](../20260623-105516-e2d9dce.md)
**Commit**: `e2d9dce` — docs(dev-log): browser-test fix over-restock partial + /tx ledger-mint (#2) — both verified live
**Last updated**: 2026-06-23 10:55:16 +07
**Summary**: browser-test fix over-restock (returned_line_qty) + /tx amount recompute #2 — verified live

## Files changed in this commit (`docs/`)

- `docs/dev-log.md`

## Last 5 commits touching `docs/`

- `e2d9dce45` docs(dev-log): browser-test fix over-restock partial + /tx ledger-mint (#2) — both verified live _(2026-06-23)_
- `5e3229713` chore(session): RESUME:20260623-102838-1928328 _(2026-06-23)_
- `1928328b8` docs(dev-log): browser-test ví NCC quick-refund cross-page — stock+ledger+idempotency+amount-cap+shared-cap PASS _(2026-06-23)_
- `73b7c0cdf` chore(session): RESUME:20260623-102004-dcfe887 _(2026-06-23)_
- `dcfe887e3` docs(dev-log): browser-test battery — 5 money/stock flows PASS, round-5 COD fix verified live _(2026-06-23)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260623-105516-e2d9dce` cho Claude walk chain theo CLAUDE.md protocol.
