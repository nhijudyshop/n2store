# Latest Snapshot — `docs/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260607-185938-f7a6a56`
**Session file**: [`./20260607-185938-f7a6a56.md`](../20260607-185938-f7a6a56.md)
**Commit**: `f7a6a56` — feat(web2): GỠ SẠCH TPOS khỏi cột live + live-campaign (no flag, no fallback)
**Last updated**: 2026-06-07 18:59:38 +07
**Summary**: feat(web2): GỠ SẠCH TPOS khỏi cột live + live-campaign (no flag, no fallback)

## Files changed in this commit (`docs/`)

- `docs/dev-log.md`

## Last 5 commits touching `docs/`

- `f7a6a56ff` feat(web2): GỠ SẠCH TPOS khỏi cột live + live-campaign (no flag, no fallback) _(2026-06-07)_
- `b52fde2c0` chore(session): RESUME:20260607-183953-0e530bd _(2026-06-07)_
- `0e530bd04` feat(web2): cắt TPOS — picker FB Graph (flag) + live-campaign CRUD→web2*live_campaigns *(2026-06-07)\_
- `1e5c9ce20` chore(session): RESUME:20260607-181747-88c9a26 _(2026-06-07)_
- `88c9a2660` feat(tpos-pancake): rewire cột comment live TPOS→FB Graph (flag-gated, fallback-safe) _(2026-06-07)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260607-185938-f7a6a56` cho Claude walk chain theo CLAUDE.md protocol.
