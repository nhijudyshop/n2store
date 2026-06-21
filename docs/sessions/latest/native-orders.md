# Latest Snapshot — `native-orders/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260622-014719-0ce6293`
**Session file**: [`./20260622-014719-0ce6293.md`](../20260622-014719-0ce6293.md)
**Commit**: `0ce6293` — fix(web2) SSE re-audit (39-agent): KEEP SSE + 8 fix (oversized fan-out, LISTEN-reconnect resync, wallet :_ prefix-match, heartbeat reopen-storm, pgNotify fallback+cap)
**Last updated**: 2026-06-22 01:47:19 +07
**Summary**: fix(web2) SSE re-audit (39-agent): KEEP SSE + 8 fix (oversized fan-out, LISTEN-reconnect resync, wallet :_ prefix-mat...

## Files changed in this commit (`native-orders/`)

- `native-orders/index.html`

## Last 5 commits touching `native-orders/`

- `0ce6293e3` fix(web2) SSE re-audit (39-agent): KEEP SSE + 8 fix (oversized fan-out, LISTEN-reconnect resync, wallet :\* prefix-match, heartbeat reopen-storm, pgNotify fallback+cap) _(2026-06-22)_
- `80e96e30d` refactor(web2) live-tv Phase6: migrate 2 fork chiến dịch → Web2Campaign (1 nguồn) _(2026-06-21)_
- `fa34c3ed2` refactor(web2): hệ KPI 1 nguồn (web2-kpi-core + Web2Kpi) + enforce scope NV/admin + mask pill + fix bug _(2026-06-21)_
- `8de7d629c` feat(web2): KPI User tag — nút Chốt KPI (admin) + health bar chưa-gán/chưa-chốt + filter NV + amber + deep-link _(2026-06-21)_
- `70a481274` auto: session update _(2026-06-21)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260622-014719-0ce6293` cho Claude walk chain theo CLAUDE.md protocol.
