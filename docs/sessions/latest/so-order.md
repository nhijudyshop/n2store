# Latest Snapshot — `so-order/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260622-102759-b60bc41`
**Session file**: [`./20260622-102759-b60bc41.md`](../20260622-102759-b60bc41.md)
**Commit**: `b60bc41` — refactor(web2-css) theme: dedup dead tr-level zebra/hover (striping now 1-source at td-level Block A)
**Last updated**: 2026-06-22 10:27:59 +07
**Summary**: refactor(web2-css) theme: dedup dead tr-level zebra/hover (striping now 1-source at td-level Block A)

## Files changed in this commit (`so-order/`)

- `so-order/index.html`

## Last 5 commits touching `so-order/`

- `b60bc417f` refactor(web2-css) theme: dedup dead tr-level zebra/hover (striping now 1-source at td-level Block A) _(2026-06-22)_
- `f2ea3f21b` feat(web2-ui) table: default bảng = look native-orders (grid-line + zebra + header đậm) cho toàn Web 2.0 + delivery emit verified live _(2026-06-22)_
- `8d6abe393` fix(web2) SSE R4 (live-test): server-side wildcard delivery in _localNotify — exact web2:wallet:<phone> now reaches web2:wallet:\* (6 ví pages) _(2026-06-22)\_
- `b07144f98` fix(web2) SSE R2: live-snap resync no-op (MED) + resync coalesce + poolDropped stat + load-bearing comment _(2026-06-22)_
- `0ce6293e3` fix(web2) SSE re-audit (39-agent): KEEP SSE + 8 fix (oversized fan-out, LISTEN-reconnect resync, wallet :\* prefix-match, heartbeat reopen-storm, pgNotify fallback+cap) _(2026-06-22)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260622-102759-b60bc41` cho Claude walk chain theo CLAUDE.md protocol.
