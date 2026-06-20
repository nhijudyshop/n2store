# Latest Snapshot — `cloudflare-worker/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260620-213936-9e87ca3`
**Session file**: [`./20260620-213936-9e87ca3.md`](../20260620-213936-9e87ca3.md)
**Commit**: `9e87ca3` — docs(dev-log): re-verify audit 09:10 + fix A3/O7/O2 + N+1 web2-returns
**Last updated**: 2026-06-20 21:39:36 +07
**Summary**: re-verify audit sang + fix A3/O7/O2/N+1, defer O3+KPI+ILIKE+keyset

## Files changed in this commit (`cloudflare-worker/`)

- `cloudflare-worker/modules/handlers/proxy-handler.js`

## Last 5 commits touching `cloudflare-worker/`

- `c2693e8f5` fix(security): A3 fb-posts draft/ad-entry require admin; O7 worker proxy header denylist _(2026-06-20)_
- `65d6ba9b4` fix(web2): medium/low audit fixes (25 file) — leaks/races/guards + bump ?v=20260620c _(2026-06-20)_
- `1e107a9a1` fix(worker): company2 TPOS dung TPOS*PASSWORD_2/TPOS_USERNAME_2 override (khong dung ONCALL*\* = PBX phone). company1 OK, company2 cho user set creds rieng _(2026-06-20)_
- `a8ba37a7d` fix(worker): TPOS token-handler doc env (TPOS*USERNAME/CLIENT_ID/PASSWORD company1, ONCALL*\* company2) thay vi hardcode — khoi phuc TPOS sau doi password. SSRF+token-handler da deploy (version 4a4202cc). _(2026-06-20)_
- `e629ef3d5` fix(worker): TPOS creds tu env.TPOS*PASSWORD (bo hardcode plaintext, da rotate); thread env vao handleTokenRequest *(2026-06-20)\_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260620-213936-9e87ca3` cho Claude walk chain theo CLAUDE.md protocol.
