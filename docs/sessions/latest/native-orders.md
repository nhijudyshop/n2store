# Latest Snapshot — `native-orders/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260521-162957-497a855`
**Session file**: [`./20260521-162957-497a855.md`](../20260521-162957-497a855.md)
**Commit**: `497a855` — fix(native-orders): 1545012 root cause = gửi PSID thay vì FB global ID
**Last updated**: 2026-05-21 16:29:57 +07
**Summary**: fix(native-orders): 1545012 root cause = gửi PSID thay vì FB global ID

## Files changed in this commit (`native-orders/`)

- `native-orders/js/native-orders-app.js`

## Last 5 commits touching `native-orders/`

- `497a855a` fix(native-orders): 1545012 root cause = gửi PSID thay vì FB global ID _(2026-05-21)_
- `7cfb0132` chore(cache-bust): opt-in toàn bộ 88 pages còn lại vào ?v=20260521b _(2026-05-21)_
- `acae6441` fix(web2-chat): silent-success bug — sendMessage/replyComment phải check Pancake success:false _(2026-05-21)_
- `5806ca3d` feat(chat): khi gửi tin nhắn lỗi 24h/no-extension → modal hướng dẫn login FB Business _(2026-05-21)_
- `7376cd57` fix(native-orders): preserve DOM during SSE-driven reload — skip loading wipe when rows already exist _(2026-05-21)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260521-162957-497a855` cho Claude walk chain theo CLAUDE.md protocol.
