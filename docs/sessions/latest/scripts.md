# Latest Snapshot — `scripts/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260619-142720-1940a8e`
**Session file**: [`./20260619-142720-1940a8e.md`](../20260619-142720-1940a8e.md)
**Commit**: `1940a8e` — auto: session update
**Last updated**: 2026-06-19 14:27:20 +07
**Summary**: auto: session update

## Files changed in this commit (`scripts/`)

- `scripts/bench-2-posts.js`
- `scripts/bench-app-slow-load.js`
- `scripts/bench-bearer-approach.js`
- `scripts/bench-cached-sources.js`
- `scripts/bench-fb-stream-url.js`
- `scripts/bench-iframe-capture.js`
- `scripts/bench-live-filter.js`
- `scripts/bench-load-comments.js`
- `scripts/bench-pancake-graph.js`
- `scripts/bench-step-b-flow.js`
- `scripts/bench-tpos-server-side.js`
- `scripts/inspect-fb-thumbnails.js`
- `scripts/inspect-tpos-livevideo.js`
- `scripts/inspect-tpos-post.js`
- `scripts/multi-tab-test.js`
- `scripts/oncallcx-capture-download-flow.js`
- `scripts/oncallcx-click-menu.js`
- `scripts/oncallcx-debug-select.js`
- `scripts/oncallcx-dump-dashboard.js`
- `scripts/oncallcx-inspect-calls.js`
- `scripts/oncallcx-probe-urls.js`
- `scripts/pancake-search-trace.js`
- `scripts/snap-auto-accuracy-test.js`
- `scripts/snap-backfill-all.js`
- `scripts/snap-e2e-full-test.js`
- `scripts/snap-fb-test2.js`
- `scripts/snap-thumbnail-browser-test.js`
- `scripts/test-ck-features.js`
- `scripts/test-dr-excel-buttons.js`
- `scripts/test-dr-filter-visible.js`
- `scripts/test-dr-lite-hide.js`
- `scripts/test-dr-report-modal.js`
- `scripts/test-dr-report-view.js`
- `scripts/test-dr-stats-match.js`
- `scripts/test-fb-seek.js`
- `scripts/test-fb-seek2.js`
- `scripts/test-fb-seek3.js`
- `scripts/test-oncall-portal-client.js`
- `scripts/test-wallet-audit.js`
- `scripts/tpos-debug-session.js`

## Last 5 commits touching `scripts/`

- `1940a8e00` auto: session update _(2026-06-19)_
- `c55c0f9b9` auto: session update _(2026-06-19)_
- `b6f944eca` chore(live-chat): server.js split DEPLOYED + smoke 3/3 PASS live (web2-realtime, client connected 265 events) _(2026-06-19)_
- `f59942147` feat(live-chat): Phase D — smoke-live-chat-server.sh (post-deploy verify cho server.js split) + dev-log tổng hợp A/B/C/D _(2026-06-19)_
- `030dc573f` feat(codemap): §4 loại trừ thin-delegate (Phase C) → đếm dup THẬT _(2026-06-19)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260619-142720-1940a8e` cho Claude walk chain theo CLAUDE.md protocol.
