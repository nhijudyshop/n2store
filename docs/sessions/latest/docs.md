# Latest Snapshot — `docs/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260629-190223-a09e241`
**Session file**: [`./20260629-190223-a09e241.md`](../20260629-190223-a09e241.md)
**Commit**: `a09e241` — fix(live-chat): tab vùng Kho SP lọc p.region thay vì p.supplier
**Last updated**: 2026-06-29 19:02:23 +07
**Summary**: fix(live-chat): tab vùng Kho SP lọc p.region thay vì p.supplier

## Files changed in this commit (`docs/`)

- `docs/dev-log.md`

## Last 5 commits touching `docs/`

- `a09e24175` fix(live-chat): tab vùng Kho SP lọc p.region thay vì p.supplier _(2026-06-29)_
- `538514eef` chore(session): RESUME:20260629-182215-be910cb _(2026-06-29)_
- `43ca56c5c` chore(session): RESUME:20260629-181532-4755323 _(2026-06-29)_
- `aeb96b91a` chore(session): RESUME:20260629-181234-dc11a6b _(2026-06-29)_
- `dc11a6b70` feat(unit-scan): hiện mã tem theo từng STT (tem nào vào STT nào) _(2026-06-29)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260629-190223-a09e241` cho Claude walk chain theo CLAUDE.md protocol.
