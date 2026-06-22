# Latest Snapshot — `docs/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260623-032524-2fa39e8`
**Session file**: [`./20260623-032524-2fa39e8.md`](../20260623-032524-2fa39e8.md)
**Commit**: `2fa39e8` — fix(web2-money) round 3: purchase-refund 410 retired state-machine + SePay reassign idempotency
**Last updated**: 2026-06-23 03:25:24 +07
**Summary**: money audit 3 vòng: PBH 8 bug + ngoài-PBH 4 bug (double-refund/over-sell/reassign-mất-tiền/state-machine-410), defer #2 /tx amount

## Files changed in this commit (`docs/`)

- `docs/dev-log.md`

## Last 5 commits touching `docs/`

- `2fa39e8d4` fix(web2-money) round 3: purchase-refund 410 retired state-machine + SePay reassign idempotency _(2026-06-23)_
- `a45c83137` chore(session): RESUME:20260623-030509-3ad35df _(2026-06-23)_
- `3ad35df32` fix(web2-pbh) deep money-flow audit: 8 bug (double-refund/over-sell/orphan/double-count) _(2026-06-23)_
- `4cf761825` chore(session): RESUME:20260623-023307-7fa6e53 _(2026-06-23)_
- `7fa6e535e` fix(web2-pbh) pbh-render detail/history: inject auth (bare-fetch 401 cho NV KPI-scope) + dev-log audit _(2026-06-23)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260623-032524-2fa39e8` cho Claude walk chain theo CLAUDE.md protocol.
