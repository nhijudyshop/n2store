# Latest Snapshot — `docs/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260619-154502-48ea427`
**Session file**: [`./20260619-154502-48ea427.md`](../20260619-154502-48ea427.md)
**Commit**: `48ea427` — auto: session update
**Last updated**: 2026-06-19 15:45:02 +07
**Summary**: auto: session update

## Files changed in this commit (`docs/`)

- `docs/dev-log.md`

## Last 5 commits touching `docs/`

- `77bcfbcb1` feat(web2/fb-posts): Đăng nhập bằng Facebook (OAuth) — liên kết 1 lần dính web luôn, không cần dán token _(2026-06-19)_
- `4d3b475a6` chore(session): RESUME:20260619-150753-3d3b873 _(2026-06-19)_
- `3d3b873cf` feat(web2/fb-posts): trang Đăng bài Facebook — quản lý + soạn/đăng/lên lịch 2 page qua Graph API + AI caption free (Groq) _(2026-06-19)_
- `274bdd80b` chore(session): RESUME:20260619-145548-da38913 _(2026-06-19)_
- `da38913d8` fix(web2/jt-tracking): auto-refresh gồm cả 'Đã hoàn' (returned) — chỉ 'Đã giao' là chốt _(2026-06-19)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260619-154502-48ea427` cho Claude walk chain theo CLAUDE.md protocol.
