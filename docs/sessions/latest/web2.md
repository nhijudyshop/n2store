# Latest Snapshot — `web2/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260623-173240-618cafd`
**Session file**: [`./20260623-173240-618cafd.md`](../20260623-173240-618cafd.md)
**Commit**: `618cafd` — docs(dev-log): Zalo P4 reconnect 500→400 + Popup + icon fix
**Last updated**: 2026-06-23 17:32:40 +07
**Summary**: docs(dev-log): Zalo P4 reconnect 500→400 + Popup + icon fix

## Files changed in this commit (`web2/`)

- `web2/zalo/index.html`
- `web2/zalo/js/web2-zalo-accounts.js`

## Last 5 commits touching `web2/`

- `b92334e06` feat(web2-zalo): Kết nối lại phiên hết hạn → Popup mở chat.zalo.me 1 chạm (bump pri3) _(2026-06-23)_
- `6c78edcdb` fix(web2-zalo): reconnect phiên hết hạn trả 400 + thông báo rõ (không 500); status error; sửa icon user-search→search _(2026-06-23)_
- `7fad61f6a` feat(web2-ai): đính ảnh vào chat cho model vision (Gemini/Llama-4/Qwen-VL) _(2026-06-23)_
- `49538eb5c` fix(web2-ai): nút AI viết mô tả dùng /complete failover + maxTokens 1024 (fix cắt chữ + Gemini overload) _(2026-06-23)_
- `0ef22cdf7` fix(web2-zalo): chặn tự gia hạn nền (silent) cho TK phụ + dọn status stale lúc boot _(2026-06-23)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260623-173240-618cafd` cho Claude walk chain theo CLAUDE.md protocol.
