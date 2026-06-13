# Latest Snapshot — `web2/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260613-200702-e269b5e`
**Session file**: [`./20260613-200702-e269b5e.md`](../20260613-200702-e269b5e.md)
**Commit**: `e269b5e` — fix(web2/chat-panel): scroll-to-bottom robust — re-scroll khi ảnh load + cờ \_forceBottom (mở conv + sau gửi tin)
**Last updated**: 2026-06-13 20:07:02 +07
**Summary**: fix(web2/chat-panel): scroll-to-bottom robust — re-scroll khi ảnh load + cờ \_forceBottom (mở conv + sau gửi...

## Files changed in this commit (`web2/`)

- `web2/shared/chat-panel/web2-chat-panel.js`

## Last 5 commits touching `web2/`

- `e269b5e09` fix(web2/chat-panel): scroll-to-bottom robust — re-scroll khi ảnh load + cờ _forceBottom (mở conv + sau gửi tin) _(2026-06-13)\_
- `0424dbb0b` refactor(web2-zalo): dua engine chat vao shared (web2/shared/web2-zalo-api + zalo-chat/\*) + controller chung WZChat.mountConversation + Web2Zalo.mountChat drop-in cho trang khac; app.js delegate (-410 dong trung) _(2026-06-13)_
- `b89f32ca6` auto: session update _(2026-06-13)_
- `123e6d54a` auto: session update _(2026-06-13)_
- `63446c668` auto: session update _(2026-06-13)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260613-200702-e269b5e` cho Claude walk chain theo CLAUDE.md protocol.
