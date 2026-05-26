# Latest Snapshot — `docs/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260526-163215-8e2cf4f`
**Session file**: [`./20260526-163215-8e2cf4f.md`](../20260526-163215-8e2cf4f.md)
**Commit**: `8e2cf4f` — feat(snap): auto-trigger Force extract khi user quay lại tab inactive
**Last updated**: 2026-05-26 16:32:15 +07
**Summary**: feat(snap): auto-trigger Force extract khi user quay lại tab inactive

## Files changed in this commit (`docs/`)

- `docs/dev-log.md`

## Last 5 commits touching `docs/`

- `3ff74b368` feat(delivery-report/report): shift data flow correct - source empty, aggregate full _(2026-05-26)_
- `b6fe61191` chore(session): RESUME:20260526-161139-048ccf9 _(2026-05-26)_
- `048ccf9e7` fix(snap): Force extract 3-step pipeline — guaranteed thumbnail cho mọi comment _(2026-05-26)_
- `4c3e1a360` chore(session): RESUME:20260526-160935-ff943bc _(2026-05-26)_
- `086664229` feat(delivery-report): main page filter respect date shifts (ext fetch + client filter) _(2026-05-26)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260526-163215-8e2cf4f` cho Claude walk chain theo CLAUDE.md protocol.
