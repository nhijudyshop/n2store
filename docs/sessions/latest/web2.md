# Latest Snapshot — `web2/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260526-102319-8f8a5cf`
**Session file**: [`./20260526-102319-8f8a5cf.md`](../20260526-102319-8f8a5cf.md)
**Commit**: `8f8a5cf` — auto: session update
**Last updated**: 2026-05-26 10:23:19 +07
**Summary**: auto: session update

## Files changed in this commit (`web2/`)

- `web2/customer-wallet/css/customer-wallet.css`
- `web2/customer-wallet/index.html`
- `web2/customer-wallet/js/web2-customer-wallet-app.js`

## Last 5 commits touching `web2/`

- `8f8a5cf1a` auto: session update _(2026-05-26)_
- `6ed0ed93c` auto: session update _(2026-05-26)_
- `c099cebd9` fix(web2/customer-wallet): merge wallet-only customers (KH có ví Web 2 nhưng chưa lập PBH) _(2026-05-26)_
- `3f016dafa` feat(web2): Phase 4 — customer-wallet drop Firestore + balance-history smart customer search _(2026-05-25)_
- `732cd201f` feat(web2): Phase 3 — frontend isolation 100% qua /api/web2/\* (rewrite) _(2026-05-25)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260526-102319-8f8a5cf` cho Claude walk chain theo CLAUDE.md protocol.
