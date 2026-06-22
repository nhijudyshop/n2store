# Latest Snapshot — `web2/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260622-093221-a412618`
**Session file**: [`./20260622-093221-a412618.md`](../20260622-093221-a412618.md)
**Commit**: `a412618` — polish(web2) SSE consumer LOW hygiene: report-delivery realtime + debounce 4 badge handlers
**Last updated**: 2026-06-22 09:32:21 +07
**Summary**: polish(web2) SSE consumer LOW hygiene: report-delivery realtime + debounce 4 badge handlers

## Files changed in this commit (`web2/`)

- `web2/balance-history/index.html`
- `web2/balance-history/js/web2-pending-match.js`
- `web2/ck-dashboard/index.html`
- `web2/ck-dashboard/js/ck-dashboard-app.js`
- `web2/report-delivery/index.html`

## Last 5 commits touching `web2/`

- `a412618eb` polish(web2) SSE consumer LOW hygiene: report-delivery realtime + debounce 4 badge handlers _(2026-06-22)_
- `8d6abe393` fix(web2) SSE R4 (live-test): server-side wildcard delivery in _localNotify — exact web2:wallet:<phone> now reaches web2:wallet:\* (6 ví pages) _(2026-06-22)\_
- `b07144f98` fix(web2) SSE R2: live-snap resync no-op (MED) + resync coalesce + poolDropped stat + load-bearing comment _(2026-06-22)_
- `0ce6293e3` fix(web2) SSE re-audit (39-agent): KEEP SSE + 8 fix (oversized fan-out, LISTEN-reconnect resync, wallet :\* prefix-match, heartbeat reopen-storm, pgNotify fallback+cap) _(2026-06-22)_
- `917941830` fix(web2) live-tv: mount sidebar control page + [hidden] display gotcha trên TV empty/grid _(2026-06-21)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260622-093221-a412618` cho Claude walk chain theo CLAUDE.md protocol.
