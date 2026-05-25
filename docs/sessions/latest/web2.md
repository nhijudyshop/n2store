# Latest Snapshot — `web2/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260525-154319-932b259`
**Session file**: [`./20260525-154319-932b259.md`](../20260525-154319-932b259.md)
**Commit**: `932b259` — fix(web2): chatDb pool ref + Phase 2 customer-wallet enrich Web 2.0 wallet
**Last updated**: 2026-05-25 15:43:19 +07
**Summary**: fix(web2): chatDb pool ref + Phase 2 customer-wallet enrich Web 2.0 wallet

## Files changed in this commit (`web2/`)

- `web2/customer-wallet/js/web2-wallet-api.js`

## Last 5 commits touching `web2/`

- `932b25998` fix(web2): chatDb pool ref + Phase 2 customer-wallet enrich Web 2.0 wallet _(2026-05-25)_
- `cd4bcf408` auto: session update _(2026-05-25)_
- `4dc51e921` auto: session update _(2026-05-25)_
- `c564dea6b` auto: session update _(2026-05-25)_
- `ddf7e02f7` auto: session update _(2026-05-25)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260525-154319-932b259` cho Claude walk chain theo CLAUDE.md protocol.
