# Latest Snapshot — `live-chat/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260615-224803-5eef62c`
**Session file**: [`./20260615-224803-5eef62c.md`](../20260615-224803-5eef62c.md)
**Commit**: `5eef62c` — revert: gỡ bump api-config version nhầm trên 7 file Web 1.0 (Web1⊥Web2)
**Last updated**: 2026-06-15 22:48:03 +07
**Summary**: revert: gỡ bump api-config version nhầm trên 7 file Web 1.0 (Web1⊥Web2)

## Files changed in this commit (`live-chat/`)

- `live-chat/chat.html`
- `live-chat/index.html`
- `live-chat/js/api-config.js`
- `live-chat/js/live/comments-mobile.js`
- `live-chat/js/live/live-api.js`
- `live-chat/js/live/live-comment-list.js`
- `live-chat/js/live/live-customer-panel.js`
- `live-chat/js/live/live-init.js`
- `live-chat/js/live/live-realtime.js`
- `live-chat/js/live/live-state.js`
- `live-chat/js/pancake/pancake-api.js`
- `live-chat/js/pancake/pancake-state.js`
- `live-chat/server/facebook-routes.js`

## Last 5 commits touching `live-chat/`

- `b5e2ad166` chore(web2): xóa sạch chữ TPOS trong comment/doc Web 2.0 (reword giữ nghĩa) _(2026-06-15)_
- `15cd722a6` fix(web2/live-chat): SĐT bị fb*id ghi đè (normPhone slice) + health-monitor 404 spam + dọn TPOS leftover *(2026-06-15)\_
- `e64df943b` refactor(web2/P4): centralize Pancake WORKER*URL hardcode → API_CONFIG (live-chat) *(2026-06-15)\_
- `350f0954b` refactor(web2/P1): gom kho KH về 1 nguồn Web2CustomerStore + fix filter SĐT lỏng (fb*id lọt batch-by-phone) *(2026-06-15)\_
- `f6276d58b` fix(web2): gắn x-web2-token cho TOÀN BỘ web2 write còn thiếu (audit) + bump ?v=20260615auth _(2026-06-15)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260615-224803-5eef62c` cho Claude walk chain theo CLAUDE.md protocol.
