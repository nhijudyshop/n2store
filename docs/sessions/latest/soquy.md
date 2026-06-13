# Latest Snapshot — `soquy/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260613-195102-123e6d5`
**Session file**: [`./20260613-195102-123e6d5.md`](../20260613-195102-123e6d5.md)
**Commit**: `123e6d5` — auto: session update
**Last updated**: 2026-06-13 19:51:02 +07
**Summary**: auto: session update

## Files changed in this commit (`soquy/`)

- `soquy/css/soquy.css`
- `soquy/index.html`
- `soquy/js/soquy-main.js`

## Last 5 commits touching `soquy/`

- `81c3336db` refactor(shared): gỡ hoàn toàn widget AI chat nổi (ai-chat-widget) khỏi navigation-modern + nhanhang/soquy FAB _(2026-06-13)_
- `63446c668` auto: session update _(2026-06-13)_
- `7cfb01320` chore(cache-bust): opt-in toàn bộ 88 pages còn lại vào ?v=20260521b _(2026-05-21)_
- `4065a28c6` feat(soquy-report): chi tiết theo loại full-width, bỏ max-height _(2026-04-29)_
- `48b4c8979` feat(soquy-report): biểu đồ thu chi mặc định collapsed, click header để mở _(2026-04-29)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260613-195102-123e6d5` cho Claude walk chain theo CLAUDE.md protocol.
