# Latest Snapshot — `docs/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260625-220424-20a5b02`
**Session file**: [`./20260625-220424-20a5b02.md`](../20260625-220424-20a5b02.md)
**Commit**: `20a5b02` — auto: session update
**Last updated**: 2026-06-25 22:04:24 +07
**Summary**: auto: session update

## Files changed in this commit (`docs/`)

- `docs/dev-log.md`

## Last 5 commits touching `docs/`

- `20a5b029f` auto: session update _(2026-06-25)_
- `152148d9d` chore(session): RESUME:20260625-220253-4e3d281 _(2026-06-25)_
- `8d1162f25` feat(web2/video-beauty): skeleton-frame loading during video decode _(2026-06-25)_
- `aeb0be345` chore(session): RESUME:20260625-215514-83513cd _(2026-06-25)_
- `83513cd80` feat(web2/print): QR đẹp + bố cục tem SP "2 tem" P1 (tên/biến thể/giá) + QR hoá đơn A4 _(2026-06-25)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260625-220424-20a5b02` cho Claude walk chain theo CLAUDE.md protocol.
