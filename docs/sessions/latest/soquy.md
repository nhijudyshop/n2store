# Latest Snapshot — `soquy/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260620-160221-8f29378`
**Session file**: [`./20260620-160221-8f29378.md`](../20260620-160221-8f29378.md)
**Commit**: `8f29378` — auto: session update
**Last updated**: 2026-06-20 16:02:22 +07
**Summary**: auto: session update

## Files changed in this commit (`soquy/`)

- `soquy/js/soquy-database.js`
- `soquy/js/soquy-permissions.js`

## Last 5 commits touching `soquy/`

- `f7824656c` fix(soquy): khop owner voucher theo account on dinh (username+alias) thay vi displayName _(2026-06-20)_
- `2704ef6f0` fix(tpos): bo hardcode creds client -> proxy-auth {companyId} sau khi doi password _(2026-06-20)_
- `81c3336db` refactor(shared): gỡ hoàn toàn widget AI chat nổi (ai-chat-widget) khỏi navigation-modern + nhanhang/soquy FAB _(2026-06-13)_
- `63446c668` auto: session update _(2026-06-13)_
- `7cfb01320` chore(cache-bust): opt-in toàn bộ 88 pages còn lại vào ?v=20260521b _(2026-05-21)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260620-160221-8f29378` cho Claude walk chain theo CLAUDE.md protocol.
