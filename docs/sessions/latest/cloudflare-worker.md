# Latest Snapshot — `cloudflare-worker/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260621-123747-b32b578`
**Session file**: [`./20260621-123747-b32b578.md`](../20260621-123747-b32b578.md)
**Commit**: `b32b578` — fix(web2) audit-r6 K-stage2: gate 13 fast-sale-orders mutation route requireWeb2AuthSoft
**Last updated**: 2026-06-21 12:37:47 +07
**Summary**: audit r6: 14 bug fix (CRITICAL ví atomic, fast-sale-orders auth+stock-race, +9)

## Files changed in this commit (`cloudflare-worker/`)

- `cloudflare-worker/modules/config/routes.js`

## Last 5 commits touching `cloudflare-worker/`

- `c0cf94762` fix(web2) audit-r6: CRITICAL ví trừ không atomic (returns) + 8 fix (auth/worker/DoS/SSE/popup/history) _(2026-06-21)_
- `c2693e8f5` fix(security): A3 fb-posts draft/ad-entry require admin; O7 worker proxy header denylist _(2026-06-20)_
- `65d6ba9b4` fix(web2): medium/low audit fixes (25 file) — leaks/races/guards + bump ?v=20260620c _(2026-06-20)_
- `1e107a9a1` fix(worker): company2 TPOS dung TPOS*PASSWORD_2/TPOS_USERNAME_2 override (khong dung ONCALL*\* = PBX phone). company1 OK, company2 cho user set creds rieng _(2026-06-20)_
- `a8ba37a7d` fix(worker): TPOS token-handler doc env (TPOS*USERNAME/CLIENT_ID/PASSWORD company1, ONCALL*\* company2) thay vi hardcode — khoi phuc TPOS sau doi password. SSRF+token-handler da deploy (version 4a4202cc). _(2026-06-20)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260621-123747-b32b578` cho Claude walk chain theo CLAUDE.md protocol.
