# Latest Snapshot — `web2-attendance-sync/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260623-140919-3850bda`
**Session file**: [`./20260623-140919-3850bda.md`](../20260623-140919-3850bda.md)
**Commit**: `3850bda` — feat(web2-attendance-sync): 2 cách đơn giản — bấm nút lấy 1 lần (--once + lay-du-lieu.bat) + chạy nền 1 PC nghe nút 'Đồng bộ máy'
**Last updated**: 2026-06-23 14:09:19 +07
**Summary**: Agent chấm công: bỏ 2-máy lease, làm 2 cách đơn giản (bấm nút lấy 1 lần + chạy nền 1 PC nghe nút Đồng bộ máy)

## Files changed in this commit (`web2-attendance-sync/`)

- `web2-attendance-sync/README.md`
- `web2-attendance-sync/lay-du-lieu.bat`
- `web2-attendance-sync/lay-du-lieu.command`
- `web2-attendance-sync/package.json`
- `web2-attendance-sync/sync.js`

## Last 5 commits touching `web2-attendance-sync/`

- `3850bdaa6` feat(web2-attendance-sync): 2 cách đơn giản — bấm nút lấy 1 lần (--once + lay-du-lieu.bat) + chạy nền 1 PC nghe nút 'Đồng bộ máy' _(2026-06-23)_
- `4b7acfc69` feat(web2-attendance-sync): tự dò IP máy chấm công trên LAN (khỏi nhập IP) + FAQ nhiều máy chạy bat _(2026-06-23)_
- `c106ad946` auto: session update _(2026-06-23)_
- `f6980786e` docs(web2-attendance-sync): bat chạy ZK pull (chế độ đã test) + tự npm install; README ưu tiên ZK pull _(2026-06-23)_
- `cb99fd56c` auto: session update _(2026-06-23)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260623-140919-3850bda` cho Claude walk chain theo CLAUDE.md protocol.
