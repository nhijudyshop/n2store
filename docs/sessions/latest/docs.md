# Latest Snapshot — `docs/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260520-150915-6e975fb`
**Session file**: [`./20260520-150915-6e975fb.md`](../20260520-150915-6e975fb.md)
**Commit**: `6e975fb` — feat(web2/PBH+delivery): return-failed restock, stats chia đơn shipper, confirm đơn web
**Last updated**: 2026-05-20 15:09:15 +07
**Summary**: feat(web2/PBH+delivery): return-failed restock, stats chia đơn shipper, confirm đơn web

## Files changed in this commit (`docs/`)

- `docs/dev-log.md`

## Last 5 commits touching `docs/`

- `6e975fb5` feat(web2/PBH+delivery): return-failed restock, stats chia đơn shipper, confirm đơn web _(2026-05-20)_
- `5acd6377` fix(web2/PBH)[CRITICAL]: chặn over-sell + restock khi cancel _(2026-05-20)_
- `9fb54e7e` chore(session): RESUME:20260520-112443-e4a31f2 _(2026-05-20)_
- `fca5c7ec` fix(web2/realtime): stop retry direct WS sau handshake fail + skip direct trong webdriver _(2026-05-20)_
- `b19eda7a` feat(delivery-report): rewrite note ticket 1:1 theo customer-wallet _(2026-05-20)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260520-150915-6e975fb` cho Claude walk chain theo CLAUDE.md protocol.
