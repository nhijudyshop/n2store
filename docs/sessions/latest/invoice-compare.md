# Latest Snapshot — `invoice-compare/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260521-153901-7cfb013`
**Session file**: [`./20260521-153901-7cfb013.md`](../20260521-153901-7cfb013.md)
**Commit**: `7cfb013` — chore(cache-bust): opt-in toàn bộ 88 pages còn lại vào ?v=20260521b
**Last updated**: 2026-05-21 15:39:01 +07
**Summary**: chore(cache-bust): opt-in toàn bộ 88 pages còn lại vào ?v=20260521b

## Files changed in this commit (`invoice-compare/`)

- `invoice-compare/index.html`

## Last 5 commits touching `invoice-compare/`

- `7cfb0132` chore(cache-bust): opt-in toàn bộ 88 pages còn lại vào ?v=20260521b _(2026-05-21)_
- `445c4a21` fix(invoice-compare): thêm shared/js/firebase-config.js trước token-manager _(2026-04-28)_
- `f8287d6a` fix(smoke-test phase 3 batch 1): G1 missing globals + G2 duplicate identifiers _(2026-04-28)_
- `92e1b824` fix(cors): full sweep — route all Render calls via Cloudflare Worker _(2026-04-22)_
- `a3d9e87c` style: clean body{} font props in module CSS (typography.css now owns) _(2026-04-08)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260521-153901-7cfb013` cho Claude walk chain theo CLAUDE.md protocol.
