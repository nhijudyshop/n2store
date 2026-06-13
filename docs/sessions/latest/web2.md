# Latest Snapshot — `web2/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260613-190730-6aaad40`
**Session file**: [`./20260613-190730-6aaad40.md`](../20260613-190730-6aaad40.md)
**Commit**: `6aaad40` — auto: session update
**Last updated**: 2026-06-13 19:07:30 +07
**Summary**: auto: session update

## Files changed in this commit (`web2/`)

- `web2/shared/web2-theme.css`

## Last 5 commits touching `web2/`

- `dd5e25c86` polish(web2): dedupe source-pill hide rule (gộp 3 block trùng → 1) _(2026-06-13)_
- `0c3188894` polish(web2): ẩn source-pill (tên bảng DB) — commit --only chống race _(2026-06-13)_
- `9b9d1ac64` polish(web2): ẩn source-pill (re-apply — lần trước mất do race commit đồng thời) _(2026-06-13)_
- `44d46ac18` auto: session update _(2026-06-13)_
- `75690ae3e` auto: session update _(2026-06-13)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260613-190730-6aaad40` cho Claude walk chain theo CLAUDE.md protocol.
