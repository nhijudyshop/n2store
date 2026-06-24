# Latest Snapshot — `web2-attendance-sync/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260624-140224-4f1cabf`
**Session file**: [`./20260624-140224-4f1cabf.md`](../20260624-140224-4f1cabf.md)
**Commit**: `4f1cabf` — auto: session update
**Last updated**: 2026-06-24 14:02:24 +07
**Summary**: auto: session update

## Files changed in this commit (`web2-attendance-sync/`)

- `web2-attendance-sync/.gitignore`
- `web2-attendance-sync/README.md`
- `web2-attendance-sync/adms-proxy.js`
- `web2-attendance-sync/install-windows.bat`
- `web2-attendance-sync/lay-du-lieu.bat`
- `web2-attendance-sync/lay-du-lieu.command`
- `web2-attendance-sync/package-lock.json`
- `web2-attendance-sync/package.json`
- `web2-attendance-sync/run-mac.command`
- `web2-attendance-sync/sync.js`

## Last 5 commits touching `web2-attendance-sync/`

- `16f698797` fix(attendance-sync): sửa lỗi không cài được + gom 1 folder + 1 nút cài/gỡ tự kiểm tra _(2026-06-24)_
- `4eaac9746` refactor(cham-cong): dual-push từ 1 collector Web 1.0 thay vì agent Web 2.0 riêng _(2026-06-23)_
- `dd787a8f1` feat(web2-attendance-sync): tự chạy nền khi bật Windows (auto-start + auto-restart) _(2026-06-23)_
- `2869d0dd8` feat(web2-cham-cong): 1 nguồn duy nhất = bat → DB (bỏ nút Đồng bộ máy + Nhập Excel/TXT thủ công); client tự lấy data mới qua smart cache + SSE _(2026-06-23)_
- `3850bdaa6` feat(web2-attendance-sync): 2 cách đơn giản — bấm nút lấy 1 lần (--once + lay-du-lieu.bat) + chạy nền 1 PC nghe nút 'Đồng bộ máy' _(2026-06-23)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260624-140224-4f1cabf` cho Claude walk chain theo CLAUDE.md protocol.
