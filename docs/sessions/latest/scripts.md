# Latest Snapshot — `scripts/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260518-110451-cc2c8ff`
**Session file**: [`./20260518-110451-cc2c8ff.md`](../20260518-110451-cc2c8ff.md)
**Commit**: `cc2c8ff` — refactor(web2): move web2-products + web2-variants into web2/
**Last updated**: 2026-05-18 11:04:51 +07
**Summary**: refactor(web2): move web2-products + web2-variants into web2/

## Files changed in this commit (`scripts/`)

- `scripts/check-pbh-badges.js`
- `scripts/n2store-interactive-smoke.js`
- `scripts/n2store-smoke-all-pages.js`
- `scripts/probe-pancake-multipages.js`
- `scripts/stealth-browser-session.js`
- `scripts/tpos-pbh-api-explore-v2.js`
- `scripts/tpos-pbh-api-explore.js`
- `scripts/tpos-pbh-deep-probe.js`
- `scripts/tpos-pbh-flow-explore.js`
- `scripts/verify-tab3-recon-real-click.mjs`
- `scripts/visible-tab3-bulk-recon-demo.mjs`
- `scripts/visible-tab3-newest-demo.mjs`
- `scripts/visible-tab3-recon-demo.mjs`

## Last 5 commits touching `scripts/`

- `cc2c8ff4` refactor(web2): move web2-products + web2-variants into web2/ _(2026-05-18)_
- `c049756e` feat(web2): filter cancelled PBH + pagination + stock tracking + SePay endpoint + WEB2.0 markers _(2026-05-18)_
- `0c3c1310` chore(web2): xóa nốt fastpurchaseorder-refund + audit data flow _(2026-05-18)_
- `711bc520` auto: session update _(2026-05-18)_
- `94ff7754` feat(web2): bulk seed 108 biến thể từ bienthe.txt vào Kho Biến Thể _(2026-05-18)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260518-110451-cc2c8ff` cho Claude walk chain theo CLAUDE.md protocol.
