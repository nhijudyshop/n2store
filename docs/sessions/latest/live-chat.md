# Latest Snapshot — `live-chat/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260616-091803-8b0a8ce`
**Session file**: [`./20260616-091803-8b0a8ce.md`](../20260616-091803-8b0a8ce.md)
**Commit**: `8b0a8ce` — docs(web2-realtime): sửa comment stale n2store-realtime → web2-realtime (broker đã fold)
**Last updated**: 2026-06-16 09:18:03 +07
**Summary**: docs(web2-realtime): sửa comment stale n2store-realtime → web2-realtime (broker đã fold)

## Files changed in this commit (`live-chat/`)

- `live-chat/server/server.js`

## Last 5 commits touching `live-chat/`

- `7f6c434b0` feat(web2-realtime): Stage 1 — fold Pancake browser-WS broker + start-multi vào web2-realtime _(2026-06-16)_
- `2a02bff32` refactor(web2): hợp nhất base-URL về 1 nguồn (web2-auth.js) + fix livestream 404 worker + ck-dashboard 401 _(2026-06-15)_
- `b5e2ad166` chore(web2): xóa sạch chữ TPOS trong comment/doc Web 2.0 (reword giữ nghĩa) _(2026-06-15)_
- `15cd722a6` fix(web2/live-chat): SĐT bị fb*id ghi đè (normPhone slice) + health-monitor 404 spam + dọn TPOS leftover *(2026-06-15)\_
- `e64df943b` refactor(web2/P4): centralize Pancake WORKER*URL hardcode → API_CONFIG (live-chat) *(2026-06-15)\_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260616-091803-8b0a8ce` cho Claude walk chain theo CLAUDE.md protocol.
