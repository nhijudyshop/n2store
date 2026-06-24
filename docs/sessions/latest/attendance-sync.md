# Latest Snapshot — `attendance-sync/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260624-140224-4f1cabf`
**Session file**: [`./20260624-140224-4f1cabf.md`](../20260624-140224-4f1cabf.md)
**Commit**: `4f1cabf` — auto: session update
**Last updated**: 2026-06-24 14:02:24 +07
**Summary**: auto: session update

## Files changed in this commit (`attendance-sync/`)

- `attendance-sync/.gitignore`
- `attendance-sync/CAI-DAT.bat`
- `attendance-sync/GO-BO.bat`
- `attendance-sync/README.md`
- `attendance-sync/adms-proxy.js`
- `attendance-sync/api.js`
- `attendance-sync/cai-dat-tu-dong.bat`
- `attendance-sync/cai-dat.command`
- `attendance-sync/config.example.json`
- `attendance-sync/diagnose.js`
- `attendance-sync/find-commkey.js`
- `attendance-sync/go-bo.command`
- `attendance-sync/go-tu-dong.bat`
- `attendance-sync/index.js`
- `attendance-sync/lib-config.js`
- `attendance-sync/package.json`
- `attendance-sync/setup-adms.bat`
- `attendance-sync/setup.bat`
- `attendance-sync/setup.js`
- `attendance-sync/start.vbs`
- `attendance-sync/stop.bat`
- `attendance-sync/test-mac.sh`
- `attendance-sync/test.js`
- `attendance-sync/web2-config.example.json`
- `attendance-sync/web2-push.js`
- `attendance-sync/zk.js`

## Last 5 commits touching `attendance-sync/`

- `16f698797` fix(attendance-sync): sửa lỗi không cài được + gom 1 folder + 1 nút cài/gỡ tự kiểm tra _(2026-06-24)_
- `a20a97094` feat(cham-cong): bat TURNKEY tự cài + auto-start + dual-push (như Web 1.0 setup.bat) _(2026-06-23)_
- `4eaac9746` refactor(cham-cong): dual-push từ 1 collector Web 1.0 thay vì agent Web 2.0 riêng _(2026-06-23)_
- `04783a0f3` auto: session update _(2026-06-23)_
- `92e1b8249` fix(cors): full sweep — route all Render calls via Cloudflare Worker _(2026-04-22)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260624-140224-4f1cabf` cho Claude walk chain theo CLAUDE.md protocol.
