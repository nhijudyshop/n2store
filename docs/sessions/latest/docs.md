# Latest Snapshot — `docs/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260623-191834-601dace`
**Session file**: [`./20260623-191834-601dace.md`](../20260623-191834-601dace.md)
**Commit**: `601dace` — auto: session update
**Last updated**: 2026-06-23 19:18:34 +07
**Summary**: auto: session update

## Files changed in this commit (`docs/`)

- `docs/dev-log.md`

## Last 5 commits touching `docs/`

- `42fb07988` tweak(web2-cham-cong): dung sai mặc định 5→6 phút (8h06/19h54 vẫn đúng giờ) + migrate _(2026-06-23)_
- `3de2ce922` chore(session): RESUME:20260623-185502-583ffca _(2026-06-23)_
- `2b159d663` feat(web2-cham-cong): lương theo tháng (cố định) + dung sai ±phút vào/ra _(2026-06-23)_
- `4b09f97ca` chore(session): RESUME:20260623-184738-d52a6b3 _(2026-06-23)_
- `d52a6b3d7` docs(session): fill Key Decisions + Next Steps for money-flow audit round _(2026-06-23)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260623-191834-601dace` cho Claude walk chain theo CLAUDE.md protocol.
