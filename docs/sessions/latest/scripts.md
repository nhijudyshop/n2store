# Latest Snapshot — `scripts/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260521-134555-8e128d5`
**Session file**: [`./20260521-134555-8e128d5.md`](../20260521-134555-8e128d5.md)
**Commit**: `8e128d5` — feat(scripts): chrome-connect CDP attach to real Chrome n2store profile + browser-session --profile/--channel flags
**Last updated**: 2026-05-21 13:45:55 +07
**Summary**: feat(scripts): chrome-connect CDP attach to real Chrome n2store profile + browser-session --profile/--channel flags

## Files changed in this commit (`scripts/`)

- `scripts/n2store-browser-session.js`
- `scripts/n2store-chrome-connect.js`

## Last 5 commits touching `scripts/`

- `8e128d55` feat(scripts): chrome-connect CDP attach to real Chrome n2store profile + browser-session --profile/--channel flags _(2026-05-21)_
- `d371b0a9` auto: session update _(2026-05-21)_
- `a82a7de4` auto: session update _(2026-05-21)_
- `8f182fc9` auto: session update _(2026-05-21)_
- `243383d0` fix(purchase-orders): paste image lớn không bị lỗi nữa + persistent session restore + debug-via-console rule _(2026-05-21)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260521-134555-8e128d5` cho Claude walk chain theo CLAUDE.md protocol.
