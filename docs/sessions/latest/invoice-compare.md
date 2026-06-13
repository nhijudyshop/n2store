# Latest Snapshot — `invoice-compare/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260613-145512-bed1cb3`
**Session file**: [`./20260613-145512-bed1cb3.md`](../20260613-145512-bed1cb3.md)
**Commit**: `bed1cb3` — fix(web2): Batch 5b audit — C7 token hash at-rest (zero-lockout, backward-compat)
**Last updated**: 2026-06-13 14:55:12 +07
**Summary**: fix(web2): Batch 5b audit — C7 token hash at-rest (zero-lockout, backward-compat)

## Files changed in this commit (`invoice-compare/`)

- `invoice-compare/index.html`

## Last 5 commits touching `invoice-compare/`

- `4a59600b9` fix(pancake): PIVOT sang query-param ?client*key (CORS) — X-API-Key header bị worker preflight chặn *(2026-06-13)\_
- `342b08713` fix(pancake): áp Fix B vào file LIVE shared/js/pancake-token-manager.js + bump ?v (fix lỗi 102 chat Web 1.0) _(2026-06-13)_
- `248532b73` feat(web2): ENFORCE-PREP — wire x-web2-token toàn bộ client gọi route soft-gated _(2026-06-12)_
- `7cfb01320` chore(cache-bust): opt-in toàn bộ 88 pages còn lại vào ?v=20260521b _(2026-05-21)_
- `445c4a21d` fix(invoice-compare): thêm shared/js/firebase-config.js trước token-manager _(2026-04-28)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260613-145512-bed1cb3` cho Claude walk chain theo CLAUDE.md protocol.
