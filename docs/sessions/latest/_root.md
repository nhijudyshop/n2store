# Latest Snapshot — `_root/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260518-092202-711bc52`
**Session file**: [`./20260518-092202-711bc52.md`](../20260518-092202-711bc52.md)
**Commit**: `711bc52` — auto: session update
**Last updated**: 2026-05-18 09:22:02 +07
**Summary**: auto: session update

## Files changed in this commit (`_root/`)

- `CLAUDE.md`

## Last 5 commits touching `_root/`

- `711bc520` auto: session update _(2026-05-18)_
- `dbe06950` docs(meta): central rule "đọc serect*dont_push.txt trước khi cần API key" *(2026-05-18)\_
- `ba7b943b` feat(session-resume): chain pointer — paste 1 token cuối walk được cả conversation history _(2026-05-13)_
- `e318b03d` auto: session update _(2026-05-13)_
- `d7985a51` docs: thêm test customer mặc định 'Huỳnh Thành Đạt — 0123456788' cho mọi browser test _(2026-04-28)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260518-092202-711bc52` cho Claude walk chain theo CLAUDE.md protocol.
