# Latest Snapshot — `web2-attendance-sync/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260623-143811-2869d0d`
**Session file**: [`./20260623-143811-2869d0d.md`](../20260623-143811-2869d0d.md)
**Commit**: `2869d0d` — feat(web2-cham-cong): 1 nguồn duy nhất = bat → DB (bỏ nút Đồng bộ máy + Nhập Excel/TXT thủ công); client tự lấy data mới qua smart cache + SSE
**Last updated**: 2026-06-23 14:38:11 +07
**Summary**: Chấm công 1 nguồn = bat → DB + smart cache/SSE tự lấy data mới (bỏ nút thủ công) + fix sync-status PUT

## Files changed in this commit (`web2-attendance-sync/`)

- `web2-attendance-sync/README.md`
- `web2-attendance-sync/sync.js`

## Last 5 commits touching `web2-attendance-sync/`

- `2869d0dd8` feat(web2-cham-cong): 1 nguồn duy nhất = bat → DB (bỏ nút Đồng bộ máy + Nhập Excel/TXT thủ công); client tự lấy data mới qua smart cache + SSE _(2026-06-23)_
- `3850bdaa6` feat(web2-attendance-sync): 2 cách đơn giản — bấm nút lấy 1 lần (--once + lay-du-lieu.bat) + chạy nền 1 PC nghe nút 'Đồng bộ máy' _(2026-06-23)_
- `4b7acfc69` feat(web2-attendance-sync): tự dò IP máy chấm công trên LAN (khỏi nhập IP) + FAQ nhiều máy chạy bat _(2026-06-23)_
- `c106ad946` auto: session update _(2026-06-23)_
- `f6980786e` docs(web2-attendance-sync): bat chạy ZK pull (chế độ đã test) + tự npm install; README ưu tiên ZK pull _(2026-06-23)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260623-143811-2869d0d` cho Claude walk chain theo CLAUDE.md protocol.
