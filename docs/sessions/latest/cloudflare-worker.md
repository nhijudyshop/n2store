# Latest Snapshot — `cloudflare-worker/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260620-111058-37eccde`
**Session file**: [`./20260620-111058-37eccde.md`](../20260620-111058-37eccde.md)
**Commit**: `37eccde` — docs(ops): ghi lai deploy prod (worker TPOS env + SSRF, WEB2_ENC_KEY 3 service, don 5 env chet, smoke-test 401-gating PASS)
**Last updated**: 2026-06-20 11:10:58 +07
**Summary**: docs(ops): ghi lai deploy prod (worker TPOS env + SSRF, WEB2_ENC_KEY 3 service, don 5 env chet, smoke-test 401-gating...

## Files changed in this commit (`cloudflare-worker/`)

- `cloudflare-worker/modules/handlers/token-handler.js`
- `cloudflare-worker/worker.js`

## Last 5 commits touching `cloudflare-worker/`

- `1e107a9a1` fix(worker): company2 TPOS dung TPOS*PASSWORD_2/TPOS_USERNAME_2 override (khong dung ONCALL*\* = PBX phone). company1 OK, company2 cho user set creds rieng _(2026-06-20)_
- `a8ba37a7d` fix(worker): TPOS token-handler doc env (TPOS*USERNAME/CLIENT_ID/PASSWORD company1, ONCALL*\* company2) thay vi hardcode — khoi phuc TPOS sau doi password. SSRF+token-handler da deploy (version 4a4202cc). _(2026-06-20)_
- `e629ef3d5` fix(worker): TPOS creds tu env.TPOS*PASSWORD (bo hardcode plaintext, da rotate); thread env vao handleTokenRequest *(2026-06-20)\_
- `c42670c11` fix(web2): audit fixes — gate auth + SSRF + money + idempotency (21 file) _(2026-06-20)_
- `83b5d75c0` fix(worker): generic /api/web2-\* → web2-api (đóng lỗ hổng route web2- quên khai báo rơi TPOS) _(2026-06-19)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260620-111058-37eccde` cho Claude walk chain theo CLAUDE.md protocol.
