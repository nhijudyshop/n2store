# Latest Snapshot — `scripts/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260521-141120-eee5df1`
**Session file**: [`./20260521-141120-eee5df1.md`](../20260521-141120-eee5df1.md)
**Commit**: `eee5df1` — auto: session update
**Last updated**: 2026-05-21 14:11:20 +07
**Summary**: auto: session update

## Files changed in this commit (`scripts/`)

- `scripts/n2store-browser-session.js`

## Last 5 commits touching `scripts/`

- `eee5df14` auto: session update _(2026-05-21)_
- `8e128d55` feat(scripts): chrome-connect CDP attach to real Chrome n2store profile + browser-session --profile/--channel flags _(2026-05-21)_
- `d371b0a9` auto: session update _(2026-05-21)_
- `a82a7de4` auto: session update _(2026-05-21)_
- `8f182fc9` auto: session update _(2026-05-21)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260521-141120-eee5df1` cho Claude walk chain theo CLAUDE.md protocol.
