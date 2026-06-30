# Latest Snapshot — `inbox/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260701-000545-0b723cb`
**Session file**: [`./20260701-000545-0b723cb.md`](../20260701-000545-0b723cb.md)
**Commit**: `0b723cb` — ci(security): gitleaks allowlist FP (storage-key/CORS/Firebase-public/.tmp/backups) — sót commit trước
**Last updated**: 2026-07-01 00:05:45 +07
**Summary**: ci(security): gitleaks allowlist FP (storage-key/CORS/Firebase-public/.tmp/backups) — sót commit trước

## Files changed in this commit (`inbox/`)

- `inbox/script1.txt`
- `inbox/script2.txt`

## Last 5 commits touching `inbox/`

- `07e0e0e92` security: xoá 5 file dump token hết hạn + allowlist FP gitleaks (storage-key/CORS/Firebase-public) _(2026-06-30)_
- `2704ef6f0` fix(tpos): bo hardcode creds client -> proxy-auth {companyId} sau khi doi password _(2026-06-20)_
- `f6276d58b` fix(web2): gắn x-web2-token cho TOÀN BỘ web2 write còn thiếu (audit) + bump ?v=20260615auth _(2026-06-15)_
- `248532b73` feat(web2): ENFORCE-PREP — wire x-web2-token toàn bộ client gọi route soft-gated _(2026-06-12)_
- `59738a0e1` auto: session update _(2026-06-12)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260701-000545-0b723cb` cho Claude walk chain theo CLAUDE.md protocol.
