# Latest Snapshot — `cloudflare-worker/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260621-154659-5b8e242`
**Session file**: [`./20260621-154659-5b8e242.md`](../20260621-154659-5b8e242.md)
**Commit**: `5b8e242` — auto: session update
**Last updated**: 2026-06-21 15:46:59 +07
**Summary**: auto: session update

## Files changed in this commit (`cloudflare-worker/`)

- `cloudflare-worker/modules/handlers/facebook-handler.js`

## Last 5 commits touching `cloudflare-worker/`

- `5413ac369` fix(worker): gate /api/facebook-graph với allowlist read-only + GET-only _(2026-06-21)_
- `2d86f265c` fix(web2) audit-r9: 16 bug (worker SSRF/log-leak, ZNS idempotency, SSE-notify, idempotency) _(2026-06-21)_
- `1a411c409` fix(web2) audit-r8: 16 bug (Zalo double-enc CRIT, double-debit CRIT, secret/PII leaks, timeouts) _(2026-06-21)_
- `c0cf94762` fix(web2) audit-r6: CRITICAL ví trừ không atomic (returns) + 8 fix (auth/worker/DoS/SSE/popup/history) _(2026-06-21)_
- `c2693e8f5` fix(security): A3 fb-posts draft/ad-entry require admin; O7 worker proxy header denylist _(2026-06-20)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260621-154659-5b8e242` cho Claude walk chain theo CLAUDE.md protocol.
