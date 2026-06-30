# Latest Snapshot — `docs/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260701-000545-0b723cb`
**Session file**: [`./20260701-000545-0b723cb.md`](../20260701-000545-0b723cb.md)
**Commit**: `0b723cb` — ci(security): gitleaks allowlist FP (storage-key/CORS/Firebase-public/.tmp/backups) — sót commit trước
**Last updated**: 2026-07-01 00:05:45 +07
**Summary**: ci(security): gitleaks allowlist FP (storage-key/CORS/Firebase-public/.tmp/backups) — sót commit trước

## Files changed in this commit (`docs/`)

- `docs/dev-log.md`

## Last 5 commits touching `docs/`

- `ab5c2c57b` security: sanitize token trong INBOX*PREVIEW doc + dev-log (rotate, không purge history) *(2026-07-01)\_
- `27ba49d7d` chore(session): RESUME:20260630-233100-acce384 _(2026-06-30)_
- `acce38413` docs(dev-log): security CI artifact triage + secret sanitization _(2026-06-30)_
- `3a581c742` chore(session): RESUME:20260630-231904-56f74ba _(2026-06-30)_
- `c7fd355c1` chore(session): RESUME:20260630-231014-fc11720 _(2026-06-30)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260701-000545-0b723cb` cho Claude walk chain theo CLAUDE.md protocol.
