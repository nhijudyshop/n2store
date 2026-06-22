# Latest Snapshot — `web2/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260622-230103-b5a5711`
**Session file**: [`./20260622-230103-b5a5711.md`](../20260622-230103-b5a5711.md)
**Commit**: `b5a5711` — fix(web2-video-maker): tự tắt Tông giọng cho giọng AI Pro/Clone (giữ nguyên gốc)
**Last updated**: 2026-06-22 23:01:03 +07
**Summary**: video-maker: tự tắt Tông giọng cho giọng AI Pro/Clone + giải thích ~80% là ngữ điệu TTS

## Files changed in this commit (`web2/`)

- `web2/video-maker/index.html`
- `web2/video-maker/js/video-maker.js`
- `web2/video-maker/js/video-tts.js`
- `web2/video-maker/video-maker.css`

## Last 5 commits touching `web2/`

- `b5a57112d` fix(web2-video-maker): tự tắt Tông giọng cho giọng AI Pro/Clone (giữ nguyên gốc) _(2026-06-22)_
- `1cc23853f` feat(web2-audit-log): per-record history (openRecord modal) + reference native-orders/so-order _(2026-06-22)_
- `9c458c309` feat(web2-audit-log): event-sink chung web2*audit_events — audit toàn bộ *(2026-06-22)\_
- `292a771cd` feat(web2): module dịch thuật dùng chung (Groq/DeepSeek/Gemini + fallback Google free) + cắm sound-fx VN→EN _(2026-06-22)_
- `ea7582417` change(web2-audit-log): gộp lịch sử thao tác về 1 nguồn (Web2AuditLog) + scope NV/admin _(2026-06-22)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260622-230103-b5a5711` cho Claude walk chain theo CLAUDE.md protocol.
