# Latest Snapshot — `web2/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260623-173018-6c78edc`
**Session file**: [`./20260623-173018-6c78edc.md`](../20260623-173018-6c78edc.md)
**Commit**: `6c78edc` — fix(web2-zalo): reconnect phiên hết hạn trả 400 + thông báo rõ (không 500); status error; sửa icon user-search→search
**Last updated**: 2026-06-23 17:30:18 +07
**Summary**: fix(web2-zalo): reconnect phiên hết hạn trả 400 + thông báo rõ (không 500); status error; sửa icon user-...

## Files changed in this commit (`web2/`)

- `web2/zalo/index.html`

## Last 5 commits touching `web2/`

- `6c78edcdb` fix(web2-zalo): reconnect phiên hết hạn trả 400 + thông báo rõ (không 500); status error; sửa icon user-search→search _(2026-06-23)_
- `7fad61f6a` feat(web2-ai): đính ảnh vào chat cho model vision (Gemini/Llama-4/Qwen-VL) _(2026-06-23)_
- `49538eb5c` fix(web2-ai): nút AI viết mô tả dùng /complete failover + maxTokens 1024 (fix cắt chữ + Gemini overload) _(2026-06-23)_
- `0ef22cdf7` fix(web2-zalo): chặn tự gia hạn nền (silent) cho TK phụ + dọn status stale lúc boot _(2026-06-23)_
- `f7f6cb576` feat(web2-ai): provider chips (mặc định OpenRouter) + nút 'AI viết mô tả' tạo ảnh + dán ảnh hiện ở khung _(2026-06-23)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260623-173018-6c78edc` cho Claude walk chain theo CLAUDE.md protocol.
