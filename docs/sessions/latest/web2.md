# Latest Snapshot — `web2/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260526-102846-ddf6d3d`
**Session file**: [`./20260526-102846-ddf6d3d.md`](../20260526-102846-ddf6d3d.md)
**Commit**: `ddf6d3d` — auto: session update
**Last updated**: 2026-05-26 10:28:46 +07
**Summary**: auto: session update

## Files changed in this commit (`web2/`)

- `web2/balance-history/index.html`
- `web2/balance-history/js/web2-balance-history-app.js`

## Last 5 commits touching `web2/`

- `712e7cf91` feat(web2/balance-history): bulk reprocess unmatched (996 NO*PHONE rows backfilled) *(2026-05-26)\_
- `8f8a5cf1a` auto: session update _(2026-05-26)_
- `6ed0ed93c` auto: session update _(2026-05-26)_
- `c099cebd9` fix(web2/customer-wallet): merge wallet-only customers (KH có ví Web 2 nhưng chưa lập PBH) _(2026-05-26)_
- `3f016dafa` feat(web2): Phase 4 — customer-wallet drop Firestore + balance-history smart customer search _(2026-05-25)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260526-102846-ddf6d3d` cho Claude walk chain theo CLAUDE.md protocol.
