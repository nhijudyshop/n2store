# Latest Snapshot — `attendance-sync/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260623-181157-465bb90`
**Session file**: [`./20260623-181157-465bb90.md`](../20260623-181157-465bb90.md)
**Commit**: `465bb90` — auto: session update
**Last updated**: 2026-06-23 18:11:57 +07
**Summary**: auto: session update

## Files changed in this commit (`attendance-sync/`)

- `attendance-sync/.gitignore`
- `attendance-sync/README.md`
- `attendance-sync/adms-proxy.js`
- `attendance-sync/index.js`
- `attendance-sync/web2-config.example.json`
- `attendance-sync/web2-push.js`

## Last 5 commits touching `attendance-sync/`

- `4eaac9746` refactor(cham-cong): dual-push từ 1 collector Web 1.0 thay vì agent Web 2.0 riêng _(2026-06-23)_
- `04783a0f3` auto: session update _(2026-06-23)_
- `92e1b8249` fix(cors): full sweep — route all Render calls via Cloudflare Worker _(2026-04-22)_
- `ea059fd13` feat(docs): add #Note AI-instruction header to all HTML+JS files + module overview in dev-log _(2026-04-04)_
- `1569d898e` docs(attendance): rewrite README for ADMS v2 architecture _(2026-04-02)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260623-181157-465bb90` cho Claude walk chain theo CLAUDE.md protocol.
