# Latest Snapshot — `_root/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260525-143255-37f2713`
**Session file**: [`./20260525-143255-37f2713.md`](../20260525-143255-37f2713.md)
**Commit**: `37f2713` — chore: gitignore TPOS test captures (chứa auth tokens)
**Last updated**: 2026-05-25 14:32:55 +07
**Summary**: chore: gitignore TPOS test captures (chứa auth tokens)

## Files changed in this commit (`_root/`)

- `.gitignore`

## Last 5 commits touching `_root/`

- `37f2713eb` chore: gitignore TPOS test captures (chứa auth tokens) _(2026-05-25)_
- `0d625dacf` auto: session update _(2026-05-25)_
- `e35d9bcf8` auto: session update _(2026-05-24)_
- `bdf9cdef6` auto: session update _(2026-05-22)_
- `6a40c72b1` perf(bill): pre-render barcode SVG ở parent → bill HTML thuần static, in instant _(2026-05-19)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260525-143255-37f2713` cho Claude walk chain theo CLAUDE.md protocol.
