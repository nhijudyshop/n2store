# Latest Snapshot — `live-chat/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260615-213808-4aa6638`
**Session file**: [`./20260615-213808-4aa6638.md`](../20260615-213808-4aa6638.md)
**Commit**: `4aa6638` — auto: session update
**Last updated**: 2026-06-15 21:38:08 +07
**Summary**: auto: session update

## Files changed in this commit (`live-chat/`)

- `live-chat/comments-mobile.html`
- `live-chat/index.html`
- `live-chat/js/live/live-api.js`
- `live-chat/js/pancake/inventory-panel.js`
- `live-chat/js/pancake/pancake-state.js`
- `live-chat/js/shared/live-customer-sync.js`
- `live-chat/js/shared/live-status.js`

## Last 5 commits touching `live-chat/`

- `e64df943b` refactor(web2/P4): centralize Pancake WORKER*URL hardcode → API_CONFIG (live-chat) *(2026-06-15)\_
- `350f0954b` refactor(web2/P1): gom kho KH về 1 nguồn Web2CustomerStore + fix filter SĐT lỏng (fb*id lọt batch-by-phone) *(2026-06-15)\_
- `f6276d58b` fix(web2): gắn x-web2-token cho TOÀN BỘ web2 write còn thiếu (audit) + bump ?v=20260615auth _(2026-06-15)_
- `fa050c1fa` auto: session update _(2026-06-15)_
- `b988e2db4` fix(live-chat): write KH 401 — thêm x-web2-token vào MỌI write live-api (PATCH/upsert/status); validPhone 10 số (tránh nhầm fb*id) *(2026-06-15)\_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260615-213808-4aa6638` cho Claude walk chain theo CLAUDE.md protocol.
