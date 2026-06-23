# Latest Snapshot — `web2/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260623-172458-02b39da`
**Session file**: [`./20260623-172458-02b39da.md`](../20260623-172458-02b39da.md)
**Commit**: `02b39da` — docs(dev-log): Zalo P3 self-healing primary note
**Last updated**: 2026-06-23 17:24:58 +07
**Summary**: docs(dev-log): Zalo P3 self-healing primary note

## Files changed in this commit (`web2/`)

- `web2/ai-hub/ai-hub.css`
- `web2/ai-hub/index.html`
- `web2/ai-hub/js/ai-chat.js`
- `web2/ai-hub/js/ai-image.js`
- `web2/zalo/index.html`
- `web2/zalo/js/web2-zalo-accounts.js`

## Last 5 commits touching `web2/`

- `7fad61f6a` feat(web2-ai): đính ảnh vào chat cho model vision (Gemini/Llama-4/Qwen-VL) _(2026-06-23)_
- `49538eb5c` fix(web2-ai): nút AI viết mô tả dùng /complete failover + maxTokens 1024 (fix cắt chữ + Gemini overload) _(2026-06-23)_
- `0ef22cdf7` fix(web2-zalo): chặn tự gia hạn nền (silent) cho TK phụ + dọn status stale lúc boot _(2026-06-23)_
- `f7f6cb576` feat(web2-ai): provider chips (mặc định OpenRouter) + nút 'AI viết mô tả' tạo ảnh + dán ảnh hiện ở khung _(2026-06-23)_
- `065e6c83d` auto: session update _(2026-06-23)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260623-172458-02b39da` cho Claude walk chain theo CLAUDE.md protocol.
