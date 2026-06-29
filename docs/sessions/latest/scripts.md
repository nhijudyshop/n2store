# Latest Snapshot — `scripts/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260629-182215-be910cb`
**Session file**: [`./20260629-182215-be910cb.md`](../20260629-182215-be910cb.md)
**Commit**: `be910cb` — fix(nav): purge dead tpos-pancake/ paths → live-chat/ (nav href, permissions-registry, 17 test scripts)
**Last updated**: 2026-06-29 18:22:15 +07
**Summary**: fix(nav): purge dead tpos-pancake/ paths → live-chat/ (nav href, permissions-registry, 17 test scripts)

## Files changed in this commit (`scripts/`)

- `scripts/bench-app-slow-load.js`
- `scripts/bench-iframe-capture.js`
- `scripts/bench-load-comments.js`
- `scripts/bench-pancake-graph.js`
- `scripts/bench-step-b-flow.js`
- `scripts/inspect-fb-thumbnails.js`
- `scripts/inspect-tpos-livevideo.js`
- `scripts/multi-tab-test.js`
- `scripts/n2store-interactive-smoke.js`
- `scripts/snap-auto-accuracy-test.js`
- `scripts/snap-backfill-all.js`
- `scripts/snap-e2e-full-test.js`
- `scripts/snap-fb-test.js`
- `scripts/snap-fb-test2.js`
- `scripts/snap-thumbnail-browser-test.js`
- `scripts/test-tpos-pancake-with-ext.js`
- `scripts/web2-verify-data-load.js`

## Last 5 commits touching `scripts/`

- `be910cb67` fix(nav): purge dead tpos-pancake/ paths → live-chat/ (nav href, permissions-registry, 17 test scripts) _(2026-06-29)_
- `e2952425a` feat(web2-vn-address): bộ chọn Tỉnh/TP → Phường/Xã dùng chung (vietnamese-provinces-database, MIT) _(2026-06-28)_
- `20c99cbbd` feat(sepay-invoices): push snapshot từ máy IP nhà + link trực tiếp khi Cloudflare chặn _(2026-06-28)_
- `881c19b4a` fix(web2/bill): PBH thermal QR sạch (bỏ mã giữa QR) + mã PBH dưới QR _(2026-06-25)_
- `4e3d28151` auto: session update _(2026-06-25)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260629-182215-be910cb` cho Claude walk chain theo CLAUDE.md protocol.
