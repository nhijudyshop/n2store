# Latest Snapshot — `cloudflare-worker/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260614-115345-8bdfc3f`
**Session file**: [`./20260614-115345-8bdfc3f.md`](../20260614-115345-8bdfc3f.md)
**Commit**: `8bdfc3f` — feat(web2): Hướng D — dọn nốt Firestore Web 2.0 → Postgres
**Last updated**: 2026-06-14 11:53:45 +07
**Summary**: feat(web2): Hướng D — dọn nốt Firestore Web 2.0 → Postgres

## Files changed in this commit (`cloudflare-worker/`)

- `cloudflare-worker/modules/config/routes.js`
- `cloudflare-worker/worker.js`

## Last 5 commits touching `cloudflare-worker/`

- `8bdfc3fc8` feat(web2): Hướng D — dọn nốt Firestore Web 2.0 → Postgres _(2026-06-14)_
- `038554748` feat(worker): route /api/web2-so-order/\* → Render (C8 so-order server storage) _(2026-06-13)_
- `bed1cb391` fix(web2): Batch 5b audit — C7 token hash at-rest (zero-lockout, backward-compat) _(2026-06-13)_
- `7bb139d21` auto: session update _(2026-06-12)_
- `707692b9a` test(wallet): chạy DB test thật (embedded-postgres) 29/29 PASS + ASCII migration _(2026-06-11)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260614-115345-8bdfc3f` cho Claude walk chain theo CLAUDE.md protocol.
