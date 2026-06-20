# Latest Snapshot — `soquy/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260620-120728-2704ef6`
**Session file**: [`./20260620-120728-2704ef6.md`](../20260620-120728-2704ef6.md)
**Commit**: `2704ef6` — fix(tpos): bo hardcode creds client -> proxy-auth {companyId} sau khi doi password
**Last updated**: 2026-06-20 12:07:28 +07
**Summary**: fix(tpos): bo hardcode creds client -> proxy-auth {companyId} sau khi doi password

## Files changed in this commit (`soquy/`)

- `soquy/index.html`

## Last 5 commits touching `soquy/`

- `2704ef6f0` fix(tpos): bo hardcode creds client -> proxy-auth {companyId} sau khi doi password _(2026-06-20)_
- `81c3336db` refactor(shared): gỡ hoàn toàn widget AI chat nổi (ai-chat-widget) khỏi navigation-modern + nhanhang/soquy FAB _(2026-06-13)_
- `63446c668` auto: session update _(2026-06-13)_
- `7cfb01320` chore(cache-bust): opt-in toàn bộ 88 pages còn lại vào ?v=20260521b _(2026-05-21)_
- `4065a28c6` feat(soquy-report): chi tiết theo loại full-width, bỏ max-height _(2026-04-29)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260620-120728-2704ef6` cho Claude walk chain theo CLAUDE.md protocol.
