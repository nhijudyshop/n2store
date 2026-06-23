# Latest Snapshot — `web2/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260623-174155-05afe83`
**Session file**: [`./20260623-174155-05afe83.md`](../20260623-174155-05afe83.md)
**Commit**: `05afe83` — auto: session update
**Last updated**: 2026-06-23 17:41:55 +07
**Summary**: auto: session update

## Files changed in this commit (`web2/`)

- `web2/ai-hub/index.html`
- `web2/ai-hub/js/ai-chat.js`
- `web2/ai-hub/js/ai-image.js`

## Last 5 commits touching `web2/`

- `05afe839b` auto: session update _(2026-06-23)_
- `b92334e06` feat(web2-zalo): Kết nối lại phiên hết hạn → Popup mở chat.zalo.me 1 chạm (bump pri3) _(2026-06-23)_
- `6c78edcdb` fix(web2-zalo): reconnect phiên hết hạn trả 400 + thông báo rõ (không 500); status error; sửa icon user-search→search _(2026-06-23)_
- `7fad61f6a` feat(web2-ai): đính ảnh vào chat cho model vision (Gemini/Llama-4/Qwen-VL) _(2026-06-23)_
- `49538eb5c` fix(web2-ai): nút AI viết mô tả dùng /complete failover + maxTokens 1024 (fix cắt chữ + Gemini overload) _(2026-06-23)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260623-174155-05afe83` cho Claude walk chain theo CLAUDE.md protocol.
